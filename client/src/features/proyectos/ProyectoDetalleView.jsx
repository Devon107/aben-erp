import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useRangoFecha } from '../../lib/useRangoFecha.js';
import { useToast } from '../../components/Toast.jsx';
import RangoSelector from '../../components/RangoSelector.jsx';
import RentabilidadResumen from './RentabilidadResumen.jsx';
import TimerWidget from './TimerWidget.jsx';
import EntradasTiempoTable from './EntradasTiempoTable.jsx';
import GastosList from './GastosList.jsx';

export default function ProyectoDetalleView({ proyecto, onVolver, onEditar, onActualizado }) {
  const showToast = useToast();
  const [rentabilidad, setRentabilidad] = useState(null);
  const [tab, setTab] = useState('tiempos'); // 'tiempos' | 'gastos'
  const [tiempoRefrescarSenal, setTiempoRefrescarSenal] = useState(0);
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

  useEffect(() => {
    cargarRentabilidad();
  }, [cargarRentabilidad]);

  // El cronómetro vive en el header (visible sin importar la pestaña activa),
  // así que su registro tiene que refrescar tanto la rentabilidad como la
  // tabla de tiempos si está montada.
  async function onTimerRegistrado() {
    setTiempoRefrescarSenal((n) => n + 1);
    cargarRentabilidad();
  }

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

  return (
    <section>
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

      <TimerWidget proyectoId={proyecto.id} onRegistrado={onTimerRegistrado} />

      <RentabilidadResumen rentabilidad={rentabilidad} />

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
        <EntradasTiempoTable
          proyectoId={proyecto.id}
          rango={rango}
          refrescarSenal={tiempoRefrescarSenal}
          onCambio={cargarRentabilidad}
        />
      ) : (
        <GastosList proyectoId={proyecto.id} rango={rango} onCambio={cargarRentabilidad} />
      )}
    </section>
  );
}
