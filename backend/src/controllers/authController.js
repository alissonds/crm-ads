const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  try {
    const { rows } = await db.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Dados inválidos. Senha mínimo 8 caracteres.' });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!await bcrypt.compare(currentPassword, rows[0].password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
}

const MAX_USERS = 5;

async function register(req, res) {
  const { name, email, password, whatsapp_number, company } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha mínimo 8 caracteres' });

  try {
    const { rows: existing } = await db.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existing[0]) return res.status(400).json({ error: 'Email já cadastrado' });

    const { rows: count } = await db.query(`SELECT COUNT(*) FROM users`);
    if (parseInt(count[0].count) >= MAX_USERS) {
      return res.status(400).json({ error: 'Limite de usuários atingido. Entre em contato com o administrador.' });
    }

    const hash = await bcrypt.hash(password, 10);
    // Armazena dados extras no avatar_url como JSON temporário (sem migração de schema)
    const extraData = JSON.stringify({ whatsapp_number: whatsapp_number || null, company: company || null });
    const { rows } = await db.query(`
      INSERT INTO users (name, email, password_hash, role, is_active, avatar_url, created_at, updated_at)
      VALUES ($1, $2, $3, 'agent', false, $4, NOW(), NOW())
      RETURNING id, name, email, role, is_active, created_at, avatar_url
    `, [name, email.toLowerCase().trim(), hash, extraData]);

    res.status(201).json({ message: 'Cadastro enviado! Aguarde a aprovação do administrador.', user: rows[0] });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: err.message || 'Erro ao criar cadastro' });
  }
}

async function listUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ORDER BY created_at ASC`
    );
    res.json({ users: rows, total: rows.length, max: MAX_USERS });
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
}

async function createUser(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admins podem criar usuários' });

  const { name, email, password, role = 'agent' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha mínimo 8 caracteres' });
  if (!['admin', 'manager', 'agent'].includes(role)) return res.status(400).json({ error: 'Role inválido' });

  try {
    const { rows: count } = await db.query(`SELECT COUNT(*) FROM users WHERE is_active = true`);
    if (parseInt(count[0].count) >= MAX_USERS) {
      return res.status(400).json({ error: `Limite de ${MAX_USERS} usuários atingido` });
    }

    const { rows: existing } = await db.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existing[0]) return res.status(400).json({ error: 'Email já cadastrado' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(`
      INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, name, email, role, is_active, created_at
    `, [name, email.toLowerCase().trim(), hash, role]);

    res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('createUser error:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
}

async function updateUser(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admins podem editar usuários' });

  const { id } = req.params;
  const { name, email, role, is_active, password } = req.body;

  try {
    const { rows: existing } = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!existing[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Impede desativar o próprio admin
    if (id === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
    }

    const updates = [];
    const params = [];
    let p = 1;

    if (name) { updates.push(`name = $${p++}`); params.push(name); }
    if (email) { updates.push(`email = $${p++}`); params.push(email.toLowerCase().trim()); }
    if (role && ['admin', 'manager', 'agent'].includes(role)) { updates.push(`role = $${p++}`); params.push(role); }
    if (is_active !== undefined) { updates.push(`is_active = $${p++}`); params.push(is_active); }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Senha mínimo 8 caracteres' });
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${p++}`); params.push(hash);
    }

    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${p} RETURNING id, name, email, role, is_active, created_at`,
      params
    );

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('updateUser error:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
}

module.exports = { login, me, changePassword, register, listUsers, createUser, updateUser };
