const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function getKeys() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error("Faltan credenciales (KLING_ACCESS_KEY / KLING_SECRET_KEY)");
  }
  return { accessKey, secretKey };
}

/**
 * JWT (modo alternativo si tu cuenta/endpoint acepta Bearer JWT directo).
 */
function generarKlingTokenJWT() {
  const { accessKey, secretKey } = getKeys();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: accessKey,
    exp: now + 300,
    nbf: now - 5,
  };

  return jwt.sign(payload, secretKey, { algorithm: "HS256" });
}

/**
 * Signature HMAC (AccessKey + SecretKey).
 *
 * NOTA: Kling puede requerir un formato exacto del string a firmar y/o el timestamp.
 * Aquí implementamos una variante típica y controlable vía KLING_AUTH_MODE.
 */
function generarKlingSignatureHmac({ method, urlPath, timestampSeconds }) {
  const { accessKey, secretKey } = getKeys();

  const signingString = [
    "accessKey=" + accessKey,
    "timestamp=" + timestampSeconds,
    "method=" + String(method || "GET").toUpperCase(),
    "path=" + urlPath,
  ].join("&");

  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(signingString)
    .digest("hex");

  return { accessKey, signature: hmac };
}

function generarKlingAuthHeaderHmac({ method, url }) {
  const timestampSeconds = Math.floor(Date.now() / 1000).toString();
  const u = new URL(url);
  const urlPath = u.pathname + (u.search || "");

  const { accessKey, signature } = generarKlingSignatureHmac({
    method,
    urlPath,
    timestampSeconds,
  });

  // Prefijo obligatorio según tu error 1002.
  return {
    // IMPORTANTE: el endpoint que te compartí usa JWT HS256.
    // Este HMAC se deja como modo alternativo, pero no es el camino principal.
    Authorization: `Bearer ${accessKey}:${timestampSeconds}:${signature}`,
    "Content-Type": "application/json",
    "X-Auth-Timestamp": timestampSeconds,
  };
}

/**
 * Export unificado para que el controller no tenga que saber el modo.
 *
 * KLING_AUTH_MODE:
 *  - "jwt"  => Authorization: Bearer <jwt>
 *  - "hmac" => Authorization: Bearer <accessKey:timestamp:signature>
 */
function getAuthHeadersForKling({ method, url }) {
  const mode = (process.env.KLING_AUTH_MODE || "hmac").toLowerCase();

  if (mode === "jwt") {
    return {
      Authorization: `Bearer ${generarKlingTokenJWT()}`,
      "Content-Type": "application/json",
    };
  }

  return generarKlingAuthHeaderHmac({ method, url });
}

module.exports = {
  getAuthHeadersForKling,
  generarKlingTokenJWT,
  generarKlingAuthHeaderHmac,
};

