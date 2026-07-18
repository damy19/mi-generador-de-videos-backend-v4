const express = require("express");
const router = express.Router();
const prisma = require("../config/prisma");

// Ruta GET /api/usuarios - Obtiene todos los usuarios desde Supabase
router.get("/usuarios", async (req, res) => {
  try {
    const usuarios = await prisma.user.findMany();
    res.status(200).json({
      mensaje: "✅ Conexión a Supabase exitosa",
      cantidad: usuarios.length,
      usuarios: usuarios,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error al conectar con Supabase:", error);
    res.status(500).json({
      error: "❌ Error al conectar con la base de datos",
      detalles: error.message,
    });
  }
});

module.exports = router;
