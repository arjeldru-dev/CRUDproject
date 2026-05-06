import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import Button from './ui/Button';
import Input from './ui/Input';
import SuccessOverlay from './SuccessOverlay';
import {
  X,
  Receipt,
  AlertCircle,
  ArrowLeftRight,
  Percent,
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

  const { transactionFormMode } = useUiStore();

  // ── Reset ─────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setMode(transactionFormMode);
    setAmount('');
    setCategoryId('');
    setFriendId('');
    setPayerType('self');
    setSplitRatio(50);
    setIsSolo(false);
    setFormError('');
    setShowSuccess(false);
  }, [transactionFormMode]);

  // ── Computed Values ───────────────────────────────────────────────────
  const parsedAmount = parseFloat(amount) || 0;
  const splitDecimal = splitRatio / 100;
  const userShare = parsedAmount * splitDecimal;
  const friendShare = parsedAmount - userShare;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
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
      <div className="relative w-full sm:max-w-lg bg-surface border border-border rounded-t-3xl sm:rounded-2xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] max-h-[90vh] overflow-y-auto animate-spring">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-border px-8 py-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                {mode === 'expense' ? 'New Expense' : 'Settle Debt'}
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {mode === 'expense'
                  ? 'Record an expense and split it'
                  : 'Settle an outstanding balance'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="transaction-form-close"
            className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-background/50 active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success Overlay ─────────────────────────────────────────── */}
        {showSuccess && (
          <SuccessOverlay amount={fmt(parsedAmount)} mode={mode} />
        )}

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="px-8 py-6">
          {/* Loading State */}
          {dataLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-background rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* ── Mode Toggle removed as per user request to keep forms separate ── */}


              {/* ── Amount Input ───────────────────────────────────────── */}
              <Input
                label="Amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                id="transaction-amount"
                leftIcon={<span className="w-5 h-5 flex items-center justify-center font-display text-lg font-medium text-muted">₱</span>}
              />

              {/* ── Category Select (Expense Only) ─────────────────────── */}
              {mode === 'expense' && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="transaction-category"
                    className="text-sm font-medium text-muted flex items-center gap-2"
                  >
                    <Tag className="w-3.5 h-3.5 text-primary" />
                    Budget Category
                  </label>
                  {categories.length === 0 ? (
                    <p className="text-xs text-muted italic py-2">
                      No categories found. Create one in the Budget page first.
                    </p>
                  ) : (
                    <select
                      id="transaction-category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border cursor-pointer appearance-none"
                    >
                      <option value="" className="bg-surface text-muted">
                        Select category…
                      </option>
                      {categories.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          className="bg-surface text-foreground"
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
                    className="text-sm font-medium text-muted flex items-center gap-2"
                  >
                    <Users className="w-3.5 h-3.5 text-secondary" />
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
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'bg-background text-muted border border-border hover:text-foreground'
                      }`}
                    >
                      Solo Expense
                    </button>
                  </div>
                )}

                {(!isSolo || mode === 'settlement') && (
                  <>
                    {friends.length === 0 ? (
                      <p className="text-xs text-muted italic py-2">
                      No friends found. Add one in the Friends page first.
                    </p>
                    ) : (
                      <select
                        id="transaction-friend"
                        value={friendId}
                        onChange={(e) => setFriendId(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-secondary/10 focus:border-secondary hover:border-border cursor-pointer appearance-none"
                      >
                        <option value="" className="bg-surface text-muted">
                          Select friend…
                        </option>
                        {friends.map((f) => (
                          <option
                            key={f.id}
                            value={f.id}
                            className="bg-surface text-foreground"
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
                  <label className="text-sm font-medium text-muted flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                    Who Paid?
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPayerType('self')}
                      id="payer-self"
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer border ${
                        payerType === 'self'
                          ? 'bg-primary/10 text-primary border-primary/40'
                          : 'bg-surface text-muted border-border-subtle hover:border-border'
                      }`}
                    >
                      I Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayerType('friend')}
                      id="payer-friend"
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer border ${
                        payerType === 'friend'
                          ? 'bg-secondary/10 text-secondary border-secondary/40'
                          : 'bg-surface text-muted border-border-subtle hover:border-border'
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
                  <label htmlFor="split-ratio-slider" className="text-sm font-medium text-muted flex items-center gap-2">
                    <Percent className="w-3.5 h-3.5 text-success" />
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
                      className="w-full h-2 bg-background rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
                    />
                    {/* Progress fill */}
                    <div
                      className="absolute top-0 left-0 h-2 bg-gradient-to-r from-primary to-secondary rounded-full pointer-events-none"
                      style={{ width: `${splitRatio}%` }}
                    />
                  </div>

                  {/* Split Preview */}
                  {parsedAmount > 0 && (
                    <div className="flex items-center gap-3 mt-1 p-4 bg-surface border border-border-subtle rounded-xl">
                      <div className="flex-1 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-0.5">
                          You
                        </p>
                        <p className="text-base font-bold text-primary">
                          {fmt(userShare)}
                        </p>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="flex-1 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-0.5">
                          Friend
                        </p>
                        <p className="text-base font-bold text-secondary">
                          {fmt(friendShare)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Ledger Impact Preview ──────────────────────────────── */}
              {parsedAmount > 0 && (
                <div className="p-4 bg-surface border border-border-subtle rounded-xl space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Ledger Impact
                  </p>
                  {mode === 'settlement' ? (
                    <p className="text-sm font-medium text-success">
                      ✓ Settles {fmt(parsedAmount)} with{' '}
                      {friends.find((f) => f.id === friendId)?.name || '—'}
                    </p>
                  ) : isSolo ? (
                    <p className="text-sm font-medium text-primary">
                      ↓ Budget deduction of {fmt(parsedAmount)}
                    </p>
                  ) : friendId ? (
                    <>
                      <p className="text-sm font-medium text-primary">
                        ↓ Budget deduction of{' '}
                        {payerType === 'self'
                          ? fmt(parsedAmount)
                          : fmt(userShare)}
                      </p>
                      {payerType === 'self' && friendShare > 0 && (
                        <p className="text-sm font-medium text-success">
                          ↑{' '}
                          {friends.find((f) => f.id === friendId)?.name || 'Friend'}{' '}
                          owes you {fmt(friendShare)}
                        </p>
                      )}
                      {payerType === 'friend' && userShare > 0 && (
                        <p className="text-sm font-medium text-error">
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
                  className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
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
    </div>
  );
};

export default TransactionForm;
