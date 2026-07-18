const express = require("express");
const { obtenerMisTransacciones } = require("../controllers/transactionController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/transactions/mis-transacciones - Listar transacciones del usuario (protegida)
router.get("/mis-transacciones", verifyToken, obtenerMisTransacciones);

module.exports = router;
