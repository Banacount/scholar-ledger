import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const widthClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'md',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClasses[maxWidth]} max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

interface ReasonConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

export function ReasonConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger = true,
  onConfirm,
}: ReasonConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Please enter a clear reason (at least 3 characters) for the audit log.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete action.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Administrative audit trail required"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">{description}</p>
        <div>
          <label
            htmlFor="audit-reason-input"
            className="block text-sm font-medium text-slate-700"
          >
            Reason for this action <span className="text-red-600">*</span>
          </label>
          <textarea
            id="audit-reason-input"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Student transferred to another program, or duplicate section created..."
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
          <p className="mt-1 text-xs text-slate-500">
            This reason will be stored in the system log for Administrator review.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            {submitting ? 'Submitting...' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
