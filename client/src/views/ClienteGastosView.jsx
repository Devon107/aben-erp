import { Link } from 'react-router-dom';
import GastosList from '../features/gastos/GastosList.jsx';

// Los gastos son del cliente (no de un proyecto puntual) — vista propia,
// enlazada desde el resumen del cliente (ver ClienteDetalleView.jsx).
export default function ClienteGastosView({ cliente, onVolver, onCambio }) {
  return (
    <section>
      <div className="page-breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clientes">Clientes</Link> /{' '}
        <Link to={`/clientes/${cliente.id}`}>{cliente.nombre}</Link> / <span className="breadcrumb-current">Gastos</span>
      </div>
      <div className="view-header">
        <div className="view-header-title">
          <button className="btn-link" onClick={onVolver}>
            &larr; Volver a {cliente.nombre}
          </button>
          <div className="title-row">
            <h1>Gastos</h1>
          </div>
        </div>
      </div>

      <GastosList clienteId={cliente.id} rango={null} onCambio={onCambio} />
    </section>
  );
}
