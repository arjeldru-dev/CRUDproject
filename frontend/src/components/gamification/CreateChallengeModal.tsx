import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useGamificationStore } from '../../store/gamificationStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { X, Trophy, Calendar, Users, Tag, AlertCircle } from 'lucide-react';

interface CreateChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFriendUserId?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface Friend {
  id: string;
  name: string;
  isGhost: boolean;
  friendUserId?: string | null;
}

const typeTemplates = {
  NO_OVERSPEND_WEEK: {
    name: 'No Overspend Week',
    description: 'Keep all selected categories under budget for a full week.',
    durationDays: 7,
  },
  NO_OVERSPEND_MONTH: {
    name: 'No Overspend Month',
    description: 'Stay disciplined and keep categories under budget for a whole month.',
    durationDays: 30,
  },
  COFFEE_FREE_WEEK: {
    name: 'Coffee-Free Week',
    description: 'Avoid spending in coffee shop budgets for a full 7 days.',
    durationDays: 7,
  },
  TRANSPORT_SAVER: {
    name: 'Transport Saver',
    description: 'Keep transport spending under limit for 14 days.',
    durationDays: 14,
  },
  SAVINGS_TARGET: {
    name: 'Savings Sprint',
    description: 'Accrue new savings to hit your target before the challenge ends.',
    durationDays: 14,
  },
  CUSTOM: {
    name: 'Custom Challenge',
    description: 'Create your own rules and challenge friends to join.',
    durationDays: 7,
  },
};

export const CreateChallengeModal: React.FC<CreateChallengeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialFriendUserId,
}) => {
  const { createChallenge, isLoading } = useGamificationStore();
  const dialogRef = useFocusTrap(isOpen, onClose);

  // Data states
  const [categories, setCategories] = useState<Category[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Form states
  const [type, setType] = useState<keyof typeof typeTemplates>('NO_OVERSPEND_WEEK');
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch categories and active friends
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setDataLoading(true);
    try {
      const [categoriesRes, friendsRes] = await Promise.all([
        api.get('/categories', { signal }),
        api.get('/friends', { signal }),
      ]);
      setCategories(categoriesRes.data.categories || []);
      // Filter out ghost profiles — ghosts cannot participate in challenges
      const activeFriends = (friendsRes.data.friends || []).filter((f: Friend) => !f.isGhost);
      setFriends(activeFriends);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== 'CanceledError' && error.name !== 'AbortError' && error.message !== 'canceled') {
        setFormError('Failed to load friends or categories.');
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Format date helper: YYYY-MM-DD
  const formatDate = (date: Date) => {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  };

  // Reset form with template defaults
  const resetForm = useCallback(() => {
    const today = new Date();
    const formattedToday = formatDate(today);
    
    const template = typeTemplates[type];
    const end = new Date(today);
    end.setDate(today.getDate() + template.durationDays);
    const formattedEnd = formatDate(end);

    setStartDate(formattedToday);
    setEndDate(formattedEnd);
    setName(type === 'CUSTOM' ? '' : template.name);
    setDescription(type === 'CUSTOM' ? '' : template.description);
    setCategoryId('');
    setTargetAmount('');
    setSelectedFriendIds(initialFriendUserId ? [initialFriendUserId] : []);
    setFormError('');
  }, [type, initialFriendUserId]);

  useEffect(() => {
    if (isOpen) {
      const controller = new AbortController();
      fetchData(controller.signal);
      resetForm();
      return () => {
        controller.abort();
      };
    }
  }, [isOpen, fetchData, resetForm]);

  // Adjust dates/details when challenge type changes
  useEffect(() => {
    const template = typeTemplates[type];
    const start = new Date(startDate || new Date());
    const end = new Date(start);
    end.setDate(start.getDate() + template.durationDays);
    
    setEndDate(formatDate(end));
    if (type !== 'CUSTOM') {
      setName(template.name);
      setDescription(template.description);
    }
  }, [type, startDate]);

  // Form validation
  const validate = (): string | null => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Compare dates at midnight (local time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startCompare = new Date(start);
    startCompare.setHours(0, 0, 0, 0);

    if (startCompare < today) {
      return 'Start date cannot be in the past.';
    }

    if (end <= start) {
      return 'End date must be after the start date.';
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
      return 'Challenge duration cannot exceed 31 days.';
    }

    // Solo challenges are allowed (0 invitees). Only cap the maximum.
    if (selectedFriendIds.length > 10) {
      return 'You can invite a maximum of 10 friends.';
    }

    if (type === 'CUSTOM' && !name.trim()) {
      return 'Please provide a name for your custom challenge.';
    }

    if (type === 'SAVINGS_TARGET') {
      const amount = Number(targetAmount);
      if (!targetAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
        return 'Please enter a savings target greater than 0.';
      }
      if (amount > 99_999_999.99) {
        return 'Savings target is too large.';
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    
    // Format dates to ISO Date strings at UTC start of day for stability
    const startISO = new Date(startDate + 'T00:00:00.000Z').toISOString();
    const endISO = new Date(endDate + 'T23:59:59.999Z').toISOString();

    const success = await createChallenge({
      type,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      categoryId: categoryId || undefined,
      startDate: startISO,
      endDate: endISO,
      invitedUserIds: selectedFriendIds,
      targetAmount: type === 'SAVINGS_TARGET' ? Number(targetAmount) : undefined,
    });

    if (success) {
      onSuccess();
      onClose();
    } else {
      const latestError = useGamificationStore.getState().error;
      setFormError(latestError || 'Failed to create challenge. Please try again.');
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-challenge-title"
        className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.15)] max-h-[70dvh] sm:max-h-[85dvh] overflow-y-auto animate-spring z-10"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md border-b border-border flex items-center justify-between z-10 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 id="create-challenge-title" className="text-lg font-display font-semibold text-foreground">
                Challenge Friends
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Create a budget discipline challenge
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-background/50 cursor-pointer btn-active-tactile transition-[transform,background-color] duration-160 ease-out"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6">
          {dataLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-background rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {/* Challenge Template Type */}
              <div className="flex flex-col gap-1 sm:gap-1.5">
                <label htmlFor="challenge-type" className="text-sm font-medium text-muted flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                  Challenge Type
                </label>
                <div className="relative w-full">
                  <select
                    id="challenge-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as keyof typeof typeTemplates)}
                    className="w-full px-4 py-3 sm:py-3.5 pr-10 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border cursor-pointer appearance-none"
                  >
                    {Object.entries(typeTemplates).map(([key, template]) => (
                      <option key={key} value={key}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Challenge Name (Custom override) */}
              {type === 'CUSTOM' ? (
                <Input
                  label="Challenge Name"
                  type="text"
                  placeholder="e.g. Diet Coca-Cola Ban"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  id="challenge-name"
                  required
                />
              ) : (
                <div className="p-3 bg-surface-hover/30 border border-border-subtle rounded-xl text-xs text-muted leading-relaxed">
                  <strong>{name}</strong>: {description}
                </div>
              )}

              {/* Savings target amount (SAVINGS_TARGET only) */}
              {type === 'SAVINGS_TARGET' && (
                <Input
                  label="Savings Target (₱)"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 1000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  id="challenge-target-amount"
                  required
                />
              )}

              {/* Scope Category */}
              <div className="flex flex-col gap-1 sm:gap-1.5">
                <label htmlFor="challenge-category" className="text-sm font-medium text-muted flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-secondary" />
                  Target Budget Category (Optional)
                </label>
                <div className="relative w-full">
                  <select
                    id="challenge-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-4 py-3 sm:py-3.5 pr-10 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-secondary/10 focus:border-secondary hover:border-border cursor-pointer appearance-none"
                  >
                    <option value="">All Categories (Whole Budget)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <p className="text-[10px] text-muted-more px-1">
                  Leave as "All Categories" to fail if any budget goes over.
                </p>
              </div>

              {/* Date Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="challenge-start" className="text-sm font-medium text-muted flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="challenge-start"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 sm:py-3 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border cursor-pointer"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="challenge-end" className="text-sm font-medium text-muted flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    End Date
                  </label>
                  <input
                    type="date"
                    id="challenge-end"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 sm:py-3 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary hover:border-border cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Invite Friends */}
              <div className="flex flex-col gap-1 sm:gap-2">
                <label htmlFor="invite-friend-select" className="text-sm font-medium text-muted flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-secondary" />
                  Invite Friends (optional)
                </label>

                {selectedFriendIds.length === 0 && (
                  <p className="text-[10px] text-muted-more px-1">
                    Leave empty to challenge yourself — solo challenges are allowed.
                  </p>
                )}

                {friends.length === 0 ? (
                  <p className="text-xs text-muted italic">
                    No active friends to invite yet — you can still start this challenge solo.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="relative w-full">
                      <select
                        id="invite-friend-select"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !selectedFriendIds.includes(val)) {
                            setSelectedFriendIds([...selectedFriendIds, val]);
                          }
                        }}
                        className="w-full px-4 py-3.5 pr-10 rounded-xl bg-surface border border-border-subtle text-foreground font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-secondary/10 focus:border-secondary hover:border-border cursor-pointer appearance-none"
                      >
                        <option value="">Choose a friend to invite...</option>
                        {friends
                          .filter((f) => !selectedFriendIds.includes(f.friendUserId || f.id))
                          .map((f) => (
                            <option key={f.id} value={f.friendUserId || f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Selected Friends Pills */}
                    {selectedFriendIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2.5 bg-surface border border-border-subtle rounded-xl">
                        {selectedFriendIds.map((fid) => {
                          const f = friends.find((fr) => (fr.friendUserId || fr.id) === fid);
                          if (!f) return null;
                          return (
                            <span
                              key={fid}
                              className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 bg-secondary/10 text-secondary font-medium rounded-full text-xs border border-secondary/20"
                            >
                              {f.name}
                              <button
                                type="button"
                                onClick={() => setSelectedFriendIds(selectedFriendIds.filter((id) => id !== fid))}
                                className="p-1 text-muted hover:text-error hover:bg-error/10 rounded-full transition-colors cursor-pointer"
                                aria-label={`Remove ${f.name}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {formError && (
                <div
                  className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                isLoading={isSubmitting || isLoading}
                disabled={isSubmitting || isLoading}
                size="lg"
                className="w-full mt-2"
              >
                <Trophy className="w-4 h-4" />
                Launch Challenge
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default CreateChallengeModal;
