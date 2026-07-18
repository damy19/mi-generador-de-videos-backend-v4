const axios = require("axios");
const jwt = require("jsonwebtoken");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Faltan credenciales: ${name}`);
  return v;
}

/**
 * Crea el JWT EXACTO según tu documentación:
 * - Header: { alg: "HS256", typ: "JWT" }
 * - Payload:
 *    iss: accessKey
 *    exp: nowSeconds + 1800
 *    nbf: nowSeconds - 5
 *
 * @returns {string} token
 */
function createKlingJwtToken() {
  const accessKey = requireEnv("KLING_ACCESS_KEY");
  const secretKey = requireEnv("KLING_SECRET_KEY");

  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload = {
    iss: accessKey,
    exp: nowSeconds + 1800,
    nbf: nowSeconds - 5,
  };

  const token = jwt.sign(payload, secretKey, {
    algorithm: "HS256",
    header: {
      typ: "JWT",
      alg: "HS256",
    },
  });

  return token;
}


function klingAuthHeaders() {
  const token = createKlingJwtToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function baseUrl() {
  // Usar siempre el dominio nuevo que indicas.
  return process.env.KLING_BASE_URL || "https://api-singapore.klingai.com";
}

/**
 * Axios instance preconfigurada para Kling.
 */
const klingAxios = axios.create({
  baseURL: baseUrl(),
  timeout: 120000,
});

/**
 * Helpers
 */
async function klingPost(path, body, { timeout = 120000 } = {}) {
  return klingAxios.post(path, body, {
    headers: klingAuthHeaders(),
    timeout,
  });
}

async function klingGet(path, { timeout = 120000 } = {}) {
  return klingAxios.get(path, {
    headers: klingAuthHeaders(),
    timeout,
  });
}

module.exports = {
  createKlingJwtToken,
  klingAuthHeaders,
  klingGet,
  klingPost,
  baseUrl,
};

