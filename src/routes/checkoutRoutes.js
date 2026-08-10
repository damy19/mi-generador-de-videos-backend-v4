const express = require("express");
const { createCheckoutSession } = require("../controllers/checkoutController");

const router = express.Router();

/**
 * ⚠️ MIGRADO A PADDLE CHECKOUT (client-side)
 *
 * El checkout ahora se abre desde el frontend con @paddle/paddle-js
 * (ver frontend/src/lib/paddle.ts → openPaddleCheckout()).
 *
 * Este endpoint se mantiene solo como referencia; devuelve 410 Gone.
 * Las rutas checkout ya NO se montan en index.js.
 */
router.post("/custom-pack", createCheckoutSession);

module.exports = router;

