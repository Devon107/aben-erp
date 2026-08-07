import { useEffect, useState } from 'react';
import { useTimer } from './TimerContext.jsx';
import { formatElapsed } from '../../lib/format.js';
import { useProyectoDetalle } from '../proyectos/ProyectoDetalleContext.jsx';

export default function TimerWidget({ proyectoId }) {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  const { marcarCambio } = useProyectoDetalle();
  const esEsteProyecto = activeTimer?.proyectoId === proyectoId;
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!esEsteProyecto) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [esEsteProyecto]);

  async function onDetener() {
    const registrado = await detenerTimer(proyectoId);
    if (registrado) marcarCambio();
  }

  if (esEsteProyecto) {
    const elapsed = Date.now() - new Date(activeTimer.startTime).getTime();
    return (
      <div className="timer-widget">
        <span className="timer-display">{formatElapsed(elapsed)}</span>
        <button className="btn btn-secondary btn-sm" onClick={onDetener}>
          Detener
        </button>
      </div>
    );
  }

  if (activeTimer) {
    return (
      <div className="timer-widget">
        <span className="timer-display muted">Cronómetro activo en otro proyecto</span>
        <button className="btn btn-primary btn-sm" disabled>
          Iniciar
        </button>
      </div>
    );
  }

  return (
    <div className="timer-widget">
      <span className="timer-display muted">00:00:00</span>
      <button className="btn btn-primary btn-sm" onClick={() => iniciarTimer(proyectoId)}>
        Iniciar
      </button>
    </div>
  );
}
