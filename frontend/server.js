const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Proxy /api para o backend
app.use('/api', (req, res) => {
  const target = new URL(BACKEND_URL);
  const isHttps = target.protocol === 'https:';
  const options = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: '/api' + req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };

  const proxyReq = (isHttps ? https : http).request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Backend indisponível' });
  });

  req.pipe(proxyReq, { end: true });
});

// SPA routing
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend rodando na porta ${PORT} | Backend: ${BACKEND_URL}`);
});
