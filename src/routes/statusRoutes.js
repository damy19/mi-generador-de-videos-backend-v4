const express = require("express");
const router = express.Router();

// Ruta GET /api/status - Devuelve estado del servidor
router.get("/status", (req, res) => {
  res.status(200).json({
    mensaje: "✅ Servidor Express funcionando correctamente",
    timestamp: new Date().toISOString(),
    servidor: "generador-videos-ia",
  });
});

module.exports = router;
