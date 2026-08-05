import { useEffect, useState } from 'react';
import { decimalAHorasYMinutos, horasYMinutosADecimal } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';

export default function EntradaTiempoModal({ open, entrada, onClose, onGuardar }) {
  const showToast = useToast();
  const [fecha, setFecha] = useState('');
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');
  const [descripcion, setDescripcion] = useState('');

  useEffect(() => {
    if (open && entrada) {
      const { horas: h, minutos: m } = decimalAHorasYMinutos(entrada.horas);
      setFecha(entrada.fecha);
      setHoras(h);
      setMinutos(m);
      setDescripcion(entrada.descripcion || '');
    }
  }, [open, entrada]);

  function submit(e) {
    e.preventDefault();
    const horasDecimal = horasYMinutosADecimal(horas, minutos);
    if (horasDecimal <= 0) {
      showToast('Ingresá al menos 1 minuto', true);
      return;
    }
    onGuardar({
      proyecto_id: entrada.proyecto_id,
      fecha,
      horas: horasDecimal,
      descripcion,
      origen: entrada.origen,
    });
  }

  if (!entrada) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
        <h2>Editar entrada de tiempo</h2>
        <button className="btn-close" type="button" onClick={onClose}>
          &times;
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Fecha
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <div className="campo-horas-minutos">
          <label>
            Horas
            <input type="number" min="0" step="1" required value={horas} onChange={(e) => setHoras(e.target.value)} />
          </label>
          <label>
            Minutos
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              required
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
            />
          </label>
        </div>
        <label>
          Descripción
          <input type="text" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Guardar cambios
          </button>
        </div>
      </form>
    </Modal>
  );
}
