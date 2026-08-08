import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import RentabilidadResumen from './RentabilidadResumen.jsx';

export default function ProyectoCard({ proyecto, onVerDetalle, onEditar, onEliminar }) {
  const [rentabilidad, setRentabilidad] = useState(null);

  useEffect(() => {
    api(`/api/proyectos/${proyecto.id}/rentabilidad`)
      .then(setRentabilidad)
      .catch(() => {
        // el proyecto pudo haber sido eliminado mientras cargaba; se ignora
      });
  }, [proyecto.id]);

  return (
    <div className="proyecto-card">
      <div className="proyecto-card-top">
        <div>
          <h3>{proyecto.nombre}</h3>
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

      <RentabilidadResumen rentabilidad={rentabilidad} />

      <div className="proyecto-footer">
        <button className="btn btn-secondary btn-sm" onClick={() => onVerDetalle(proyecto.id)}>
          Ver detalle y gastos
        </button>
      </div>
    </div>
  );
}
