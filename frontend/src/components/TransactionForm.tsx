import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Button from './ui/Button';
import Input from './ui/Input';
import {
  X,
  Receipt,
  AlertCircle,
  ArrowLeftRight,
  Percent,
  DollarSign,
  CheckCircle2,
  Users,
  Tag,
  Handshake,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
interface Friend {
  id: string;
  name: string;
  isGhost: boolean;
}

interface Category {
  id: string;
  name: string;
  monthlyLimit: number;
}

type TransactionMode = 'expense' | 'settlement';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * TransactionForm — Phase 7, Step 7.1
 *
 * A slide-up modal component for creating expense transactions or settlements.
 * Fetches categories and friends on mount. Validates all inputs before
 * dispatching to the backend. Shows real-time split calculations and
 * success/error feedback.
 */
const TransactionForm: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();

  // ── Data State ────────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friend[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Form State ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TransactionMode>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [payerType, setPayerType] = useState<'self' | 'friend'>('self');
  const [splitRatio, setSplitRatio] = useState(50); // 0–100 slider value
  const [isSolo, setIsSolo] = useState(false);

  // ── Submission State ──────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Fetch Dependencies ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [friendsRes, categoriesRes] = await Promise.all([
        api.get('/friends'),
        api.get('/categories'),
      ]);
      setFriends(friendsRes.data.friends || []);
      setCategories(categoriesRes.data.categories || []);
    } catch {
      setFormError('Failed to load form data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      resetForm();
    }
  }, [isOpen, fetchData]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setMode('expense');
    setAmount('');
    setCategoryId('');
    setFriendId('');
    setPayerType('self');
    setSplitRatio(50);
    setIsSolo(false);
    setFormError('');
    setShowSuccess(false);
  };

  // ── Computed Values ───────────────────────────────────────────────────
  const parsedAmount = parseFloat(amount) || 0;
  const splitDecimal = splitRatio / 100;
  const userShare = parsedAmount * splitDecimal;
  const friendShare = parsedAmount - userShare;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // ── Validation ────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!amount || parsedAmount <= 0) {
      return 'Please enter a valid positive amount.';
    }

    if (mode === 'expense') {
      if (!categoryId) {
        return 'Please select a budget category.';
      }
      if (!isSolo && !friendId) {
        return 'Please select a friend or toggle solo expense.';
      }
    }

    if (mode === 'settlement') {
      if (!friendId) {
        return 'Please select a friend to settle with.';
      }
    }

    return null;
  };

  // ── Submit Expense ────────────────────────────────────────────────────
  const handleExpenseSubmit = async () => {
    const userId = user?.id;
    if (!userId) return;

    const payerId = payerType === 'self' ? userId : friendId;
    const taggieId = payerType === 'self'
      ? (isSolo ? userId : friendId)
      : userId;

    await api.post('/transactions', {
      amount: parsedAmount,
      categoryId,
      payerId,
      taggieId,
      splitRatio: isSolo ? 1 : splitDecimal,
    });
  };

  // ── Submit Settlement ─────────────────────────────────────────────────
  const handleSettlementSubmit = async () => {
    await api.post('/transactions/settle', {
      amount: parsedAmount,
      friendProfileId: friendId,
    });
  };

  // ── Main Submit Handler ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'expense') {
        await handleExpenseSubmit();
      } else {
        await handleSettlementSubmit();
      }

      setShowSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        'Transaction failed. Please try again.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Don't render if closed ────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative w-full sm:max-w-lg bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto animate-slideUp">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {mode === 'expense' ? 'New Expense' : 'Settle Debt'}
              </h2>
              <p className="text-xs text-text-secondary">
                {mode === 'expense'
                  ? 'Record an expense and split it'
                  : 'Settle an outstanding balance'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="transaction-form-close"
            className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success Overlay ─────────────────────────────────────────── */}
        {showSuccess && (
          <div className="absolute inset-0 bg-zinc-900/95 flex flex-col items-center justify-center z-20 rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 animate-bounce">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-1">
              Transaction Recorded!
            </h3>
            <p className="text-sm text-text-secondary">
              {fmt(parsedAmount)} {mode === 'expense' ? 'expense' : 'settlement'} saved successfully.
            </p>
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="px-6 py-5">
          {/* Loading State */}
          {dataLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-white/5 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* ── Mode Toggle ───────────────────────────────────────── */}
              <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMode('expense')}
                  id="mode-expense"
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    mode === 'expense'
                      ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 shadow-sm'
                      : 'text-text-secondary hover:text-text-secondary'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setMode('settlement')}
                  id="mode-settlement"
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    mode === 'settlement'
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-sm'
                      : 'text-text-secondary hover:text-text-secondary'
                  }`}
                >
                  <Handshake className="w-4 h-4" />
                  Settlement
                </button>
              </div>

              {/* ── Amount Input ───────────────────────────────────────── */}
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-[38px] w-4 h-4 text-text-secondary" />
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  id="transaction-amount"
                  className="pl-9"
                />
              </div>

              {/* ── Category Select (Expense Only) ─────────────────────── */}
              {mode === 'expense' && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="transaction-category"
                    className="text-sm font-medium text-text-secondary flex items-center gap-2"
                  >
                    <Tag className="w-3.5 h-3.5 text-accent-primary" />
                    Budget Category
                  </label>
                  {categories.length === 0 ? (
                    <p className="text-xs text-text-secondary italic py-2">
                      No categories found. Create one in the Budget page first.
                    </p>
                  ) : (
                    <select
                      id="transaction-category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary hover:border-text-secondary/30 cursor-pointer appearance-none"
                    >
                      <option value="" className="bg-zinc-900 text-text-secondary">
                        Select category…
                      </option>
                      {categories.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          className="bg-zinc-900 text-white"
                        >
                          {c.name} (Limit: {fmt(c.monthlyLimit)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* ── Friend Select ──────────────────────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="transaction-friend"
                  className="text-sm font-medium text-text-secondary flex items-center gap-2"
                >
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  {mode === 'expense' ? 'Split With' : 'Settle With'}
                </label>

                {mode === 'expense' && (
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSolo(!isSolo);
                        if (!isSolo) setFriendId('');
                      }}
                      id="solo-toggle"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                        isSolo
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-white/5 text-text-secondary border border-white/10 hover:text-text-secondary'
                      }`}
                    >
                      Solo Expense
                    </button>
                  </div>
                )}

                {(!isSolo || mode === 'settlement') && (
                  <>
                    {friends.length === 0 ? (
                      <p className="text-xs text-text-secondary italic py-2">
                        No friends found. Add one in the Friends page first.
                      </p>
                    ) : (
                      <select
                        id="transaction-friend"
                        value={friendId}
                        onChange={(e) => setFriendId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/60 hover:border-white/20 cursor-pointer appearance-none"
                      >
                        <option value="" className="bg-zinc-900 text-text-secondary">
                          Select friend…
                        </option>
                        {friends.map((f) => (
                          <option
                            key={f.id}
                            value={f.id}
                            className="bg-zinc-900 text-white"
                          >
                            {f.name} {f.isGhost ? '👻' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>

              {/* ── Payer Toggle (Expense + Friend Only) ────────────────── */}
              {mode === 'expense' && !isSolo && friendId && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                    Who Paid?
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPayerType('self')}
                      id="payer-self"
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer border ${
                        payerType === 'self'
                          ? 'bg-indigo-500/15 text-accent-primary-hover border-indigo-500/40'
                          : 'bg-white/5 text-text-secondary border-white/10 hover:border-white/20'
                      }`}
                    >
                      I Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayerType('friend')}
                      id="payer-friend"
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer border ${
                        payerType === 'friend'
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                          : 'bg-white/5 text-text-secondary border-white/10 hover:border-white/20'
                      }`}
                    >
                      Friend Paid
                    </button>
                  </div>
                </div>
              )}

              {/* ── Split Ratio Slider (Expense + Friend Only) ──────────── */}
              {mode === 'expense' && !isSolo && friendId && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="split-ratio-slider" className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <Percent className="w-3.5 h-3.5 text-teal-400" />
                    Your Share: {splitRatio}%
                  </label>

                  {/* Slider */}
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={splitRatio}
                      onChange={(e) =>
                        setSplitRatio(parseInt(e.target.value, 10))
                      }
                      id="split-ratio-slider"
                      className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-indigo-500/50 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-indigo-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
                    />
                    {/* Progress fill */}
                    <div
                      className="absolute top-0 left-0 h-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full pointer-events-none"
                      style={{ width: `${splitRatio}%` }}
                    />
                  </div>

                  {/* Split Preview */}
                  {parsedAmount > 0 && (
                    <div className="flex items-center gap-3 mt-1 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex-1 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">
                          You
                        </p>
                        <p className="text-sm font-bold text-accent-primary-hover">
                          {fmt(userShare)}
                        </p>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div className="flex-1 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">
                          Friend
                        </p>
                        <p className="text-sm font-bold text-purple-300">
                          {fmt(friendShare)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Ledger Impact Preview ──────────────────────────────── */}
              {parsedAmount > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
                    Ledger Impact
                  </p>
                  {mode === 'settlement' ? (
                    <p className="text-xs text-emerald-400">
                      ✓ Settles {fmt(parsedAmount)} with{' '}
                      {friends.find((f) => f.id === friendId)?.name || '—'}
                    </p>
                  ) : isSolo ? (
                    <p className="text-xs text-amber-400">
                      ↓ Budget deduction of {fmt(parsedAmount)}
                    </p>
                  ) : friendId ? (
                    <>
                      <p className="text-xs text-amber-400">
                        ↓ Budget deduction of{' '}
                        {payerType === 'self'
                          ? fmt(parsedAmount)
                          : fmt(userShare)}
                      </p>
                      {payerType === 'self' && friendShare > 0 && (
                        <p className="text-xs text-emerald-400">
                          ↑{' '}
                          {friends.find((f) => f.id === friendId)?.name || 'Friend'}{' '}
                          owes you {fmt(friendShare)}
                        </p>
                      )}
                      {payerType === 'friend' && userShare > 0 && (
                        <p className="text-xs text-red-400">
                          ↑ You owe{' '}
                          {friends.find((f) => f.id === friendId)?.name || 'Friend'}{' '}
                          {fmt(userShare)}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* ── Error ──────────────────────────────────────────────── */}
              {formError && (
                <div
                  className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ── Submit ─────────────────────────────────────────────── */}
              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={isSubmitting || showSuccess}
                size="lg"
                className="w-full"
                id="transaction-submit"
              >
                {mode === 'expense' ? (
                  <>
                    <Receipt className="w-4 h-4" />
                    Record Expense
                  </>
                ) : (
                  <>
                    <Handshake className="w-4 h-4" />
                    Record Settlement
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default TransactionForm;
