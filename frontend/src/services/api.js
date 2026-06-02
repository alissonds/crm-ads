import axios from 'axios';

// Em produção (Railway), VITE_API_URL aponta para o backend. Em dev, usa proxy local.
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('crm_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/password', data),
};

// Leads
export const leadsAPI = {
  list: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  addActivity: (id, data) => api.post(`/leads/${id}/activities`, data),
  stats: (params) => api.get('/leads/stats', { params }),
};

// Analytics
export const analyticsAPI = {
  overview: (params) => api.get('/analytics/overview', { params }),
  campaigns: (params) => api.get('/analytics/campaigns', { params }),
  keywords: (params) => api.get('/analytics/keywords', { params }),
  attribution: (params) => api.get('/analytics/attribution', { params }),
  chart: (params) => api.get('/analytics/chart', { params }),
};

// Campaigns
export const campaignsAPI = {
  list: (params) => api.get('/campaigns', { params }),
  getInsights: (params) => api.get('/campaigns/insights', { params }),
  getAdSetsInsights: (params) => api.get('/campaigns/adsets/insights', { params }),
  getAdsInsights: (params) => api.get('/campaigns/ads/insights', { params }),
  getById: (id) => api.get(`/campaigns/${id}`),
  syncGoogle: () => api.post('/campaigns/sync/google'),
  syncMeta: (adAccountId) => api.post(`/campaigns/sync/meta${adAccountId ? `?ad_account_id=${adAccountId}` : ''}`),
  getRoas: (id, params) => api.get(`/campaigns/${id}/roas`, { params }),
};

// Traffic / Tracking
export const trackingAPI = {
  dashboard: (params) => api.get('/track/dashboard', { params }),
};

// Automations
export const automationsAPI = {
  list: () => api.get('/automations'),
  create: (data) => api.post('/automations', data),
  update: (id, data) => api.put(`/automations/${id}`, data),
  delete: (id) => api.delete(`/automations/${id}`),
  test: (id, lead_id) => api.post(`/automations/${id}/test`, { lead_id }),
};

// Conversions
export const conversionsAPI = {
  list: (params) => api.get('/conversions', { params }),
  send: (data) => api.post('/conversions/send', data),
  retry: () => api.post('/conversions/retry'),
};

// Webhooks
export const webhooksAPI = {
  listConfigs: () => api.get('/webhook/configs'),
  createConfig: (data) => api.post('/webhook/configs', data),
};

// Users
export const usersAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
};
