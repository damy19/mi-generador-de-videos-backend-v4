const prisma = require("../config/prisma");
const crypto = require("crypto");

const handleLemonSqueezyWebhook = async (req, res) => {
  try {
    // 1. Validar que el llamado venga realmente de Lemon Squeezy (Seguridad)
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const hmac = crypto.createHmac("sha256", secret);
    
    if (!req.rawBody) {
      console.error("❌ No se recibió el rawBody en la petición.");
      return res.status(400).json({ error: "Falta el cuerpo crudo de la petición" });
    }

    const digest = Buffer.from(hmac.update(req.rawBody).digest("hex"), "utf8");
    const signature = Buffer.from(req.get("X-Signature") || "", "utf8");

    if (!crypto.timingSafeEqual(digest, signature)) {
      console.error("❌ Firma de Lemon Squeezy inválida. No autorizado.");
      return res.status(401).json({ error: "Firma inválida. No autorizado." });
    }

    // ⚙️ SOLUCIÓN AL ERROR 500: Convertir el Buffer crudo a un objeto JSON real
    let payload;
    try {
      if (Buffer.isBuffer(req.rawBody)) {
        payload = JSON.parse(req.rawBody.toString("utf8"));
      } else {
        payload = typeof req.rawBody === "string" ? JSON.parse(req.rawBody) : req.rawBody;
      }
    } catch (parseError) {
      console.error("❌ Error al parsear el JSON del webhook:", parseError.message);
      return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
    }

    const eventName = payload?.meta?.event_name;
    console.log(`🔔 Webhook recibido de Lemon Squeezy: ${eventName}`);

    // 2. Escuchar solo cuando el pago esté totalmente aprobado
    if (eventName === "order_created" || eventName === "subscription_created") {
      const attributes = payload.data?.attributes || {};
      const emailUsuario =
        attributes.user_email ||
        payload?.data?.attributes?.customer_email ||
        payload?.data?.attributes?.customer?.email;

      const lemonCheckoutId = String(payload.data?.relationships?.checkout?.data?.id || "");

      // Capturamos el variant_id del producto comprado
      const variantIdReceived = String(
        attributes.first_order_item?.variant_id ||
          attributes.first_order_item?.plan?.variant_id ||
          attributes.items?.[0]?.variant_id ||
          ""
      );

      console.log(
        `💳 Pago exitoso detectado. event=${eventName}, email: ${emailUsuario}, variant_id: ${variantIdReceived}`
      );

      if (!emailUsuario) {
        console.error(`❌ Lemon Squeezy no envió user_email. event=${eventName}`);
        return res.status(400).json({ error: "Falta user_email en el webhook" });
      }

      // 3. Buscar checkout (opcional) para marcarlo como PAID
      let checkoutRecord = null;
      if (lemonCheckoutId) {
        checkoutRecord = await prisma.checkout.findFirst({ where: { lemonCheckoutId: lemonCheckoutId } });
      }

      // 4. Determinar cuántos tokens inyectar según el Variant ID comprado
      let tokensAInyectar = 0;

      console.log("-----------------------------------------");
      console.log(`🔍 VARIANT ID RECIBIDO DEL WEBHOOK: "${variantIdReceived}"`);
      console.log("-----------------------------------------");

      switch (variantIdReceived) {
        case "1773938": // Plan de $8
          tokensAInyectar = 40;
          break;
        case "1773941": // Plan de $18
          tokensAInyectar = 120;
          break;
        case "1773945": // Plan de $36
          tokensAInyectar = 300;
          break;
        case "1773949": // Plan de $80
          tokensAInyectar = 800;
          break;
        default:
          console.warn(`⚠️ ALERTA: El Variant ID "${variantIdReceived}" no coincidió con ninguno mapeado.`);
          return res.status(200).json({ message: "Webhook recibido, pero el Variant ID no está mapeado." });
      }

      // 5. Sumar tokens directamente por email
      const userUpdateResult = await prisma.user.updateMany({
        where: { email: emailUsuario },
        data: { tokens: { increment: tokensAInyectar } },
      });

      if (userUpdateResult.count === 0) {
        console.error(`❌ No se encontró el usuario con email ${emailUsuario} en la base de datos.`);
        return res.status(404).json({ error: "Usuario no encontrado en BD" });
      }

      console.log(`✅ Tokens actualizados por email=${emailUsuario}. increment=+${tokensAInyectar}.`);

      if (checkoutRecord) {
        await prisma.checkout.update({
          where: { id: checkoutRecord.id },
          data: { status: "PAID" },
        });
        console.log(`✅ Checkout marcado como PAID. lemonCheckoutId=${lemonCheckoutId}`);
      }
    }

    // Lemon Squeezy necesita un 200 OK para saber que recibiste el mensaje
    res.status(200).send("Webhook procesado correctamente");
  } catch (error) {
    console.error("❌ Error en el Webhook de Lemon Squeezy:", error);
    res.status(500).json({ error: "Error interno en el webhook" });
  }
};

module.exports = {
  handleLemonSqueezyWebhook,
};