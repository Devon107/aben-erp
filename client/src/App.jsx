import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { api } from './lib/api.js';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { ConfirmProvider } from './components/ConfirmModal.jsx';
import { PromptProvider } from './components/PromptModal.jsx';
import { TimerProvider } from './features/tiempo/TimerContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import DashboardView from './views/DashboardView.jsx';
import ClientesView from './views/ClientesView.jsx';
import ClienteDetalleView from './views/ClienteDetalleView.jsx';

// El cliente ya está cargado en AppShell (cargarClientes); esta ruta solo
// resuelve cuál es por el :clienteId de la URL.
function ClienteDetalleRoute({ clientes, onClienteActualizado }) {
  const { clienteId } = useParams();
  const navigate = useNavigate();
  const cliente = clientes.find((c) => c.id === Number(clienteId)) ?? null;

  if (!cliente) return null; // clientes aún cargando, o id invalido en la URL

  return (
    <ClienteDetalleView
      cliente={cliente}
      onVolver={() => navigate('/clientes')}
      onClienteActualizado={onClienteActualizado}
    />
  );
}

function AppShell() {
  const showToast = useToast();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);

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

  function irACliente(id) {
    navigate(`/clientes/${id}`);
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardView onIrACliente={irACliente} />} />
          <Route
            path="/clientes"
            element={<ClientesView clientes={clientes} onClientesChange={cargarClientes} onIrACliente={irACliente} />}
          />
          <Route
            path="/clientes/:clienteId/*"
            element={<ClienteDetalleRoute clientes={clientes} onClienteActualizado={cargarClientes} />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
            <TimerProvider>
              <AppShell />
            </TimerProvider>
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}
