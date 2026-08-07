import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { isoDateLocal } from '../../lib/format.js';
import { usePrompt } from '../../components/PromptModal.jsx';
import { useToast } from '../../components/Toast.jsx';

const TIMER_STORAGE_KEY = 'freelance-tracker:activeTimer';
const TimerContext = createContext(null);

function cargarTimerGuardado() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardarTimerEnStorage(timer) {
  if (timer) {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  } else {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

// Un cronómetro activo a la vez para toda la app, persistido en localStorage
// y sincronizado entre pestañas vía el evento 'storage'.
export function TimerProvider({ children }) {
  const [activeTimer, setActiveTimer] = useState(() => cargarTimerGuardado());
  const showToast = useToast();
  const pedirTexto = usePrompt();

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== TIMER_STORAGE_KEY) return;
      setActiveTimer(e.newValue ? JSON.parse(e.newValue) : null);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // entradaId opcional: si se pasa, el cronómetro queda "adjuntado" a esa
  // fila existente — al detenerlo se le suma un subregistro en vez de crear
  // una entrada nueva.
  function iniciarTimer(proyectoId, entradaId = null) {
    if (activeTimer) {
      showToast('Ya hay un cronómetro activo en otro proyecto', true);
      return;
    }
    const timer = { proyectoId, entradaId, startTime: new Date().toISOString() };
    setActiveTimer(timer);
    guardarTimerEnStorage(timer);
  }

  // Devuelve true si se registró tiempo (para que quien llame recargue su
  // lista de entradas y la rentabilidad).
  async function detenerTimer(proyectoId) {
    if (!activeTimer || activeTimer.proyectoId !== proyectoId) return false;

    const inicio = new Date(activeTimer.startTime);
    const ahora = new Date();
    const horas = Math.max(0.01, Math.round(((ahora - inicio) / 3600000) * 100) / 100);

    // Adjuntado a una fila existente: se suma directo como subregistro, sin
    // pedir descripción (la fila ya tiene la suya).
    if (activeTimer.entradaId) {
      try {
        await api(`/api/entradas-tiempo/${activeTimer.entradaId}/subregistros`, {
          method: 'POST',
          body: JSON.stringify({ horas, origen: 'timer' }),
        });
        setActiveTimer(null);
        guardarTimerEnStorage(null);
        showToast(`Tiempo agregado: ${horas} h`);
        return true;
      } catch (err) {
        showToast(err.message, true);
        return false;
      }
    }

    const descripcion = await pedirTexto('Descripción breve de la tarea realizada:');
    if (descripcion === null) return false; // el usuario canceló: el cronómetro sigue corriendo

    try {
      await api('/api/entradas-tiempo', {
        method: 'POST',
        body: JSON.stringify({
          proyecto_id: proyectoId,
          fecha: isoDateLocal(inicio),
          horas,
          descripcion: descripcion.trim() || 'Sesión de trabajo',
          origen: 'timer',
        }),
      });
      setActiveTimer(null);
      guardarTimerEnStorage(null);
      showToast(`Tiempo registrado: ${horas} h`);
      return true;
    } catch (err) {
      showToast(err.message, true);
      return false;
    }
  }

  return <TimerContext.Provider value={{ activeTimer, iniciarTimer, detenerTimer }}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer debe usarse dentro de TimerProvider');
  return ctx;
}
