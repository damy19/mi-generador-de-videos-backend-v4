const { supabaseAdmin } = require("../utils/supabaseAdmin");

const extractBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
};

// Middleware para verificar token Supabase (Google Auth compatible)
const verifyToken = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: "❌ Token no proporcionado o formato inválido",
      });
    }

    // Validar token usando el cliente admin de Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        error: "❌ Token inválido o expirado",
        detalles: error?.message,
      });
    }

    // Guardar datos del usuario en req.user
    req.user = {
      id: data.user.id,
      email: data.user.email,
      user_metadata: data.user.user_metadata,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      error: "❌ Unauthorized",
      detalles: error.message,
    });
  }
};

module.exports = { verifyToken };
