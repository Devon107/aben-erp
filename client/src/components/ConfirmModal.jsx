import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from './Modal.jsx';

const ConfirmContext = createContext(null);

// Confirmación en modal (Promise<boolean>), mismo patrón que pedirConfirmacion()
// de la versión vanilla: resuelve true solo si se confirma explícitamente.
export function ConfirmProvider({ children }) {
  const [mensaje, setMensaje] = useState(null);
  const resolveRef = useRef(null);

  const confirmar = useCallback((msg) => {
    setMensaje(msg);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function terminar(resultado) {
    resolveRef.current?.(resultado);
    resolveRef.current = null;
    setMensaje(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Modal open={mensaje !== null} onClose={() => terminar(false)} className="modal-confirmar">
        <div className="modal-header">
          <h2>Confirmar</h2>
          <button className="btn-close" type="button" onClick={() => terminar(false)}>
            &times;
          </button>
        </div>
        <p>{mensaje}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => terminar(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={() => terminar(true)}>
            Eliminar
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx;
}
