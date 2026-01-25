import { useEffect, useRef, type ReactNode } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  size?: ModalSize;
  className?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-full w-full h-full',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  className = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeOnEscape]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${className}`}
      onClick={handleBackdropClick}
    >
      <div className={`modal-box ${sizeClasses[size]}`}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">{title}</h3>
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        )}
        <div className="modal-content">{children}</div>
        {actions && <div className="modal-action">{actions}</div>}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

/**
 * Simple confirmation modal
 */
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'error' | 'warning';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
}: ConfirmModalProps) {
  const variantClass = variant === 'error' ? 'btn-glass-error' : variant === 'warning' ? 'btn-warning' : 'btn-glass-primary';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="py-4">{message}</p>
      <div className="modal-action">
        <button className="btn btn-ghost" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className={`btn ${variantClass}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
