import { useEffect, useState } from 'react';
import { useTimer } from './TimerContext.jsx';
import { formatElapsed } from '../../lib/format.js';
import { useProyectoDetalle } from '../proyectos/ProyectoDetalleContext.jsx';

// Cronómetro adjuntado a una tarea puntual: al detenerse suma un log de
// tiempo a esa tarea en vez de pedir elegir una (ver TimerContext.detenerTimer).
// Mismo patrón de ticking que TimerWidget.jsx, parametrizado por fila.
export default function FilaTimerBoton({ proyectoId, tareaId }) {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  const { marcarCambio } = useProyectoDetalle();
  const esEstaFila = activeTimer?.proyectoId === proyectoId && activeTimer?.tareaId === tareaId;
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!esEstaFila) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [esEstaFila]);

  async function onDetener() {
    const registrado = await detenerTimer(proyectoId);
    if (registrado) marcarCambio();
  }

  if (esEstaFila) {
    const elapsed = Date.now() - new Date(activeTimer.startTime).getTime();
    return (
      <button type="button" className="btn-icon fila-timer activo" title="Detener cronómetro" onClick={onDetener}>
        ⏹ {formatElapsed(elapsed)}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-icon fila-timer"
      title={activeTimer ? 'Ya hay un cronómetro activo' : 'Iniciar cronómetro para esta fila'}
      disabled={!!activeTimer}
      onClick={() => iniciarTimer(proyectoId, tareaId)}
    >
      ▶
    </button>
  );
}
