export default function AppBar({ vista, clienteNombre, onIrDashboard, onIrClientes }) {
  return (
    <header className="appbar">
      <div className="brand">Freelance Tracker</div>
      <nav className="breadcrumb">
        <button className={`crumb ${vista === 'dashboard' ? 'active' : ''}`} onClick={onIrDashboard}>
          Dashboard
        </button>
        <span className="crumb-sep">
          <span>/</span>
        </span>
        <button className={`crumb ${vista !== 'dashboard' ? 'active' : ''}`} onClick={onIrClientes}>
          Clientes
        </button>
        {vista === 'cliente' && (
          <span className="crumb-sep">
            <span>/</span>
            <span>{clienteNombre}</span>
          </span>
        )}
      </nav>
    </header>
  );
}
