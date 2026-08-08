import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useRangoFecha } from '../../lib/useRangoFecha.js';
import RangoSelector from '../../components/RangoSelector.jsx';
import RentabilidadResumen from './RentabilidadResumen.jsx';
import TimerWidget from '../tiempo/TimerWidget.jsx';
import TareasTable from '../tareas/TareasTable.jsx';
import TareaDetalleView from '../tareas/TareaDetalleView.jsx';
import GastosList from '../gastos/GastosList.jsx';
import { ProyectoDetalleProvider, useProyectoDetalle } from './ProyectoDetalleContext.jsx';

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
  const { senalRecarga } = useProyectoDetalle();
  const [rentabilidad, setRentabilidad] = useState(null);
  const [tab, setTab] = useState('tareas'); // 'tareas' | 'gastos'
  const { preset, setPreset, desdeInput, setDesdeInput, hastaInput, setHastaInput, presets, rango } = useRangoFecha({
    incluirTodo: true,
  });

  const cargarRentabilidad = useCallback(() => {
    api(`/api/proyectos/${proyecto.id}/rentabilidad`)
      .then(setRentabilidad)
      .catch(() => {
        // el proyecto pudo haber sido eliminado mientras cargaba; se ignora
      });
  }, [proyecto.id]);

  // senalRecarga la bump cualquier cambio de tiempo del proyecto (cronómetro
  // de cabecera, cronómetro por fila, o alta/edición/borrado de un log de
  // tiempo) — ver ProyectoDetalleContext.jsx.
  useEffect(() => {
    cargarRentabilidad();
  }, [cargarRentabilidad, senalRecarga]);

  const presupuestoPct =
    rentabilidad && rentabilidad.presupuesto_total > 0
      ? Math.round((rentabilidad.total_gastos / rentabilidad.presupuesto_total) * 100)
      : null;

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
              </div>
              <div className="view-header-actions">
                <button className="btn btn-secondary" onClick={() => onEditar(proyecto)}>
                  Editar proyecto
                </button>
              </div>
            </div>

            <TimerWidget proyectoId={proyecto.id} />

            <RentabilidadResumen rentabilidad={rentabilidad} />

            {presupuestoPct !== null && (
              <div className="budget-progress">
                <div className="budget-progress-row">
                  <div>Costo vs. presupuesto (tareas de precio fijo)</div>
                  <strong>
                    {money(rentabilidad.total_gastos)} / {money(rentabilidad.presupuesto_total)}
                  </strong>
                </div>
                <div className="budget-track">
                  <div
                    className={`budget-fill ${presupuestoPct > 100 ? 'over' : ''}`}
                    style={{ width: `${Math.min(presupuestoPct, 100)}%` }}
                  />
                </div>
                <div className="budget-note">{presupuestoPct}% del presupuesto usado</div>
              </div>
            )}

            <div className="reporte-controles">
              <div className="tabs">
                <button className={`tab ${tab === 'tareas' ? 'active' : ''}`} onClick={() => setTab('tareas')}>
                  Tareas
                </button>
                <button className={`tab ${tab === 'gastos' ? 'active' : ''}`} onClick={() => setTab('gastos')}>
                  Gastos
                </button>
              </div>
              {tab === 'gastos' && (
                <RangoSelector
                  presets={presets}
                  preset={preset}
                  setPreset={setPreset}
                  desdeInput={desdeInput}
                  setDesdeInput={setDesdeInput}
                  hastaInput={hastaInput}
                  setHastaInput={setHastaInput}
                />
              )}
            </div>

            {tab === 'tareas' ? (
              <TareasTable proyectoId={proyecto.id} onVerTarea={(id) => navigate(`tareas/${id}`)} />
            ) : (
              <GastosList proyectoId={proyecto.id} rango={rango} onCambio={cargarRentabilidad} />
            )}
          </section>
        }
      />
      <Route path="tareas/:tareaId" element={<TareaDetalleRoute proyecto={proyecto} cliente={cliente} />} />
    </Routes>
  );
}
