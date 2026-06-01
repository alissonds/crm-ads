require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes/index');
const logger = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security & compression
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// Workers (cron jobs)
if (process.env.ENABLE_WORKERS !== 'false') {
  require('./workers/index');
}

app.listen(PORT, () => {
  logger.info(`CRM ADS Backend rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
