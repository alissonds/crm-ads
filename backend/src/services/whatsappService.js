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
      'Olá! Recebemos sua mensagem. Em breve um de nossos atendentes entrará em contato. 😊';
  }

  // Verificação do webhook pela Meta
  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verificação falhou' });
  }

  // Valida assinatura HMAC do payload
  validateSignature(rawBody, signature) {
    if (!this.appSecret || !signature) return true; // ignora se não configurado
    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // Processa mensagens recebidas
  async processWebhook(body) {
    const results = [];

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const message of messages) {
          // Só processa a primeira mensagem de cada contato (evita duplicatas)
          const result = await this._processMessage(message, contacts, value.metadata);
          if (result) results.push(result);
        }
      }
    }

    return results;
  }

  async _processMessage(message, contacts, metadata) {
    const phone = message.from; // número no formato internacional sem +
    const contact = contacts.find(c => c.wa_id === phone);
    const name = contact?.profile?.name || null;
    const referral = message.referral || null; // dados do anúncio CTWA

    // Verifica se lead já existe (pelo telefone, nas últimas 24h)
    const { rows: [existing] } = await db.query(
      `SELECT id FROM leads WHERE whatsapp = $1 OR phone = $1 LIMIT 1`,
      [phone]
    );

    if (existing) {
      // Registra nova atividade se já existir
      await db.query(`
        INSERT INTO lead_activities (id, lead_id, type, title, metadata, created_at)
        VALUES ($1, $2, 'whatsapp_message', 'Nova mensagem WhatsApp', $3, NOW())
      `, [
        uuidv4(), existing.id,
        JSON.stringify({ message_type: message.type, referral }),
      ]);
      return null;
    }

    // Extrai dados da campanha a partir do referral (disponível em anúncios CTWA)
    const utmSource = referral ? 'facebook' : 'whatsapp';
    const utmMedium = referral ? 'cpc' : 'organic';
    const utmCampaign = referral?.headline || null;
    const adId = referral?.source_id || null;
    const ctwaClid = referral?.ctwa_clid || null;

    // Busca campanha pelo ad_id se disponível
    let campaignId = null;
    if (adId) {
      const { rows: [camp] } = await db.query(
        `SELECT id FROM campaigns WHERE external_id = $1 LIMIT 1`,
        [adId]
      );
      campaignId = camp?.id || null;
    }

    const { rows } = await db.query(`
      INSERT INTO leads (
        id, name, phone, whatsapp,
        utm_source, utm_medium, utm_campaign,
        campaign_id, source_channel, status,
        custom_fields, created_at, updated_at
      )
      VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'whatsapp','new',$8,NOW(),NOW())
      RETURNING *
    `, [
      uuidv4(), name, phone,
      utmSource, utmMedium, utmCampaign,
      campaignId,
      JSON.stringify({
        ad_id: adId,
        ctwa_clid: ctwaClid,
        referral_source_type: referral?.source_type,
        referral_headline: referral?.headline,
        referral_body: referral?.body,
        first_message: message.text?.body || `[${message.type}]`,
      }),
    ]);

    const lead = rows[0];

    await db.query(`
      INSERT INTO lead_activities (id, lead_id, type, title, metadata, created_at)
      VALUES ($1, $2, 'whatsapp_message', 'Lead criado via WhatsApp', $3, NOW())
    `, [
      uuidv4(), lead.id,
      JSON.stringify({ via: referral ? 'ctwa_ad' : 'direct', referral }),
    ]);

    setImmediate(() => automationService.trigger('lead_created', lead).catch(() => {}));

    // Envia mensagem de boas-vindas
    await this.sendMessage(phone, this.welcomeMessage).catch(() => {});

    return lead;
  }

  async sendMessage(to, text) {
    if (!this.token || !this.phoneNumberId) return null;

    const res = await axios.post(
      `${GRAPH_URL}/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    return res.data;
  }
}

module.exports = new WhatsAppService();
