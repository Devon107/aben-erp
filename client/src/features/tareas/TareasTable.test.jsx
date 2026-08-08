import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ToastProvider } from '../../components/Toast.jsx';
import { ConfirmProvider } from '../../components/ConfirmModal.jsx';
import { TareaPickerProvider } from '../../components/TareaPickerModal.jsx';
import { TimerProvider } from '../tiempo/TimerContext.jsx';
import { ProyectoDetalleProvider } from '../proyectos/ProyectoDetalleContext.jsx';
import TareasTable from './TareasTable.jsx';

const TAREAS = [
  { id: 1, nombre: 'Reunion cliente', tipo_cobro: 'hora', tarifa_hora: 50, precio_fijo: null, horas: 1, estado: 'completada', pagado: true, fecha_limite: null },
  { id: 2, nombre: 'Desarrollo backend', tipo_cobro: 'hora', tarifa_hora: 50, precio_fijo: null, horas: 2, estado: 'en_curso', pagado: false, fecha_limite: null },
  { id: 3, nombre: 'Reunion equipo', tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: 100, horas: 0.5, estado: 'completada', pagado: true, fecha_limite: null },
  { id: 4, nombre: 'Reunion ventas', tipo_cobro: 'hora', tarifa_hora: 50, precio_fijo: null, horas: 1.5, estado: 'pendiente', pagado: false, fecha_limite: null },
];

function renderTabla() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <TareaPickerProvider>
          <TimerProvider>
            <ProyectoDetalleProvider>
              <TareasTable proyectoId={1} onVerTarea={() => {}} />
            </ProyectoDetalleProvider>
          </TimerProvider>
        </TareaPickerProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe('TareasTable: filtrado combinado', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => TAREAS,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sin filtros muestra todas las tareas', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());
    expect(screen.getByText('Desarrollo backend')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    expect(screen.getByText('Reunion ventas')).toBeInTheDocument();
  });

  it('el buscador por nombre filtra sin importar el estado de pago', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre...'), { target: { value: 'reunion' } });

    expect(screen.getByText('Reunion cliente')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    expect(screen.getByText('Reunion ventas')).toBeInTheDocument();
    expect(screen.queryByText('Desarrollo backend')).not.toBeInTheDocument();
  });

  it('combina búsqueda por nombre y filtro de pago (AND, no OR)', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre...'), { target: { value: 'reunion' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pagado' } });

    // "Reunion cliente" y "Reunion equipo" coinciden con el texto y están pagadas.
    expect(screen.getByText('Reunion cliente')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    // "Reunion ventas" coincide con el texto pero no está pagada: debe quedar afuera.
    expect(screen.queryByText('Reunion ventas')).not.toBeInTheDocument();
    // "Desarrollo backend" no coincide con el texto de búsqueda.
    expect(screen.queryByText('Desarrollo backend')).not.toBeInTheDocument();
  });

  it('muestra un mensaje cuando los filtros no matchean ninguna tarea', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre...'), { target: { value: 'inexistente' } });

    expect(screen.getByText('Sin resultados para los filtros seleccionados.')).toBeInTheDocument();
  });
});
