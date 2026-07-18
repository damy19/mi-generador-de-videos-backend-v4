const express = require("express");
const { getCurrentUser } = require("../controllers/authController");

const router = express.Router();

// Ruta GET /api/auth/me - Obtener usuario autenticado
// (Supabase auth via Authorization: Bearer <access_token>)
router.get("/me", getCurrentUser);

module.exports = router;
