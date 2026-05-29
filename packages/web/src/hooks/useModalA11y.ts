import { useEffect, useRef } from "react";

/**
 * P5-A11Y-3: Reusable modal a11y wiring — ESC to close, focus trap, focus
 * restore on close. Modals that don't use this hook regress WCAG 2.1.2
 * (No Keyboard Trap) + 2.4.3 (Focus Order).
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useModalA11y(open, onClose, containerRef);
 *   return <div ref={containerRef} role="dialog">...</div>;
 *
 * The hook does NOT render anything — the caller is responsible for the
 * `role="dialog" aria-modal="true"` markup and conditional rendering
 * (return null when !open). This keeps the hook narrow + composable.
 */
export function useModalA11y(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  // Save the element that had focus when the modal opened so we can return
  // focus there on close. WCAG 2.4.3: focus order. Without this, keyboard
  // users lose their place in the page on dismiss.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Focus the first focusable inside the modal. Headers + close buttons
    // and form inputs all qualify. Default to the dialog itself if no
    // focusables exist so ESC still works.
    const focusFirst = () => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      if (first) {
        first.focus();
      } else if (container.tabIndex >= 0 || container.hasAttribute("tabindex")) {
        container.focus();
      } else {
        // Force-focus the dialog so ESC works even with no focusable children.
        container.setAttribute("tabindex", "-1");
        container.focus();
      }
    };

    // Defer one frame so the modal DOM is mounted before we query it.
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      // ESC: close. Stop propagation so a parent listener doesn't also act
      // on it (e.g. closing a sidebar behind the modal).
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      // Tab / Shift+Tab focus trap. Cycle focus within the modal so the
      // user can't tab into the underlying page (which would expose
      // controls behind the modal — both a11y + UX regression).
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the element that triggered the modal. If that
      // element is gone (e.g. unmounted), default to <body> so subsequent
      // keystrokes have a sensible target.
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose, containerRef]);
}
