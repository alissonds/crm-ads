const crypto = require('crypto');

// Valida assinatura de webhooks Meta
function validateMetaWebhook(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.status(403).json({ error: 'Assinatura ausente' });

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.META_APP_SECRET || '')
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Assinatura inválida' });
  }
  next();
}

// Valida token de webhook personalizado
function validateWebhookToken(req, res, next) {
  const token = req.headers['x-webhook-token'] || req.query.token;
  if (!token || token !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Token de webhook inválido' });
  }
  next();
}

// Sanitiza parâmetros UTM
function sanitizeUTM(params) {
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'gclid', 'gbraid', 'wbraid', 'fbclid'];
  const result = {};
  for (const key of allowed) {
    if (params[key]) {
      result[key] = String(params[key]).slice(0, 500).replace(/[<>'"]/g, '');
    }
  }
  return result;
}

module.exports = { validateMetaWebhook, validateWebhookToken, sanitizeUTM };
