import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';

const TareaPickerContext = createContext(null);

// Selector de tarea en modal (Promise<{tareaId}|{nueva}|null>), usado por
// TimerContext cuando se detiene el cronómetro "suelto" (sin tarea
// pre-seleccionada): en vez de pedir una descripción libre que crea una
// entrada nueva, se elige una tarea existente del proyecto o se crea una
// nueva ahí mismo (nombre + tipo de cobro).
export function TareaPickerProvider({ children }) {
  const [proyectoId, setProyectoId] = useState(null);
  const [tareas, setTareas] = useState(null);
  const [seleccionId, setSeleccionId] = useState('');
  const [modoNueva, setModoNueva] = useState(false);
  const [nombreNueva, setNombreNueva] = useState('');
  const [tipoCobroNueva, setTipoCobroNueva] = useState('hora');
  const resolveRef = useRef(null);

  const pedirTarea = useCallback((pid) => {
    setProyectoId(pid);
    setSeleccionId('');
    setModoNueva(false);
    setNombreNueva('');
    setTipoCobroNueva('hora');
    setTareas(null);
    api(`/api/tareas?proyecto_id=${pid}`)
      .then(setTareas)
      .catch(() => setTareas([]));
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function terminar(resultado) {
    resolveRef.current?.(resultado);
    resolveRef.current = null;
    setProyectoId(null);
  }

  function confirmar(e) {
    e.preventDefault();
    if (modoNueva) {
      if (!nombreNueva.trim()) return;
      terminar({ nueva: { nombre: nombreNueva.trim(), tipo_cobro: tipoCobroNueva } });
    } else {
      if (!seleccionId) return;
      terminar({ tareaId: Number(seleccionId) });
    }
  }

  return (
    <TareaPickerContext.Provider value={pedirTarea}>
      {children}
      <Modal open={proyectoId !== null} onClose={() => terminar(null)} className="modal-confirmar">
        <div className="modal-header">
          <h2>Elegir tarea</h2>
          <button className="btn-close" type="button" onClick={() => terminar(null)}>
            &times;
          </button>
        </div>
        <form onSubmit={confirmar}>
          {!modoNueva && (
            <>
              {tareas === null && <p className="mini-empty">Cargando...</p>}
              {tareas !== null && tareas.length === 0 && (
                <p className="mini-empty">Este proyecto no tiene tareas todavía.</p>
              )}
              {tareas !== null && tareas.length > 0 && (
                <ul className="mini-list">
                  {tareas.map((t) => (
                    <li key={t.id}>
                      <label className="label-checkbox">
                        <input
                          type="radio"
                          name="tarea"
                          value={t.id}
                          checked={seleccionId === String(t.id)}
                          onChange={() => setSeleccionId(String(t.id))}
                        />
                        {t.nombre}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn-link" onClick={() => setModoNueva(true)}>
                + Crear una tarea nueva
              </button>
            </>
          )}
          {modoNueva && (
            <>
              <label>
                Nombre de la tarea
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input type="text" autoFocus value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} />
              </label>
              <label>
                Tipo de cobro
                <select value={tipoCobroNueva} onChange={(e) => setTipoCobroNueva(e.target.value)}>
                  <option value="hora">Por hora</option>
                  <option value="fijo">Precio fijo</option>
                </select>
              </label>
              <button type="button" className="btn-link" onClick={() => setModoNueva(false)}>
                &larr; Elegir una existente
              </button>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => terminar(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Confirmar
            </button>
          </div>
        </form>
      </Modal>
    </TareaPickerContext.Provider>
  );
}

export function useTareaPicker() {
  const ctx = useContext(TareaPickerContext);
  if (!ctx) throw new Error('useTareaPicker debe usarse dentro de TareaPickerProvider');
  return ctx;
}
