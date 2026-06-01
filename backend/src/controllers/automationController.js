const automationService = require('../services/automationService');
const db = require('../config/database');

async function list(req, res) {
  try {
    const automations = await automationService.list();
    res.json({ automations });
  } catch (err) {
    console.error('automation list error:', err);
    res.status(500).json({ error: 'Erro ao listar automações' });
  }
}

async function create(req, res) {
  try {
    const automation = await automationService.create(req.body, req.user.id);
    res.status(201).json({ automation });
  } catch (err) {
    console.error('automation create error:', err);
    res.status(500).json({ error: 'Erro ao criar automação' });
  }
}

async function update(req, res) {
  try {
    const automation = await automationService.update(req.params.id, req.body);
    if (!automation) return res.status(404).json({ error: 'Automação não encontrada' });
    res.json({ automation });
  } catch (err) {
    console.error('automation update error:', err);
    res.status(500).json({ error: 'Erro ao atualizar automação' });
  }
}

async function remove(req, res) {
  try {
    await automationService.remove(req.params.id);
    res.json({ message: 'Automação removida' });
  } catch (err) {
    console.error('automation remove error:', err);
    res.status(500).json({ error: 'Erro ao remover automação' });
  }
}

async function test(req, res) {
  try {
    const { lead_id } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id obrigatório' });

    const { rows: [automation] } = await db.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
    const { rows: [lead] } = await db.query('SELECT * FROM leads WHERE id = $1', [lead_id]);

    if (!automation || !lead) return res.status(404).json({ error: 'Automação ou lead não encontrado' });

    await automationService.trigger(automation.trigger_type, lead);
    res.json({ message: 'Automação executada em modo teste' });
  } catch (err) {
    console.error('automation test error:', err);
    res.status(500).json({ error: 'Erro ao executar automação' });
  }
}

module.exports = { list, create, update, remove, test };
