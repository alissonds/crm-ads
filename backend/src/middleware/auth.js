const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Usuário inativo ou não encontrado' });
    req.user = rows[0];

    // Para não-admins: carrega a conta atribuída para filtrar dados automaticamente
    if (req.user.role !== 'admin') {
      const { rows: cfgRows } = await db.query(
        'SELECT meta_ad_account_id FROM client_configs WHERE user_id = $1 AND is_active = true LIMIT 1',
        [req.user.id]
      );
      req.user.meta_ad_account_id = cfgRows[0]?.meta_ad_account_id || null;
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
