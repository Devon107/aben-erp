import { Link, useLocation } from 'react-router-dom';

export default function AppBar({ clienteNombre }) {
  const location = useLocation();
  const enDashboard = location.pathname === '/';
  const enClienteDetalle = location.pathname.startsWith('/clientes/');

  return (
    <header className="appbar">
      <div className="brand">Freelance Tracker</div>
      <nav className="breadcrumb">
        <Link className={`crumb ${enDashboard ? 'active' : ''}`} to="/">
          Dashboard
        </Link>
        <span className="crumb-sep">
          <span>/</span>
        </span>
        <Link className={`crumb ${!enDashboard ? 'active' : ''}`} to="/clientes">
          Clientes
        </Link>
        {enClienteDetalle && clienteNombre && (
          <span className="crumb-sep">
            <span>/</span>
            <span>{clienteNombre}</span>
          </span>
        )}
      </nav>
    </header>
  );
}
