import { useEffect } from 'react';

// Wrapper genérico: overlay + click afuera y Escape cierran (mismo comportamiento
// que los modales de la versión vanilla).
export default function Modal({ open, onClose, className = '', children }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeydown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`}>{children}</div>
    </div>
  );
}
