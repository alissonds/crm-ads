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

  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!await bcrypt.compare(currentPassword, rows[0].password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
  res.json({ message: 'Senha alterada com sucesso' });
}

module.exports = { login, me, changePassword };
