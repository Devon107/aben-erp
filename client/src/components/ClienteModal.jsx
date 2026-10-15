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
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [industria, setIndustria] = useState('');
  const [sitioWeb, setSitioWeb] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contactoPrincipal, setContactoPrincipal] = useState('');
  const [clienteDesde, setClienteDesde] = useState('');

  useEffect(() => {
    if (open) {
      setNombre(cliente?.nombre ?? '');
      setModoFacturacion(cliente?.modo_facturacion ?? 'hora');
      setEmail(cliente?.email ?? '');
      setTelefono(cliente?.telefono ?? '');
      setIndustria(cliente?.industria ?? '');
      setSitioWeb(cliente?.sitio_web ?? '');
      setDireccion(cliente?.direccion ?? '');
      setContactoPrincipal(cliente?.contacto_principal ?? '');
      setClienteDesde(cliente?.cliente_desde ?? '');
    }
  }, [open, cliente]);

  async function guardar(e) {
    e.preventDefault();
    const payload = {
      nombre,
      modo_facturacion: modoFacturacion,
      email: email || null,
      telefono: telefono || null,
      industria: industria || null,
      sitio_web: sitioWeb || null,
      direccion: direccion || null,
      contacto_principal: contactoPrincipal || null,
      cliente_desde: clienteDesde || null,
    };
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
        <label>
          Email
          <input type="email" placeholder="contacto@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input type="text" placeholder="+1 415 555 0148" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label>
          Industria
          <input type="text" placeholder="Tecnología" value={industria} onChange={(e) => setIndustria(e.target.value)} />
        </label>
        <label>
          Contacto principal
          <input
            type="text"
            placeholder="Nombre — cargo"
            value={contactoPrincipal}
            onChange={(e) => setContactoPrincipal(e.target.value)}
          />
        </label>
        <label>
          Sitio web
          <input type="text" placeholder="empresa.com" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
        </label>
        <label>
          Dirección
          <input type="text" placeholder="Ciudad, país" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </label>
        <label>
          Cliente desde
          <input type="date" value={clienteDesde} onChange={(e) => setClienteDesde(e.target.value)} />
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
