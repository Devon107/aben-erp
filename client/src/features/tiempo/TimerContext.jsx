import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { isoDateLocal } from '../../lib/format.js';
import { useTareaPicker } from '../../components/TareaPickerModal.jsx';
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
  const pedirTarea = useTareaPicker();

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== TIMER_STORAGE_KEY) return;
      setActiveTimer(e.newValue ? JSON.parse(e.newValue) : null);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // tareaId opcional: si se pasa, el cronómetro queda "adjuntado" a esa
  // tarea existente — al detenerlo se le suma un log de tiempo directo, sin
  // pedir elegir tarea.
  function iniciarTimer(proyectoId, tareaId = null) {
    if (activeTimer) {
      showToast('Ya hay un cronómetro activo en otro proyecto', true);
      return;
    }
    const timer = { proyectoId, tareaId, startTime: new Date().toISOString() };
    setActiveTimer(timer);
    guardarTimerEnStorage(timer);
  }

  // Devuelve true si se registró tiempo (para que quien llame recargue su
  // lista de tareas y la rentabilidad).
  async function detenerTimer(proyectoId) {
    if (!activeTimer || activeTimer.proyectoId !== proyectoId) return false;

    const inicio = new Date(activeTimer.startTime);
    const ahora = new Date();
    const horas = Math.max(0.01, Math.round(((ahora - inicio) / 3600000) * 100) / 100);
    const fecha = isoDateLocal(inicio);

    // Adjuntado a una tarea existente: se suma directo como log de tiempo.
    if (activeTimer.tareaId) {
      try {
        await api(`/api/tareas/${activeTimer.tareaId}/subregistros`, {
          method: 'POST',
          body: JSON.stringify({ horas, fecha, origen: 'timer' }),
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

    // Suelto: se elige una tarea existente del proyecto, o se crea una nueva.
    const eleccion = await pedirTarea(proyectoId);
    if (eleccion === null) return false; // el usuario canceló: el cronómetro sigue corriendo

    try {
      let tareaId = eleccion.tareaId;
      if (!tareaId) {
        const nueva = await api('/api/tareas', {
          method: 'POST',
          body: JSON.stringify({ proyecto_id: proyectoId, nombre: eleccion.nueva.nombre }),
        });
        tareaId = nueva.id;
      }
      await api(`/api/tareas/${tareaId}/subregistros`, {
        method: 'POST',
        body: JSON.stringify({ horas, fecha, origen: 'timer' }),
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
