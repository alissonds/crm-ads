import { create } from 'zustand';
import { authAPI } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('crm_token'),
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    const { data } = await authAPI.login(email, password);
    localStorage.setItem('crm_token', data.token);
    set({ user: data.user, token: data.token, loading: false });
    return data;
  },

  logout: () => {
    localStorage.removeItem('crm_token');
    set({ user: null, token: null });
  },

  loadUser: async () => {
    if (!get().token) return;
    try {
      const { data } = await authAPI.me();
      set({ user: data.user });
    } catch (err) {
      // Só faz logout em erro de autenticação (401), não em erros de rede
      if (err?.response?.status === 401) {
        get().logout();
      }
    }
  },
}));
