import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fechaCorta, horasTexto, iniciales, money } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import ClienteModal from '../components/ClienteModal.jsx';
import ActividadLista from '../components/ActividadLista.jsx';
import ProyectoModal from '../features/proyectos/ProyectoModal.jsx';
import ProyectoDetalleView from '../features/proyectos/ProyectoDetalleView.jsx';
import ClienteGastosView from './ClienteGastosView.jsx';

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

const ESTADO_LABEL = { activo: 'Activo', pausado: 'Pausado', completado: 'Completado' };

function ProyectoFila({ proyecto, onVerDetalle, onEditar, onEliminar }) {
  return (
    <tr>
      <td className="col-descripcion">
        <button type="button" className="tabla-link" onClick={onVerDetalle}>
          {proyecto.nombre}
        </button>
      </td>
      <td>{horasTexto(proyecto.horas)} h</td>
      <td>{proyecto.presupuesto_total > 0 ? money(proyecto.presupuesto_total) : '—'}</td>
      <td>
        <div className="progreso-mini">
          <div className="budget-track">
            <div className="budget-fill" style={{ width: `${proyecto.progreso_pct}%` }} />
          </div>
          <span>{proyecto.progreso_pct}%</span>
        </div>
      </td>
      <td>
        <span className={`badge badge-${proyecto.estado}`}>{ESTADO_LABEL[proyecto.estado]}</span>
      </td>
      <td>
        <div className="row-actions-table">
          <button className="btn-icon" title="Editar" onClick={onEditar}>
            &#9998;
          </button>
          <button className="btn-icon danger" title="Eliminar" onClick={onEliminar}>
            &times;
          </button>
        </div>
      </td>
    </tr>
  );
}

// Resumen del cliente: KPIs históricos, lista de proyectos (con progreso),
// historial de actividad y datos de la empresa — solo se pide una vez al
// entrar a esta vista (index de las rutas de ClienteDetalleView), separado
// de la lista liviana `proyectos` del padre (que solo alimenta el
// enrutamiento y el modal de edición).
function ClienteResumen({
  cliente,
  version,
  onVolver,
  onAbrirEditarCliente,
  onAbrirNuevoProyecto,
  onEditarProyecto,
  onEliminarProyecto,
  onVerProyecto,
  onVerGastos,
}) {
  const showToast = useToast();
  const [resumen, setResumen] = useState(null); // { kpis, proyectos, actividad }

  useEffect(() => {
    api(`/api/clientes/${cliente.id}/resumen`)
      .then(setResumen)
      .catch((err) => showToast(err.message, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id, version]);

  const kpis = resumen?.kpis;
  const datosEmpresa = [
    { label: 'Contacto principal', value: cliente.contacto_principal },
    { label: 'Sitio web', value: cliente.sitio_web },
    { label: 'Dirección', value: cliente.direccion },
    { label: 'Cliente desde', value: cliente.cliente_desde ? fechaCorta(cliente.cliente_desde) : null },
  ].filter((f) => f.value);

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
          {(cliente.email || cliente.telefono || cliente.industria) && (
            <div className="cliente-contacto-linea">
              {[cliente.email, cliente.telefono, cliente.industria].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div className="view-header-actions">
          <button className="btn btn-secondary" onClick={onVerGastos}>
            Gastos
          </button>
          <button className="btn btn-secondary" onClick={onAbrirEditarCliente}>
            Editar cliente
          </button>
          <button className="btn btn-primary" onClick={onAbrirNuevoProyecto}>
            + Nuevo proyecto
          </button>
        </div>
      </div>

      {kpis && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Ingresos generados</div>
            <div className="kpi-value">{money(kpis.ingreso_total)}</div>
            <div className="kpi-note">{money(kpis.ingreso_pendiente)} por cobrar</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Horas invertidas</div>
            <div className="kpi-value">{horasTexto(kpis.total_horas)} h</div>
            <div className="kpi-note">A través de {kpis.proyectos_totales} proyecto(s)</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Proyectos activos</div>
            <div className="kpi-value">{kpis.proyectos_activos}</div>
            <div className="kpi-note">de {kpis.proyectos_totales} totales</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Margen neto</div>
            <div className={`kpi-value ${kpis.margen >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>{money(kpis.margen)}</div>
            <div className="kpi-note">{money(kpis.total_gastos)} en gastos</div>
          </div>
        </div>
      )}

      <div className="detalle-grid-2col">
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-panel-title">Proyectos</div>
          </div>
          {resumen && resumen.proyectos.length === 0 ? (
            <p className="empty-state">Este cliente aún no tiene proyectos.</p>
          ) : (
            <div className="tabla-wrap">
              <table className="tabla-entradas">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Horas</th>
                    <th>Presupuesto</th>
                    <th>Progreso</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {resumen === null && (
                    <tr>
                      <td colSpan="6" className="mini-empty">
                        Cargando...
                      </td>
                    </tr>
                  )}
                  {resumen?.proyectos.map((p) => (
                    <ProyectoFila
                      key={p.id}
                      proyecto={p}
                      onVerDetalle={() => onVerProyecto(p.id)}
                      onEditar={() => onEditarProyecto(p)}
                      onEliminar={() => onEliminarProyecto(p)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="card-panel">
            <div className="card-panel-header">
              <div className="card-panel-title">Historial de actividad</div>
            </div>
            <ActividadLista actividad={resumen?.actividad ?? null} />
          </div>

          {datosEmpresa.length > 0 && (
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="card-panel-title">Datos de la empresa</div>
              </div>
              <div className="company-info-list">
                {datosEmpresa.map((f) => (
                  <div key={f.label}>
                    <div className="company-info-label">{f.label}</div>
                    <div className="company-info-value">{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function ClienteDetalleView({ cliente, onVolver, onClienteActualizado }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const confirmar = useConfirm();
  const [proyectos, setProyectos] = useState([]);
  const [resumenVersion, setResumenVersion] = useState(0);
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

  // Tras crear/editar/eliminar un proyecto se refresca tanto la lista liviana
  // (usada para resolver la ruta de detalle) como el resumen (kpis/tabla con
  // progreso/actividad), que vive como estado propio de ClienteResumen y no
  // se refetchea solo por un cambio en `proyectos`.
  async function refrescarTodo() {
    await cargarProyectos();
    setResumenVersion((v) => v + 1);
  }

  function abrirNuevoProyecto() {
    setProyectoEditando(null);
    setModalProyectoAbierto(true);
  }

  function abrirEditarProyecto(proyecto) {
    setProyectoEditando(proyecto);
    setModalProyectoAbierto(true);
  }

  async function eliminarProyecto(proyecto) {
    if (!(await confirmar('¿Eliminar este proyecto? Se eliminarán también sus tareas.'))) return;
    try {
      await api(`/api/proyectos/${proyecto.id}`, { method: 'DELETE' });
      showToast('Proyecto eliminado');
      await refrescarTodo();
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
            <ClienteResumen
              cliente={cliente}
              version={resumenVersion}
              onVolver={onVolver}
              onAbrirEditarCliente={() => setModalClienteAbierto(true)}
              onAbrirNuevoProyecto={abrirNuevoProyecto}
              onEditarProyecto={abrirEditarProyecto}
              onEliminarProyecto={eliminarProyecto}
              onVerProyecto={(id) => navigate(`proyectos/${id}`)}
              onVerGastos={() => navigate('gastos')}
            />
          }
        />
        <Route
          path="proyectos/:proyectoId/*"
          element={
            <ProyectoDetalleRoute proyectos={proyectos} cliente={cliente} onEditarProyecto={abrirEditarProyecto} />
          }
        />
        <Route
          path="gastos"
          element={
            <ClienteGastosView
              cliente={cliente}
              onVolver={() => navigate(`/clientes/${cliente.id}`)}
              onCambio={() => setResumenVersion((v) => v + 1)}
            />
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
        onSaved={refrescarTodo}
      />
    </>
  );
}
