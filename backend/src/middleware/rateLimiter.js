const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Limite de webhooks excedido.' },
});

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Limite de tracking excedido.' },
});

module.exports = { apiLimiter, webhookLimiter, trackingLimiter };
