import { useEffect, useState } from 'react';
import { useTimer } from './TimerContext.jsx';
import { formatElapsed, horaCorta } from '../../lib/format.js';
import { useProyectoDetalle } from '../proyectos/ProyectoDetalleContext.jsx';

// Estilo "Live timer" de Tiempos.dc.html: caja destacada con borde/glow de
// acento cuando corre acá, punto de estado, título + subtítulo, tiempo
// grande en mono, botón ghost.
export default function TimerWidget({ proyecto, cliente }) {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  const { marcarCambio } = useProyectoDetalle();
  const esEsteProyecto = activeTimer?.proyectoId === proyecto.id;
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!esEsteProyecto) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [esEsteProyecto]);

  async function onDetener() {
    const registrado = await detenerTimer(proyecto.id);
    if (registrado) marcarCambio();
  }

  if (esEsteProyecto) {
    const elapsed = Date.now() - new Date(activeTimer.startTime).getTime();
    return (
      <div className="timer-live timer-live-activo">
        <div className="timer-live-info">
          <span className="timer-live-dot" />
          <div>
            <div className="timer-live-title">Cronómetro activo — {proyecto.nombre}</div>
            <div className="timer-live-sub">
              {cliente.nombre} · iniciado {horaCorta(activeTimer.startTime)}
            </div>
          </div>
        </div>
        <div className="timer-live-actions">
          <span className="timer-live-time">{formatElapsed(elapsed)}</span>
          <button type="button" className="btn-ghost" onClick={onDetener}>
            Detener
          </button>
        </div>
      </div>
    );
  }

  if (activeTimer) {
    return (
      <div className="timer-live">
        <div className="timer-live-info">
          <span className="timer-live-dot timer-live-dot-inactivo" />
          <div className="timer-live-title">Cronómetro activo en otro proyecto</div>
        </div>
        <div className="timer-live-actions">
          <span className="timer-live-time timer-live-time-muted">00:00:00</span>
          <button type="button" className="btn-ghost" disabled>
            Iniciar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="timer-live">
      <div className="timer-live-info">
        <span className="timer-live-dot timer-live-dot-inactivo" />
        <div className="timer-live-title">Cronómetro inactivo</div>
      </div>
      <div className="timer-live-actions">
        <span className="timer-live-time timer-live-time-muted">00:00:00</span>
        <button type="button" className="btn-ghost" onClick={() => iniciarTimer(proyecto.id)}>
          Iniciar
        </button>
      </div>
    </div>
  );
}
