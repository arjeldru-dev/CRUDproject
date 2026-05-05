import React from 'react';
import { useUiStore } from '../store/uiStore';
import Button from '../components/ui/Button';
import {
  Plus,
  ArrowLeftRight,
  Handshake,
} from 'lucide-react';

/**
 * Transactions Page — Phase 7 dedicated page.
 * Provides a clear entry-point for recording expenses and settlements
 * via the TransactionForm modal.
 */
const Transactions: React.FC = () => {
  const { openTransactionForm } = useUiStore();

  return (
    <div className="animate-fadeInFast">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-fluid-h1 font-display font-semibold text-foreground tracking-tight">
            Transactions
          </h1>
          <p className="text-muted text-base font-medium mt-1">
            Record expenses, split costs, and settle debts
          </p>
        </div>
        <Button
          onClick={openTransactionForm}
          size="md"
          id="add-transaction-page-btn"
        >
          <Plus className="w-4 h-4" />
          New Log
        </Button>
      </div>

      <div className="divider mb-8" />

      {/* ── Action Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Expense Block */}
        <button
          onClick={openTransactionForm}
          id="quick-expense"
          className="group container-card container-card-interactive text-left p-10 cursor-pointer"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors duration-200">
            <ArrowLeftRight className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">
            Log an Expense
          </h3>
          <p className="text-base text-muted leading-relaxed">
            Record a purchase, assign it to a category, and optionally split the cost with friends or ghosts.
          </p>
        </button>

        {/* Settlement Block */}
        <button
          onClick={openTransactionForm}
          id="quick-settlement"
          className="group container-card container-card-interactive text-left p-10 cursor-pointer"
        >
          <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mb-5 group-hover:bg-success/15 transition-colors duration-200">
            <Handshake className="w-7 h-7 text-success" />
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">
            Settle Balances
          </h3>
          <p className="text-base text-muted leading-relaxed">
            Record a payment to or from a friend to reduce an outstanding balance seamlessly.
          </p>
        </button>
      </div>

      {/* ── Info Note ────────────────────────────────────────────────── */}
      <div className="p-6 bg-surface rounded-2xl border border-border-subtle">
        <p className="text-base text-muted text-center">
          All transactions create atomic dual-entry ledger records. Your balances and budget limits update automatically.
        </p>
      </div>
    </div>
  );
};

export default Transactions;
