import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { ConfirmProvider } from './components/ConfirmModal.jsx';
import { PromptProvider } from './components/PromptModal.jsx';
import { TimerProvider } from './features/proyectos/TimerContext.jsx';
import AppBar from './components/AppBar.jsx';
import DashboardView from './views/DashboardView.jsx';
import ClientesView from './views/ClientesView.jsx';
import ClienteDetalleView from './views/ClienteDetalleView.jsx';

function AppShell() {
  const showToast = useToast();
  const [vista, setVista] = useState('dashboard'); // 'dashboard' | 'clientes' | 'cliente'
  const [clientes, setClientes] = useState([]);
  const [clienteActualId, setClienteActualId] = useState(null);

  async function cargarClientes() {
    try {
      const data = await api('/api/clientes');
      setClientes(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clienteActual = clientes.find((c) => c.id === clienteActualId) ?? null;

  function irADashboard() {
    setVista('dashboard');
    setClienteActualId(null);
  }

  function irAClientes() {
    setVista('clientes');
    setClienteActualId(null);
  }

  function irACliente(id) {
    setClienteActualId(id);
    setVista('cliente');
  }

  return (
    <div className="app">
      <AppBar vista={vista} clienteNombre={clienteActual?.nombre} onIrDashboard={irADashboard} onIrClientes={irAClientes} />
      <main>
        {vista === 'dashboard' && <DashboardView onIrACliente={irACliente} />}
        {vista === 'clientes' && (
          <ClientesView clientes={clientes} onClientesChange={cargarClientes} onIrACliente={irACliente} />
        )}
        {vista === 'cliente' && clienteActual && (
          <ClienteDetalleView cliente={clienteActual} onVolver={irAClientes} onClienteActualizado={cargarClientes} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <PromptProvider>
          <TimerProvider>
            <AppShell />
          </TimerProvider>
        </PromptProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
