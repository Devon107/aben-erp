import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fechaCorta, isoDateLocal, money } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';

export default function GastosList({ proyectoId, onCambio }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [gastos, setGastos] = useState(null); // null = cargando
  const [fecha, setFecha] = useState(() => isoDateLocal(new Date()));
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');

  async function cargarGastos() {
    try {
      const data = await api(`/api/gastos?proyecto_id=${proyectoId}`);
      setGastos(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarGastos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  async function agregar(e) {
    e.preventDefault();
    try {
      await api('/api/gastos', {
        method: 'POST',
        body: JSON.stringify({ proyecto_id: proyectoId, fecha, descripcion, monto: Number(monto) }),
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
    <div className="detalle-col">
      <h4>Gastos</h4>
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
      <ul className="mini-list">
        {gastos === null && <li className="mini-empty">Cargando...</li>}
        {gastos !== null && gastos.length === 0 && <li className="mini-empty">Sin gastos registrados.</li>}
        {gastos?.map((g) => (
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
