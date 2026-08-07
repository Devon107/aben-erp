import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../components/Toast.jsx';
import { PromptProvider } from '../../components/PromptModal.jsx';
import { TimerProvider, useTimer } from './TimerContext.jsx';

function Harness() {
  const { activeTimer, iniciarTimer, detenerTimer } = useTimer();
  return (
    <div>
      <div data-testid="active">
        {activeTimer ? `${activeTimer.proyectoId}:${activeTimer.entradaId ?? 'suelto'}` : 'ninguno'}
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
      <PromptProvider>
        <TimerProvider>
          <Harness />
        </TimerProvider>
      </PromptProvider>
    </ToastProvider>
  );
}

describe('TimerContext', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, horas: 0.01, origen: 'timer' }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('adjunta el cronómetro a una fila cuando se pasa entradaId', () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-fila'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:99');
  });

  it('queda suelto (sin entradaId) cuando no se pasa fila', () => {
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

  it('detenerTimer con entradaId suma un subregistro a esa fila sin pedir descripción, y limpia el timer', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('iniciar-fila'));
    expect(screen.getByTestId('active')).toHaveTextContent('1:99');

    fireEvent.click(screen.getByText('detener'));

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('ninguno'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/entradas-tiempo/99/subregistros',
      expect.objectContaining({ method: 'POST' })
    );
    // no debe haber quedado ningún prompt de descripción abierto
    expect(screen.queryByText('Descripción')).not.toBeInTheDocument();
  });
});
