import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../components/Toast.jsx';
import { TareaPickerProvider } from '../../components/TareaPickerModal.jsx';
import { TimerProvider, useTimer } from './TimerContext.jsx';

function Harness() {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  return (
    <div>
      <div data-testid="active">
        {activeTimer ? `${activeTimer.proyectoId}:${activeTimer.tareaId ?? 'suelto'}` : 'ninguno'}
      </div>
      <button onClick={() => iniciarTimer(1)}>iniciar-suelto</button>
      <button onClick={() => iniciarTimer(1, 99)}>iniciar-fila</button>
      <button onClick={() => detenerTimer(1)}>detener</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <TareaPickerProvider>
        <TimerProvider>
          <Harness />
        </TimerProvider>
      </TareaPickerProvider>
    </ToastProvider>
  );
}

function mockFetch() {
  return vi.fn((url, options = {}) => {
    const method = options.method || 'GET';
    if (method === 'GET' && url.startsWith('/api/tareas?proyecto_id=')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 5, nombre: 'Tarea existente' }] });
    }
    if (method === 'POST' && url === '/api/tareas') {
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 7, nombre: 'Tarea nueva' }) });
    }
    return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 1, horas: 0.01, origen: 'timer' }) });
  });
}

describe('TimerContext', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = mockFetch();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('adjunta el cronómetro a una tarea cuando se pasa tareaId', () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-fila'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:99');
  });

  it('queda suelto (sin tareaId) cuando no se pasa fila', () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-suelto'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:suelto');
  });

  it('no permite iniciar un segundo cronómetro mientras uno esté activo', () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-suelto'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:suelto');

    fireEvent.click(screen.getByText('iniciar-fila'));
    // el timer original sigue activo, sin adjuntarse a la fila 99
    expect(screen.getByTestId('active')).toHaveTextContent('1:suelto');
    expect(screen.getByText('Ya hay un cronómetro activo en otro proyecto')).toBeInTheDocument();
  });

  it('detenerTimer con tareaId suma un log de tiempo a esa tarea sin abrir el selector, y limpia el timer', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-fila'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:99');

    fireEvent.click(screen.getByText('detener'));

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('ninguno'));
    expect(global.fetch).toHaveBeenCalledWith('/api/tareas/99/subregistros', expect.objectContaining({ method: 'POST' }));
    // no debe haber quedado abierto el selector de tarea
    expect(screen.queryByText('Elegir tarea')).not.toBeInTheDocument();
  });

  it('detenerTimer suelto abre el selector de tarea; elegir una existente le suma el tiempo', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-suelto'));
    fireEvent.click(screen.getByText('detener'));

    await waitFor(() => expect(screen.getByText('Tarea existente')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Tarea existente'));
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('ninguno'));
    expect(global.fetch).toHaveBeenCalledWith('/api/tareas/5/subregistros', expect.objectContaining({ method: 'POST' }));
  });

  it('detenerTimer suelto: crear una tarea nueva la crea y le suma el tiempo', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-suelto'));
    fireEvent.click(screen.getByText('detener'));

    await waitFor(() => expect(screen.getByText('+ Crear una tarea nueva')).toBeInTheDocument());
    fireEvent.click(screen.getByText('+ Crear una tarea nueva'));
    fireEvent.change(screen.getByLabelText('Nombre de la tarea'), { target: { value: 'Tarea nueva' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('ninguno'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tareas',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ proyecto_id: 1, nombre: 'Tarea nueva' }) })
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/tareas/7/subregistros', expect.objectContaining({ method: 'POST' }));
  });
});
