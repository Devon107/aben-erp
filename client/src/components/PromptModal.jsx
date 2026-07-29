import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';

const PromptContext = createContext(null);

// Input de texto en modal (Promise<string|null>), mismo patrón que pedirTexto()
// de la versión vanilla: null si se cancela, el valor si se confirma.
export function PromptProvider({ children }) {
  const [mensaje, setMensaje] = useState(null);
  const [valor, setValor] = useState('');
  const resolveRef = useRef(null);
  const inputRef = useRef(null);

  const pedirTexto = useCallback((msg, valorInicial = '') => {
    setMensaje(msg);
    setValor(valorInicial);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (mensaje === null) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [mensaje]);

  function terminar(resultado) {
    resolveRef.current?.(resultado);
    resolveRef.current = null;
    setMensaje(null);
  }

  return (
    <PromptContext.Provider value={pedirTexto}>
      {children}
      <Modal open={mensaje !== null} onClose={() => terminar(null)} className="modal-confirmar">
        <div className="modal-header">
          <h2>Descripción</h2>
          <button className="btn-close" type="button" onClick={() => terminar(null)}>
            &times;
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            terminar(valor);
          }}
        >
          <label>
            <span>{mensaje}</span>
            <input ref={inputRef} type="text" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => terminar(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt debe usarse dentro de PromptProvider');
  return ctx;
}
