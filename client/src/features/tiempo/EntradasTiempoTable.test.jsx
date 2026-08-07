import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ToastProvider } from '../../components/Toast.jsx';
import { ConfirmProvider } from '../../components/ConfirmModal.jsx';
import { PromptProvider } from '../../components/PromptModal.jsx';
import { TimerProvider } from './TimerContext.jsx';
import { ProyectoDetalleProvider } from '../proyectos/ProyectoDetalleContext.jsx';
import EntradasTiempoTable from './EntradasTiempoTable.jsx';

const ENTRADAS = [
  { id: 1, fecha: '2026-08-01', horas: 1, descripcion: 'Reunion cliente', origen: 'manual', pagado: true, creado_en: '2026-08-01T10:00:00' },
  { id: 2, fecha: '2026-08-02', horas: 2, descripcion: 'Desarrollo backend', origen: 'manual', pagado: false, creado_en: '2026-08-02T10:00:00' },
  { id: 3, fecha: '2026-08-03', horas: 0.5, descripcion: 'Reunion equipo', origen: 'timer', pagado: true, creado_en: '2026-08-03T10:00:00' },
  { id: 4, fecha: '2026-08-04', horas: 1.5, descripcion: 'Reunion ventas', origen: 'manual', pagado: false, creado_en: '2026-08-04T10:00:00' },
];

function renderTabla() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <PromptProvider>
          <TimerProvider>
            <ProyectoDetalleProvider>
              <EntradasTiempoTable proyectoId={1} rango={null} />
            </ProyectoDetalleProvider>
          </TimerProvider>
        </PromptProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe('EntradasTiempoTable: filtrado combinado', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ENTRADAS,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sin filtros muestra todas las entradas', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());
    expect(screen.getByText('Desarrollo backend')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    expect(screen.getByText('Reunion ventas')).toBeInTheDocument();
  });

  it('el buscador por descripción filtra sin importar el estado de pago', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por descripción...'), { target: { value: 'reunion' } });

    expect(screen.getByText('Reunion cliente')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    expect(screen.getByText('Reunion ventas')).toBeInTheDocument();
    expect(screen.queryByText('Desarrollo backend')).not.toBeInTheDocument();
  });

  it('combina búsqueda por descripción y filtro de pago (AND, no OR)', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por descripción...'), { target: { value: 'reunion' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pagado' } });

    // "Reunion cliente" y "Reunion equipo" coinciden con el texto y están pagadas.
    expect(screen.getByText('Reunion cliente')).toBeInTheDocument();
    expect(screen.getByText('Reunion equipo')).toBeInTheDocument();
    // "Reunion ventas" coincide con el texto pero no está pagada: debe quedar afuera.
    expect(screen.queryByText('Reunion ventas')).not.toBeInTheDocument();
    // "Desarrollo backend" no coincide con el texto de búsqueda.
    expect(screen.queryByText('Desarrollo backend')).not.toBeInTheDocument();
  });

  it('muestra un mensaje cuando los filtros no matchean ninguna entrada', async () => {
    renderTabla();
    await waitFor(() => expect(screen.getByText('Reunion cliente')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar por descripción...'), { target: { value: 'inexistente' } });

    expect(screen.getByText('Sin resultados para los filtros seleccionados.')).toBeInTheDocument();
  });
});
