import { create } from 'zustand';

interface UiState {
  isTransactionFormOpen: boolean;
  transactionTimestamp: number;
  openTransactionForm: () => void;
  closeTransactionForm: () => void;
  notifyTransactionComplete: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isTransactionFormOpen: false,
  transactionTimestamp: Date.now(),
  openTransactionForm: () => set({ isTransactionFormOpen: true }),
  closeTransactionForm: () => set({ isTransactionFormOpen: false }),
  notifyTransactionComplete: () => set({ transactionTimestamp: Date.now() }),
}));
