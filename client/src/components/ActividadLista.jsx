import { fechaCorta } from '../lib/format.js';

function colorPorTipo(tipo) {
  if (tipo === 'pagado') return 'green';
  if (tipo === 'estado_cambiado') return 'accent';
  return 'gray';
}

// Historial de actividad (tiempo registrado / cambio de estado / marcada
// pagada — ver registrarActividad en db/queries.js), reusado tanto en el
// panel del cliente como en la "línea de tiempo" del proyecto.
export default function ActividadLista({ actividad }) {
  if (actividad === null) return <p className="mini-empty">Cargando...</p>;
  if (actividad.length === 0) return <p className="mini-empty">Sin actividad todavía.</p>;
  return (
    <ul className="mini-list mini-list-actividad">
      {actividad.map((a) => (
        <li key={a.id} className="actividad-item">
          <span className={`actividad-dot actividad-dot-${colorPorTipo(a.tipo)}`} />
          <div className="item-main">
            <span className="item-title">{a.descripcion}</span>
            <span className="item-sub">{fechaCorta(a.fecha)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
