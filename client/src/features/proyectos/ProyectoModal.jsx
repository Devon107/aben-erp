import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

export default function ProyectoModal({ open, proyecto, clienteId, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState('activo');

  useEffect(() => {
    if (open) {
      setNombre(proyecto?.nombre ?? '');
      setEstado(proyecto?.estado ?? 'activo');
    }
  }, [open, proyecto]);

  async function guardar(e) {
    e.preventDefault();
    const payload = { cliente_id: clienteId, nombre, estado };
    try {
      if (proyecto) {
        await api(`/api/proyectos/${proyecto.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Proyecto actualizado');
      } else {
        await api('/api/proyectos', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Proyecto creado');
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
        <h2>{proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
        <button className="btn-close" type="button" onClick={onClose}>
          &times;
        </button>
      </div>
      <form onSubmit={guardar}>
        <label>
          Nombre
          <input
            type="text"
            required
            placeholder="Nombre del proyecto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
          </select>
        </label>
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
