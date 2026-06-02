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
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.resolve(__dirname, '../schema.sql');
    if (fs.existsSync(schemaPath)) {
      const db = require('./config/database');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await db.query(sql);
      logger.info('✅ Schema do banco aplicado');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Aviso na migração (não crítico)');
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
