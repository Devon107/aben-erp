import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

export default function ProyectoModal({ open, proyecto, clienteId, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [tipoCobro, setTipoCobro] = useState('hora');
  const [tarifaHora, setTarifaHora] = useState('');
  const [precioFijo, setPrecioFijo] = useState('');
  const [estado, setEstado] = useState('activo');
  const [pagado, setPagado] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre(proyecto?.nombre ?? '');
      setTipoCobro(proyecto?.tipo_cobro ?? 'hora');
      setTarifaHora(proyecto?.tarifa_hora ?? '');
      setPrecioFijo(proyecto?.precio_fijo ?? '');
      setEstado(proyecto?.estado ?? 'activo');
      setPagado(proyecto?.pagado ?? false);
    }
  }, [open, proyecto]);

  async function guardar(e) {
    e.preventDefault();
    const payload = {
      cliente_id: clienteId,
      nombre,
      tipo_cobro: tipoCobro,
      tarifa_hora: tarifaHora !== '' ? Number(tarifaHora) : null,
      precio_fijo: precioFijo !== '' ? Number(precioFijo) : null,
      estado,
      pagado: tipoCobro === 'fijo' ? pagado : false,
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
          Tipo de cobro
          <select value={tipoCobro} onChange={(e) => setTipoCobro(e.target.value)} required>
            <option value="hora">Por hora</option>
            <option value="fijo">Precio fijo</option>
          </select>
        </label>
        {tipoCobro === 'hora' && (
          <label>
            Tarifa por hora
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={tarifaHora}
              onChange={(e) => setTarifaHora(e.target.value)}
            />
          </label>
        )}
        {tipoCobro === 'fijo' && (
          <>
            <label>
              Precio fijo
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={precioFijo}
                onChange={(e) => setPrecioFijo(e.target.value)}
              />
            </label>
            <label className="label-checkbox">
              <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
              Ya se cobró el precio fijo
            </label>
          </>
        )}
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
