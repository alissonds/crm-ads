import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Conta "todas" — admin vê tudo sem filtro
export const ALL_ACCOUNTS = { id: '__all__', label: 'Todas as contas' };

export const useAccountStore = create(
  persist(
    (set) => ({
      selected: ALL_ACCOUNTS, // conta selecionada atualmente
      select: (account) => set({ selected: account }),
      reset: () => set({ selected: ALL_ACCOUNTS }),
    }),
    { name: 'crm-selected-account' }
  )
);
