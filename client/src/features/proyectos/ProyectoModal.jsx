import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

export default function ProyectoModal({ open, proyecto, clienteId, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState('activo');
  const [tipoCobro, setTipoCobro] = useState('hora');
  const [tarifaHora, setTarifaHora] = useState('');
  const [precioFijo, setPrecioFijo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaEntregaEstimada, setFechaEntregaEstimada] = useState('');

  useEffect(() => {
    if (open) {
      setNombre(proyecto?.nombre ?? '');
      setEstado(proyecto?.estado ?? 'activo');
      setTipoCobro(proyecto?.tipo_cobro ?? 'hora');
      setTarifaHora(proyecto?.tarifa_hora ?? '');
      setPrecioFijo(proyecto?.precio_fijo ?? '');
      setFechaInicio(proyecto?.fecha_inicio ?? '');
      setFechaEntregaEstimada(proyecto?.fecha_entrega_estimada ?? '');
    }
  }, [open, proyecto]);

  async function guardar(e) {
    e.preventDefault();
    const payload = {
      cliente_id: clienteId,
      nombre,
      estado,
      tipo_cobro: tipoCobro,
      tarifa_hora: tarifaHora !== '' ? Number(tarifaHora) : null,
      precio_fijo: precioFijo !== '' ? Number(precioFijo) : null,
      fecha_inicio: fechaInicio || null,
      fecha_entrega_estimada: fechaEntregaEstimada || null,
    };
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
          Fecha de inicio
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </label>
        <label>
          Entrega estimada
          <input type="date" value={fechaEntregaEstimada} onChange={(e) => setFechaEntregaEstimada(e.target.value)} />
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
