import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';

// Las horas ya no se editan acá: entradas_tiempo.horas es la suma de sus
// subregistros (ver SubregistrosModal.jsx). Este modal solo edita fecha y
// descripción de la fila.
export default function EntradaTiempoModal({ open, entrada, onClose, onGuardar }) {
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');

  useEffect(() => {
    if (open && entrada) {
      setFecha(entrada.fecha);
      setDescripcion(entrada.descripcion || '');
    }
  }, [open, entrada]);

  function submit(e) {
    e.preventDefault();
    onGuardar({
      proyecto_id: entrada.proyecto_id,
      fecha,
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
