const prisma = require("../config/prisma");
const {
  Environment,
  LogLevel,
  Paddle,
  EventName,
} = require("@paddle/paddle-node-sdk");
const {
  getTokensForPriceId,
  getPlanForPriceId,
} = require("../config/paddlePlans");

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_WEBHOOK_SECRET_KEY = process.env.PADDLE_WEBHOOK_SECRET_KEY;

let paddleClient = null;
if (PADDLE_API_KEY) {
  paddleClient = new Paddle(PADDLE_API_KEY, {
    environment: PADDLE_API_KEY.startsWith("test_")
      ? Environment.sandbox
      : Environment.production,
    logLevel: LogLevel.error,
  });
}

const TEST_MODE = Boolean(PADDLE_API_KEY && PADDLE_API_KEY.startsWith("test_"));

/**
 * Resuelve el usuario de Prisma.
 * 1) Por el user_id que se envió en customData al abrir el checkout.
 * 2) Fallback: buscando el email del customer en la API de Paddle.
 */
const obtenerUsuario = async (userIdFromCustomData, customerId) => {
  if (userIdFromCustomData) {
    const parsed = parseInt(userIdFromCustomData, 10);
    if (!Number.isNaN(parsed)) {
      const user = await prisma.user.findUnique({ where: { id: parsed } });
      if (user) return user;
    }
  }

  if (customerId && paddleClient) {
    try {
      const customer = await paddleClient.customers.get(customerId);
      if (customer?.email) {
        const user = await prisma.user.findUnique({
          where: { email: customer.email },
        });
        if (user) return user;
      }
    } catch (customerError) {
      console.error("❌ Error obteniendo customer de Paddle:", customerError.message);
    }
  }

  return null;
};

/**
 * transaction.completed: cubre pagos únicos, la primera factura de una
 * suscripción y las renovaciones mensuales. Acredita tokens según el Price ID.
 */
const handleTransactionCompleted = async (transaction) => {
  const transactionId = transaction.id;
  const userIdFromCustomData = transaction.customData?.user_id;
  const customerId = transaction.customerId;
  const priceId = transaction.items?.[0]?.price?.id || null;
  const subscriptionId = transaction.subscriptionId;

  const tokensAInyectar = getTokensForPriceId(priceId);
  console.log(
    `💳 transaction.completed: ${transactionId}, priceId=${priceId}, tokens=${tokensAInyectar}`
  );

  if (tokensAInyectar <= 0) {
    console.warn(`⚠️ Price ID no mapeado en paddlePlans.js: ${priceId}`);
    return;
  }

  // Idempotencia: si ya procesamos esta transacción, no volvemos a acreditar.
  const existing = await prisma.checkout.findUnique({
    where: { paddleTransactionId: transactionId },
  });

  if (existing && existing.status === "PAID") {
    console.log(`⏭️  Transacción ${transactionId} ya procesada (PAID).`);
    return;
  }

  const usuario = await obtenerUsuario(userIdFromCustomData, customerId);
  if (!usuario) {
    console.error(
      `❌ No se encontró el usuario para la transacción ${transactionId}.`
    );
    return;
  }

  // Acreditar tokens
  await prisma.user.update({
    where: { id: usuario.id },
    data: { tokens: { increment: tokensAInyectar } },
  });

  // Registrar transacción interna
  await prisma.transaction.create({
    data: {
      userId: usuario.id,
      tipo: "COMPRA_PADDLE",
      cantidad: tokensAInyectar,
    },
  });

  // Guardar / actualizar el checkout (idempotente)
  const checkoutUrl = transaction.checkout?.url || null;

  if (existing) {
    await prisma.checkout.update({
      where: { id: existing.id },
      data: {
        status: "PAID",
        priceId,
        subscriptionId,
        url: existing.url || checkoutUrl,
      },
    });
  } else {
    await prisma.checkout.create({
      data: {
        userId: usuario.id,
        paddleTransactionId: transactionId,
        url: checkoutUrl,
        status: "PAID",
        priceId,
        subscriptionId,
        testMode: TEST_MODE,
      },
    });
  }

  console.log(
    `✅ Tokens acreditados +${tokensAInyectar} al usuario ${usuario.id} (${usuario.email}).`
  );
};

/**
 * subscription.activated / subscription.created:
 * actualiza el plan del usuario según el Price ID de la suscripción.
 */
const handleSubscriptionPlan = async (subscription) => {
  const priceId = subscription.items?.[0]?.price?.id || null;
  const userIdFromCustomData = subscription.customData?.user_id;
  const customerId = subscription.customerId;

  const plan = getPlanForPriceId(priceId);
  if (!plan) {
    console.warn(`⚠️ Suscripción sin plan mapeado: priceId=${priceId}`);
    return;
  }

  const usuario = await obtenerUsuario(userIdFromCustomData, customerId);
  if (!usuario) {
    console.error("❌ No se encontró el usuario para actualizar el plan.");
    return;
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { plan: plan.key },
  });

  console.log(`✅ Plan actualizado a ${plan.key} para el usuario ${usuario.id}.`);
};

const handlePaddleWebhook = async (req, res) => {
  try {
    if (!paddleClient) {
      console.error("❌ No se configuró PADDLE_API_KEY en el backend.");
      return res.status(500).json({
        error: "Falta configurar PADDLE_API_KEY en backend/.env.",
      });
    }

    if (!PADDLE_WEBHOOK_SECRET_KEY) {
      console.error("❌ No se configuró PADDLE_WEBHOOK_SECRET_KEY en el backend.");
      return res.status(500).json({
        error: "Falta configurar PADDLE_WEBHOOK_SECRET_KEY en backend/.env.",
      });
    }

    if (!req.rawBody) {
      console.error("❌ No se recibió el rawBody en la petición.");
      return res.status(400).json({
        error: "Falta el cuerpo crudo de la petición",
      });
    }

    const signature = req.get("Paddle-Signature") || "";
    const rawRequestBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString("utf8")
      : String(req.rawBody);

    // Valida integridad y firma (Paddle-Signature) y devuelve el evento tipado.
    const eventData = await paddleClient.webhooks.unmarshal(
      rawRequestBody,
      PADDLE_WEBHOOK_SECRET_KEY,
      signature
    );

    console.log(`🔔 Webhook de Paddle recibido: ${eventData.eventType}`);

    switch (eventData.eventType) {
      case EventName.TransactionCompleted:
        await handleTransactionCompleted(eventData.data);
        break;

      case EventName.SubscriptionActivated:
      case EventName.SubscriptionCreated:
        await handleSubscriptionPlan(eventData.data);
        break;

      default:
        console.log(`ℹ️ Evento ignorado: ${eventData.eventType}`);
    }

    // Paddle necesita un 200 OK para confirmar la recepción.
    res.status(200).send("Webhook procesado correctamente");
  } catch (error) {
    console.error("❌ Error en el Webhook de Paddle:", error);
    res.status(400).json({
      error: "Firma inválida o error procesando el webhook.",
      detalles: error.message,
    });
  }
};

module.exports = {
  handlePaddleWebhook,
};

