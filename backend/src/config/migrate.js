require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./database');

async function migrate() {
  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Aplicando schema do banco de dados...');
  try {
    await db.query(sql);
    console.log('✅ Schema aplicado com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao aplicar schema:', err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

migrate();
