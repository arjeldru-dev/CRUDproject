import React, { useState } from 'react';
import TransactionForm from '../components/TransactionForm';
import Button from '../components/ui/Button';
import {
  Receipt,
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
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            Transactions
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Record expenses, split costs, and settle debts.
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          size="md"
          id="add-transaction-page-btn"
        >
          <Plus className="w-4 h-4" />
          New Transaction
        </Button>
      </div>

      {/* ── Action Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        {/* Expense Card */}
        <button
          onClick={() => setShowForm(true)}
          id="quick-expense"
          className="group bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-left hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
            <ArrowLeftRight className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            Record an Expense
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Log a purchase, assign it to a category, and optionally split it
            with a friend or ghost profile.
          </p>
        </button>

        {/* Settlement Card */}
        <button
          onClick={() => setShowForm(true)}
          id="quick-settlement"
          className="group bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-left hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
            <Handshake className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            Settle a Debt
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Record a payment to or from a friend to reduce an outstanding
            balance between you.
          </p>
        </button>
      </div>

      {/* ── Info Note ────────────────────────────────────────────────── */}
      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
        <p className="text-sm text-zinc-500 text-center">
          All transactions create atomic dual-entry ledger records. Your
          balances and budget limits update automatically.
        </p>
      </div>

      {/* ── Modal ────────────────────────────────────────────────────── */}
      <TransactionForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => {
          // Refresh balances on dashboard when navigated back
        }}
      />
    </div>
  );
};

export default Transactions;
