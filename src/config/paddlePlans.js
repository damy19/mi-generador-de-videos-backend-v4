/**
 * Mapeo de planes/precios de Paddle.
 *
 * Los Price IDs deben estar definidos en backend/.env:
 *   PADDLE_PRICE_STARTER
 *   PADDLE_PRICE_CREATOR
 *   PADDLE_PRICE_PRO
 *   PADDLE_PRICE_BUSINESS
 */

const PADDLE_PRICE_STARTER = process.env.PADDLE_PRICE_STARTER;
const PADDLE_PRICE_CREATOR = process.env.PADDLE_PRICE_CREATOR;
const PADDLE_PRICE_PRO = process.env.PADDLE_PRICE_PRO;
const PADDLE_PRICE_BUSINESS = process.env.PADDLE_PRICE_BUSINESS;

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

// priceId -> tokens (solo planes con priceId configurado)
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

