import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import ClienteModal from '../components/ClienteModal.jsx';
import ProyectoModal from '../features/proyectos/ProyectoModal.jsx';
import ProyectoCard from '../features/proyectos/ProyectoCard.jsx';

export default function ClienteDetalleView({ cliente, onVolver, onClienteActualizado }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [proyectos, setProyectos] = useState([]);
  const [detalleAbierto, setDetalleAbierto] = useState(null); // id del proyecto expandido, o null
  const [modalClienteAbierto, setModalClienteAbierto] = useState(false);
  const [modalProyectoAbierto, setModalProyectoAbierto] = useState(false);
  const [proyectoEditando, setProyectoEditando] = useState(null);

  async function cargarProyectos() {
    try {
      const data = await api(`/api/proyectos?cliente_id=${cliente.id}`);
      setProyectos(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    setDetalleAbierto(null);
    cargarProyectos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  function abrirNuevoProyecto() {
    setProyectoEditando(null);
    setModalProyectoAbierto(true);
  }

  function abrirEditarProyecto(proyecto) {
    setProyectoEditando(proyecto);
    setModalProyectoAbierto(true);
  }

  async function eliminarProyecto(proyecto) {
    if (!(await confirmar('¿Eliminar este proyecto? Se eliminarán también sus horas y gastos asociados.'))) return;
    try {
      await api(`/api/proyectos/${proyecto.id}`, { method: 'DELETE' });
      showToast('Proyecto eliminado');
      setDetalleAbierto((actual) => (actual === proyecto.id ? null : actual));
      await cargarProyectos();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function toggleDetalle(id) {
    setDetalleAbierto((actual) => (actual === id ? null : id));
  }

  return (
    <section>
      <div className="view-header">
        <div className="view-header-title">
          <button className="btn-link" onClick={onVolver}>
            &larr; Clientes
          </button>
          <div className="title-row">
            <h1>{cliente.nombre}</h1>
            <span className="badge badge-modo">{cliente.modo_facturacion}</span>
          </div>
        </div>
        <div className="view-header-actions">
          <button className="btn btn-secondary" onClick={() => setModalClienteAbierto(true)}>
            Editar cliente
          </button>
          <button className="btn btn-primary" onClick={abrirNuevoProyecto}>
            + Nuevo proyecto
          </button>
        </div>
      </div>

      {proyectos.length === 0 ? (
        <p className="empty-state">Este cliente aún no tiene proyectos.</p>
      ) : (
        <div className="grid-proyectos">
          {proyectos.map((p) => (
            <ProyectoCard
              key={p.id}
              proyecto={p}
              expandido={detalleAbierto === p.id}
              onToggleDetalle={toggleDetalle}
              onEditar={abrirEditarProyecto}
              onEliminar={eliminarProyecto}
            />
          ))}
        </div>
      )}

      <ClienteModal
        open={modalClienteAbierto}
        cliente={cliente}
        onClose={() => setModalClienteAbierto(false)}
        onSaved={onClienteActualizado}
      />
      <ProyectoModal
        open={modalProyectoAbierto}
        proyecto={proyectoEditando}
        clienteId={cliente.id}
        onClose={() => setModalProyectoAbierto(false)}
        onSaved={cargarProyectos}
      />
    </section>
  );
}
