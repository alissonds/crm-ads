const cron = require('node-cron');
const googleAds = require('../services/googleAdsService');
const metaAds = require('../services/metaAdsService');
const conversionService = require('../services/conversionService');
const logger = require('../config/logger');

logger.info('Workers iniciados');

// Sincroniza Google Ads a cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  logger.info('Worker: Sincronizando Google Ads...');
  try {
    const count = await googleAds.syncCampaigns();
    await googleAds.syncKeywords();
    logger.info(`Worker: ${count} campanhas Google Ads sincronizadas`);
  } catch (err) {
    logger.error({ err }, 'Worker: Erro Google Ads sync');
  }
});

// Sincroniza Meta Ads a cada 6 horas (offset de 30min)
cron.schedule('30 */6 * * *', async () => {
  logger.info('Worker: Sincronizando Meta Ads...');
  try {
    const count = await metaAds.syncCampaigns();
    logger.info(`Worker: ${count} campanhas Meta Ads sincronizadas`);
  } catch (err) {
    logger.error({ err }, 'Worker: Erro Meta Ads sync');
  }
});

// Reenvio de conversões falhas a cada hora
cron.schedule('0 * * * *', async () => {
  try {
    await conversionService.retryFailed();
  } catch (err) {
    logger.error({ err }, 'Worker: Erro retry conversões');
  }
});

// Atualiza métricas diárias à meia-noite
cron.schedule('5 0 * * *', async () => {
  const db = require('../config/database');
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  try {
    await db.query(`
      INSERT INTO daily_metrics (id, date, platform, campaign_id, leads_total, leads_won, revenue, cpl, created_at)
      SELECT uuid_generate_v4(), $1::date, c.platform, l.campaign_id,
        COUNT(l.id), COUNT(l.id) FILTER (WHERE l.status = 'won'),
        COALESCE(SUM(l.actual_value) FILTER (WHERE l.status = 'won'), 0),
        CASE WHEN COUNT(l.id) > 0 THEN COALESCE(c.spend, 0) / COUNT(l.id) ELSE 0 END,
        NOW()
      FROM leads l
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      WHERE DATE(l.created_at) = $1::date
      GROUP BY c.platform, l.campaign_id, c.spend
      ON CONFLICT (date, platform, campaign_id, ad_group_id, keyword_id) DO NOTHING
    `, [yesterday]);
    logger.info(`Worker: Métricas de ${yesterday} calculadas`);
  } catch (err) {
    logger.error({ err }, 'Worker: Erro métricas diárias');
  }
});
