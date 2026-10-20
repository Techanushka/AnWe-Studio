import { useEffect, useRef } from 'react';

/** Minimal accessible modal: focus trap, Escape to close, focus restored on close. */
export default function Modal({ wide = false, titleId, descriptionId, role = 'dialog', onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select,textarea')];
    (el.querySelector('[data-autofocus]') || focusables()[0])?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal${wide ? ' wide' : ''}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        {children}
      </div>
    </div>
  );
}
