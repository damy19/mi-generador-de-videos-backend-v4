const express = require("express");
const { handlePaddleWebhook } = require("../controllers/webhookController");

const router = express.Router();

// Al estar montado en index.js como "/api/webhook",
// la ruta raíz ("/") mapea a la URL limpia del webhook de Paddle.
router.post("/", handlePaddleWebhook);

module.exports = router;

