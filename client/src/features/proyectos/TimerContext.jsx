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

  function iniciarTimer(proyectoId) {
    if (activeTimer) {
      showToast('Ya hay un cronómetro activo en otro proyecto', true);
      return;
    }
    const timer = { proyectoId, startTime: new Date().toISOString() };
    setActiveTimer(timer);
    guardarTimerEnStorage(timer);
  }

  // Devuelve true si se registró una entrada de tiempo (para que quien llame
  // recargue su lista de entradas y la rentabilidad).
  async function detenerTimer(proyectoId) {
    if (!activeTimer || activeTimer.proyectoId !== proyectoId) return false;

    const inicio = new Date(activeTimer.startTime);
    const ahora = new Date();
    const horas = Math.max(0.01, Math.round(((ahora - inicio) / 3600000) * 100) / 100);

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
