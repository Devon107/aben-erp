import { useEffect, useState } from 'react';
import { useTimer } from './TimerContext.jsx';
import { formatElapsed } from '../../lib/format.js';

// Cronómetro adjuntado a una fila de entradas_tiempo puntual: al detenerse
// suma un subregistro a esa fila en vez de crear una entrada nueva (ver
// TimerContext.detenerTimer). Mismo patrón de ticking que TimerWidget.jsx,
// parametrizado por fila.
export default function FilaTimerBoton({ proyectoId, entradaId, onRegistrado }) {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  const esEstaFila = activeTimer?.proyectoId === proyectoId && activeTimer?.entradaId === entradaId;
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!esEstaFila) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [esEstaFila]);

  async function onDetener() {
    const registrado = await detenerTimer(proyectoId);
    if (registrado) await onRegistrado?.();
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
      onClick={() => iniciarTimer(proyectoId, entradaId)}
    >
      ▶
    </button>
  );
}
