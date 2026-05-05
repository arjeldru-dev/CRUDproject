import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import {
  Wallet,
  Plus,
  X,
  AlertCircle,
  Check,
  Pencil,
  Search,
} from 'lucide-react';

/** Shape of a Category row from the backend. */
interface Category {
  id: string;
  name: string;
  monthlyLimit: number;
  userId: string;
}

/**
 * Budgeting Layout — Phase 6, Step 6.2
 * Displays budget category cards with inline limit editing
 * and a creation form.
 */
const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
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

  // ── Search ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── Data Fetching ───────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/categories');
      setCategories(res.data.categories);
    } catch {
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
    if (isNaN(limit) || limit < 0) {
      setFormError('Monthly limit must be a non-negative number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/categories', {
        name: trimmedName,
        monthlyLimit: limit,
      });
      // Optimistic prepend
      setCategories((prev) => [res.data.category, ...prev]);
      setFormName('');
      setFormLimit('');
      setShowForm(false);
    } catch {
      setFormError('Failed to create category. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Update Monthly Limit ────────────────────────────────────────────
  const handleSaveLimit = async (categoryId: string) => {
    const newLimit = parseFloat(editLimit);
    if (isNaN(newLimit) || newLimit < 0) return;

    setIsSaving(true);
    try {
      const res = await api.patch(`/categories/${categoryId}`, {
        monthlyLimit: newLimit,
      });
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? res.data.category : c)),
      );
      setEditingId(null);
    } catch {
      // Keep edit mode open on failure so user can retry
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (cat: Category) => {
    setEditingId(cat.id);
    setEditLimit(cat.monthlyLimit.toString());
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditLimit('');
  };

  // ── Filtered List ───────────────────────────────────────────────────
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Utility — Format Currency ───────────────────────────────────────
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // ── Skeleton Loader ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="animate-fadeInFast">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="h-9 w-48 bg-surface-hover rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-72 bg-surface rounded-lg animate-pulse" />
          </div>
          <div className="h-10 w-40 bg-surface-hover rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-28 bg-surface rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-fluid-h1 font-display font-semibold text-foreground tracking-tight">
            Budget Categories
          </h1>
          <p className="text-muted text-base font-medium mt-1">
            Define your spending categories and monthly limits
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          variant={showForm ? 'outline' : 'primary'}
          size="md"
          id="add-category-toggle"
        >
          {showForm ? (
            <>
              <X className="w-4 h-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" /> Add Category
            </>
          )}
        </Button>
      </div>

      <div className="divider mb-8" />

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchCategories}
            className="ml-auto text-xs font-medium underline hover:text-error/80 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Add Category Form ───────────────────────────────────────── */}
      {showForm && (
        <div className="mb-8 p-6 bg-surface border border-border-subtle rounded-2xl animate-slideDownIn">
          <h3 className="text-base font-display font-semibold text-foreground mb-5 flex items-center gap-2">
            New Budget Category
          </h3>

          {formError && (
            <div
              className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-4 items-end"
          >
            <div className="flex-1 w-full">
              <Input
                label="Category Name"
                type="text"
                placeholder="e.g. Groceries"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                id="category-name-input"
              />
            </div>
            <div className="w-full sm:w-48">
              <Input
                label="Monthly Limit ($)"
                type="number"
                placeholder="500"
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                id="category-limit-input"
              />
            </div>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              size="lg"
              id="category-submit"
            >
              Create
            </Button>
          </form>
        </div>
      )}

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="mb-6">
          <Input
            label="Search categories"
            hideLabel
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="category-search"
            leftIcon={<Search className="w-5 h-5 text-muted" />}
          />
        </div>
      )}

      {/* ── Category Cards Grid ─────────────────────────────────────── */}
      {categories.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 container-subtle rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">
            No Categories Yet
          </h3>
          <p className="text-sm text-muted mb-6 text-center max-w-sm">
            Create budget categories to start tracking your spending limits.
          </p>
          <Button
            onClick={() => setShowForm(true)}
            size="lg"
            id="add-category-empty"
          >
            <Plus className="w-4 h-4" /> Add Category
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* Search — No Results */
        <div className="flex flex-col items-center justify-center py-16 container-subtle rounded-2xl">
          <Search className="w-8 h-8 text-muted mb-4" />
          <p className="text-sm text-muted">
            No matches for "<span className="text-foreground font-medium">{search}</span>"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slideUpIn">
          {filtered.map((cat) => {
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className="group container-card container-card-interactive p-5"
              >
                {/* Top row — Name + Edit trigger */}
                <div className="flex items-start justify-between mb-4">
                  <p className="text-sm font-semibold text-foreground">{cat.name}</p>

                  {!isEditing && (
                    <button
                      onClick={() => startEditing(cat)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 cursor-pointer"
                      aria-label={`Edit ${cat.name} limit`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Monthly Limit */}
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor={`edit-limit-${cat.id}`} className="sr-only">Edit limit for {cat.name}</label>
                    <input
                      type="number"
                      value={editLimit}
                      onChange={(e) => setEditLimit(e.target.value)}
                      onKeyDown={(e) => {
                         if (e.key === 'Enter') handleSaveLimit(cat.id);
                         if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                      id={`edit-limit-${cat.id}`}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground font-semibold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                    <button
                      onClick={() => handleSaveLimit(cat.id)}
                      disabled={isSaving}
                      className="p-2 bg-success text-white rounded-lg hover:bg-success/80 transition-colors cursor-pointer disabled:opacity-50"
                      aria-label="Save limit"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                       onClick={cancelEditing}
                       className="p-2 bg-error text-white rounded-lg hover:bg-error/80 transition-colors cursor-pointer"
                       aria-label="Cancel edit"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted mb-1">Monthly Limit</p>
                    <p className="text-2xl font-display font-semibold text-foreground tracking-tight">
                      {fmt(cat.monthlyLimit)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Categories;
