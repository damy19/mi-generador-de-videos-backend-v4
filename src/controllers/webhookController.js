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
 * 1) Por el user_id de customData.
 * 2) Fallback: buscando el email del customer en Paddle (case-insensitive).
 */
const obtenerUsuario = async (userIdFromCustomData, customerId) => {
  if (userIdFromCustomData) {
    const parsed = parseInt(userIdFromCustomData, 10);
    if (!Number.isNaN(parsed)) {
      const user = await prisma.user.findUnique({ where: { id: parsed } });
      if (user) {
        console.log(`✅ Usuario encontrado por customData.user_id: ${user.id}`);
        return user;
      }
    }
  }

  if (customerId && paddleClient) {
    try {
      const customer = await paddleClient.customers.get(customerId);
      if (customer?.email) {
        const cleanEmail = customer.email.trim().toLowerCase();
        console.log(`🔍 Buscando usuario por fallback de email: ${cleanEmail}`);
        
        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: cleanEmail,
              mode: "insensitive",
            },
          },
        });
        if (user) {
          console.log(`✅ Usuario encontrado por email: ${user.id}`);
          return user;
        }
      }
    } catch (customerError) {
      console.error("❌ Error obteniendo customer de Paddle:", customerError.message);
    }
  }

  return null;
};

const handleTransactionCompleted = async (transaction) => {
  const transactionId = transaction.id;
  // Intenta leer user_id o userId
  const userIdFromCustomData =
    transaction.customData?.user_id || transaction.customData?.userId;
  const customerId = transaction.customerId;
  const priceId = transaction.items?.[0]?.price?.id || null;
  const subscriptionId = transaction.subscriptionId;

  const tokensAInyectar = getTokensForPriceId(priceId);
  console.log(
    `💳 transaction.completed: ${transactionId}, priceId=${priceId}, tokens=${tokensAInyectar}, customData=`,
    transaction.customData
  );

  if (tokensAInyectar <= 0) {
    console.warn(`⚠️ Price ID no mapeado en paddlePlans.js: ${priceId}`);
    return;
  }

  // Idempotencia: previene doble acreditación
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
      `❌ No se encontró usuario para la transacción ${transactionId}. customData:`,
      transaction.customData
    );
    return;
  }

  // Acreditar tokens de forma segura (si era NULL, suma a 0)
  const currentTokens = usuario.tokens || 0;
  await prisma.user.update({
    where: { id: usuario.id },
    data: { tokens: currentTokens + tokensAInyectar },
  });

  // Registrar transacción interna
  await prisma.transaction.create({
    data: {
      userId: usuario.id,
      tipo: "COMPRA_PADDLE",
      cantidad: tokensAInyectar,
    },
  });

  // Guardar / actualizar checkout
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

const handleSubscriptionPlan = async (subscription) => {
  const priceId = subscription.items?.[0]?.price?.id || null;
  const userIdFromCustomData =
    subscription.customData?.user_id || subscription.customData?.userId;
  const customerId = subscription.customerId;

  const plan = getPlanForPriceId(priceId);
  if (!plan) {
    console.warn(`⚠️ Suscripción sin plan mapeado: priceId=${priceId}`);
    return;
  }

  const usuario = await obtenerUsuario(userIdFromCustomData, customerId);
  if (!usuario) {
    console.error("❌ No se encontró usuario para actualizar plan.");
    return;
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { plan: plan.key },
  });

  console.log(`✅ Plan actualizado a ${plan.key} para usuario ${usuario.id}.`);
};

const handlePaddleWebhook = async (req, res) => {
  try {
    if (!paddleClient) {
      console.error("❌ No se configuró PADDLE_API_KEY en el backend.");
      return res.status(500).json({ error: "Falta PADDLE_API_KEY" });
    }

    if (!PADDLE_WEBHOOK_SECRET_KEY) {
      console.error("❌ No se configuró PADDLE_WEBHOOK_SECRET_KEY.");
      return res.status(500).json({ error: "Falta PADDLE_WEBHOOK_SECRET_KEY" });
    }

    if (!req.rawBody) {
      console.error("❌ No se recibió rawBody.");
      return res.status(400).json({ error: "Falta rawBody" });
    }

    const signature = req.get("Paddle-Signature") || "";
    const rawRequestBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString("utf8")
      : String(req.rawBody);

    const eventData = await paddleClient.webhooks.unmarshal(
      rawRequestBody,
      PADDLE_WEBHOOK_SECRET_KEY,
      signature
    );

    console.log(`🔔 Webhook recibido: ${eventData.eventType}`);

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

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en Webhook de Paddle:", error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  handlePaddleWebhook,
};