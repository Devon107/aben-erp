import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fechaHoraCorta, horasTexto } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';
import Modal from '../../components/Modal.jsx';

// Detalle de las sesiones (subregistros) que componen el total de horas de
// una entrada de tiempo. Cada subregistro es editable y eliminable; el total
// de la fila (entradas_tiempo.horas) se recalcula en el backend con cada
// cambio — acá solo se refresca la lista y se avisa al padre via onCambio.
export default function SubregistrosModal({ open, entrada, onClose, onCambio }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [subregistros, setSubregistros] = useState(null); // null = cargando
  const [valores, setValores] = useState({}); // id -> texto editable del input

  async function cargar() {
    if (!entrada) return;
    try {
      const data = await api(`/api/entradas-tiempo/${entrada.id}/subregistros`);
      setSubregistros(data);
      setValores(Object.fromEntries(data.map((s) => [s.id, String(s.horas)])));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    if (open) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entrada?.id]);

  async function guardar(sub) {
    const horas = Number(valores[sub.id]);
    if (!Number.isFinite(horas) || horas <= 0) {
      showToast('Ingresá un número de horas mayor a 0', true);
      return;
    }
    try {
      await api(`/api/entradas-tiempo/${entrada.id}/subregistros/${sub.id}`, {
        method: 'PUT',
        body: JSON.stringify({ horas }),
      });
      showToast('Subregistro actualizado');
      await cargar();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function eliminar(sub) {
    if (!(await confirmar('¿Eliminar este subregistro de tiempo?'))) return;
    try {
      await api(`/api/entradas-tiempo/${entrada.id}/subregistros/${sub.id}`, { method: 'DELETE' });
      showToast('Subregistro eliminado');
      await cargar();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  if (!entrada) return null;

  const total = subregistros?.reduce((suma, s) => suma + s.horas, 0) ?? 0;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <h2>Subregistros de tiempo</h2>
        <button className="btn-close" type="button" onClick={onClose}>
          &times;
        </button>
      </div>

      {subregistros === null && <p className="mini-empty">Cargando...</p>}
      {subregistros !== null && subregistros.length === 0 && <p className="mini-empty">Sin subregistros.</p>}

      {subregistros !== null && subregistros.length > 0 && (
        <>
          <ul className="mini-list">
            {subregistros.map((s) => (
              <li key={s.id}>
                <div className="item-main">
                  <span className={`badge-origen badge-origen-${s.origen}`}>{s.origen}</span>
                  <span className="item-sub">{fechaHoraCorta(s.creado_en)}</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-subregistro"
                  value={valores[s.id] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [s.id]: e.target.value }))}
                />
                <button className="btn-icon" title="Guardar" onClick={() => guardar(s)}>
                  &#10003;
                </button>
                <button className="btn-icon danger" title="Eliminar" onClick={() => eliminar(s)}>
                  &times;
                </button>
              </li>
            ))}
          </ul>
          <p className="subregistros-total">Total: {horasTexto(total)} h</p>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
