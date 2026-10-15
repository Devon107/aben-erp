import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fechaCorta, horasTexto, money } from '../../lib/format.js';
import TimerWidget from '../tiempo/TimerWidget.jsx';
import { useTimer } from '../tiempo/TimerContext.jsx';
import TareasTable from '../tareas/TareasTable.jsx';
import TareaDetalleView from '../tareas/TareaDetalleView.jsx';
import TareaModal from '../tareas/TareaModal.jsx';
import ActividadLista from '../../components/ActividadLista.jsx';
import { ProyectoDetalleProvider, useProyectoDetalle } from './ProyectoDetalleContext.jsx';

function RegistroDeTiempos({ subregistros }) {
  if (subregistros === null) return <p className="mini-empty">Cargando...</p>;
  if (subregistros.length === 0) return <p className="mini-empty">Sin tiempo registrado todavía.</p>;
  return (
    <ul className="mini-list mini-list-grande">
      {subregistros.map((s) => (
        <li key={s.id}>
          <div className="item-main">
            <span className="item-title">{s.tarea_nombre}</span>
            <span className="item-sub">
              {fechaCorta(s.fecha)} · {horasTexto(s.horas)} h
            </span>
          </div>
          <span className="item-value">{s.costo != null ? money(s.costo) : '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function TareaDetalleRoute({ proyecto, cliente }) {
  const { tareaId } = useParams();
  const navigate = useNavigate();
  return (
    <TareaDetalleView
      tareaId={Number(tareaId)}
      proyecto={proyecto}
      cliente={cliente}
      onVolver={() => navigate(`/clientes/${cliente.id}/proyectos/${proyecto.id}`)}
    />
  );
}

export default function ProyectoDetalleView(props) {
  return (
    <ProyectoDetalleProvider>
      <ProyectoDetalleViewInner {...props} />
    </ProyectoDetalleProvider>
  );
}

function ProyectoDetalleViewInner({ proyecto, cliente, onVolver, onEditar }) {
  const navigate = useNavigate();
  const { senalRecarga, marcarCambio } = useProyectoDetalle();
  const { activeTimer, iniciarTimer } = useTimer();
  const [resumen, setResumen] = useState(null);
  const [subregistrosRecientes, setSubregistrosRecientes] = useState(null);
  const [actividad, setActividad] = useState(null);
  const [modalTareaAbierto, setModalTareaAbierto] = useState(false);

  const cargarResumen = useCallback(() => {
    api(`/api/proyectos/${proyecto.id}/resumen`)
      .then(setResumen)
      .catch(() => {
        // el proyecto pudo haber sido eliminado mientras cargaba; se ignora
      });
  }, [proyecto.id]);

  // senalRecarga la bump cualquier cambio de tiempo del proyecto (cronómetro
  // de cabecera, cronómetro por fila, o alta/edición/borrado de un log de
  // tiempo) — ver ProyectoDetalleContext.jsx. Los paneles de "Registro de
  // tiempos" y "Línea de tiempo" dependen de los mismos eventos.
  useEffect(() => {
    cargarResumen();
    api(`/api/proyectos/${proyecto.id}/subregistros-recientes`)
      .then(setSubregistrosRecientes)
      .catch(() => {});
    api(`/api/proyectos/${proyecto.id}/actividades`)
      .then(setActividad)
      .catch(() => {});
  }, [cargarResumen, proyecto.id, senalRecarga]);

  // Las barras de progreso/presupuesto solo tienen sentido en proyectos de
  // precio fijo: por hora no hay un total fijo contra el cual medir avance.
  const mostrarBarras = proyecto.tipo_cobro === 'fijo' && resumen;
  const progresoPct =
    mostrarBarras && resumen.tareas_totales > 0 ? Math.round((resumen.tareas_completadas / resumen.tareas_totales) * 100) : null;
  const progresoHorasPct = mostrarBarras ? resumen.progreso_horas_pct : null;

  const fechasHeader = [
    proyecto.fecha_inicio && `Inicio ${fechaCorta(proyecto.fecha_inicio)}`,
    proyecto.fecha_entrega_estimada && `Entrega estimada ${fechaCorta(proyecto.fecha_entrega_estimada)}`,
  ].filter(Boolean);

  const timerActivoAca = activeTimer?.proyectoId === proyecto.id;

  return (
    <Routes>
      <Route
        index
        element={
          <section>
            <div className="page-breadcrumb">
              <Link to="/">Dashboard</Link> / <Link to="/clientes">Clientes</Link> /{' '}
              <Link to={`/clientes/${cliente.id}`}>{cliente.nombre}</Link> /{' '}
              <span className="breadcrumb-current">{proyecto.nombre}</span>
            </div>
            <div className="view-header">
              <div className="view-header-title">
                <button className="btn-link" onClick={onVolver}>
                  &larr; Volver a proyectos
                </button>
                <div className="title-row">
                  <h1>{proyecto.nombre}</h1>
                  <span className={`badge badge-${proyecto.estado}`}>{proyecto.estado}</span>
                </div>
                <div className="proyecto-meta">
                  Cliente: <Link to={`/clientes/${cliente.id}`}>{cliente.nombre}</Link>
                  {fechasHeader.length > 0 && ` · ${fechasHeader.join(' · ')}`}
                </div>
              </div>
              <div className="view-header-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={Boolean(activeTimer) && !timerActivoAca}
                  onClick={() => iniciarTimer(proyecto.id)}
                >
                  Registrar tiempo
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setModalTareaAbierto(true)}>
                  + Nueva tarea
                </button>
                <button className="btn btn-secondary" onClick={() => onEditar(proyecto)}>
                  Editar proyecto
                </button>
              </div>
            </div>

            {resumen && (
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">Horas registradas</div>
                  <div className="kpi-value">{horasTexto(resumen.total_horas)} h</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Ingreso</div>
                  <div className="kpi-value">{money(resumen.ingreso_total)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Por cobrar</div>
                  <div className="kpi-value">{money(resumen.ingreso_pendiente)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Tareas abiertas</div>
                  <div className="kpi-value">{resumen.tareas_abiertas}</div>
                  <div className="kpi-note">de {resumen.tareas_totales} totales</div>
                </div>
              </div>
            )}

            <TimerWidget proyecto={proyecto} cliente={cliente} />

            {mostrarBarras && (
              <div className="dashboard-bottom-row">
                {progresoPct !== null && (
                  <div className="budget-progress">
                    <div className="budget-progress-row">
                      <div>Progreso general</div>
                      <strong>{progresoPct}%</strong>
                    </div>
                    <div className="budget-track">
                      <div className="budget-fill" style={{ width: `${progresoPct}%` }} />
                    </div>
                    <div className="budget-note">
                      {resumen.tareas_completadas} de {resumen.tareas_totales} tareas completadas
                    </div>
                  </div>
                )}
                <div className="budget-progress">
                  <div className="budget-progress-row">
                    <div>Presupuesto del proyecto</div>
                    <strong>{money(resumen.precio_fijo)}</strong>
                  </div>
                  <div className="budget-track">
                    <div className="budget-fill" style={{ width: `${progresoHorasPct ?? 0}%` }} />
                  </div>
                  <div className="budget-note">
                    {progresoHorasPct !== null
                      ? `${horasTexto(resumen.horas_trabajadas_estimables)} de ${horasTexto(resumen.horas_estimadas_total)} horas estimadas trabajadas`
                      : 'Sin horas estimadas todavía en las tareas de este proyecto'}
                  </div>
                </div>
              </div>
            )}

            <div className="detalle-grid-2col">
              <div>
                <div className="card-panel-title seccion-titulo">Tareas</div>
                <TareasTable proyectoId={proyecto.id} onVerTarea={(id) => navigate(`tareas/${id}`)} />
              </div>

              <div>
                <div className="card-panel">
                  <div className="card-panel-header">
                    <div className="card-panel-title">Registro de tiempos</div>
                  </div>
                  <RegistroDeTiempos subregistros={subregistrosRecientes} />
                </div>
                <div className="card-panel">
                  <div className="card-panel-header">
                    <div className="card-panel-title">Línea de tiempo</div>
                  </div>
                  <ActividadLista actividad={actividad} />
                </div>
              </div>
            </div>

            <TareaModal
              open={modalTareaAbierto}
              tarea={null}
              proyectoId={proyecto.id}
              onClose={() => setModalTareaAbierto(false)}
              onSaved={marcarCambio}
            />
          </section>
        }
      />
      <Route path="tareas/:tareaId" element={<TareaDetalleRoute proyecto={proyecto} cliente={cliente} />} />
    </Routes>
  );
}
