require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes/index');
const logger = require('./config/logger');

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// Security & compression
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'https://valiant-imagination-production-f84c.up.railway.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Body parsing — raw para webhooks Meta antes do json parser
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhook/meta')) {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    next();
  }
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Rota ${req.method} ${req.path} não encontrada` });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Migração automática ao iniciar
async function startServer() {
  try {
    const db = require('./config/database');
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_configs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        meta_ad_account_id VARCHAR(100),
        meta_ad_account_name VARCHAR(255),
        whatsapp_phone_number_id VARCHAR(100),
        whatsapp_display_number VARCHAR(30),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      );
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        wa_message_id VARCHAR(255) UNIQUE,
        direction VARCHAR(3) CHECK (direction IN ('in', 'out')) DEFAULT 'in',
        message_type VARCHAR(30) DEFAULT 'text',
        content TEXT,
        metadata JSONB DEFAULT '{}',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead ON whatsapp_messages(lead_id);
      CREATE INDEX IF NOT EXISTS idx_client_configs_user ON client_configs(user_id);
      CREATE INDEX IF NOT EXISTS idx_client_configs_phone ON client_configs(whatsapp_phone_number_id);
      CREATE INDEX IF NOT EXISTS idx_client_configs_account ON client_configs(meta_ad_account_id);
    `);
    logger.info('✅ Tabelas client_configs e whatsapp_messages criadas/verificadas');
  } catch (err) {
    logger.warn({ err: err.message }, 'Aviso na migração');
  }

  // Workers (cron jobs)
  if (process.env.ENABLE_WORKERS !== 'false') {
    require('./workers/index');
  }

  app.listen(PORT, () => {
    logger.info(`CRM ADS Backend rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer();

module.exports = app;
