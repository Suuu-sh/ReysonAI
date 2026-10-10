import { useEffect, useRef, type ReactNode } from "react";

export type DialogProps = {
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

/** Shared modal shell. Each screen owns its title, controls and localized copy. */
export function Dialog({ labelledBy, onClose, className = "", children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKey = (event: KeyboardEvent) => {
      // A nested dialog owns the keyboard until it closes.
      if (dialog?.querySelector("[role='dialog']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      )].filter(element => element.tabIndex >= 0 && !element.matches(":disabled, input[type='hidden']")
        && !element.closest("[hidden], [aria-hidden='true'], [inert]")
        && window.getComputedStyle(element).display !== "none"
        && window.getComputedStyle(element).visibility !== "hidden");
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="modal-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className={`modal ${className}`.trim()} role="dialog" aria-modal="true"
      aria-labelledby={labelledBy} tabIndex={-1} ref={dialogRef}>
      {children}
    </div>
  </div>;
}
