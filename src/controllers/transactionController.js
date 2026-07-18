const prisma = require("../config/prisma");

// Obtener transacciones del usuario autenticado
// Query params: ?limit=10  (opcional, máximo 20, default 20)
const obtenerMisTransacciones = async (req, res) => {
  try {
    const usuarioId = req.user.id;

    const limitParam = parseInt(req.query.limit, 10);
    const DEFAULT_LIMIT = 20;
    const MAX_LIMIT = 20;
    let limit = DEFAULT_LIMIT;

    if (!Number.isNaN(limitParam) && Number.isInteger(limitParam) && limitParam > 0) {
      limit = Math.min(limitParam, MAX_LIMIT);
    }

    const transacciones = await prisma.transaction.findMany({
      where: { userId: usuarioId },
      select: {
        id: true,
        tipo: true,
        cantidad: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.status(200).json({
      mensaje: "✅ Transacciones obtenidas correctamente",
      cantidad: transacciones.length,
      limiteSolicitado: limit,
      transacciones,
    });
  } catch (error) {
    console.error("Error en obtenerMisTransacciones:", error);
    res.status(500).json({
      error: "❌ Error al obtener las transacciones",
      detalles: error.message,
    });
  }
};

module.exports = { obtenerMisTransacciones };
