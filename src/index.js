require("dotenv").config(); // Cargar variables de .env
const express = require("express");
const cors = require("cors");
const prisma = require("./config/prisma");

// Importar rutas
const statusRoutes = require("./routes/statusRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const videoRoutes = require("./routes/videoRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const { startFalPendingPoller } = require("./controllers/videoController");

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
//           MIDDLEWARES & RUTAS
// ==========================================

app.use(cors());

// ⚠️ IMPORTANTE: Registrar webhook ANTES de express.json()
// Configuramos express.raw para capturar los bytes puros y guardarlos en req.rawBody.
// Esto permite que el webhookController valide la firma Paddle-Signature sin que el body se rompa.
app.use(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body; // Guardamos el buffer crudo para la verificación de firma
    next();
  },
  webhookRoutes
);

// JSON parser para el resto de las rutas (Debe ir abajo del webhook)
app.use(express.json());

// Rutas de la API
app.use("/api", statusRoutes); // GET /api/status
app.use("/api", userRoutes);   // GET /api/usuarios
app.use("/api/auth", authRoutes); // POST /api/auth/signup, /api/auth/login
app.use("/api/videos", videoRoutes); // POST /api/videos/crear, GET /api/videos/mis-videos
app.use("/api/transactions", transactionRoutes); // GET /api/transactions/mis-transacciones

// Ruta raíz para verificación rápida
app.get("/", (req, res) => {
  res.json({
    mensaje: "Bienvenido al Backend del Generador de Videos IA",
    version: "1.0.0",
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Error interno del servidor",
    detalles: err.message,
  });
});

// ==========================================
//          INICIALIZAR SERVIDOR
// ==========================================

const startServer = async () => {
  try {
    // Verificar conexión a Supabase
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Conexión a Supabase verificada");

    // Levantar servidor
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor Express escuchando en http://localhost:${PORT}`);
      console.log(`📝 Rutas disponibles:`);
      console.log(`   - GET / - Información del servidor`);
      console.log(`   - GET /api/status - Estado del servidor`);
      console.log(`   - GET /api/usuarios - Lista de usuarios (desde Supabase)`);
      console.log(`   - POST /api/auth/signup - Registro de usuarios`);
      console.log(`   - POST /api/auth/login - Inicio de sesión`);
      console.log(`   - POST /api/videos/crear - Crear un nuevo video (protegida)`);
      console.log(`   - GET /api/videos/mis-videos - Obtener mis videos (protegida)`);
      console.log(`   - GET /api/videos/:videoId - Obtener un video específico (protegida)`);
      console.log(`   - GET /api/transactions/mis-transacciones - Obtener mis transacciones (protegida)`);
      console.log(`   - POST /api/webhook - Webhook de Paddle (Firma raw habilitada)\n`);
      startFalPendingPoller();
    });
  } catch (error) {
    console.error("❌ Error al conectar a Supabase:", error.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n👋 Desconectando de Supabase...");
  await prisma.$disconnect();
  process.exit(0);
});

