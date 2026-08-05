import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';

const MODOS = [
  { value: 'hora', label: 'Por hora' },
  { value: 'proyecto', label: 'Por proyecto' },
  { value: 'mixto', label: 'Mixto' },
];

// Formulario de alta/edición de cliente, reutilizado desde ClientesView y
// ClienteDetalleView (botón "Editar cliente").
export default function ClienteModal({ open, cliente, onClose, onSaved }) {
  const showToast = useToast();
  const [nombre, setNombre] = useState('');
  const [modoFacturacion, setModoFacturacion] = useState('hora');

  useEffect(() => {
    if (open) {
      setNombre(cliente?.nombre ?? '');
      setModoFacturacion(cliente?.modo_facturacion ?? 'hora');
    }
  }, [open, cliente]);

  async function guardar(e) {
    e.preventDefault();
    const payload = { nombre, modo_facturacion: modoFacturacion };
    try {
      if (cliente) {
        await api(`/api/clientes/${cliente.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Cliente actualizado');
      } else {
        await api('/api/clientes', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Cliente creado');
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
        <h2>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
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
            placeholder="Nombre del cliente"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label>
          Modo de facturación
          <select value={modoFacturacion} onChange={(e) => setModoFacturacion(e.target.value)} required>
            {MODOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
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
