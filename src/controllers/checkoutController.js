/**
 * ⚠️ MIGRADO A PADDLE CHECKOUT (client-side)
 *
 * El checkout ya NO se crea desde el backend.
 * Ahora se abre 100% client-side con @paddle/paddle-js
 * (ver frontend/src/lib/paddle.ts → openPaddleCheckout()).
 *
 * El backend solo se encarga de recibir los eventos del webhook
 * en POST /api/webhook (controllers/webhookController.js) para
 * acreditar tokens según el Price ID comprado.
 */

const createCheckoutSession = async (req, res) => {
  res.status(410).json({
    error:
      "El checkout de pago se migró a Paddle Checkout (client-side). Este endpoint ya no se usa.",
    migracion: "Usá frontend/src/lib/paddle.ts → openPaddleCheckout()",
  });
};

module.exports = {
  createCheckoutSession,
};

