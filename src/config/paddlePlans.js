/**
 * Mapeo de planes/precios de Paddle.
 * 
 * Se usan los variables de entorno de Render si existen;
 * de lo contrario, toma los Price IDs reales de Paddle Sandbox.
 */

const PADDLE_PRICE_STARTER = process.env.PADDLE_PRICE_STARTER || "pri_01kzav98948zzkb382m5sk9kb2";
const PADDLE_PRICE_CREATOR = process.env.PADDLE_PRICE_CREATOR || "pri_01kzavjw57gr47f0w5wfgfrbdn";
const PADDLE_PRICE_PRO = process.env.PADDLE_PRICE_PRO || "pri_01kzay4stvw017xshgnf8japcc";
const PADDLE_PRICE_BUSINESS = process.env.PADDLE_PRICE_BUSINESS || "pri_01kzaya72s4pm17v9hy6w54hn1";

const PLANS = [
  {
    key: "STARTER",
    name: "Starter",
    priceId: PADDLE_PRICE_STARTER,
    tokens: 40,
    price: 8,
  },
  {
    key: "CREATOR",
    name: "Creator",
    priceId: PADDLE_PRICE_CREATOR,
    tokens: 120,
    price: 18,
  },
  {
    key: "PRO",
    name: "Pro",
    priceId: PADDLE_PRICE_PRO,
    tokens: 300,
    price: 36,
    recommended: true,
  },
  {
    key: "BUSINESS",
    name: "Business",
    priceId: PADDLE_PRICE_BUSINESS,
    tokens: 800,
    price: 80,
  },
];

// Mapeo dinámico priceId -> tokens
const PRICE_ID_TO_TOKENS = PLANS.reduce((acc, plan) => {
  if (plan.priceId) acc[plan.priceId] = plan.tokens;
  return acc;
}, {});

const getTokensForPriceId = (priceId) => {
  if (!priceId) return 0;
  return PRICE_ID_TO_TOKENS[priceId] || 0;
};

const getPlanForPriceId = (priceId) => {
  if (!priceId) return null;
  return PLANS.find((plan) => plan.priceId === priceId) || null;
};

module.exports = {
  PLANS,
  PRICE_ID_TO_TOKENS,
  getTokensForPriceId,
  getPlanForPriceId,
};

