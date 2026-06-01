const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const googleAds = require('./googleAdsService');
const metaAds = require('./metaAdsService');

// Registra conversão e envia para as plataformas de anúncios
async function sendConversion(leadId, type, value, currency = 'BRL') {
  const { rows: [lead] } = await db.query(`
    SELECT l.*, u.email as user_email, u.name as user_name
    FROM leads l LEFT JOIN users u ON l.assigned_to = u.id
    WHERE l.id = $1
  `, [leadId]);

  if (!lead) throw new Error('Lead não encontrado');

  const conversionsToSend = [];

  // Google Ads via GCLID
  if (lead.gclid) {
    conversionsToSend.push({
      platform: 'google_ads',
      conversionName: getGoogleConversionName(type),
      gclid: lead.gclid,
    });
  }

  // Meta Ads via FBCLID
  if (lead.fbclid) {
    conversionsToSend.push({
      platform: 'meta_ads',
      eventName: getMetaEventName(type),
      fbclid: lead.fbclid,
    });
  }

  const results = await Promise.allSettled(conversionsToSend.map(async (conv) => {
    const convId = uuidv4();

    // Registra no banco como pendente
    await db.query(`
      INSERT INTO conversions (id, lead_id, type, platform, conversion_name, conversion_value, currency, gclid, fbclid, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NOW())
    `, [convId, leadId, type, conv.platform, conv.conversionName || conv.eventName,
        value, currency, lead.gclid, lead.fbclid]);

    try {
      let response;
      if (conv.platform === 'google_ads') {
        response = await googleAds.sendOfflineConversion({
          gclid: conv.gclid,
          conversionName: conv.conversionName,
          conversionValue: value,
          currencyCode: currency,
        });
      } else {
        response = await metaAds.sendConversion({
          eventName: conv.eventName,
          fbclid: conv.fbclid,
          userData: { email: lead.email, phone: lead.phone },
          customData: { value, currency, contentName: type },
          eventSourceUrl: lead.landing_page_url,
        });
      }

      await db.query(`
        UPDATE conversions SET status = 'sent', sent_at = NOW(), response_data = $1 WHERE id = $2
      `, [JSON.stringify(response), convId]);

      return { platform: conv.platform, status: 'sent' };
    } catch (err) {
      await db.query(`
        UPDATE conversions SET status = 'failed', error_message = $1 WHERE id = $2
      `, [err.message, convId]);
      return { platform: conv.platform, status: 'failed', error: err.message };
    }
  }));

  return results.map(r => r.value || r.reason);
}

function getGoogleConversionName(type) {
  const map = {
    lead: 'Lead',
    qualified_lead: 'Qualified_Lead',
    sale: 'Purchase',
    checkout: 'Begin_Checkout',
    call: 'Phone_Call',
    form: 'Form_Submission',
  };
  return map[type] || 'Lead';
}

function getMetaEventName(type) {
  const map = {
    lead: 'Lead',
    qualified_lead: 'Lead',
    sale: 'Purchase',
    checkout: 'InitiateCheckout',
    call: 'Contact',
    form: 'CompleteRegistration',
  };
  return map[type] || 'Lead';
}

async function listPending() {
  const { rows } = await db.query(`
    SELECT c.*, l.name as lead_name, l.gclid, l.fbclid
    FROM conversions c JOIN leads l ON c.lead_id = l.id
    WHERE c.status = 'pending'
    ORDER BY c.created_at
    LIMIT 100
  `);
  return rows;
}

async function retryFailed() {
  const { rows } = await db.query(`
    SELECT c.*, l.gclid, l.fbclid, l.email, l.phone, l.landing_page_url
    FROM conversions c JOIN leads l ON c.lead_id = l.id
    WHERE c.status = 'failed' AND c.created_at > NOW() - INTERVAL '7 days'
    LIMIT 50
  `);

  for (const conv of rows) {
    try {
      await sendConversion(conv.lead_id, conv.type, conv.conversion_value, conv.currency);
    } catch {}
  }
}

module.exports = { sendConversion, listPending, retryFailed };
