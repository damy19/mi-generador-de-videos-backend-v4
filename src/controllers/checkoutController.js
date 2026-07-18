const prisma = require("../config/prisma");

const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_SQUEEZY_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID;
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;
const LEMON_SQUEEZY_REDIRECT_URL = process.env.LEMON_SQUEEZY_REDIRECT_URL;
const LEMON_SQUEEZY_TEST_MODE = process.env.LEMON_SQUEEZY_TEST_MODE === "true";
const LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1/checkouts";

const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { variantId = LEMON_SQUEEZY_VARIANT_ID } = req.body;

    if (!LEMON_SQUEEZY_API_KEY) {
      return res.status(500).json({
        error: "Falta configurar la clave LEMON_SQUEEZY_API_KEY en el backend.",
      });
    }

    if (!variantId) {
      return res.status(500).json({
        error: "Falta configurar LEMON_SQUEEZY_VARIANT_ID en el backend.",
      });
    }

    if (!LEMON_SQUEEZY_STORE_ID) {
      return res.status(500).json({
        error: "Falta configurar LEMON_SQUEEZY_STORE_ID en el backend.",
      });
    }

    const usuario = await prisma.user.findUnique({
      where: {
        email: req.user.email,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({
        error: "Usuario no encontrado.",
      });
    }

    // Estructura JSON:API v1 oficial y estricta para Lemon Squeezy
    const checkoutPayload = {
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: LEMON_SQUEEZY_REDIRECT_URL || "http://localhost:3001"
          },
          checkout_data: {
            email: usuario.email,
            name: usuario.nombre,
            custom: {
              user_id: String(usuario.id)
            }
          },
          test_mode: LEMON_SQUEEZY_TEST_MODE
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: String(LEMON_SQUEEZY_STORE_ID)
            }
          },
          variant: {
            data: {
              type: "variants",
              id: String(variantId)
            }
          }
        }
      }
    };

    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${LEMON_SQUEEZY_API_KEY}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMessage =
        responseBody.error?.message || responseBody.errors?.[0]?.detail || "Error creando el checkout en Lemon Squeezy.";
      return res.status(response.status).json({ error: errorMessage });
    }

    const checkoutUrl = responseBody?.data?.attributes?.url;
    const lemonCheckoutId = responseBody?.data?.id;

    if (!checkoutUrl || !lemonCheckoutId) {
      return res.status(500).json({
        error: "La respuesta de Lemon Squeezy no devolvió la URL del checkout.",
      });
    }

    const checkoutRecord = await prisma.checkout.create({
      data: {
        userId: usuario.id,
        lemonCheckoutId: String(lemonCheckoutId),
        url: checkoutUrl,
        status: "CREATED",
        variantId: String(variantId),
        testMode: LEMON_SQUEEZY_TEST_MODE,
      },
    });

    res.status(201).json({
      mensaje: "✅ Checkout creado exitosamente",
      url: checkoutUrl,
      checkoutId: checkoutRecord.id,
    });
  } catch (error) {
    console.error("Error en createCheckoutSession:", error);
    res.status(500).json({
      error: "Error interno al crear el checkout.",
      detalles: error.message,
    });
  }
};

module.exports = {
  createCheckoutSession,
};