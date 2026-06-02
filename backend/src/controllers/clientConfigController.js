const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

// Lista todas as contas de anúncio que o admin gerencia via Meta API
// Busca de /me/adaccounts + todos os portfólios empresariais (BMs)
async function listMetaAccounts(req, res) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ error: 'META_ACCESS_TOKEN não configurado' });

    const fields = 'id,name,account_status,currency,amount_spent,balance';
    const accountMap = {};

    // 1. Contas pessoais do usuário
    try {
      const { data: personal } = await axios.get(`${GRAPH_URL}/me/adaccounts`, {
        params: { access_token: token, fields, limit: 200 },
      });
      for (const acc of personal.data || []) accountMap[acc.id] = acc;
    } catch {}

    // 2. Portfólios empresariais (Business Managers)
    try {
      const { data: bizData } = await axios.get(`${GRAPH_URL}/me/businesses`, {
        params: { access_token: token, fields: 'id,name', limit: 50 },
      });

      await Promise.all((bizData.data || []).map(async (biz) => {
        // Contas próprias do portfólio
        try {
          const { data: owned } = await axios.get(`${GRAPH_URL}/${biz.id}/owned_ad_accounts`, {
            params: { access_token: token, fields, limit: 200 },
          });
          for (const acc of owned.data || []) {
            accountMap[acc.id] = { ...acc, business_name: biz.name, business_id: biz.id };
          }
        } catch {}

        // Contas clientes do portfólio
        try {
          const { data: client } = await axios.get(`${GRAPH_URL}/${biz.id}/client_ad_accounts`, {
            params: { access_token: token, fields, limit: 200 },
          });
          for (const acc of client.data || []) {
            accountMap[acc.id] = { ...acc, business_name: biz.name, business_id: biz.id };
          }
        } catch {}
      }));
    } catch {}

    // Busca configurações já salvas para cruzar com os dados da API
    const { rows: configs } = await db.query(
      `SELECT cc.*, u.name as client_name, u.email as client_email
       FROM client_configs cc
       JOIN users u ON cc.user_id = u.id`
    );
    const configMap = {};
    for (const c of configs) configMap[c.meta_ad_account_id] = c;

    const accounts = Object.values(accountMap).map(acc => ({
      ...acc,
      assigned_config: configMap[acc.id] || null,
    }));

    // Ordena por nome
    accounts.sort((a, b) => (a.business_name || '').localeCompare(b.business_name || '') || a.name.localeCompare(b.name));

    res.json({ accounts, total: accounts.length });
  } catch (err) {
    console.error('listMetaAccounts error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || 'Erro ao buscar contas Meta' });
  }
}

// Lista todas as configurações de clientes
async function listConfigs(req, res) {
  try {
    const { rows } = await db.query(`
      SELECT cc.*, u.name as client_name, u.email as client_email, u.is_active as client_active
      FROM client_configs cc
      JOIN users u ON cc.user_id = u.id
      ORDER BY u.name ASC
    `);
    res.json({ configs: rows });
  } catch (err) {
    console.error('listConfigs error:', err);
    res.status(500).json({ error: 'Erro ao listar configurações' });
  }
}

// Cria ou atualiza configuração de um cliente
async function upsertConfig(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admins' });

  const {
    user_id,
    meta_ad_account_id,
    meta_ad_account_name,
    whatsapp_phone_number_id,
    whatsapp_display_number,
    notes,
  } = req.body;

  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  try {
    const { rows: [user] } = await db.query(`SELECT id, name FROM users WHERE id = $1`, [user_id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { rows } = await db.query(`
      INSERT INTO client_configs (id, user_id, meta_ad_account_id, meta_ad_account_name,
        whatsapp_phone_number_id, whatsapp_display_number, notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        meta_ad_account_id = EXCLUDED.meta_ad_account_id,
        meta_ad_account_name = EXCLUDED.meta_ad_account_name,
        whatsapp_phone_number_id = EXCLUDED.whatsapp_phone_number_id,
        whatsapp_display_number = EXCLUDED.whatsapp_display_number,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [
      uuidv4(), user_id,
      meta_ad_account_id || null,
      meta_ad_account_name || null,
      whatsapp_phone_number_id || null,
      whatsapp_display_number || null,
      notes || null,
    ]);

    res.json({ config: rows[0] });
  } catch (err) {
    console.error('upsertConfig error:', err);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
}

// Busca configuração de um cliente específico
async function getConfig(req, res) {
  try {
    const userId = req.params.userId || req.user.id;
    if (req.user.role !== 'admin' && userId !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { rows: [config] } = await db.query(
      `SELECT cc.*, u.name as client_name, u.email as client_email
       FROM client_configs cc
       JOIN users u ON cc.user_id = u.id
       WHERE cc.user_id = $1`,
      [userId]
    );

    res.json({ config: config || null });
  } catch (err) {
    console.error('getConfig error:', err);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
}

// Mensagens WhatsApp de um lead
async function getLeadMessages(req, res) {
  try {
    const { leadId } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM whatsapp_messages WHERE lead_id = $1 ORDER BY sent_at ASC`,
      [leadId]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error('getLeadMessages error:', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
}

module.exports = { listMetaAccounts, listConfigs, upsertConfig, getConfig, getLeadMessages };
