/**
 * CRM ADS - Universal Tracker v1.0
 * Adicione na <head> de todas as landing pages:
 * <script src="https://seu-dominio.com/tracker.js" data-api="https://api.seu-dominio.com"></script>
 */
(function (window, document) {
  'use strict';

  var CRM_API = document.currentScript?.getAttribute('data-api') || 'http://localhost:3001/api';
  var COOKIE_DAYS = 90;
  var SESSION_KEY = 'crm_session_id';
  var UTM_COOKIE = 'crm_utm';
  var GCLID_COOKIE = 'crm_gclid';
  var FBCLID_COOKIE = 'crm_fbclid';

  // ─── Utilidades ──────────────────────────────────────────────────────────────

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(value)) +
      '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])); } catch { return null; }
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getDevice() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function post(path, data) {
    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      navigator.sendBeacon(CRM_API + path, blob);
      return;
    }
    fetch(CRM_API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(function () {});
  }

  // ─── Captura de parâmetros ────────────────────────────────────────────────────

  var UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function collectParams() {
    var params = {};

    // UTM
    UTM_PARAMS.forEach(function (key) {
      var val = getParam(key);
      if (val) params[key] = val;
    });

    // Google Click ID
    var gclid = getParam('gclid');
    if (gclid) {
      params.gclid = gclid;
      setCookie(GCLID_COOKIE, { gclid: gclid, ts: Date.now() }, COOKIE_DAYS);
    } else {
      var saved = getCookie(GCLID_COOKIE);
      if (saved?.gclid) params.gclid = saved.gclid;
    }

    // Google Broadcast IDs
    var gbraid = getParam('gbraid');
    var wbraid = getParam('wbraid');
    if (gbraid) params.gbraid = gbraid;
    if (wbraid) params.wbraid = wbraid;

    // Meta Click ID
    var fbclid = getParam('fbclid');
    if (fbclid) {
      params.fbclid = fbclid;
      setCookie(FBCLID_COOKIE, { fbclid: fbclid, ts: Date.now() }, COOKIE_DAYS);
    } else {
      var savedFb = getCookie(FBCLID_COOKIE);
      if (savedFb?.fbclid) params.fbclid = savedFb.fbclid;
    }

    // Se veio GCLID sem UTM, infere origem Google
    if (params.gclid && !params.utm_source) {
      params.utm_source = 'google';
      params.utm_medium = params.utm_medium || 'cpc';
    }

    // Se veio FBCLID sem UTM, infere origem Meta
    if (params.fbclid && !params.utm_source) {
      params.utm_source = 'facebook';
      params.utm_medium = params.utm_medium || 'paid';
    }

    // Informações do ambiente
    params.page_url = window.location.href;
    params.device = getDevice();
    params.screen = screen.width + 'x' + screen.height;
    params.referer = document.referrer || '';
    params.title = document.title;
    params.lang = navigator.language;
    params.session_id = getOrCreateSession();

    return params;
  }

  function getOrCreateSession() {
    var sid = sessionStorage.getItem(SESSION_KEY) || getCookie(SESSION_KEY);
    if (!sid) {
      sid = uuid();
      sessionStorage.setItem(SESSION_KEY, sid);
      setCookie(SESSION_KEY, sid, 1);
    }
    return sid;
  }

  // ─── Inicialização ───────────────────────────────────────────────────────────

  var params = collectParams();

  // Salva UTMs no cookie para persistir entre páginas
  if (Object.keys(params).some(function (k) { return UTM_PARAMS.includes(k); })) {
    setCookie(UTM_COOKIE, params, COOKIE_DAYS);
  } else {
    var savedUtm = getCookie(UTM_COOKIE);
    if (savedUtm) {
      UTM_PARAMS.forEach(function (k) {
        if (savedUtm[k] && !params[k]) params[k] = savedUtm[k];
      });
    }
  }

  // Envia sessão para o CRM
  post('/track/capture', params);

  // Expõe dados globalmente
  window.CRMTracker = {
    params: params,
    sessionId: params.session_id,

    // Envia evento personalizado
    event: function (eventName, eventData) {
      post('/track/event', Object.assign({
        session_id: params.session_id,
        event_name: eventName,
        page_url: window.location.href,
      }, eventData || {}));
    },

    // Gera URL do WhatsApp com parâmetros embutidos
    whatsappUrl: function (phone, message) {
      phone = phone || document.body.getAttribute('data-whatsapp') || '5511999999999';
      var baseMsg = message || 'Olá! Vi seu anúncio e gostaria de mais informações.';

      var extra = '';
      if (params.utm_campaign) extra += ' | Campanha: ' + params.utm_campaign;
      if (params.utm_term || params.keyword) extra += ' | Keyword: ' + (params.utm_term || params.keyword);
      if (params.gclid) extra += ' | Ref: ' + params.gclid.slice(0, 8);

      var encoded = encodeURIComponent(baseMsg + extra);
      return 'https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encoded;
    },

    // Botão WhatsApp inteligente
    initWhatsAppButtons: function () {
      var self = this;
      var buttons = document.querySelectorAll('[data-whatsapp-btn], .whatsapp-btn, #whatsapp-btn');
      buttons.forEach(function (btn) {
        btn.href = self.whatsappUrl(btn.getAttribute('data-phone'));
        btn.target = '_blank';
        btn.addEventListener('click', function () {
          self.event('whatsapp_click', {
            event_category: 'engagement',
            event_label: params.utm_campaign || 'direct',
            metadata: {
              source: params.utm_source,
              campaign: params.utm_campaign,
              keyword: params.utm_term,
              gclid: params.gclid,
              fbclid: params.fbclid,
            },
          });
        });
      });
    },

    // Rastreia formulários automaticamente
    initForms: function () {
      var self = this;
      var forms = document.querySelectorAll('form[data-crm-form]');
      forms.forEach(function (form) {
        form.addEventListener('submit', function (e) {
          var formData = {};
          new FormData(form).forEach(function (val, key) { formData[key] = val; });

          self.event('form_submit', {
            event_category: 'conversion',
            event_label: form.id || 'form',
            metadata: Object.assign({}, params, formData),
          });
        });
      });
    },
  };

  // Auto-inicializa quando o DOM estiver pronto
  function init() {
    window.CRMTracker.initWhatsAppButtons();
    window.CRMTracker.initForms();

    // Page view event
    window.CRMTracker.event('page_view', {
      event_category: 'engagement',
      metadata: {
        source: params.utm_source,
        medium: params.utm_medium,
        campaign: params.utm_campaign,
        device: params.device,
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
