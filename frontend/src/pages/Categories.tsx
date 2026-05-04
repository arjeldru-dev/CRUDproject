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
  Tag,
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
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);

  // ── Skeleton Loader ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-7 w-48 bg-white/5 rounded-lg animate-pulse" />
            <div className="h-4 w-72 bg-white/5 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-32 bg-surface border border-border shadow-resting rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-accent-primary flex items-center justify-center shadow-lg">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            Budget Categories
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            Define your spending categories and monthly limits.
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

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchCategories}
            className="ml-auto text-xs underline hover:text-red-300 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Add Category Form ───────────────────────────────────────── */}
      {showForm && (
        <div className="mb-6 p-5 bg-surface border border-border shadow-resting rounded-2xl">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Tag className="w-4 h-4 text-accent-primary" />
            New Budget Category
          </h3>

          {formError && (
            <div
              className="flex items-center gap-2 p-2.5 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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
            <div className="w-full sm:w-44">
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
              size="md"
              id="category-submit"
            >
              Create
            </Button>
          </form>
        </div>
      )}

      {/* ── Search Bar ──────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="mb-5 relative">
          <label htmlFor="category-search" className="sr-only">Search categories</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="category-search"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-text-primary placeholder-text-secondary shadow-sm text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary hover:border-text-secondary/30"
          />
        </div>
      )}

      {/* ── Category Cards Grid ─────────────────────────────────────── */}
      {categories.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border bg-surface/50 rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center mb-5">
            <Wallet className="w-8 h-8 text-accent-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            No categories yet
          </h3>
          <p className="text-sm text-text-secondary mb-5 text-center max-w-xs">
            Create budget categories to start tracking your spending limits.
          </p>
          <Button
            onClick={() => setShowForm(true)}
            size="md"
            id="add-category-empty"
          >
            <Plus className="w-4 h-4" /> Add your first category
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* Search — No Results */
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="w-8 h-8 text-zinc-600 mb-3" />
          <p className="text-sm text-text-secondary">
            No categories match "
            <span className="text-text-secondary">{search}</span>".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cat) => {
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className="group bg-surface border border-border rounded-2xl p-5 shadow-resting hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                {/* Top row — Name + Edit trigger */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-accent-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Tag className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-sm font-semibold text-text-primary">{cat.name}</p>
                  </div>

                  {!isEditing && (
                    <button
                      onClick={() => startEditing(cat)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg hover:bg-white/10 text-text-secondary hover:text-white cursor-pointer"
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
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-indigo-500/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                    <button
                      onClick={() => handleSaveLimit(cat.id)}
                      disabled={isSaving}
                      className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                      aria-label="Save limit"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-1.5 rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 transition-colors cursor-pointer"
                      aria-label="Cancel edit"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-text-secondary mb-0.5">Monthly Limit</p>
                    <p className="text-xl font-bold text-text-primary tracking-tight">
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
