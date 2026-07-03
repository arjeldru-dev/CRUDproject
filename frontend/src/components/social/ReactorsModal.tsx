import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { ReactionGlyph } from './ReactionGlyph';
import type { Reactor } from '../../store/feedStore';

interface ReactorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fetchReactors: () => Promise<Reactor[]>;
  /**
   * The originating post card. When provided, the dim/blur backdrop is scoped
   * to this element's bounds instead of the whole viewport.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

/** Lists who reacted, with an "All" tab plus a tab per emoji used. */
const ReactorsModal: React.FC<ReactorsModalProps> = ({ isOpen, onClose, fetchReactors, anchorRef }) => {
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Keep the latest fetcher in a ref so the fetch effect only depends on `isOpen`
  // (avoids refetch loops if the parent passes a new inline function).
  const fetchRef = useRef(fetchReactors);
  useEffect(() => {
    fetchRef.current = fetchReactors;
  }, [fetchReactors]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      setActiveTab('all');
      try {
        const data = await fetchRef.current();
        if (!cancelled) setReactors(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Track the anchor post's position so the blur stays pinned to it while the
  // page scrolls or resizes underneath the (portaled) overlay.
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setAnchorRect(null);
      return;
    }
    const measure = () => {
      const el = anchorRef.current;
      if (el) setAnchorRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, anchorRef]);

  if (!isOpen) return null;

  // Backdrop covers just the post card when we know its bounds, else full screen.
  const backdropStyle: React.CSSProperties = anchorRect
    ? { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height }
    : { inset: 0 };
  // Center the card over the post region (falls back to viewport center).
  const cardWrapStyle: React.CSSProperties = anchorRect
    ? { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height }
    : { inset: 0 };

  const counts: Record<string, number> = {};
  reactors.forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  });
  const emojiTabs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const filtered = activeTab === 'all' ? reactors : reactors.filter((r) => r.emoji === activeTab);

  const tabClass = (active: boolean) =>
    `flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
      active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-hover'
    }`;

  // Render into document.body via a portal. Feed post cards apply a persistent
  // `transform` (from the entrance animation's `forwards` fill mode), which
  // would otherwise make this `fixed` overlay positioned/stacked relative to
  // the card instead of the viewport — causing post content to bleed over it.
  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Reactions">
      {/* Transparent full-screen catcher so a click anywhere closes the modal. */}
      <div className="absolute inset-0" onClick={onClose} />
      {/* Dim + blur limited to the originating post card. */}
      <div
        className="absolute bg-black/40 backdrop-blur-sm animate-fadeIn rounded-2xl pointer-events-none"
        style={backdropStyle}
      />
      {/* Card centered over the post region; only the card itself is clickable. */}
      <div className="absolute flex items-center justify-center p-4 pointer-events-none" style={cardWrapStyle}>
      <div className="relative w-full max-w-sm bg-surface rounded-2xl shadow-2xl overflow-hidden animate-scaleIn max-h-[70vh] flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-display font-semibold text-sm text-foreground">Reactions</h3>
          <button
            onClick={onClose}
            aria-label="Close reactions"
            className="p-1 text-muted hover:text-foreground rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {!loading && !error && reactors.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveTab('all')} className={tabClass(activeTab === 'all')}>
              All <span className="font-mono">{reactors.length}</span>
            </button>
            {emojiTabs.map(([emoji, count]) => (
              <button key={emoji} onClick={() => setActiveTab(emoji)} className={tabClass(activeTab === emoji)}>
                <ReactionGlyph emoji={emoji} className="w-3.5 h-3.5" />
                <span className="font-mono">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-[140px]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted">
              <Loader2 className="w-5 h-5 animate-spin opacity-60" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted px-6">
              <AlertCircle className="w-5 h-5 text-error mb-2" />
              <p className="text-xs">Couldn't load reactions.</p>
            </div>
          ) : reactors.length === 0 ? (
            <p className="text-center text-xs text-muted py-10">No reactions yet.</p>
          ) : (
            <ul className="flex flex-col py-1">
              {filtered.map((r, i) => {
                const name = r.user.displayName || r.user.username || 'User';
                return (
                  <li key={`${r.user.username}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="relative shrink-0">
                      <Avatar
                        src={r.user.avatarUrl}
                        name={name}
                        size="sm"
                        className="!rounded-full"
                        frameClass={r.user.activeFrame?.cssClass || undefined}
                      />
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface flex items-center justify-center shadow-sm text-primary">
                        <ReactionGlyph emoji={r.emoji} className="w-3 h-3" />
                      </span>
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
};

export default ReactorsModal;
