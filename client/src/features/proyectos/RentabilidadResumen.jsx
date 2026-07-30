import { horasTexto, money } from '../../lib/format.js';

export default function RentabilidadResumen({ rentabilidad }) {
  const margenClase = rentabilidad && rentabilidad.margen >= 0 ? 'positivo' : 'negativo';

  return (
    <div className="rent-mini">
      <div className="rent-mini-item">
        <span className="label">Horas</span>
        <span className="value">{rentabilidad ? `${horasTexto(rentabilidad.total_horas)} h` : <>&hellip;</>}</span>
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
  );
}
