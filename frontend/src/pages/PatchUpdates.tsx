import React, { useEffect } from 'react';
import { Sparkles, Wrench, SlidersHorizontal, Trash2, Lightbulb } from 'lucide-react';
import { CHANGELOG, type ChangeType, type ChangeItem } from '../data/changelog';
import { markUpdatesSeen } from '../lib/updates';
import { useAuthStore } from '../store/authStore';

/** Visual metadata per change type. */
const TYPE_META: Record<
  ChangeType,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string; iconClass: string }
> = {
  feature: {
    label: 'New',
    icon: Sparkles,
    badgeClass: 'bg-primary/10 text-primary',
    iconClass: 'text-primary',
  },
  fix: {
    label: 'Fixed',
    icon: Wrench,
    badgeClass: 'bg-success/10 text-success',
    iconClass: 'text-success',
  },
  adjustment: {
    label: 'Adjusted',
    icon: SlidersHorizontal,
    badgeClass: 'bg-warning/10 text-warning',
    iconClass: 'text-warning',
  },
  removed: {
    label: 'Removed',
    icon: Trash2,
    badgeClass: 'bg-error/10 text-error',
    iconClass: 'text-error',
  },
};

const TYPE_ORDER: ChangeType[] = ['feature', 'fix', 'adjustment', 'removed'];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : dateFormatter.format(d);
};

/** A single change row with its type badge, description, and optional how-to. */
const ChangeRow: React.FC<{ change: ChangeItem }> = ({ change }) => {
  const meta = TYPE_META[change.type];
  const Icon = meta.icon;

  return (
    <div className="flex gap-3">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.badgeClass}`}
        aria-hidden="true"
      >
        <Icon className={`w-4.5 h-4.5 ${meta.iconClass}`} />
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex items-center flex-wrap gap-2">
          <h4 className="font-display font-semibold text-foreground text-sm">{change.title}</h4>
          <span
            className={`rounded-full font-bold text-[10px] leading-none px-2 py-1 uppercase tracking-wide ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
        </div>

        <p className="text-sm text-muted font-sans mt-1 leading-relaxed">{change.description}</p>

        {change.howToUse && (
          <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-primary/[0.06] p-3">
            <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-[10px] font-bold font-display text-primary uppercase tracking-wider">How to use</p>
              <p className="text-xs text-muted font-sans mt-0.5 leading-relaxed">{change.howToUse}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PatchUpdates: React.FC = () => {
  const userId = useAuthStore((s) => s.user?.id);

  // Viewing the page marks the update seen for this account (the notification
  // entry then shows as read rather than disappearing).
  useEffect(() => {
    markUpdatesSeen(userId);
  }, [userId]);

  return (
    <div className="animate-fadeInFast w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display font-bold text-fluid-h1 text-foreground leading-tight">What's New</h1>
        <p className="font-sans text-base text-muted mt-2">
          New features, fixes, and adjustments — and how to make the most of them.
        </p>
      </div>

      {/* Timeline of releases */}
      <div className="flex flex-col gap-5">
        {CHANGELOG.map((release, index) => {
          const grouped = TYPE_ORDER.map((type) => ({
            type,
            items: release.changes.filter((c) => c.type === type),
          })).filter((g) => g.items.length > 0);

          return (
            <section
              key={release.version}
              className="bg-surface rounded-2xl shadow-sm animate-stagger-card"
              style={{ padding: '24px', animationDelay: `${index * 60}ms` }}
              aria-label={release.title || formatDate(release.date)}
            >
              {/* Release header */}
              <div className="mb-1">
                {release.title && (
                  <h2 className="font-display font-semibold text-lg text-foreground">{release.title}</h2>
                )}
                {release.summary && (
                  <p className="text-sm text-muted font-sans mt-1 leading-relaxed">{release.summary}</p>
                )}
              </div>

              <p className="text-xs text-muted/70 font-sans mb-5">{formatDate(release.date)}</p>

              {/* Changes */}
              <div className="flex flex-col gap-5">
                {grouped.map((group) => (
                  <div key={group.type} className="flex flex-col gap-4">
                    {group.items.map((change, i) => (
                      <ChangeRow key={`${group.type}-${i}`} change={change} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default PatchUpdates;
