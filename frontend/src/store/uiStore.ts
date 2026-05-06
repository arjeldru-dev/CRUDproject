import { create } from 'zustand';

interface UiState {
  isTransactionFormOpen: boolean;
  transactionFormMode: 'expense' | 'settlement';
  transactionTimestamp: number;
  openTransactionForm: (mode?: 'expense' | 'settlement') => void;
  closeTransactionForm: () => void;
  notifyTransactionComplete: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isTransactionFormOpen: false,
  transactionFormMode: 'expense',
  transactionTimestamp: Date.now(),
  openTransactionForm: (mode = 'expense') =>
    set({ isTransactionFormOpen: true, transactionFormMode: mode }),
  closeTransactionForm: () => set({ isTransactionFormOpen: false }),
  notifyTransactionComplete: () => set({ transactionTimestamp: Date.now() }),
}));
