import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import RentabilidadResumen from './RentabilidadResumen.jsx';

export default function ProyectoCard({ proyecto, onVerDetalle, onEditar, onEliminar, onActualizado }) {
  const showToast = useToast();
  const [rentabilidad, setRentabilidad] = useState(null);

  function cargarRentabilidad() {
    return api(`/api/proyectos/${proyecto.id}/rentabilidad`)
      .then(setRentabilidad)
      .catch(() => {
        // el proyecto pudo haber sido eliminado mientras cargaba; se ignora
      });
  }

  useEffect(() => {
    cargarRentabilidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

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
    <div className="proyecto-card">
      <div className="proyecto-card-top">
        <div>
          <h3>{proyecto.nombre}</h3>
          <div className="proyecto-meta">{tarifaTexto}</div>
        </div>
        <div className="proyecto-card-actions">
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
