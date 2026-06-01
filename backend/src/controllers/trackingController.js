const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');
const { sanitizeUTM } = require('../middleware/validateWebhook');

async function capture(req, res) {
  try {
    const rawParams = { ...req.query, ...req.body };
    const utmParams = sanitizeUTM(rawParams);

    const sessionId = rawParams.session_id || uuidv4();
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const device = detectDevice(userAgent);

    const existing = await db.query(
      'SELECT id FROM utm_tracking WHERE session_id = $1',
      [sessionId]
    );

    if (existing.rows[0]) {
      await db.query(
        'UPDATE utm_tracking SET last_seen_at = NOW() WHERE session_id = $1',
        [sessionId]
      );
      return res.json({ session_id: sessionId, existing: true });
    }

    let campaignId = null;
    if (utmParams.utm_campaign) {
      const { rows } = await db.query(
        `SELECT id FROM campaigns WHERE name ILIKE $1 LIMIT 1`,
        [utmParams.utm_campaign]
      );
      campaignId = rows[0]?.id || null;
    }

    const { rows } = await db.query(`
      INSERT INTO utm_tracking (
        id, session_id,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, gbraid, wbraid, fbclid,
        campaign_id, ip_address, user_agent,
        device_type, landing_page_url, referer_url, raw_params,
        first_seen_at, last_seen_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW()
      ) RETURNING id, session_id
    `, [
      uuidv4(), sessionId,
      utmParams.utm_source, utmParams.utm_medium, utmParams.utm_campaign,
      utmParams.utm_content, utmParams.utm_term,
      utmParams.gclid, utmParams.gbraid, utmParams.wbraid, utmParams.fbclid,
      campaignId, ip, userAgent,
      device, rawParams.page_url, req.headers['referer'],
      JSON.stringify(rawParams),
    ]);

    const trackingId = rows[0].id;

    if (utmParams.gclid) {
      await redis.set(`gclid:${utmParams.gclid}`, trackingId, 86400 * 90);
    }
    if (utmParams.fbclid) {
      await redis.set(`fbclid:${utmParams.fbclid}`, trackingId, 86400 * 90);
    }
    await redis.set(`session:${sessionId}`, trackingId, 86400 * 30);

    res.json({ session_id: sessionId, tracking_id: trackingId });
  } catch (err) {
    console.error('capture error:', err);
    res.status(500).json({ error: 'Erro ao capturar sessão' });
  }
}

async function event(req, res) {
  try {
    const { session_id, event_name, event_category, event_label, event_value, page_url, metadata = {} } = req.body;
    if (!session_id || !event_name) return res.status(400).json({ error: 'session_id e event_name obrigatórios' });

    const trackingId = await redis.get(`session:${session_id}`);

    await db.query(`
      INSERT INTO analytics_events (id, session_id, utm_tracking_id, event_name, event_category, event_label, event_value, page_url, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    `, [
      uuidv4(), session_id, trackingId || null,
      event_name, event_category, event_label, event_value,
      page_url, JSON.stringify(metadata),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('event error:', err);
    res.status(500).json({ error: 'Erro ao registrar evento' });
  }
}

async function resolveByGclid(req, res) {
  try {
    const { gclid } = req.params;
    const cached = await redis.get(`gclid:${gclid}`);
    if (cached) return res.json({ tracking_id: cached });

    const { rows } = await db.query(
      'SELECT id FROM utm_tracking WHERE gclid = $1 LIMIT 1',
      [gclid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'GCLID não encontrado' });
    res.json({ tracking_id: rows[0].id });
  } catch (err) {
    console.error('resolveByGclid error:', err);
    res.status(500).json({ error: 'Erro ao resolver GCLID' });
  }
}

async function trafficDashboard(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const [sessionsRes, sourceRes, deviceRes, keywordRes] = await Promise.all([
      db.query(`
        SELECT DATE(first_seen_at) as date, COUNT(*) as sessions
        FROM utm_tracking WHERE first_seen_at BETWEEN $1 AND $2
        GROUP BY DATE(first_seen_at) ORDER BY date
      `, [df, dt]),
      db.query(`
        SELECT ut.utm_source, ut.utm_medium, COUNT(*) as sessions,
          COUNT(DISTINCT l.id) as leads
        FROM utm_tracking ut
        LEFT JOIN leads l ON l.utm_tracking_id = ut.id
        WHERE ut.first_seen_at BETWEEN $1 AND $2
        GROUP BY ut.utm_source, ut.utm_medium ORDER BY sessions DESC LIMIT 20
      `, [df, dt]),
      db.query(`
        SELECT device_type, COUNT(*) as count
        FROM utm_tracking WHERE first_seen_at BETWEEN $1 AND $2
        GROUP BY device_type
      `, [df, dt]),
      db.query(`
        SELECT ut.utm_term as keyword, COUNT(*) as sessions, COUNT(DISTINCT l.id) as leads
        FROM utm_tracking ut
        LEFT JOIN leads l ON l.utm_tracking_id = ut.id
        WHERE ut.utm_term IS NOT NULL AND ut.first_seen_at BETWEEN $1 AND $2
        GROUP BY ut.utm_term ORDER BY leads DESC LIMIT 20
      `, [df, dt]),
    ]);

    res.json({
      sessions: sessionsRes.rows,
      bySource: sourceRes.rows,
      byDevice: deviceRes.rows,
      topKeywords: keywordRes.rows,
    });
  } catch (err) {
    console.error('trafficDashboard error:', err);
    res.status(500).json({ error: 'Erro ao buscar dashboard de tráfego' });
  }
}

function detectDevice(ua) {
  if (!ua) return 'unknown';
  if (/mobile|android|iphone|ipad|tablet/i.test(ua)) {
    return /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
  }
  return 'desktop';
}

module.exports = { capture, event, resolveByGclid, trafficDashboard };
