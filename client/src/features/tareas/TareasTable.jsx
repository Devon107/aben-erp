import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fechaCorta, horasTexto, money } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';
import { useProyectoDetalle } from '../proyectos/ProyectoDetalleContext.jsx';
import FilaTimerBoton from '../tiempo/FilaTimerBoton.jsx';
import TareaModal from './TareaModal.jsx';

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada' };

// Tabla de tareas de un proyecto: cada tarea es su propia unidad de cobro
// (tipo/tarifa) y se crea explícitamente con "+ Nueva tarea", sin depender
// de iniciar ningún cronómetro. El cronómetro por fila permite trackear
// tiempo para una tarea ya creada.
export default function TareasTable({ proyectoId, onVerTarea }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const { senalRecarga, marcarCambio } = useProyectoDetalle();
  const [tareas, setTareas] = useState(null); // null = cargando
  const [busqueda, setBusqueda] = useState('');
  const [estadoPago, setEstadoPago] = useState('todos'); // 'todos' | 'pagado' | 'pendiente'
  const [modalAbierto, setModalAbierto] = useState(false);
  const [tareaEditando, setTareaEditando] = useState(null);

  async function cargarTareas() {
    try {
      const data = await api(`/api/tareas?proyecto_id=${proyectoId}`);
      setTareas(data);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarTareas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, senalRecarga]);

  const busquedaNormalizada = busqueda.trim().toLowerCase();
  const tareasFiltradas = tareas
    ?.filter((t) => estadoPago === 'todos' || (estadoPago === 'pagado' ? t.pagado : !t.pagado))
    .filter((t) => !busquedaNormalizada || t.nombre.toLowerCase().includes(busquedaNormalizada));

  function abrirNueva() {
    setTareaEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(tarea) {
    setTareaEditando(tarea);
    setModalAbierto(true);
  }

  async function alternarPagado(tarea) {
    try {
      await api(`/api/tareas/${tarea.id}`, { method: 'PUT', body: JSON.stringify({ pagado: !tarea.pagado }) });
      showToast(tarea.pagado ? 'Marcada como pendiente' : 'Marcada como pagada');
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function eliminar(tarea) {
    if (!(await confirmar('¿Eliminar esta tarea? Se eliminará también su historial de tiempos.'))) return;
    try {
      await api(`/api/tareas/${tarea.id}`, { method: 'DELETE' });
      showToast('Tarea eliminada');
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  return (
    <div className="reporte-panel">
      <div className="filtros-tabla">
        <input
          type="search"
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="pagado">Pagadas</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={abrirNueva}>
          + Nueva tarea
        </button>
      </div>

      <div className="tabla-wrap tabla-wrap-grande">
        <table className="tabla-entradas">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo de cobro</th>
              <th>Horas</th>
              <th>Estado</th>
              <th>Pago</th>
              <th>Fecha límite</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tareas === null && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Cargando...
                </td>
              </tr>
            )}
            {tareas !== null && tareas.length === 0 && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Sin tareas todavía. Creá la primera con "+ Nueva tarea".
                </td>
              </tr>
            )}
            {tareas !== null && tareas.length > 0 && tareasFiltradas.length === 0 && (
              <tr>
                <td colSpan="7" className="mini-empty">
                  Sin resultados para los filtros seleccionados.
                </td>
              </tr>
            )}
            {tareasFiltradas?.map((t) => (
              <tr key={t.id}>
                <td className="col-descripcion">
                  <button type="button" className="tabla-link" onClick={() => onVerTarea(t.id)}>
                    {t.nombre}
                  </button>
                </td>
                <td>{t.tipo_cobro === 'hora' ? `${money(t.tarifa_hora)} / h` : `${money(t.precio_fijo)} fijo`}</td>
                <td>{horasTexto(t.horas)} h</td>
                <td>
                  <span className={`badge badge-tarea-${t.estado}`}>{ESTADO_LABEL[t.estado]}</span>
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
                <td>{t.fecha_limite ? fechaCorta(t.fecha_limite) : '—'}</td>
                <td>
                  <div className="row-actions-table">
                    <FilaTimerBoton proyectoId={proyectoId} tareaId={t.id} />
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

      <TareaModal
        open={modalAbierto}
        tarea={tareaEditando}
        proyectoId={proyectoId}
        onClose={() => setModalAbierto(false)}
        onSaved={marcarCambio}
      />
    </div>
  );
}
