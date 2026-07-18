const prisma = require("../config/prisma");
const { supabaseAdmin } = require("../utils/supabaseAdmin");

const INITIAL_TOKENS = 0;
const INITIAL_CREDITOS = 10;

const extractBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
};

// Controlador: Obtener datos del usuario autenticado (Supabase)
const getCurrentUser = async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: "❌ Token no proporcionado o formato inválido",
      });
    }

    // Validar token de Supabase y extraer el usuario
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        error: "❌ Token inválido o expirado",
        detalles: error?.message,
      });
    }

    const email = data.user.email;
    if (!email) {
      return res.status(400).json({
        error: "❌ El usuario no tiene email en Supabase",
      });
    }

    // Buscar por email en Prisma
    let usuario = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        nombre: true,
        email: true,
        creditos: true,
        tokens: true,
      },
    });

    // Fallback: si entra por primera vez (Google) y no existe aún en Prisma
    if (!usuario) {
      const nombreFallback =
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        "User";

      usuario = await prisma.user.create({
        data: {
          nombre: nombreFallback,
          email,
          // Supabase maneja auth; dejamos placeholder para no romper el schema.
          password: "",
          creditos: INITIAL_CREDITOS,
          tokens: INITIAL_TOKENS,
        },
        select: {
          id: true,
          nombre: true,
          email: true,
          creditos: true,
          tokens: true,
        },
      });
    }

    return res.status(200).json({
      mensaje: "✅ Usuario autenticado",
      usuario,
    });
  } catch (error) {
    console.error("Error en getCurrentUser:", error);
    return res.status(500).json({
      error: "❌ Error al obtener datos del usuario",
      detalles: error.message,
    });
  }
};

module.exports = { getCurrentUser };


