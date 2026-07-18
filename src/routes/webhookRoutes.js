const express = require("express");
const { handleLemonSqueezyWebhook } = require("../controllers/webhookController");

const router = express.Router();

// Al estar mapeado en index.js como "/api/webhook",
// la ruta raíz ("/") mapea directamente a la URL limpia que configuraste.
router.post("/", handleLemonSqueezyWebhook);

module.exports = router;
