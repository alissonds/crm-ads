const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { apiLimiter, webhookLimiter, trackingLimiter } = require('../middleware/rateLimiter');

// Controllers
const authCtrl = require('../controllers/authController');
const leadsCtrl = require('../controllers/leadsController');
const trackingCtrl = require('../controllers/trackingController');
const analyticsCtrl = require('../controllers/analyticsController');
const webhookCtrl = require('../controllers/webhookController');
const campaignCtrl = require('../controllers/campaignController');
const automationCtrl = require('../controllers/automationController');
const conversionCtrl = require('../controllers/conversionController');

// --- AUTH ---
router.post('/auth/login', authCtrl.login);
router.post('/auth/register', authCtrl.register);
router.get('/auth/me', authenticate, authCtrl.me);
router.put('/auth/password', authenticate, authCtrl.changePassword);

// --- USUÁRIOS (admin only) ---
router.get('/users', authenticate, authCtrl.listUsers);
router.post('/users', authenticate, authCtrl.createUser);
router.put('/users/:id', authenticate, authCtrl.updateUser);

// --- LEADS ---
router.get('/leads', authenticate, apiLimiter, leadsCtrl.list);
router.get('/leads/stats', authenticate, leadsCtrl.stats);
router.get('/leads/:id', authenticate, leadsCtrl.getById);
router.post('/leads', authenticate, leadsCtrl.create);
router.put('/leads/:id', authenticate, leadsCtrl.update);
router.post('/leads/:id/activities', authenticate, leadsCtrl.addActivity);

// --- TRACKING (público - chamado pela landing page) ---
router.post('/track/capture', trackingLimiter, trackingCtrl.capture);
router.get('/track/capture', trackingLimiter, trackingCtrl.capture);
router.post('/track/event', trackingLimiter, trackingCtrl.event);
router.get('/track/gclid/:gclid', authenticate, trackingCtrl.resolveByGclid);
router.get('/track/dashboard', authenticate, trackingCtrl.trafficDashboard);

// --- ANALYTICS ---
router.get('/analytics/overview', authenticate, analyticsCtrl.overview);
router.get('/analytics/campaigns', authenticate, analyticsCtrl.campaignPerformance);
router.get('/analytics/keywords', authenticate, analyticsCtrl.keywordPerformance);
router.get('/analytics/attribution', authenticate, analyticsCtrl.attributionReport);
router.get('/analytics/chart', authenticate, analyticsCtrl.dailyChart);

// --- CAMPANHAS ---
router.get('/campaigns', authenticate, campaignCtrl.list);
router.get('/campaigns/:id', authenticate, campaignCtrl.getById);
router.post('/campaigns/sync/google', authenticate, campaignCtrl.syncGoogle);
router.post('/campaigns/sync/meta', authenticate, campaignCtrl.syncMeta);
router.get('/campaigns/:id/roas', authenticate, campaignCtrl.getRoas);

// --- CONVERSÕES ---
router.get('/conversions', authenticate, conversionCtrl.list);
router.post('/conversions/send', authenticate, conversionCtrl.send);
router.post('/conversions/retry', authenticate, conversionCtrl.retry);

// --- AUTOMAÇÕES ---
router.get('/automations', authenticate, automationCtrl.list);
router.post('/automations', authenticate, automationCtrl.create);
router.put('/automations/:id', authenticate, automationCtrl.update);
router.delete('/automations/:id', authenticate, automationCtrl.remove);
router.post('/automations/:id/test', authenticate, automationCtrl.test);

// --- WEBHOOKS (receber leads externos) ---
router.get('/webhook/meta', webhookCtrl.verifyMeta);
router.post('/webhook/meta', webhookLimiter, webhookCtrl.receiveMeta);
router.get('/webhook/whatsapp', webhookCtrl.verifyWhatsApp);
router.post('/webhook/whatsapp', webhookLimiter, webhookCtrl.receiveWhatsApp);
router.post('/webhook/lead/:token', webhookLimiter, webhookCtrl.receiveGeneric);
router.get('/webhook/configs', authenticate, webhookCtrl.listConfigs);
router.post('/webhook/configs', authenticate, webhookCtrl.createConfig);

// --- HEALTH ---
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
