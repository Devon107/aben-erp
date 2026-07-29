import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import EntradasTiempoTable from './EntradasTiempoTable.jsx';
import GastosList from './GastosList.jsx';

export default function ProyectoCard({ proyecto, expandido, onToggleDetalle, onEditar, onEliminar }) {
  const [rentabilidad, setRentabilidad] = useState(null);

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

  const tarifaTexto =
    proyecto.tipo_cobro === 'hora' ? `${money(proyecto.tarifa_hora)} / hora` : `${money(proyecto.precio_fijo)} fijo`;
  const margenClase = rentabilidad && rentabilidad.margen >= 0 ? 'positivo' : 'negativo';

  return (
    <div className={`proyecto-card ${expandido ? 'abierto' : ''}`}>
      <div className="proyecto-card-top">
        <div>
          <h3>{proyecto.nombre}</h3>
          <div className="proyecto-meta">{tarifaTexto}</div>
        </div>
        <div className="proyecto-card-actions">
          <span className={`badge badge-${proyecto.estado}`}>{proyecto.estado}</span>
          <button className="btn-icon" title="Editar" onClick={() => onEditar(proyecto)}>
            &#9998;
          </button>
          <button className="btn-icon danger" title="Eliminar" onClick={() => onEliminar(proyecto)}>
            &times;
          </button>
        </div>
      </div>

      <div className="rent-mini">
        <div className="rent-mini-item">
          <span className="label">Horas</span>
          <span className="value">{rentabilidad ? `${rentabilidad.total_horas} h` : <>&hellip;</>}</span>
        </div>
        <div className="rent-mini-item">
          <span className="label">Ingreso</span>
          <span className="value">{rentabilidad ? money(rentabilidad.ingreso_total) : <>&hellip;</>}</span>
        </div>
        <div className="rent-mini-item">
          <span className="label">Gastos</span>
          <span className="value">{rentabilidad ? money(rentabilidad.total_gastos) : <>&hellip;</>}</span>
        </div>
        <div className="rent-mini-item margen">
          <span className="label">Margen</span>
          <span className={`value ${rentabilidad ? margenClase : ''}`}>
            {rentabilidad ? money(rentabilidad.margen) : <>&hellip;</>}
          </span>
        </div>
      </div>

      <div className="proyecto-footer">
        <button className="btn btn-secondary btn-sm" onClick={() => onToggleDetalle(proyecto.id)}>
          {expandido ? 'Ocultar detalle' : 'Ver detalle y gastos'}
        </button>
      </div>

      {expandido && (
        <div className="proyecto-detalle">
          <EntradasTiempoTable proyectoId={proyecto.id} onCambio={cargarRentabilidad} />
          <GastosList proyectoId={proyecto.id} onCambio={cargarRentabilidad} />
        </div>
      )}
    </div>
  );
}
