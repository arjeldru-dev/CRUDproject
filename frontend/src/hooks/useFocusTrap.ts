import { useEffect, useRef } from 'react';

export function useFocusTrap(isOpen: boolean, onClose: () => void) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const element = elementRef.current;
    if (!element) return;

    const getFocusableElements = () => {
      return element.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    };




    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      // Re-query in case DOM elements changed inside the modal (e.g. loading state finished)
      const currentElements = getFocusableElements();
      if (currentElements.length === 0) return;
      
      const first = currentElements[0];
      const last = currentElements[currentElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    };

    // Delay focus slightly to let layout/animations finish mounting
    const timer = setTimeout(() => {
      const currentElements = getFocusableElements();
      if (currentElements.length > 0) {
        currentElements[0].focus();
      }
    }, 50);

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return elementRef;
}
