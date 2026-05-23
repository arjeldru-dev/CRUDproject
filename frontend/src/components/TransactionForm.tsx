import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Wallet,
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

interface Balance {
  friendProfileId: string;
  friendName: string;
  receivableBalance: number;
  payableBalance: number;
}

type TransactionMode = 'expense' | 'settlement' | 'topup';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * TransactionForm — Phase 7
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

  // ── Fetch Dependencies ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [friendsRes, categoriesRes, balancesRes] = await Promise.all([
        api.get('/friends'),
        api.get('/categories'),
        api.get('/transactions/balances').catch(() => ({ data: { balances: [] } })),
      ]);
      setFriends(friendsRes.data.friends || []);
      setCategories(categoriesRes.data.categories || []);
      setBalances(balancesRes.data.balances || []);
    } catch {
      setFormError('Failed to load form data. Please try again.');
    } finally {
      setDataLoading(false);
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

  // ── Validation ────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!amount || parsedAmount <= 0) {
      return 'Please enter a valid positive amount.';
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

      setShowSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      const msg =
        error?.response?.data?.error ||
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
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${mode === 'topup' ? 'bg-warning/10' : 'bg-primary/10'}`}>
              {mode === 'topup' ? <Wallet className="w-6 h-6 text-warning" /> : <Receipt className="w-6 h-6 text-primary" />}
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">
                {mode === 'expense' ? 'New Expense' : mode === 'settlement' ? 'Settle Debt' : 'Top-Up Budget'}
              </h2>
              <p className="text-sm text-muted mt-0.5">
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
              
              {mode === 'settlement' && selectedFriendIds.length === 1 && (() => {
                const friendId = selectedFriendIds[0];
                const b = balances.find((bal) => bal.friendProfileId === friendId);
                if (!b) return null;
                
                return (
                  <div className="flex justify-end mt-[-12px] mb-2 gap-4">
                    {b.payableBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(b.payableBalance.toString());
                          setPayerId('self');
                        }}
                        className="text-xs text-primary hover:text-primary-focus font-medium transition-colors"
                      >
                        Suggest full owed amount: {fmt(b.payableBalance)}
                      </button>
                    )}
                    {b.receivableBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(b.receivableBalance.toString());
                          setPayerId(friendId);
                        }}
                        className="text-xs text-success hover:text-success/80 font-medium transition-colors"
                      >
                        Suggest full receivable: {fmt(b.receivableBalance)}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ── Category Select ────────────────────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="transaction-category"
                  className="text-sm font-medium text-muted flex items-center gap-2"
                >
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  {mode === 'expense'
                    ? 'Budget Category'
                    : mode === 'topup'
                    ? 'Budget Category to Top-Up'
                    : payerId === 'self'
                      ? 'Take from Budget'
                      : 'Refund to Budget'}
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

              {/* ── Friend Select ──────────────────────────────────────── */}
              {mode !== 'topup' && (
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
                        if (!isSolo) setSelectedFriendIds([]);
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
                    ) : mode === 'settlement' ? (
                      <select
                        id="transaction-friend"
                        value={selectedFriendIds[0] || ''}
                        onChange={(e) => setSelectedFriendIds(e.target.value ? [e.target.value] : [])}
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
                    ) : (
                      <div className="space-y-3">
                        <select
                          id="transaction-friend"
                          value=""
                          onChange={(e) => {
                            if (e.target.value && !selectedFriendIds.includes(e.target.value)) {
                               setSelectedFriendIds([...selectedFriendIds, e.target.value]);
                            }
                          }}
                          className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-secondary/10 focus:border-secondary hover:border-border cursor-pointer appearance-none"
                        >
                          <option value="" className="bg-surface text-muted">
                            Add friend to split...
                          </option>
                          {friends.filter(f => !selectedFriendIds.includes(f.id)).map((f) => (
                            <option
                              key={f.id}
                              value={f.id}
                              className="bg-surface text-foreground"
                            >
                              {f.name} {f.isGhost ? '👻' : ''}
                            </option>
                          ))}
                        </select>

                        {selectedFriendIds.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedFriendIds.map(fid => {
                              const f = friends.find(fr => fr.id === fid);
                              if (!f) return null;
                              return (
                                <span key={fid} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 text-secondary-focus font-medium rounded-full text-sm border border-secondary/20">
                                  {f.name}
                                  <button type="button" onClick={() => setSelectedFriendIds(selectedFriendIds.filter(id => id !== fid))} className="hover:text-error transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                </div>
              )}

              {/* ── Payer Toggle ────────────────────────────────────────── */}
              {((mode === 'expense' && !isSolo && selectedFriendIds.length > 0) || 
                (mode === 'settlement' && selectedFriendIds.length === 1)) && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-muted flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                    Who Paid?
                  </label>
                  <select
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border cursor-pointer appearance-none"
                  >
                    <option value="self">I Paid</option>
                    {selectedFriendIds.map(fid => {
                      const f = friends.find(fr => fr.id === fid);
                      if (!f) return null;
                      return <option key={fid} value={fid}>{f.name} Paid</option>;
                    })}
                  </select>
                </div>
              )}

              {/* ── Split Options (Expense + Friend Only) ──────────── */}
              {mode === 'expense' && !isSolo && selectedFriendIds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted flex items-center gap-2">
                      <Percent className="w-3.5 h-3.5 text-success" />
                      Split Details
                    </label>
                    <div className="flex gap-1 bg-surface border border-border-subtle p-1 rounded-lg">
                       <button 
                          type="button" 
                          onClick={() => setSplitMode('equal')} 
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${splitMode === 'equal' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'}`}
                        >
                          Equally
                        </button>
                       <button 
                          type="button" 
                          onClick={() => setSplitMode('exact')} 
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${splitMode === 'exact' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'}`}
                        >
                          Exact Amounts
                        </button>
                    </div>
                  </div>

                  {parsedAmount > 0 && (
                    <div className="flex flex-col gap-2 mt-1 p-4 bg-surface border border-border-subtle rounded-xl">
                      {['self', ...selectedFriendIds].map((pid) => {
                         const name = pid === 'self' ? 'You' : friends.find(f => f.id === pid)?.name || 'Unknown';
                         if (splitMode === 'equal') {
                           const splitAmount = computedSplits.find(s => s.profileId === pid)?.amount || 0;
                           return (
                             <div key={pid} className="flex justify-between items-center py-1">
                                <span className="text-sm font-medium text-foreground">{name}</span>
                                <span className="text-sm font-bold text-primary">{fmt(splitAmount)}</span>
                             </div>
                           );
                         } else {
                           return (
                             <div key={pid} className="flex justify-between items-center py-1 gap-4">
                                <span className="text-sm font-medium text-foreground whitespace-nowrap">{name}</span>
                                <div className="relative w-1/2">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-medium">₱</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={exactAmounts[pid] !== undefined ? exactAmounts[pid] : ''}
                                    onChange={(e) => setExactAmounts(prev => ({ ...prev, [pid]: e.target.value }))}
                                    className="w-full pl-7 pr-3 py-2 rounded-lg bg-background border border-border-subtle text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                                    placeholder="0.00"
                                  />
                                </div>
                             </div>
                           );
                         }
                      })}
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
                  {mode === 'topup' ? (
                    <p className="text-sm font-medium text-success">
                      ↑ Added {fmt(parsedAmount)} to {categories.find(c => c.id === categoryId)?.name || 'budget'}
                    </p>
                  ) : mode === 'settlement' ? (
                    <>
                      <p className={`text-sm font-medium ${payerId === 'self' ? 'text-primary' : 'text-success'}`}>
                        {payerId === 'self'
                          ? `↓ You paid ${fmt(parsedAmount)} to settle with `
                          : `↑ Received ${fmt(parsedAmount)} to settle from `}
                        {friends.find((f) => f.id === selectedFriendIds[0])?.name || '—'}
                      </p>
                      {categoryId && (
                        <p className={`text-sm font-medium ${payerId === 'self' ? 'text-error' : 'text-success'}`}>
                          {payerId === 'self'
                            ? `↓ Budget deduction of ${fmt(parsedAmount)} from ${categories.find(c => c.id === categoryId)?.name || 'budget'}`
                            : `↑ Budget refund of ${fmt(parsedAmount)} to ${categories.find(c => c.id === categoryId)?.name || 'budget'}`}
                        </p>
                      )}
                    </>
                  ) : isSolo ? (
                    <p className="text-sm font-medium text-primary">
                      ↓ Budget deduction of {fmt(parsedAmount)}
                    </p>
                  ) : selectedFriendIds.length > 0 ? (
                    <>
                      {payerId === 'self' ? (
                        <p className="text-sm font-medium text-primary">
                          ↓ Budget deduction of {fmt(parsedAmount)} (full amount you paid)
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-muted">
                          No budget impact yet — you'll choose a budget when settling
                        </p>
                      )}
                      
                      {payerId === 'self' && computedSplits.filter(s => s.profileId !== 'self' && s.amount > 0).map(s => (
                        <p key={s.profileId} className="text-sm font-medium text-success">
                          ↑ {friends.find(f => f.id === s.profileId)?.name || 'Friend'} owes you {fmt(s.amount)}
                        </p>
                      ))}

                      {payerId !== 'self' && userShare > 0 && (
                        <p className="text-sm font-medium text-error">
                          ↑ You owe {friends.find(f => f.id === payerId)?.name || 'Friend'} {fmt(userShare)}
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
                    className="text-sm font-medium text-muted flex items-center gap-2"
                  >
                    <Receipt className="w-3.5 h-3.5 text-secondary" />
                    What is this for? (Optional)
                  </label>
                  <textarea
                    id="transaction-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Dinner at Mendokoro"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border resize-none"
                  />
                </div>
              )}

              {/* ── Privacy Toggle ─────────────────────────────────────── */}
              {mode !== 'topup' && (
                <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between p-4 bg-surface border border-border-subtle rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-foreground">Make Private</p>
                    <p className="text-xs text-muted mt-0.5">Only you can see this in your feed</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isPrivate ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPrivate ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {(!isSolo || mode === 'settlement') && selectedFriendIds.length > 0 && (
                  <div className="flex items-center justify-between p-4 bg-surface border border-border-subtle rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">Allow friends to manage privacy</p>
                      <p className="text-xs text-muted mt-0.5">Let your friends make this post private or public</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAllowFriendToPrivate(!allowFriendToPrivate)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        allowFriendToPrivate ? 'bg-secondary' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          allowFriendToPrivate ? 'translate-x-6' : 'translate-x-1'
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
                ) : mode === 'settlement' ? (
                  <>
                    <Handshake className="w-4 h-4" />
                    Record Settlement
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
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
