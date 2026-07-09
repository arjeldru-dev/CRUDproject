import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import api from '../lib/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import Button from './ui/Button';
import Input from './ui/Input';
import SuccessOverlay from './SuccessOverlay';
import {
  X,
  Receipt,
  AlertCircle,
  ShoppingBag,
  Percent,
  Users,
  Tag,
  Handshake,
  Wallet,
  ArrowRight,
  ArrowLeftRight,
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
  limitAmount: number;
}

interface Balance {
  friendProfileId: string;
  friendName: string;
  receivableBalance: number;
  payableBalance: number;
}

type TransactionMode = 'expense' | 'settlement' | 'topup';

// Mirrors the backend cap, pinned to the Decimal(10,2) amount columns
// (max 99,999,999.99). Keeping them in sync turns an oversized amount into an
// inline form error instead of a server 500.
const MAX_AMOUNT = 99_999_999.99;

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ExactSplitInputProps {
  pid: string;
  initialValue: string;
  onChange: (pid: string, val: string) => void;
  name: string;
}

/**
 * ExactSplitInput — Performance Optimized Sub-component
 * Localizes typed values to prevent complete parent form re-rendering
 * on every single keystroke. Propagates values on blur.
 */
const ExactSplitInput: React.FC<ExactSplitInputProps> = React.memo(({
  pid,
  initialValue,
  onChange,
  name,
}) => {
  const [localVal, setLocalVal] = useState(initialValue);

  useEffect(() => {
    setLocalVal(initialValue);
  }, [initialValue]);

  const handleBlur = () => {
    onChange(pid, localVal);
  };

  return (
    <div className="flex justify-between items-center py-2.5 gap-4 font-sans border-b border-border/10 last:border-0">
      <label
        htmlFor={`split-input-${pid}`}
        className="text-sm font-medium text-foreground whitespace-nowrap"
      >
        {name}
      </label>
      <div className="relative w-1/2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
          ₱
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          id={`split-input-${pid}`}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={handleBlur}
          className="w-full pl-8 pr-4 h-[44px] rounded-xl bg-surface border border-border-subtle text-sm font-sans font-medium text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-200"
          placeholder="0.00"
        />
      </div>
    </div>
  );
});

ExactSplitInput.displayName = 'ExactSplitInput';

/**
 * TransactionForm — Phase 7 (Hardened & Optimized)
 *
 * A slide-up modal component for creating expense transactions or settlements.
 * Validates all inputs before dispatching to the backend.
 * Shows real-time split calculations and ledger impact.
 */
const TransactionForm: React.FC<TransactionFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const dialogRef = useFocusTrap(isOpen, onClose);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Data State ────────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friend[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Form State ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<TransactionMode>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [payerId, setPayerId] = useState<string>('self');
  const [splitMode, setSplitMode] = useState<'equal' | 'exact'>('equal');
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [isSolo, setIsSolo] = useState(false);
  const [message, setMessage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowFriendToPrivate, setAllowFriendToPrivate] = useState(false);

  // ── Submission State ──────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track mount status for memory leak protection & request cancellation
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ── Fetch Dependencies ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isMountedRef.current) {
      setFormError('');
      setDataLoading(true);
    }
    try {
      const [friendsRes, categoriesRes, balancesRes] = await Promise.all([
        api.get('/friends', { signal: controller.signal }),
        api.get('/categories', { signal: controller.signal }),
        api.get('/transactions/balances', { signal: controller.signal }).catch(() => ({ data: { balances: [] } })),
      ]);
      if (isMountedRef.current) {
        setFriends(friendsRes.data.friends || []);
        setCategories(categoriesRes.data.categories || []);
        setBalances(balancesRes.data.balances || []);
      }
    } catch (err: unknown) {
      if (axios.isCancel(err)) {
        return; // Ignore component-initiated cancel aborts
      }
      if (isMountedRef.current) {
        setFormError('Failed to load form data. Please try again.');
      }
    } finally {
      if (isMountedRef.current && abortControllerRef.current === controller) {
        setDataLoading(false);
      }
    }
  }, []);

  const { transactionFormMode } = useUiStore();

  // ── Reset ─────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setMode(transactionFormMode);
    setAmount('');
    setCategoryId('');
    setSelectedFriendIds([]);
    setPayerId('self');
    setSplitMode('equal');
    setExactAmounts({});
    setIsSolo(false);
    setMessage('');
    setIsPrivate(false);
    setAllowFriendToPrivate(false);
    setFormError('');
    setShowSuccess(false);
  }, [transactionFormMode]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      resetForm();
    }
  }, [isOpen, fetchData, resetForm]);

  // Clear validation/form error when user edits form values
  useEffect(() => {
    setFormError('');
  }, [amount, categoryId, selectedFriendIds, payerId, splitMode, exactAmounts, isSolo, message, mode]);

  // Auto-reset payerId to 'self' if the selected payer is deselected from friends list
  useEffect(() => {
    if (payerId !== 'self' && !selectedFriendIds.includes(payerId) && mode === 'expense') {
      setPayerId('self');
    }
  }, [selectedFriendIds, payerId, mode]);

  // Clean up submit timer on unmount
  useEffect(() => {
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, []);

  // ── Auto-suggest Settlement Amount ────────────────────────────────────
  useEffect(() => {
    if (mode === 'settlement' && selectedFriendIds.length === 1) {
      const friendId = selectedFriendIds[0];
      const b = balances.find((bal) => bal.friendProfileId === friendId);
      if (b && b.payableBalance > 0) {
        setAmount(b.payableBalance.toString());
      }
    }
  }, [mode, selectedFriendIds, balances]);

  // ── Computed Values ───────────────────────────────────────────────────
  const parsedAmount = parseFloat(amount) || 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const computedSplits = useMemo(() => {
    if (mode !== 'expense' || isSolo || parsedAmount <= 0) return [];
    const participantIds = ['self', ...selectedFriendIds];
    
    if (splitMode === 'equal') {
       const baseAmount = Math.floor((parsedAmount / participantIds.length) * 100) / 100;
       let remainder = Math.round((parsedAmount - baseAmount * participantIds.length) * 100);
       
       return participantIds.map((pid) => {
         let splitAmount = baseAmount;
         if (remainder > 0) {
           splitAmount += 0.01;
           remainder--;
         }
         return { profileId: pid, amount: Math.round(splitAmount * 100) / 100 };
       });
    } else {
       return participantIds.map(pid => ({
         profileId: pid,
         amount: parseFloat(exactAmounts[pid]) || 0
       }));
    }
  }, [mode, isSolo, parsedAmount, selectedFriendIds, splitMode, exactAmounts]);

  const userShare = computedSplits.find(s => s.profileId === 'self')?.amount || 0;

  // Stable Exact Split Change handler to prevent re-render lag
  const handleExactSplitChange = useCallback((pid: string, val: string) => {
    setExactAmounts((prev) => ({
      ...prev,
      [pid]: val,
    }));
  }, []);

  // Helper to re-distribute splits equally inside Exact Mode
  const handleDistributeEqually = useCallback(() => {
    if (parsedAmount <= 0) return;
    const participantIds = ['self', ...selectedFriendIds];
    const baseAmount = Math.floor((parsedAmount / participantIds.length) * 100) / 100;
    let remainder = Math.round((parsedAmount - baseAmount * participantIds.length) * 100);
    
    const newExact: Record<string, string> = {};
    participantIds.forEach((pid) => {
      let splitAmount = baseAmount;
      if (remainder > 0) {
        splitAmount += 0.01;
        remainder--;
      }
      newExact[pid] = (Math.round(splitAmount * 100) / 100).toFixed(2);
    });
    setExactAmounts(newExact);
  }, [parsedAmount, selectedFriendIds]);

  const exactSplitSum = useMemo(() => {
    if (splitMode !== 'exact') return 0;
    const participantIds = ['self', ...selectedFriendIds];
    const sumRaw = participantIds.reduce((acc, pid) => acc + (parseFloat(exactAmounts[pid]) || 0), 0);
    return Math.round(sumRaw * 100) / 100;
  }, [splitMode, selectedFriendIds, exactAmounts]);

  const exactSplitDiff = useMemo(() => {
    return Math.round((parsedAmount - exactSplitSum) * 100) / 100;
  }, [parsedAmount, exactSplitSum]);

  // ── Validation ────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!amount || parsedAmount <= 0) {
      return 'Please enter a valid positive amount.';
    }
    if (parsedAmount > MAX_AMOUNT) {
      return 'Amount cannot exceed ₱99,999,999.99.';
    }
    // Limit decimal precision input to 2 decimal places to avoid floating arithmetic bugs
    if (amount.includes('.') && amount.split('.')[1].length > 2) {
      return 'Amount cannot have more than 2 decimal places.';
    }

    if (!categoryId) {
      return 'Please select a budget category.';
    }
    if (mode === 'expense') {
      if (!isSolo && selectedFriendIds.length === 0) {
        return 'Please add at least one friend or toggle solo expense.';
      }
      if (!isSolo && splitMode === 'exact') {
         const participantIds = ['self', ...selectedFriendIds];
         
         // Ensure no negative exact split values and check decimal precision
         for (const pid of participantIds) {
           const valStr = exactAmounts[pid] || '';
           const val = parseFloat(valStr) || 0;
           if (val < 0) {
             return 'Individual split amounts cannot be negative.';
           }
           if (valStr.includes('.') && valStr.split('.')[1].length > 2) {
             return 'Split amounts cannot have more than 2 decimal places.';
           }
         }

         const sum = participantIds.reduce((acc, pid) => acc + (parseFloat(exactAmounts[pid]) || 0), 0);
         if (Math.abs(sum - parsedAmount) > 0.05) {
            return `Total split sum (${fmt(sum)}) must equal the transaction amount (${fmt(parsedAmount)}).`;
         }
      }
    }

    if (mode === 'settlement') {
      if (selectedFriendIds.length !== 1) {
        return 'Please select a friend to settle with.';
      }
    }

    return null;
  };

  // ── Submit Expense ────────────────────────────────────────────────────
  const handleExpenseSubmit = async () => {
    const userId = user?.id;
    if (!userId) return;

    let splits = computedSplits;
    if (isSolo) {
      splits = [{ profileId: 'self', amount: parsedAmount }];
    }

    const finalPayerId = isSolo ? 'self' : payerId;

    await api.post('/transactions', {
      amount: parsedAmount,
      categoryId,
      payerId: finalPayerId,
      splits,
      message: message.trim() || undefined,
      isPrivate,
      allowFriendToPrivate,
    });
  };

  // ── Submit Settlement ─────────────────────────────────────────────────
  const handleSettlementSubmit = async () => {
    await api.post('/transactions/settle', {
      amount: parsedAmount,
      friendProfileId: selectedFriendIds[0],
      payerId: payerId,
      categoryId: categoryId || undefined,
      message: message.trim() || undefined,
      isPrivate,
      allowFriendToPrivate,
    });
  };

  // ── Submit Topup ──────────────────────────────────────────────────────
  const handleTopupSubmit = async () => {
    await api.post('/transactions/topup', {
      amount: parsedAmount,
      categoryId,
      message: message.trim() || undefined,
    });
  };

  // ── Main Submit Handler ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against concurrent submit actions or double submissions
    if (isSubmitting || showSuccess) return;

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
      } else if (mode === 'settlement') {
        await handleSettlementSubmit();
      } else {
        await handleTopupSubmit();
      }

      if (isMountedRef.current) {
        setShowSuccess(true);
      }
      submitTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          onSuccess();
          onClose();
        }
      }, 1500);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const error = err as { response?: { data?: { error?: string } } };
        const msg =
          error?.response?.data?.error ||
          'Transaction failed. Please try again.';
        setFormError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  // ── Don't render if closed ────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop with enhanced blur */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-md transition-opacity duration-300 animate-fadeInFast"
        onClick={onClose}
      />

      {/* Modal Panel with premium shadow, rounded corners, and responsive entry physics */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
        className="relative w-full max-w-lg bg-surface rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.15)] max-h-[85vh] overflow-y-auto transaction-form-panel z-10"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md transaction-form-header flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-250 ease-out-emil ${
                mode === 'topup'
                  ? 'bg-warning/10 text-warning'
                  : mode === 'settlement'
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {mode === 'topup' ? (
                <Wallet className="w-6 h-6 animate-spring" />
              ) : mode === 'settlement' ? (
                <Handshake className="w-6 h-6 animate-spring" />
              ) : (
                <ShoppingBag className="w-6 h-6 animate-spring" />
              )}
            </div>
            <div>
              <h2 id="transaction-form-title" className="text-lg font-display font-semibold text-foreground leading-tight">
                {mode === 'expense'
                  ? 'New Expense'
                  : mode === 'settlement'
                  ? 'Settle Debt'
                  : 'Top-Up Budget'}
              </h2>
              <p className="text-xs text-muted font-sans mt-1">
                {mode === 'expense'
                  ? 'Record an expense and split it'
                  : mode === 'settlement'
                  ? 'Settle an outstanding balance'
                  : 'Add funds to replenish a category'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="transaction-form-close"
            aria-label="Close transaction form"
            className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-hover hover:scale-105 active:scale-95 transition-transform duration-150 ease-out-emil cursor-pointer"
            style={{ transitionProperty: 'transform, background-color, color' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success Overlay ─────────────────────────────────────────── */}
        {showSuccess && (
          <SuccessOverlay amount={fmt(parsedAmount)} mode={mode} />
        )}

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="pt-6 transaction-form-body">
          {/* Loading State */}
          {dataLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 bg-background dark:bg-background/50 rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : formError && (friends.length === 0 || categories.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center border border-error/20 bg-error/5 rounded-2xl animate-fadeIn">
              <AlertCircle className="w-10 h-10 text-error animate-shake" />
              <div>
                <h3 className="text-sm font-semibold text-foreground font-display">Could not load form dependencies</h3>
                <p className="text-xs text-muted mt-1 max-w-xs mx-auto leading-relaxed">{formError}</p>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-error/10 text-error border border-error/20 hover:bg-error/20 active:scale-95 transition-all duration-100 cursor-pointer"
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* ── Amount Input (Custom Height and Radius) ─────────────── */}
              <Input
                label="Amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                id="transaction-amount"
                className="rounded-2xl h-[56px] font-sans border-border-subtle focus:border-primary focus:ring-primary/20 transition-all duration-200"
                leftIcon={
                  <span className="w-5 h-5 flex items-center justify-center font-display text-lg font-bold text-muted">
                    ₱
                  </span>
                }
              />

              {mode === 'settlement' && selectedFriendIds.length === 1 && (() => {
                const friendId = selectedFriendIds[0];
                const b = balances.find((bal) => bal.friendProfileId === friendId);
                if (!b) return null;

                return (
                  <div className="flex flex-wrap justify-end gap-2 mt-[-6px] mb-2 animate-slideDownIn">
                    {b.payableBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(b.payableBalance.toString());
                          setPayerId('self');
                        }}
                        className="px-3 py-1.5 min-h-[36px] flex items-center justify-center text-xs font-sans font-semibold rounded-full border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors cursor-pointer active:scale-95 duration-100 ease-out"
                      >
                        Owed full: {fmt(b.payableBalance)}
                      </button>
                    )}
                    {b.receivableBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(b.receivableBalance.toString());
                          setPayerId(friendId);
                        }}
                        className="px-3 py-1.5 min-h-[36px] flex items-center justify-center text-xs font-sans font-semibold rounded-full border border-success/20 bg-success/5 text-success hover:bg-success/10 transition-colors cursor-pointer active:scale-95 duration-100 ease-out"
                      >
                        Receivable full: {fmt(b.receivableBalance)}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ── Category Select (Custom chevron & geometry) ─────────── */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="transaction-category"
                  className="text-sm font-sans font-semibold text-muted flex items-center gap-2"
                >
                  <Tag className="w-4 h-4 text-primary" />
                  {mode === 'expense'
                    ? 'Budget Category'
                    : mode === 'topup'
                    ? 'Budget Category to Top-Up'
                    : payerId === 'self'
                    ? 'Take from Budget'
                    : 'Refund to Budget'}
                </label>
                {categories.length === 0 ? (
                  <div className="p-6 bg-warning/5 border border-warning/15 rounded-2xl flex flex-col gap-2.5 animate-slideDownIn">
                    <p className="text-xs text-muted font-sans leading-relaxed">
                      You haven't created any budget categories yet. You need at least one category to record transactions.
                    </p>
                    <a
                      href="/categories"
                      onClick={onClose}
                      className="text-xs font-semibold text-warning hover:underline flex items-center gap-1 mt-1 font-sans"
                    >
                      Go to Budget page <ArrowRight className="w-3.5 h-3.5 inline" />
                    </a>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      id="transaction-category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full h-[56px] pl-4 pr-10 rounded-2xl bg-surface border border-border-subtle text-foreground font-sans font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary hover:border-border cursor-pointer appearance-none"
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
                          {c.name} (Limit: {fmt(c.limitAmount)})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted transition-transform duration-200">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Friend Select (Normalized Tag UI across modes) ─────── */}
              {mode !== 'topup' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-sans font-semibold text-muted flex items-center gap-2">
                    <Users className="w-4 h-4 text-secondary" />
                    {mode === 'expense' ? 'Split With' : 'Settle With'}
                  </span>

                  {mode === 'expense' && (
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSolo(!isSolo);
                          if (!isSolo) setSelectedFriendIds([]);
                        }}
                        id="solo-toggle"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-transform active:scale-[0.96] duration-150 ease-out-emil cursor-pointer ${
                          isSolo
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'bg-background dark:bg-border text-muted border border-border-subtle hover:text-foreground'
                        }`}
                        style={{ transitionProperty: 'transform, background-color, border-color, color' }}
                      >
                        Solo Expense
                      </button>
                    </div>
                  )}

                  {(!isSolo || mode === 'settlement') && (
                    <>
                      {friends.length === 0 ? (
                        <div className="p-6 bg-warning/5 border border-warning/15 rounded-2xl flex flex-col gap-2.5 animate-slideDownIn">
                          <p className="text-xs text-muted font-sans leading-relaxed">
                            No friends found. You need to add a friend profile before you can record settlements.
                          </p>
                          <a
                            href="/friends"
                            onClick={onClose}
                            className="text-xs font-semibold text-warning hover:underline flex items-center gap-1 mt-1 font-sans"
                          >
                            Go to Friends page <ArrowRight className="w-3.5 h-3.5 inline" />
                          </a>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {friends.map((f, index) => {
                            const isSelected = selectedFriendIds.includes(f.id);
                            const selectColorClass = mode === 'settlement'
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-secondary/10 text-secondary border-secondary/30';
                            const selectIndicatorClass = mode === 'settlement'
                              ? 'bg-success text-white border-transparent'
                              : 'bg-secondary text-white border-transparent';

                            return (
                              <button
                                key={f.id}
                                type="button"
                                style={{ animationDelay: `${index * 30}ms`, transitionProperty: 'transform, background-color, border-color, color' }}
                                onClick={() => {
                                  if (mode === 'settlement') {
                                    if (isSelected) {
                                      setSelectedFriendIds([]);
                                    } else {
                                      setSelectedFriendIds([f.id]);
                                    }
                                  } else {
                                    if (isSelected) {
                                      setSelectedFriendIds(
                                        selectedFriendIds.filter((id) => id !== f.id)
                                      );
                                    } else {
                                      setSelectedFriendIds([...selectedFriendIds, f.id]);
                                    }
                                  }
                                }}
                                aria-label={
                                  mode === 'settlement'
                                    ? `Select ${f.name} to settle with`
                                    : `Toggle split with ${f.name}`
                                }
                                className={`animate-slideUpIn flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold font-sans border transition-transform duration-160 ease-out-emil active:scale-[0.95] cursor-pointer ${
                                  isSelected
                                    ? selectColorClass
                                    : 'bg-background hover:bg-surface-hover text-muted hover:text-foreground border-border-subtle'
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] font-bold transition-all shrink-0 ${
                                    isSelected
                                      ? selectIndicatorClass
                                      : 'border-muted/30'
                                  }`}
                                >
                                  {isSelected && '✓'}
                                </span>
                                <span className="truncate max-w-[120px]" title={f.name}>{f.name}</span>
                                {f.isGhost && <span title="Ghost account" className="shrink-0">👻</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Payer Toggle ────────────────────────────────────────── */}
              {((mode === 'expense' && !isSolo && selectedFriendIds.length > 0) ||
                (mode === 'settlement' && selectedFriendIds.length === 1)) && (
                <div className="flex flex-col gap-1.5 animate-slideDownIn">
                  <label
                    htmlFor="transaction-payer"
                    className="text-sm font-sans font-semibold text-muted flex items-center gap-2"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-primary" />
                    Who Paid?
                  </label>
                  <div className="relative">
                    <select
                      id="transaction-payer"
                      value={payerId}
                      onChange={(e) => setPayerId(e.target.value)}
                      className="w-full h-[56px] pl-4 pr-10 rounded-2xl bg-surface border border-border-subtle text-foreground font-sans font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary hover:border-border cursor-pointer appearance-none"
                    >
                      <option value="self">I Paid</option>
                      {selectedFriendIds.map((fid) => {
                        const f = friends.find((fr) => fr.id === fid);
                        if (!f) return null;
                        return (
                          <option key={fid} value={fid}>
                            {f.name} Paid
                          </option>
                        );
                      })}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Split Options (Expense + Friend Only) ──────────── */}
              {mode === 'expense' && !isSolo && selectedFriendIds.length > 0 && (
                <div className="flex flex-col gap-2 animate-slideDownIn">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-sans font-semibold text-muted flex items-center gap-2">
                      <Percent className="w-4 h-4 text-success" />
                      Split Details
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Split details selector"
                      className="flex gap-1 bg-background border border-border-subtle p-1 rounded-xl"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={splitMode === 'equal'}
                        onClick={() => setSplitMode('equal')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-transform duration-160 ease-out-emil active:scale-[0.96] cursor-pointer ${
                          splitMode === 'equal'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-muted hover:text-foreground'
                        }`}
                        style={{ transitionProperty: 'transform, background-color, color, box-shadow' }}
                      >
                        Equally
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={splitMode === 'exact'}
                        onClick={() => {
                          setSplitMode('exact');
                          // Initialize exactAmounts with equal values if empty
                          const hasValues = Object.values(exactAmounts).some((v) => v !== '');
                          if (!hasValues && parsedAmount > 0) {
                            const participantIds = ['self', ...selectedFriendIds];
                            const baseAmount = Math.floor((parsedAmount / participantIds.length) * 100) / 100;
                            let remainder = Math.round((parsedAmount - baseAmount * participantIds.length) * 100);
                            const newExact: Record<string, string> = {};
                            participantIds.forEach((pid) => {
                              let splitAmount = baseAmount;
                              if (remainder > 0) {
                                splitAmount += 0.01;
                                remainder--;
                              }
                              newExact[pid] = (Math.round(splitAmount * 100) / 100).toFixed(2);
                            });
                            setExactAmounts(newExact);
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-transform duration-160 ease-out-emil active:scale-[0.96] cursor-pointer ${
                          splitMode === 'exact'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-muted hover:text-foreground'
                        }`}
                        style={{ transitionProperty: 'transform, background-color, color, box-shadow' }}
                      >
                        Exact
                      </button>
                    </div>
                  </div>

                  {parsedAmount > 0 && (
                    <div className="space-y-1 mt-2 pt-3 border-t border-border/40">
                      {['self', ...selectedFriendIds].map((pid, index) => {
                        const name =
                          pid === 'self'
                            ? 'You'
                            : friends.find((f) => f.id === pid)?.name || 'Unknown';
                        if (splitMode === 'equal') {
                          const splitAmount =
                            computedSplits.find((s) => s.profileId === pid)
                              ?.amount || 0;
                          return (
                            <div
                              key={pid}
                              style={{ animationDelay: `${index * 30}ms` }}
                              className="animate-slideUpIn flex justify-between items-center py-2.5 font-sans border-b border-border/10 last:border-0"
                            >
                              <span className="text-sm font-medium text-foreground">
                                {name}
                              </span>
                              <span className="text-sm font-bold text-primary animate-spring">
                                {fmt(splitAmount)}
                              </span>
                            </div>
                          );
                        } else {
                          return (
                            <ExactSplitInput
                              key={pid}
                              pid={pid}
                              name={name}
                              initialValue={exactAmounts[pid] !== undefined ? exactAmounts[pid] : ''}
                              onChange={handleExactSplitChange}
                            />
                          );
                        }
                      })}

                      {splitMode === 'exact' && (
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4 p-6 bg-background/50 dark:bg-background/20 border border-border-subtle rounded-2xl animate-slideDownIn">
                          <div className="font-sans text-xs">
                            {Math.abs(exactSplitDiff) < 0.01 ? (
                              <p className="text-success font-semibold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block" />
                                Splits match total perfectly
                              </p>
                            ) : (
                              <div>
                                <p className="text-warning font-semibold">
                                  Total allocated: {fmt(exactSplitSum)} of {fmt(parsedAmount)}
                                </p>
                                <p className="text-[10px] text-muted mt-0.5 font-normal">
                                  {exactSplitDiff > 0
                                    ? `₱${exactSplitDiff.toFixed(2)} remaining to assign`
                                    : `₱${Math.abs(exactSplitDiff).toFixed(2)} over-allocated`}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleDistributeEqually}
                            className="text-xs font-sans font-semibold text-primary hover:text-primary-hover active:scale-95 transition-all duration-100 cursor-pointer shrink-0"
                          >
                            Distribute Equally
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Ledger Impact Preview (Redesigned visual card) ─────── */}
              {parsedAmount > 0 && (
                <div className="animate-slideDownIn p-6 bg-primary/5 dark:bg-primary/10 border border-primary/10 rounded-2xl space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-2 font-sans">
                    Ledger Impact
                  </p>
                  {mode === 'topup' ? (
                    <p className="text-sm font-medium text-success font-sans">
                      ↑ Added {fmt(parsedAmount)} to{' '}
                      {categories.find((c) => c.id === categoryId)?.name ||
                        'budget'}
                    </p>
                  ) : mode === 'settlement' ? (
                    <>
                      <p
                        className={`text-sm font-medium font-sans ${
                          payerId === 'self' ? 'text-primary' : 'text-success'
                        }`}
                      >
                        {payerId === 'self'
                          ? `↓ You paid ${fmt(parsedAmount)} to settle with `
                          : `↑ Received ${fmt(parsedAmount)} to settle from `}
                        {friends.find((f) => f.id === selectedFriendIds[0])
                          ?.name || '—'}
                      </p>
                      {categoryId && (
                        <p
                          className={`text-sm font-medium font-sans ${
                            payerId === 'self' ? 'text-error' : 'text-success'
                          }`}
                        >
                          {payerId === 'self'
                            ? `↓ Budget deduction of ${fmt(parsedAmount)} from ${
                                categories.find((c) => c.id === categoryId)
                                  ?.name || 'budget'
                              }`
                            : `↑ Budget refund of ${fmt(parsedAmount)} to ${
                                categories.find((c) => c.id === categoryId)
                                  ?.name || 'budget'
                              }`}
                        </p>
                      )}
                    </>
                  ) : isSolo ? (
                    <p className="text-sm font-medium text-primary font-sans">
                      ↓ Budget deduction of {fmt(parsedAmount)}
                    </p>
                  ) : selectedFriendIds.length > 0 ? (
                    <>
                      {payerId === 'self' ? (
                        <p className="text-sm font-medium text-primary font-sans">
                          ↓ Budget deduction of {fmt(parsedAmount)} (full amount
                          you paid)
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-muted font-sans">
                          No budget impact yet — you'll choose a budget when
                          settling
                        </p>
                      )}

                      {payerId === 'self' &&
                        computedSplits
                          .filter((s) => s.profileId !== 'self' && s.amount > 0)
                          .map((s) => (
                            <p
                              key={s.profileId}
                              className="text-sm font-medium text-success font-sans"
                            >
                              ↑{' '}
                              {friends.find((f) => f.id === s.profileId)?.name ||
                                'Friend'}{' '}
                              owes you {fmt(s.amount)}
                            </p>
                          ))}

                      {payerId !== 'self' && userShare > 0 && (
                        <p className="text-sm font-medium text-error font-sans">
                          ↑ You owe{' '}
                          {friends.find((f) => f.id === payerId)?.name ||
                            'Friend'}{' '}
                          {fmt(userShare)}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* ── Optional Message ───────────────────────────────────── */}
              {mode !== 'topup' && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="transaction-message"
                    className="text-sm font-sans font-semibold text-muted flex items-center gap-2"
                  >
                    <Receipt className="w-4 h-4 text-secondary" />
                    What is this for? (Optional)
                  </label>
                  <textarea
                    id="transaction-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 255))}
                    maxLength={255}
                    placeholder="e.g. Dinner at Mendokoro (max 255 chars)"
                    rows={2}
                    className="w-full px-4 py-3 rounded-2xl bg-surface border border-border-subtle text-foreground font-sans font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary hover:border-border resize-none"
                  />
                  <div className="flex justify-end text-[11px] text-muted font-mono mt-1 pr-1">
                    <span>{message.length} / 255</span>
                  </div>
                </div>
              )}

              {/* ── Privacy Toggle ─────────────────────────────────────── */}
              {mode !== 'topup' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-6 bg-background/50 dark:bg-background/20 border border-border-subtle rounded-2xl">
                    <div className="font-sans">
                      <p className="text-sm font-semibold text-foreground">
                        Make Private
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        Only you can see this in your feed
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPrivate(!isPrivate)}
                      role="switch"
                      aria-checked={isPrivate}
                      aria-label="Make Private"
                      className={`relative inline-flex h-6.5 w-12 items-center rounded-full transition-colors duration-250 ease-out-emil focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer active:scale-95 ${
                        isPrivate
                          ? 'bg-primary'
                          : 'bg-border-subtle dark:bg-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md transition-transform duration-250 ease-out-emil ${
                          isPrivate ? 'translate-x-6' : 'translate-x-1.5'
                        }`}
                      />
                    </button>
                  </div>

                  {!isSolo &&
                    mode !== 'settlement' &&
                    selectedFriendIds.length > 0 && (
                      <div className="flex items-center justify-between p-6 bg-background/50 dark:bg-background/20 border border-border-subtle rounded-2xl">
                        <div className="font-sans">
                          <p className="text-sm font-semibold text-foreground">
                            Allow friends to manage privacy
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            Let your friends toggle private/public status
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAllowFriendToPrivate(!allowFriendToPrivate)
                          }
                          role="switch"
                          aria-checked={allowFriendToPrivate}
                          aria-label="Allow friends to manage privacy"
                          className={`relative inline-flex h-6.5 w-12 items-center rounded-full transition-colors duration-250 ease-out-emil focus:outline-none focus:ring-2 focus:ring-secondary/20 cursor-pointer active:scale-95 ${
                            allowFriendToPrivate
                              ? 'bg-secondary'
                              : 'bg-border-subtle dark:bg-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md transition-transform duration-250 ease-out-emil ${
                              allowFriendToPrivate
                                ? 'translate-x-6'
                                : 'translate-x-1.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                </div>
              )}

              {/* ── Error ──────────────────────────────────────────────── */}
              {formError && (
                <div
                  className="flex items-center gap-2 p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-sm font-sans animate-shake"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ── Submit (Enforced Height & Rounded Radius) ──────────── */}
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={isSubmitting || showSuccess}
                className="w-full h-[56px] rounded-2xl text-sm font-semibold transition-transform duration-160 ease-out-emil active:scale-[0.97]"
                id="transaction-submit"
                style={{ transitionProperty: 'transform, background-color, color, box-shadow' }}
              >
                {mode === 'expense' ? (
                  <>
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    Record Expense
                  </>
                ) : mode === 'settlement' ? (
                  <>
                    <Handshake className="w-4 h-4 mr-2" />
                    Record Settlement
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4 mr-2" />
                    Add Funds
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
