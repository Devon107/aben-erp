import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import ClienteModal from '../components/ClienteModal.jsx';

export default function ClientesView({ clientes, onClientesChange, onIrACliente }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null); // null = nuevo

  function abrirNuevo() {
    setClienteEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(cliente) {
    setClienteEditando(cliente);
    setModalAbierto(true);
  }

  async function eliminar(cliente) {
    if (!(await confirmar('¿Eliminar este cliente? Se eliminarán también sus proyectos, horas y gastos asociados.'))) {
      return;
    }
    try {
      await api(`/api/clientes/${cliente.id}`, { method: 'DELETE' });
      showToast('Cliente eliminado');
      await onClientesChange();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <section>
      <div className="view-header">
        <h1>Clientes</h1>
        <button className="btn btn-primary" onClick={abrirNuevo}>
          + Nuevo cliente
        </button>
      </div>

      {clientes.length === 0 ? (
        <p className="empty-state">Aún no tienes clientes. Crea el primero para empezar.</p>
      ) : (
        <div className="grid-clientes">
          {clientes.map((c) => (
            <div key={c.id} className="cliente-card" onClick={() => onIrACliente(c.id)}>
              <div className="cliente-card-top">
                <h3>{c.nombre}</h3>
                <div className="cliente-card-actions">
                  <button
                    className="btn-icon"
                    title="Editar"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirEditar(c);
                    }}
                  >
                    &#9998;
                  </button>
                  <button
                    className="btn-icon danger"
                    title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      eliminar(c);
                    }}
                  >
                    &times;
                  </button>
                </div>
              </div>
              <span className="badge badge-modo">{c.modo_facturacion}</span>
            </div>
          ))}
        </div>
      )}

      <ClienteModal open={modalAbierto} cliente={clienteEditando} onClose={() => setModalAbierto(false)} onSaved={onClientesChange} />
    </section>
  );
}
