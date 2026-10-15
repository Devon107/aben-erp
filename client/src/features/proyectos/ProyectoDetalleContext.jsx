import { createContext, useCallback, useContext, useState } from 'react';

const ProyectoDetalleContext = createContext(null);

// Centraliza "recargar rentabilidad (y la tabla de tareas) de este proyecto"
// en una sola señal, en vez de threading manual de onCambio/refrescarSenal/
// onRegistrado entre ProyectoDetalleView, TareasTable, TareaDetalleView,
// FilaTimerBoton y TimerWidget.
export function ProyectoDetalleProvider({ children }) {
  const [senalRecarga, setSenalRecarga] = useState(0);
  const marcarCambio = useCallback(() => setSenalRecarga((n) => n + 1), []);

  return (
    <ProyectoDetalleContext.Provider value={{ senalRecarga, marcarCambio }}>
      {children}
    </ProyectoDetalleContext.Provider>
  );
}

export function useProyectoDetalle() {
  const ctx = useContext(ProyectoDetalleContext);
  if (!ctx) throw new Error('useProyectoDetalle debe usarse dentro de ProyectoDetalleProvider');
  return ctx;
}
