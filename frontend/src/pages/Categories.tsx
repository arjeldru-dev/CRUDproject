import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import Button from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { getCategoryColor } from '../components/ui/SpendingDonutChart';
import {
  Wallet,
  Plus,
  X,
  AlertCircle,
  Check,
  Pencil,
  Search,
  ShoppingBag,
  Utensils,
  Plane,
  Zap,
  PiggyBank,
  Film,
  Activity,
  Lightbulb,
  Trash2,
} from 'lucide-react';

/** Shape of category budget status returned by /transactions/budget */
interface CategoryBudget {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  status?: string;
  insightText?: string;
  alertText?: string;
}

/** Global performance optimization: Avoid recreating Intl.NumberFormat on every render */
const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const fmt = (n: number) => currencyFormatter.format(n);

/** Helper mapping category names to Lucide icons and Stitch/index.css style variables */
const getCategoryMeta = (categoryName: string) => {
  const name = categoryName.toLowerCase();
  const color = getCategoryColor(categoryName);
  
  let icon = Wallet;
  if (name.includes('grocer') || name.includes('shop') || name.includes('market')) {
    icon = ShoppingBag;
  } else if (name.includes('dining') || name.includes('eat') || name.includes('drink') || name.includes('food') || name.includes('restau') || name.includes('cafe')) {
    icon = Utensils;
  } else if (name.includes('travel') || name.includes('transport') || name.includes('car') || name.includes('flight') || name.includes('taxi') || name.includes('gas')) {
    icon = Plane;
  } else if (name.includes('utilit') || name.includes('bill') || name.includes('cloud') || name.includes('power') || name.includes('internet') || name.includes('bolt') || name.includes('electricity')) {
    icon = Zap;
  } else if (name.includes('save') || name.includes('saving') || name.includes('invest') || name.includes('piggy')) {
    icon = PiggyBank;
  } else if (name.includes('entertain') || name.includes('movie') || name.includes('show') || name.includes('play') || name.includes('game') || name.includes('stream')) {
    icon = Film;
  } else if (name.includes('health') || name.includes('well') || name.includes('fit') || name.includes('gym') || name.includes('medical')) {
    icon = Activity;
  }
  
  return {
    icon,
    colorVar: color,
    badgeClass: ''
  };
};

interface ProgressRingProps {
  percent: number;
  color: string;
  isOver: boolean;
}

/** Circular progress ring element. Memoized to avoid unnecessary SVG recalculation */
const ProgressRing = React.memo<ProgressRingProps>(({ percent, color, isOver }) => {
  const r = 33;
  const strokeWidth = 5.5;
  const c = 2 * Math.PI * r;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const offset = c - (clampedPercent / 100) * c;
  const svgSize = 80;
  const center = svgSize / 2;

  return (
    <div 
      style={{ width: '80px', height: '80px', flexShrink: 0 }}
      className="relative flex items-center justify-center"
      role="progressbar"
      aria-valuenow={Math.round(clampedPercent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(clampedPercent)}% spent`}
    >
      <svg style={{ width: '80px', height: '80px' }} aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          fill="transparent"
          r={r}
          className="stroke-border dark:stroke-border-subtle"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          fill="transparent"
          r={r}
          stroke={isOver ? 'var(--color-error)' : color}
          className="transition-all duration-700 ease-out-emil"
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center select-none">
        <span className={`font-mono font-bold text-sm ${isOver ? 'text-error' : 'text-foreground'}`}>
          {isOver ? '!' : `${Math.round(percent)}%`}
        </span>
      </div>
    </div>
  );
});

ProgressRing.displayName = 'ProgressRing';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<CategoryBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Create Form State ───────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Inline Edit State ───────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editErrorId, setEditErrorId] = useState<string | null>(null);

  // ── Search State ────────────────────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── Insight Display ─────────────────────────────────────────────────
  const [showInsight, setShowInsight] = useState(true);

  // ── Deletion State ──────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Data Fetching ───────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      setError('');
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const clientNow = now.toISOString();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const res = await api.get(
        `/transactions/budget?monthStart=${monthStart}&monthEnd=${monthEnd}&now=${clientNow}&daysInMonth=${daysInMonth}`
      );
      setCategories(res.data.budgetStatuses || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
      setError('Failed to load categories. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ── Create Category ─────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = formName.trim();
    const limit = parseFloat(formLimit);

    if (!trimmedName) {
      setFormError('Category name is required.');
      return;
    }
    if (trimmedName.length > 30) {
      setFormError('Category name cannot exceed 30 characters.');
      return;
    }
    if (isNaN(limit) || limit < 0) {
      setFormError('Monthly limit must be a non-negative number.');
      return;
    }
    if (limit > 999999999) {
      setFormError('Monthly limit cannot exceed ₱999,999,999.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/categories', {
        name: trimmedName,
        monthlyLimit: limit,
      });
      setFormName('');
      setFormLimit('');
      setShowForm(false);
      fetchCategories();
    } catch (err) {
      const apiError = err as { response?: { data?: { error?: string } } };
      setFormError(apiError.response?.data?.error || 'Failed to create category. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Update Monthly Limit ────────────────────────────────────────────
  const handleSaveLimit = async (categoryId: string) => {
    const newLimit = parseFloat(editLimit);
    if (isNaN(newLimit) || newLimit < 0) {
      setEditErrorId(categoryId);
      return;
    }
    if (newLimit > 999999999) {
      setEditErrorId(categoryId);
      return;
    }

    setIsSaving(true);
    setEditErrorId(null);
    try {
      await api.patch(`/categories/${categoryId}`, {
        monthlyLimit: newLimit,
      });
      setEditingId(null);
      fetchCategories();
    } catch {
      setEditErrorId(categoryId);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete Category ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/categories/${deleteTarget.id}`);
      setDeleteTarget(null);
      setEditingId(null);
      fetchCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
      setError('Failed to delete category. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = (cat: CategoryBudget) => {
    setEditingId(cat.categoryId);
    setEditLimit(cat.monthlyLimit.toString());
    setEditErrorId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditLimit('');
    setEditErrorId(null);
  };

  // ── Filtered List ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return categories.filter((c) =>
      c.categoryName.toLowerCase().includes(search.toLowerCase())
    );
  }, [categories, search]);

  // Find first category containing insightText for top display card
  const insightCategory = categories.find((c) => c.insightText);

  // Style metadata for creation form preview
  const previewMeta = getCategoryMeta(formName || 'Category');
  const PreviewIcon = previewMeta.icon;

  // ── Skeleton Loader ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="animate-fadeInFast w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="h-10 w-56 bg-surface-hover rounded-xl animate-pulse mb-2" />
            <div className="h-5 w-80 bg-surface rounded-lg animate-pulse" />
          </div>
          <div className="h-12 w-44 bg-surface-hover rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 mt-4">
          <div className="lg:col-span-4 h-80 bg-surface border border-border rounded-2xl animate-pulse" />
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-40 bg-surface border border-border rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast relative w-full flex flex-col gap-2">
      {/* Header Section */}
      <div>
        <h1 className="font-display font-bold text-fluid-h1 text-foreground leading-tight">
          Budget Categories
        </h1>
        <p className="font-sans text-base text-muted mt-1">
          Define your spending targets and monthly targets
        </p>
      </div>

      <div className="flex flex-col gap-4 md:gap-6 w-full">
        {/* Add Category Toggle Button (Mobile/Tablet Only) */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="relative flex items-center justify-center pl-10 pr-4 h-10 bg-primary text-white font-semibold text-sm rounded-lg hover:bg-primary-hover active:scale-95 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer w-full sm:w-auto"
        >
          <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5" />
          <span>{showForm ? 'Hide Form' : 'Add Category'}</span>
        </button>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2.5 p-4 mb-6 rounded-2xl bg-error/10 border border-error/20 text-error text-sm font-sans animate-fadeInFast"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchCategories}
            className="ml-auto text-xs font-bold underline hover:text-error/80 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Main Layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 items-start" style={{ gap: 'var(--space-4)' }}>
        
        {/* Left Side: Create Form Card (Always visible on desktop, toggleable on mobile) */}
        <aside className={`lg:col-span-4 h-fit ${showForm ? 'block animate-slideDownIn' : 'hidden lg:block'}`}>
          <div 
            className="bg-surface rounded-2xl shadow-sm sticky top-24 animate-scaleIn transform-origin-center"
            style={{ padding: '24px' }}
          >
            <h2 className="font-display font-semibold text-lg text-foreground mb-5">
              New Budget Category
            </h2>

            {formError && (
              <div
                className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans animate-fadeInFast"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Dynamic Style Preview */}
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-[background-color] duration-300 ease-out-emil"
                style={{ backgroundColor: previewMeta.colorVar }}
              >
                <PreviewIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">Style Preview</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">
                  Auto-assigned Theme
                </p>
              </div>
            </div>

            <div className="h-6" />

            <form onSubmit={handleCreate} className="flex flex-col gap-6 font-sans">
              <div className="flex flex-col gap-2">
                <label htmlFor="category-name-input" className="block text-xs font-bold font-display text-muted uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dining Out"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={30}
                  className="w-full h-11 bg-background border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-muted/60 text-sm"
                  id="category-name-input"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="category-limit-input" className="block text-xs font-bold font-display text-muted uppercase tracking-wider">
                  Monthly Limit (₱)
                </label>
                <input
                  type="number"
                  placeholder="5000"
                  value={formLimit}
                  onChange={(e) => setFormLimit(e.target.value)}
                  min={0}
                  max={999999999}
                  className="w-full h-11 bg-background border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-muted/60 text-sm"
                  id="category-limit-input"
                />
              </div>

              <div className="flex gap-3 mt-4">
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                  size="md"
                  className="flex-1 h-10 transition-[transform,background-color] duration-150 ease-out-emil"
                  id="category-submit"
                >
                  Create
                </Button>
                {showForm && (
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 h-10 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-sm rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </aside>

        {/* Right Side: Category List & Search */}
        <section className="lg:col-span-8 w-full">
          {/* Integrated Insight Banner */}
          {showInsight && insightCategory && (
            <div className="bg-surface rounded-2xl shadow-sm relative animate-slideDownIn" style={{ padding: '24px', marginBottom: 'var(--space-3)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 animate-breathe">
                  <Lightbulb className="w-4.5 h-4.5" />
                </div>
                <div className="flex-grow pr-4">
                  <h4 className="font-display font-semibold text-sm text-primary">Budget Insight</h4>
                  <p className="font-sans text-xs text-muted mt-1 leading-relaxed">
                    {insightCategory.insightText}
                  </p>
                </div>
                <button
                  onClick={() => setShowInsight(false)}
                  className="text-muted hover:text-error transition-colors shrink-0 btn-active-tactile cursor-pointer p-0.5 rounded-lg"
                  aria-label="Close insight panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* Search Input */}
          {categories.length > 0 && (
            <div className="relative" style={{ marginBottom: 'var(--space-3)' }}>
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search your categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-12 pr-4 bg-surface border border-border rounded-lg text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-muted/50 text-sm"
                style={{ paddingLeft: '2.75rem' }}
                id="category-search"
                aria-label="Search budget categories"
              />
            </div>
          )}

          {/* Unified Layout Grid */}
          {categories.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 bg-surface rounded-2xl shadow-sm text-center px-6 animate-scaleIn">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary animate-float">
                <Wallet className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                No Categories Yet
              </h3>
              <p className="text-sm text-muted font-sans mb-6 max-w-sm">
                Create budget categories to start tracking your spending limits and visual targets.
              </p>
              <Button
                onClick={() => setShowForm(true)}
                size="lg"
                className="transition-[transform,background-color] duration-150 ease-out-emil"
                id="add-category-empty"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add Category
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            /* Search — No Results & Recovery Action */
            <div className="flex flex-col items-center justify-center py-16 bg-surface rounded-2xl shadow-sm animate-fadeInFast px-4 text-center">
              <Search className="w-8 h-8 text-muted mb-4" />
              <p className="text-sm text-muted font-sans">
                No matches for &ldquo;<span className="text-foreground font-semibold">{search}</span>&rdquo;
              </p>
              <button
                onClick={() => setSearch('')}
                className="mt-3.5 px-4 h-9 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-xl transition-all duration-150 btn-active-tactile cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            /* Unified, responsive grid card list (eliminates loop duplication) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {filtered.map((cat, index) => {
                const isEditing = editingId === cat.categoryId;
                const meta = getCategoryMeta(cat.categoryName);
                const Icon = meta.icon;
                const percent = cat.monthlyLimit > 0 ? (cat.spent / cat.monthlyLimit) * 100 : 0;
                const isOver = cat.spent > cat.monthlyLimit;
                const hasEditError = editErrorId === cat.categoryId;

                return (
                  <div
                    key={cat.categoryId}
                    className="bg-surface rounded-2xl flex items-center gap-5 transition-[box-shadow,transform] duration-200 ease-out-emil hover:-translate-y-0.5 hover:shadow-md relative group animate-stagger-card shadow-sm"
                    style={{ 
                      padding: '24px',
                      animationDelay: `${index * 35}ms`
                    }}
                  >
                    {/* circular progress indicator */}
                    <ProgressRing percent={percent} color={meta.colorVar} isOver={isOver} />
                    
                    {/* Right side info details */}
                    <div className="flex-grow font-sans min-w-0 relative">

                      {/* Name + Budget limit on same row, vertically centered */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="p-1.5 rounded-lg text-white flex items-center justify-center shrink-0"
                          style={{ backgroundColor: meta.colorVar }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <h3 className="font-display font-semibold text-foreground truncate" style={{ fontSize: '1.125rem', lineHeight: '1.3' }} title={cat.categoryName}>
                          {cat.categoryName}
                        </h3>
                        {!isEditing && (
                          <p className="text-sm text-muted truncate animate-fadeInFast shrink-0 whitespace-nowrap">
                            <span className="font-mono font-semibold text-foreground">{fmt(cat.spent)}</span>
                            <span className="text-muted/60"> / </span>
                            <span className="font-mono text-muted/80">{fmt(cat.monthlyLimit)}</span>
                          </p>
                        )}
                      </div>
                      
                      {/* Inline edit row (only visible when editing) */}
                      {isEditing && (
                        <div className="flex items-center gap-1.5 w-full animate-fadeInFast mt-2">
                          <label htmlFor={`edit-limit-${cat.categoryId}`} className="sr-only">
                            Edit limit for {cat.categoryName}
                          </label>
                          <input
                            type="number"
                            value={editLimit}
                            onChange={(e) => setEditLimit(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveLimit(cat.categoryId);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                            min={0}
                            max={999999999}
                            autoFocus
                            id={`edit-limit-${cat.categoryId}`}
                            className={`w-28 px-2.5 py-1 bg-background border rounded-lg text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm h-9 transition-colors ${
                              hasEditError ? 'border-error ring-2 ring-error/25' : 'border-border'
                            }`}
                          />
                          <button
                            onClick={() => handleSaveLimit(cat.categoryId)}
                            disabled={isSaving}
                            className="w-9 h-9 flex items-center justify-center bg-success text-white rounded-lg hover:bg-success/80 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile disabled:opacity-50 shrink-0"
                            aria-label="Save limit"
                          >
                            <Check className="w-4.5 h-4.5" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="w-9 h-9 flex items-center justify-center bg-error text-white rounded-lg hover:bg-error/80 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile shrink-0"
                            aria-label="Cancel edit"
                          >
                            <X className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      )}

                      {/* Footer Row (remaining status and visible action buttons) */}
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full font-bold border transition-[background-color,border-color] duration-200 ease-out-emil ${
                              isOver ? 'bg-error/10 text-error border-error/20' : ''
                            }`}
                            style={{
                              fontSize: '10px',
                              lineHeight: '1',
                              padding: '4px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: '22px',
                              gap: '4px',
                              backgroundColor: isOver ? undefined : `color-mix(in srgb, ${meta.colorVar} 10%, transparent)`,
                              borderColor: isOver ? undefined : `color-mix(in srgb, ${meta.colorVar} 20%, transparent)`,
                              color: isOver ? undefined : meta.colorVar
                            }}
                          >
                            <span className="font-mono">
                              {isOver ? fmt(Math.abs(cat.remaining)) : fmt(cat.remaining)}
                            </span>
                            <span>{isOver ? 'over' : 'left'}</span>
                          </span>
                          {/* Status badge — inline on all sizes */}
                          {isOver ? (
                            <span
                              className="bg-error/10 text-error border border-error/20 rounded-full font-bold"
                              style={{ fontSize: '10px', lineHeight: '1', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', height: '22px' }}
                            >
                              Over
                            </span>
                          ) : (
                            <span
                              className="bg-success/10 text-success border border-success/20 rounded-full font-bold animate-pulse"
                              style={{ fontSize: '10px', lineHeight: '1', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', height: '22px' }}
                            >
                              Within
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => startEditing(cat)}
                                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile"
                                aria-label={`Edit ${cat.categoryName} limit`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget({ id: cat.categoryId, name: cat.categoryName })}
                                className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile"
                                aria-label={`Delete ${cat.categoryName} category`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteTarget({ id: cat.categoryId, name: cat.categoryName })}
                              className="p-1 text-error hover:bg-error/10 rounded-lg transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile flex items-center gap-0.5 text-[10px] font-bold"
                              aria-label="Delete category"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      </div>

      {/* ── Delete Confirmation Dialog ────────────────────────────────── */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Budget Category"
        message={`Are you sure you want to delete the category "${deleteTarget?.name}"? All transactions mapped to this category will automatically become uncategorized. This action is irreversible.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Categories;
