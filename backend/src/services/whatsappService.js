const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const automationService = require('./automationService');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

class WhatsAppService {
  constructor() {
    this.token = process.env.WHATSAPP_BUSINESS_API_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    this.appSecret = process.env.META_APP_SECRET;
    this.welcomeMessage = process.env.WHATSAPP_WELCOME_MESSAGE ||
      'Olá! Recebemos sua mensagem. Em breve um de nossos atendentes entrará em contato.';
  }

  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === this.verifyToken) return res.status(200).send(challenge);
    return res.status(403).json({ error: 'Verificação falhou' });
  }

  validateSignature(rawBody, signature) {
    if (!this.appSecret || !signature) return true;
    const expected = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  async processWebhook(body) {
    const results = [];
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const phoneNumberId = value.metadata?.phone_number_id;

        for (const message of messages) {
          const result = await this._processMessage(message, contacts, phoneNumberId);
          if (result) results.push(result);
        }
      }
    }
    return results;
  }

  async _processMessage(message, contacts, phoneNumberId) {
    const phone = message.from;
    const contact = contacts.find(c => c.wa_id === phone);
    const name = contact?.profile?.name || null;
    const referral = message.referral || null;
    const content = message.text?.body || message.caption || `[${message.type}]`;
    const sentAt = message.timestamp ? new Date(parseInt(message.timestamp) * 1000) : new Date();

    // Descobre a qual cliente este número de WhatsApp pertence
    let assignedTo = null;
    if (phoneNumberId) {
      const { rows: [cfg] } = await db.query(
        `SELECT user_id FROM client_configs WHERE whatsapp_phone_number_id = $1 AND is_active = true LIMIT 1`,
        [phoneNumberId]
      );
      assignedTo = cfg?.user_id || null;
    }

    // Verifica se lead já existe pelo telefone
    const { rows: [existing] } = await db.query(
      `SELECT id FROM leads WHERE whatsapp = $1 OR phone = $1 LIMIT 1`,
      [phone]
    );

    let leadId;
    if (existing) {
      leadId = existing.id;
      // Se o lead existir mas não tiver assigned_to, atribui agora
      if (assignedTo) {
        await db.query(
          `UPDATE leads SET assigned_to = COALESCE(assigned_to, $1), updated_at = NOW() WHERE id = $2`,
          [assignedTo, leadId]
        );
      }
    } else {
      // Cria novo lead
      const utmSource = referral ? 'facebook' : 'whatsapp';
      const utmMedium = referral ? 'cpc' : 'organic';
      const adId = referral?.source_id || null;
      let campaignId = null;

      if (adId) {
        const { rows: [camp] } = await db.query(
          `SELECT id FROM campaigns WHERE external_id = $1 LIMIT 1`, [adId]
        );
        campaignId = camp?.id || null;
      }

      const { rows } = await db.query(`
        INSERT INTO leads (
          id, name, phone, whatsapp, assigned_to,
          utm_source, utm_medium, utm_campaign,
          campaign_id, source_channel, status,
          custom_fields, created_at, updated_at
        )
        VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,'whatsapp','new',$9,NOW(),NOW())
        RETURNING *
      `, [
        uuidv4(), name, phone, assignedTo,
        utmSource, utmMedium, referral?.headline || null,
        campaignId,
        JSON.stringify({
          ad_id: adId,
          ctwa_clid: referral?.ctwa_clid,
          referral_headline: referral?.headline,
          whatsapp_phone_number_id: phoneNumberId,
        }),
      ]);

      const lead = rows[0];
      leadId = lead.id;

      await db.query(`
        INSERT INTO lead_activities (id, lead_id, type, title, metadata, created_at)
        VALUES ($1, $2, 'whatsapp_message', 'Lead criado via WhatsApp', $3, NOW())
      `, [uuidv4(), leadId, JSON.stringify({ via: referral ? 'ctwa_ad' : 'direct', referral })]);

      setImmediate(() => automationService.trigger('lead_created', lead).catch(() => {}));

      // Envia boas-vindas usando o phone_number_id correto do cliente
      await this.sendMessage(phone, this.welcomeMessage, phoneNumberId).catch(() => {});
    }

    // Salva mensagem no histórico (ignora duplicatas por wa_message_id)
    if (message.id) {
      await db.query(`
        INSERT INTO whatsapp_messages (id, lead_id, wa_message_id, direction, message_type, content, metadata, sent_at, created_at)
        VALUES ($1,$2,$3,'in',$4,$5,$6,$7,NOW())
        ON CONFLICT (wa_message_id) DO NOTHING
      `, [
        uuidv4(), leadId, message.id,
        message.type, content,
        JSON.stringify({ referral, contact_name: name }),
        sentAt,
      ]);
    }

    return leadId;
  }

  async sendMessage(to, text, phoneNumberId) {
    const pid = phoneNumberId || this.phoneNumberId;
    if (!this.token || !pid) return null;

    const res = await axios.post(
      `${GRAPH_URL}/${pid}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    return res.data;
  }
}

module.exports = new WhatsAppService();
