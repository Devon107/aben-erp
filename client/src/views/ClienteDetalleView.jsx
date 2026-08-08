import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { iniciales } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import ClienteModal from '../components/ClienteModal.jsx';
import ProyectoModal from '../features/proyectos/ProyectoModal.jsx';
import ProyectoCard from '../features/proyectos/ProyectoCard.jsx';
import ProyectoDetalleView from '../features/proyectos/ProyectoDetalleView.jsx';

// Resuelve cuál proyecto abrir por el :proyectoId de la URL (los proyectos ya
// están cargados en ClienteDetalleView) y le pasa a ProyectoDetalleView todo
// lo que necesita para su propia navegación anidada (tareas/:tareaId).
function ProyectoDetalleRoute({ proyectos, cliente, onEditarProyecto }) {
  const { proyectoId } = useParams();
  const navigate = useNavigate();
  const proyecto = proyectos.find((p) => p.id === Number(proyectoId)) ?? null;

  if (!proyecto) return null; // proyectos aun cargando, o id invalido en la URL

  return (
    <ProyectoDetalleView
      proyecto={proyecto}
      cliente={cliente}
      onVolver={() => navigate(`/clientes/${cliente.id}`)}
      onEditar={onEditarProyecto}
    />
  );
}

function ProyectosGrid({
  cliente,
  proyectos,
  onVolver,
  onAbrirEditarCliente,
  onAbrirNuevoProyecto,
  onEditarProyecto,
  onEliminarProyecto,
  onVerProyecto,
}) {
  return (
    <section>
      <div className="page-breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clientes">Clientes</Link> /{' '}
        <span className="breadcrumb-current">{cliente.nombre}</span>
      </div>
      <div className="view-header">
        <div className="view-header-title">
          <button className="btn-link" onClick={onVolver}>
            &larr; Clientes
          </button>
          <div className="title-row">
            <span className="avatar-initials-lg">{iniciales(cliente.nombre)}</span>
            <h1>{cliente.nombre}</h1>
            <span className="badge badge-modo">{cliente.modo_facturacion}</span>
          </div>
        </div>
        <div className="view-header-actions">
          <button className="btn btn-secondary" onClick={onAbrirEditarCliente}>
            Editar cliente
          </button>
          <button className="btn btn-primary" onClick={onAbrirNuevoProyecto}>
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
              onVerDetalle={() => onVerProyecto(p.id)}
              onEditar={onEditarProyecto}
              onEliminar={onEliminarProyecto}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ClienteDetalleView({ cliente, onVolver, onClienteActualizado }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const confirmar = useConfirm();
  const [proyectos, setProyectos] = useState([]);
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
    if (!(await confirmar('¿Eliminar este proyecto? Se eliminarán también sus tareas y gastos asociados.'))) return;
    try {
      await api(`/api/proyectos/${proyecto.id}`, { method: 'DELETE' });
      showToast('Proyecto eliminado');
      await cargarProyectos();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <>
      <Routes>
        <Route
          index
          element={
            <ProyectosGrid
              cliente={cliente}
              proyectos={proyectos}
              onVolver={onVolver}
              onAbrirEditarCliente={() => setModalClienteAbierto(true)}
              onAbrirNuevoProyecto={abrirNuevoProyecto}
              onEditarProyecto={abrirEditarProyecto}
              onEliminarProyecto={eliminarProyecto}
              onVerProyecto={(id) => navigate(`proyectos/${id}`)}
            />
          }
        />
        <Route
          path="proyectos/:proyectoId/*"
          element={
            <ProyectoDetalleRoute proyectos={proyectos} cliente={cliente} onEditarProyecto={abrirEditarProyecto} />
          }
        />
      </Routes>

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
    </>
  );
}
