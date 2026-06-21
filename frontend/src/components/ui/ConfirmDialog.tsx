import React, { useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  type?: 'alert' | 'confirm' | 'prompt';
  inputPlaceholder?: string;
  defaultValue?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  type = 'confirm',
  inputPlaceholder = 'Type your response...',
  defaultValue = '',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const dialogRef = useFocusTrap(isOpen, onCancel);

  if (!isOpen) return null;

  const confirmClass = variant === 'danger'
    ? 'bg-error hover:bg-error/90 text-white'
    : 'bg-primary hover:bg-primary-hover text-white';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'prompt' && !inputValue.trim()) return;
    onConfirm(type === 'prompt' ? inputValue : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        className="w-full max-w-md bg-surface rounded-[var(--radius-lg)] p-6 shadow-xl modal-content"
      >
        <h2 id="dialog-title" className="font-display text-xl font-bold text-foreground mb-2">{title}</h2>
        <p id="dialog-desc" className="text-muted text-sm mb-4 font-sans">{message}</p>
        
        {type === 'prompt' && (
          <form onSubmit={handleSubmit} className="mb-6">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="w-full h-11 px-4 rounded-[var(--radius-md)] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 font-sans"
              autoFocus
            />
          </form>
        )}
        
        <div className="flex justify-end gap-3">
          {type !== 'alert' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold border border-border rounded-[var(--radius-md)] hover:bg-surface-hover transition-all duration-150 cursor-pointer text-muted hover:text-foreground btn-press"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={() => onConfirm(type === 'prompt' ? inputValue : undefined)}
            disabled={type === 'prompt' && !inputValue.trim()}
            className={`px-4 py-2 text-sm font-semibold rounded-[var(--radius-md)] transition-all duration-150 cursor-pointer btn-press disabled:opacity-40 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
