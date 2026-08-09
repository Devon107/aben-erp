import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { isoDateLocal } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

// Crea o edita una tarea. El precio (tipo de cobro/tarifa) vive en el
// proyecto, no acá — una tarea solo tiene nombre/estado/fecha límite/horas
// estimadas y su propio estado de pago. No depende de ningún cronómetro — se
// puede crear en cualquier momento y trackear tiempo después.
export default function TareaModal({ open, tarea, proyectoId, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState('pendiente');
  const [fechaLimite, setFechaLimite] = useState('');
  const [horasEstimadas, setHorasEstimadas] = useState('');
  const [pagado, setPagado] = useState(false);
  const [fechaCobro, setFechaCobro] = useState('');

  useEffect(() => {
    if (open) {
      setNombre(tarea?.nombre ?? '');
      setEstado(tarea?.estado ?? 'pendiente');
      setFechaLimite(tarea?.fecha_limite ?? '');
      setHorasEstimadas(tarea?.horas_estimadas ?? '');
      setPagado(tarea?.pagado ?? false);
      setFechaCobro(tarea?.fecha_cobro ?? isoDateLocal(new Date()));
    }
  }, [open, tarea]);

  async function guardar(e) {
    e.preventDefault();
    const payload = {
      proyecto_id: proyectoId,
      nombre,
      estado,
      fecha_limite: fechaLimite || null,
      horas_estimadas: horasEstimadas !== '' ? Number(horasEstimadas) : null,
      pagado,
      fecha_cobro: pagado ? fechaCobro : null,
    };
    try {
      if (tarea) {
        await api(`/api/tareas/${tarea.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Tarea actualizada');
      } else {
        await api('/api/tareas', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Tarea creada');
      }
      onClose();
      await onSaved();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <h2>{tarea ? 'Editar tarea' : 'Nueva tarea'}</h2>
        <button className="btn-close" type="button" onClick={onClose}>
          &times;
        </button>
      </div>
      <form onSubmit={guardar}>
        <label>
          Nombre
          <input type="text" required placeholder="Nombre de la tarea" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Horas estimadas (opcional)
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={horasEstimadas}
            onChange={(e) => setHorasEstimadas(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="pendiente">Pendiente</option>
            <option value="en_curso">En curso</option>
            <option value="completada">Completada</option>
          </select>
        </label>
        <label>
          Fecha límite (opcional)
          <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
        </label>
        <label className="label-checkbox">
          <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
          Ya se cobró esta tarea
        </label>
        {pagado && (
          <label>
            Fecha de cobro
            <input type="date" required value={fechaCobro} onChange={(e) => setFechaCobro(e.target.value)} />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
