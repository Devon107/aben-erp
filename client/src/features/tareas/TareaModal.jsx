import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { isoDateLocal } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

// Crea o edita una tarea: es la unidad de cobro dentro de un proyecto (el
// tipo de cobro/tarifa vive acá, no en el proyecto). No depende de ningún
// cronómetro — se puede crear en cualquier momento y trackear tiempo después.
export default function TareaModal({ open, tarea, proyectoId, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [tipoCobro, setTipoCobro] = useState('hora');
  const [tarifaHora, setTarifaHora] = useState('');
  const [precioFijo, setPrecioFijo] = useState('');
  const [estado, setEstado] = useState('pendiente');
  const [fechaLimite, setFechaLimite] = useState('');
  const [pagado, setPagado] = useState(false);
  const [fechaCobro, setFechaCobro] = useState('');

  useEffect(() => {
    if (open) {
      setNombre(tarea?.nombre ?? '');
      setTipoCobro(tarea?.tipo_cobro ?? 'hora');
      setTarifaHora(tarea?.tarifa_hora ?? '');
      setPrecioFijo(tarea?.precio_fijo ?? '');
      setEstado(tarea?.estado ?? 'pendiente');
      setFechaLimite(tarea?.fecha_limite ?? '');
      setPagado(tarea?.pagado ?? false);
      setFechaCobro(tarea?.fecha_cobro ?? isoDateLocal(new Date()));
    }
  }, [open, tarea]);

  async function guardar(e) {
    e.preventDefault();
    const payload = {
      proyecto_id: proyectoId,
      nombre,
      tipo_cobro: tipoCobro,
      tarifa_hora: tarifaHora !== '' ? Number(tarifaHora) : null,
      precio_fijo: precioFijo !== '' ? Number(precioFijo) : null,
      estado,
      fecha_limite: fechaLimite || null,
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
          Tipo de cobro
          <select value={tipoCobro} onChange={(e) => setTipoCobro(e.target.value)} required>
            <option value="hora">Por hora</option>
            <option value="fijo">Precio fijo</option>
          </select>
        </label>
        {tipoCobro === 'hora' && (
          <label>
            Tarifa por hora
            <input type="number" step="0.01" min="0" placeholder="0.00" value={tarifaHora} onChange={(e) => setTarifaHora(e.target.value)} />
          </label>
        )}
        {tipoCobro === 'fijo' && (
          <label>
            Precio fijo
            <input type="number" step="0.01" min="0" placeholder="0.00" value={precioFijo} onChange={(e) => setPrecioFijo(e.target.value)} />
          </label>
        )}
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
