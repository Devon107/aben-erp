import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fechaCorta, fechaHoraCorta, horasTexto, horasYMinutosADecimal } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';
import EntradaTiempoModal from './EntradaTiempoModal.jsx';
import SubregistrosModal from './SubregistrosModal.jsx';
import FilaTimerBoton from './FilaTimerBoton.jsx';

// rango === null significa sin filtro (se muestra todo el historial).
export default function EntradasTiempoTable({ proyectoId, rango, refrescarSenal = 0, onCambio }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const [entradas, setEntradas] = useState(null); // null = cargando
  const [fecha, setFecha] = useState('');
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [entradaEditando, setEntradaEditando] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [entradaSubregistros, setEntradaSubregistros] = useState(null);
  const [subregistrosAbierto, setSubregistrosAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [estadoPago, setEstadoPago] = useState('todos'); // 'todos' | 'pagado' | 'pendiente'

  async function cargarEntradas() {
    try {
      const data = await api(`/api/entradas-tiempo?proyecto_id=${proyectoId}`);
      setEntradas(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarEntradas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, refrescarSenal]);

  const busquedaNormalizada = busqueda.trim().toLowerCase();
  const entradasFiltradas = entradas
    ?.filter((t) => !rango || (t.fecha >= rango.desde && t.fecha <= rango.hasta))
    .filter((t) => estadoPago === 'todos' || (estadoPago === 'pagado' ? t.pagado : !t.pagado))
    .filter((t) => !busquedaNormalizada || (t.descripcion || '').toLowerCase().includes(busquedaNormalizada));

  async function agregar(e) {
    e.preventDefault();
    const horasDecimal = horasYMinutosADecimal(horas, minutos);
    if (horasDecimal <= 0) {
      showToast('Ingresá al menos 1 minuto', true);
      return;
    }
    try {
      await api('/api/entradas-tiempo', {
        method: 'POST',
        body: JSON.stringify({ proyecto_id: proyectoId, fecha, horas: horasDecimal, descripcion, origen: 'manual' }),
      });
      setFecha('');
      setHoras('');
      setMinutos('');
      setDescripcion('');
      showToast('Horas registradas');
      await cargarEntradas();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function abrirEditar(entrada) {
    setEntradaEditando(entrada);
    setModalAbierto(true);
  }

  function abrirSubregistros(entrada) {
    setEntradaSubregistros(entrada);
    setSubregistrosAbierto(true);
  }

  async function onCambioSubregistros() {
    await cargarEntradas();
    onCambio();
  }

  async function guardarEdicion(payload) {
    try {
      await api(`/api/entradas-tiempo/${entradaEditando.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Entrada actualizada');
      setModalAbierto(false);
      await cargarEntradas();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function alternarPagado(entrada) {
    try {
      await api(`/api/entradas-tiempo/${entrada.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pagado: !entrada.pagado }),
      });
      showToast(entrada.pagado ? 'Marcada como pendiente' : 'Marcada como pagada');
      await cargarEntradas();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function eliminar(entrada) {
    if (!(await confirmar('¿Eliminar esta entrada de tiempo?'))) return;
    try {
      await api(`/api/entradas-tiempo/${entrada.id}`, { method: 'DELETE' });
      showToast('Entrada eliminada');
      await cargarEntradas();
      onCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <div className="reporte-panel">
      <form className="subform" onSubmit={agregar}>
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input
          type="number"
          className="input-horas"
          placeholder="h"
          min="0"
          step="1"
          required
          value={horas}
          onChange={(e) => setHoras(e.target.value)}
        />
        <input
          type="number"
          className="input-minutos"
          placeholder="min"
          min="0"
          max="59"
          step="1"
          required
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
        />
        <input type="text" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">
          Agregar
        </button>
      </form>

      <div className="filtros-tabla">
        <input
          type="search"
          placeholder="Buscar por descripción..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="pagado">Pagadas</option>
          <option value="pendiente">Pendientes</option>
        </select>
      </div>

      <div className="tabla-wrap tabla-wrap-grande">
        <table className="tabla-entradas">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horas</th>
              <th>Pago</th>
              <th>Descripción</th>
              <th>Origen</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entradas === null && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Cargando...
                </td>
              </tr>
            )}
            {entradas !== null && entradas.length === 0 && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Sin horas registradas.
                </td>
              </tr>
            )}
            {entradas !== null && entradas.length > 0 && entradasFiltradas.length === 0 && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Sin resultados para los filtros seleccionados.
                </td>
              </tr>
            )}
            {entradasFiltradas?.map((t) => (
              <tr key={t.id}>
                <td>{fechaCorta(t.fecha)}</td>
                <td>
                  <button type="button" className="horas-link" title="Ver subregistros" onClick={() => abrirSubregistros(t)}>
                    {horasTexto(t.horas)} h
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className={`badge-pago ${t.pagado ? 'badge-pago-pagado' : 'badge-pago-pendiente'}`}
                    title="Cambiar estado de pago"
                    onClick={() => alternarPagado(t)}
                  >
                    {t.pagado ? 'Pagado' : 'Pendiente'}
                  </button>
                </td>
                <td className="col-descripcion">{t.descripcion || '—'}</td>
                <td>
                  <span className={`badge-origen badge-origen-${t.origen}`}>{t.origen}</span>
                </td>
                <td className="col-creado">{fechaHoraCorta(t.creado_en)}</td>
                <td>
                  <div className="row-actions-table">
                    <FilaTimerBoton proyectoId={proyectoId} entradaId={t.id} onRegistrado={onCambioSubregistros} />
                    <button className="btn-icon" title="Editar" onClick={() => abrirEditar(t)}>
                      &#9998;
                    </button>
                    <button className="btn-icon danger" title="Eliminar" onClick={() => eliminar(t)}>
                      &times;
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EntradaTiempoModal
        open={modalAbierto}
        entrada={entradaEditando}
        onClose={() => setModalAbierto(false)}
        onGuardar={guardarEdicion}
      />
      <SubregistrosModal
        open={subregistrosAbierto}
        entrada={entradaSubregistros}
        onClose={() => setSubregistrosAbierto(false)}
        onCambio={onCambioSubregistros}
      />
    </div>
  );
}
