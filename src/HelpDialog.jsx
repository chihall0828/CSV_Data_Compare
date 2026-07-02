import { useEffect, useRef } from "react";

export function HelpButton({ open, onToggle, dialogId, label }) {
  return (
    <button
      type="button"
      className="help-button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={dialogId}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      ?
    </button>
  );
}

export function HelpDialog({ open, onClose, dialogId, title, children }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay help-overlay" onClick={onClose}>
      <div
        className="modal-dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        id={dialogId}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-dialog-header">
          <h3 id={`${dialogId}-title`}>{title}</h3>
          <button
            type="button"
            className="help-close-button"
            aria-label="ヘルプを閉じる"
            onClick={onClose}
            ref={closeButtonRef}
          >
            ×
          </button>
        </div>
        <div className="help-dialog-body">{children}</div>
        <div className="modal-actions help-dialog-footer">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
