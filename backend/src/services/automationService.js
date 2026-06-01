const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Dispara automações para um evento e lead
async function trigger(eventType, lead) {
  const { rows: automations } = await db.query(`
    SELECT * FROM automations
    WHERE is_active = true AND trigger_type = $1
    ORDER BY created_at
  `, [eventType]);

  for (const automation of automations) {
    try {
      const conditions = automation.conditions || [];
      const match = evaluateConditions(conditions, lead);

      if (!match) continue;

      const results = await executeActions(automation.actions || [], lead);

      await db.query(`
        INSERT INTO automation_logs (id, automation_id, lead_id, status, actions_executed, created_at)
        VALUES ($1,$2,$3,'success',$4,NOW())
      `, [uuidv4(), automation.id, lead.id, JSON.stringify(results)]);

      await db.query(`
        UPDATE automations SET execution_count = execution_count + 1, last_executed_at = NOW()
        WHERE id = $1
      `, [automation.id]);
    } catch (err) {
      await db.query(`
        INSERT INTO automation_logs (id, automation_id, lead_id, status, error_message, created_at)
        VALUES ($1,$2,$3,'failed',$4,NOW())
      `, [uuidv4(), automation.id, lead.id, err.message]);
    }
  }
}

function evaluateConditions(conditions, lead) {
  if (!conditions.length) return true;

  return conditions.every(cond => {
    const value = getNestedValue(lead, cond.field);
    switch (cond.operator) {
      case 'equals': return String(value) === String(cond.value);
      case 'not_equals': return String(value) !== String(cond.value);
      case 'contains': return String(value || '').toLowerCase().includes(String(cond.value).toLowerCase());
      case 'starts_with': return String(value || '').toLowerCase().startsWith(String(cond.value).toLowerCase());
      case 'greater_than': return parseFloat(value) > parseFloat(cond.value);
      case 'less_than': return parseFloat(value) < parseFloat(cond.value);
      case 'in': return Array.isArray(cond.value) && cond.value.includes(value);
      case 'not_empty': return value !== null && value !== undefined && value !== '';
      default: return false;
    }
  });
}

async function executeActions(actions, lead) {
  const results = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'set_priority':
          await db.query('UPDATE leads SET priority = $1, updated_at = NOW() WHERE id = $2', [action.value, lead.id]);
          results.push({ type: 'set_priority', value: action.value, ok: true });
          break;

        case 'set_status':
          await db.query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', [action.value, lead.id]);
          results.push({ type: 'set_status', value: action.value, ok: true });
          break;

        case 'add_tag':
          await db.query(
            `UPDATE leads SET tags = array_append(tags, $1), updated_at = NOW() WHERE id = $2 AND NOT ($1 = ANY(tags))`,
            [action.value, lead.id]
          );
          results.push({ type: 'add_tag', value: action.value, ok: true });
          break;

        case 'assign_to':
          await db.query('UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [action.value, lead.id]);
          results.push({ type: 'assign_to', value: action.value, ok: true });
          break;

        case 'set_score':
          await db.query('UPDATE leads SET score = $1, updated_at = NOW() WHERE id = $2', [parseInt(action.value), lead.id]);
          results.push({ type: 'set_score', value: action.value, ok: true });
          break;

        case 'add_note':
          await db.query(`
            INSERT INTO lead_activities (id, lead_id, type, title, description, created_at)
            VALUES ($1,$2,'note','Automação: nota automática',$3,NOW())
          `, [uuidv4(), lead.id, action.value]);
          results.push({ type: 'add_note', ok: true });
          break;

        case 'send_webhook': {
          const axios = require('axios');
          await axios.post(action.url, {
            lead,
            automation: action,
            timestamp: new Date().toISOString(),
          }, { timeout: 5000 });
          results.push({ type: 'send_webhook', url: action.url, ok: true });
          break;
        }

        default:
          results.push({ type: action.type, ok: false, error: 'Ação desconhecida' });
      }
    } catch (err) {
      results.push({ type: action.type, ok: false, error: err.message });
    }
  }

  return results;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// CRUD de automações
async function list() {
  const { rows } = await db.query('SELECT * FROM automations ORDER BY created_at DESC');
  return rows;
}

async function create(data, userId) {
  const { rows } = await db.query(`
    INSERT INTO automations (id, name, description, is_active, trigger_type, conditions, actions, created_by, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING *
  `, [uuidv4(), data.name, data.description, data.is_active ?? true, data.trigger_type,
      JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []), userId]);
  return rows[0];
}

async function update(id, data) {
  const { rows } = await db.query(`
    UPDATE automations SET name=$1, description=$2, is_active=$3, trigger_type=$4,
      conditions=$5, actions=$6, updated_at=NOW()
    WHERE id=$7 RETURNING *
  `, [data.name, data.description, data.is_active, data.trigger_type,
      JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []), id]);
  return rows[0];
}

async function remove(id) {
  await db.query('DELETE FROM automations WHERE id = $1', [id]);
}

module.exports = { trigger, list, create, update, remove };
