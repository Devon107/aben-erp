import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fechaCorta, isoDateLocal, money } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';

// rango === null significa sin filtro (se muestra todo el historial). Los
// gastos son del cliente (no de un proyecto puntual) — ver ClienteGastosView.
export default function GastosList({ clienteId, rango, onCambio }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [gastos, setGastos] = useState(null); // null = cargando
  const [fecha, setFecha] = useState(() => isoDateLocal(new Date()));
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  async function cargarGastos() {
    try {
      const data = await api(`/api/gastos?cliente_id=${clienteId}`);
      setGastos(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarGastos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const busquedaNormalizada = busqueda.trim().toLowerCase();
  const gastosFiltrados = gastos
    ?.filter((g) => !rango || (g.fecha >= rango.desde && g.fecha <= rango.hasta))
    .filter((g) => !busquedaNormalizada || g.descripcion.toLowerCase().includes(busquedaNormalizada));

  async function agregar(e) {
    e.preventDefault();
    try {
      await api('/api/gastos', {
        method: 'POST',
        body: JSON.stringify({ cliente_id: clienteId, fecha, descripcion, monto: Number(monto) }),
      });
      setFecha(isoDateLocal(new Date()));
      setDescripcion('');
      setMonto('');
      showToast('Gasto agregado');
      await cargarGastos();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function eliminar(gasto) {
    if (!(await confirmar('¿Eliminar este gasto?'))) return;
    try {
      await api(`/api/gastos/${gasto.id}`, { method: 'DELETE' });
      showToast('Gasto eliminado');
      await cargarGastos();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <div className="reporte-panel">
      <form className="subform" onSubmit={agregar}>
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input
          type="text"
          placeholder="Descripción"
          required
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Agregar
        </button>
      </form>

      <div className="filtros-tabla">
        <input
          type="search"
          placeholder="Buscar por descripción..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <ul className="mini-list mini-list-grande">
        {gastos === null && <li className="mini-empty">Cargando...</li>}
        {gastos !== null && gastos.length === 0 && <li className="mini-empty">Sin gastos registrados.</li>}
        {gastos !== null && gastos.length > 0 && gastosFiltrados.length === 0 && (
          <li className="mini-empty">Sin resultados para los filtros seleccionados.</li>
        )}
        {gastosFiltrados?.map((g) => (
          <li key={g.id}>
            <div className="item-main">
              <span className="item-title">{g.descripcion}</span>
              <span className="item-sub">{fechaCorta(g.fecha)}</span>
            </div>
            <span className="item-value">{money(g.monto)}</span>
            <button className="btn-icon danger" title="Eliminar" onClick={() => eliminar(g)}>
              &times;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
