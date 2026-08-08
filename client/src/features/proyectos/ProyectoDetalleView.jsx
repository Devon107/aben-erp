import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useRangoFecha } from '../../lib/useRangoFecha.js';
import { useToast } from '../../components/Toast.jsx';
import RangoSelector from '../../components/RangoSelector.jsx';
import RentabilidadResumen from './RentabilidadResumen.jsx';
import TimerWidget from '../tiempo/TimerWidget.jsx';
import EntradasTiempoTable from '../tiempo/EntradasTiempoTable.jsx';
import GastosList from '../gastos/GastosList.jsx';
import { ProyectoDetalleProvider, useProyectoDetalle } from './ProyectoDetalleContext.jsx';

export default function ProyectoDetalleView(props) {
  return (
    <ProyectoDetalleProvider>
      <ProyectoDetalleViewInner {...props} />
    </ProyectoDetalleProvider>
  );
}

function ProyectoDetalleViewInner({ proyecto, cliente, onVolver, onEditar, onActualizado }) {
  const showToast = useToast();
  const { senalRecarga } = useProyectoDetalle();
  const [rentabilidad, setRentabilidad] = useState(null);
  const [tab, setTab] = useState('tiempos'); // 'tiempos' | 'gastos'
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
  // de cabecera, cronómetro por fila, o edición/borrado de un subregistro) —
  // ver ProyectoDetalleContext.jsx.
  useEffect(() => {
    cargarRentabilidad();
  }, [cargarRentabilidad, senalRecarga]);

  const tarifaTexto =
    proyecto.tipo_cobro === 'hora' ? `${money(proyecto.tarifa_hora)} / hora` : `${money(proyecto.precio_fijo)} fijo`;

  async function alternarPagado() {
    try {
      await api(`/api/proyectos/${proyecto.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pagado: !proyecto.pagado }),
      });
      showToast(proyecto.pagado ? 'Marcado como pendiente' : 'Marcado como pagado');
      await Promise.all([onActualizado(), cargarRentabilidad()]);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  const presupuesto = proyecto.tipo_cobro === 'fijo' ? proyecto.precio_fijo : null;
  const gastado = rentabilidad ? rentabilidad.total_gastos : null;
  const presupuestoPct =
    presupuesto && gastado !== null && presupuesto > 0 ? Math.round((gastado / presupuesto) * 100) : null;

  return (
    <section>
      <div className="page-breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clientes">Clientes</Link> /{' '}
        {cliente ? <Link to={`/clientes/${cliente.id}`}>{cliente.nombre}</Link> : null} /{' '}
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
            {proyecto.tipo_cobro === 'fijo' && (
              <button
                type="button"
                className={`badge-pago ${proyecto.pagado ? 'badge-pago-pagado' : 'badge-pago-pendiente'}`}
                title="Cambiar estado de pago"
                onClick={alternarPagado}
              >
                {proyecto.pagado ? 'Pagado' : 'Pendiente'}
              </button>
            )}
          </div>
          <div className="proyecto-meta">{tarifaTexto}</div>
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
            <div>Costo vs. presupuesto</div>
            <strong>
              {money(gastado)} / {money(presupuesto)}
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
          <button className={`tab ${tab === 'tiempos' ? 'active' : ''}`} onClick={() => setTab('tiempos')}>
            Tiempos
          </button>
          <button className={`tab ${tab === 'gastos' ? 'active' : ''}`} onClick={() => setTab('gastos')}>
            Gastos
          </button>
        </div>
        <RangoSelector
          presets={presets}
          preset={preset}
          setPreset={setPreset}
          desdeInput={desdeInput}
          setDesdeInput={setDesdeInput}
          hastaInput={hastaInput}
          setHastaInput={setHastaInput}
        />
      </div>

      {tab === 'tiempos' ? (
        <EntradasTiempoTable proyectoId={proyecto.id} rango={rango} />
      ) : (
        <GastosList proyectoId={proyecto.id} rango={rango} onCambio={cargarRentabilidad} />
      )}
    </section>
  );
}
