const express = require("express");
const {
  crearVideo,
  obtenerMisVideos,
  obtenerVideo,
  streamVideoProxy,
  obtenerEstadoVideo,
} = require("../controllers/videoController");

const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Endpoints públicos
// GET /api/videos/stream/:videoId - Proxy para ocultar la URL original
router.get("/stream/:videoId", streamVideoProxy);

// Endpoints protegidos (todas las rutas requieren autenticación)
router.post("/crear", verifyToken, crearVideo);
router.get("/mis-videos", verifyToken, obtenerMisVideos);
router.get("/:videoId", verifyToken, obtenerVideo);

// GET /api/videos/:videoId/status - estado (sin forzar polling por proveedor)
router.get("/:videoId/status", verifyToken, obtenerEstadoVideo);


module.exports = router;

