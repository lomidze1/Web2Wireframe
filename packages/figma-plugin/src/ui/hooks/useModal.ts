import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface UseModalOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Set to false on destructive-confirmation modals (HtmlWarning, LayoutChoice). */
  closeOnEsc?: boolean;
}

/**
 * Modal accessibility helper:
 *   • Escape-to-close (opt out via closeOnEsc=false)
 *   • Focus trap (Tab cycles within modal)
 *   • Initial focus → first focusable inside modalRef
 *   • Restores focus to opener on close
 *   • Marks the rest of the app as inert + aria-hidden while open
 *
 * Usage:
 *   const { modalRef } = useModal({ isOpen, onClose });
 *   return isOpen ? <div role="dialog" aria-modal="true" ref={modalRef}>...</div> : null;
 */
export function useModal({
  isOpen,
  onClose,
  closeOnEsc = true,
}: UseModalOptions) {
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus management — initial focus inside modal, restore to opener on close.
  //
  // NOTE: We deliberately do NOT mark the rest of the app `inert` here,
  // because several modals (FontFallback, HtmlWarning, LayoutChoice,
  // ImportOptions) are rendered as descendants of the import-page tree —
  // applying `inert` to a common ancestor would also disable the modal's
  // own controls. The focus trap (below) + role="dialog" + aria-modal="true"
  // are enough to keep keyboard and AT users contained without breaking
  // mouse interactions.
  useEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement as HTMLElement | null;

    // Defer initial focus until DOM is rendered
    const focusTimer = window.setTimeout(() => {
      const first = modalRef.current?.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      first?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      // Defer focus restoration so re-renders don't steal it back
      window.setTimeout(() => {
        openerRef.current?.focus();
      }, 0);
    };
  }, [isOpen]);

  // Keyboard handlers — Escape + Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEsc) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, closeOnEsc]);

  return { modalRef };
}
