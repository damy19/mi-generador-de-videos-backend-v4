const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { createCheckoutSession } = require("../controllers/checkoutController");

const router = express.Router();

// Ruta POST /api/checkout/custom-pack - Crear una sesión de pago de Lemon Squeezy
router.post("/custom-pack", verifyToken, createCheckoutSession);

module.exports = router;
