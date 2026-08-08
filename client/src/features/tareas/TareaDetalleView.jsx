import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fechaCorta, horasTexto, horasYMinutosADecimal, isoDateLocal, money } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmModal.jsx';
import { useProyectoDetalle } from '../proyectos/ProyectoDetalleContext.jsx';
import TareaModal from './TareaModal.jsx';

const ESTADO_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada' };

// Sub-vista de ruta de una tarea: detalle editable + el log completo de
// sesiones de tiempo (ex-subregistros), cada una con su propia fecha
// trabajada — reemplaza a EntradaTiempoModal/SubregistrosModal.
export default function TareaDetalleView({ tareaId, proyecto, cliente, onVolver }) {
  const showToast = useToast();
  const confirmar = useConfirm();
  const { marcarCambio } = useProyectoDetalle();
  const [tarea, setTarea] = useState(null);
  const [logs, setLogs] = useState(null); // null = cargando
  const [fecha, setFecha] = useState(() => isoDateLocal(new Date()));
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');
  const [valores, setValores] = useState({}); // id -> horas editable
  const [fechas, setFechas] = useState({}); // id -> fecha editable
  const [modalAbierto, setModalAbierto] = useState(false);

  async function cargarTarea() {
    try {
      setTarea(await api(`/api/tareas/${tareaId}`));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function cargarLogs() {
    try {
      const data = await api(`/api/tareas/${tareaId}/subregistros`);
      setLogs(data);
      setValores(Object.fromEntries(data.map((l) => [l.id, String(l.horas)])));
      setFechas(Object.fromEntries(data.map((l) => [l.id, l.fecha])));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  useEffect(() => {
    cargarTarea();
    cargarLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareaId]);

  async function alternarPagado() {
    try {
      await api(`/api/tareas/${tareaId}`, { method: 'PUT', body: JSON.stringify({ pagado: !tarea.pagado }) });
      showToast(tarea.pagado ? 'Marcada como pendiente' : 'Marcada como pagada');
      await cargarTarea();
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function agregarLog(e) {
    e.preventDefault();
    const horasDecimal = horasYMinutosADecimal(horas, minutos);
    if (horasDecimal <= 0) {
      showToast('Ingresá al menos 1 minuto', true);
      return;
    }
    try {
      await api(`/api/tareas/${tareaId}/subregistros`, {
        method: 'POST',
        body: JSON.stringify({ horas: horasDecimal, fecha, origen: 'manual' }),
      });
      setHoras('');
      setMinutos('');
      showToast('Tiempo registrado');
      await cargarLogs();
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function guardarLog(log) {
    const h = Number(valores[log.id]);
    if (!Number.isFinite(h) || h <= 0) {
      showToast('Ingresá un número de horas mayor a 0', true);
      return;
    }
    try {
      await api(`/api/tareas/${tareaId}/subregistros/${log.id}`, {
        method: 'PUT',
        body: JSON.stringify({ horas: h, fecha: fechas[log.id] }),
      });
      showToast('Log actualizado');
      await cargarLogs();
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function eliminarLog(log) {
    if (!(await confirmar('¿Eliminar este log de tiempo?'))) return;
    try {
      await api(`/api/tareas/${tareaId}/subregistros/${log.id}`, { method: 'DELETE' });
      showToast('Log eliminado');
      await cargarLogs();
      marcarCambio();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  if (!tarea) return null; // cargando, o la tarea fue eliminada mientras se navegaba

  const total = logs?.reduce((s, l) => s + l.horas, 0) ?? 0;

  return (
    <section>
      <div className="page-breadcrumb">
        <Link to="/">Dashboard</Link> / <Link to="/clientes">Clientes</Link> /{' '}
        <Link to={`/clientes/${cliente.id}`}>{cliente.nombre}</Link> /{' '}
        <Link to={`/clientes/${cliente.id}/proyectos/${proyecto.id}`}>{proyecto.nombre}</Link> /{' '}
        <span className="breadcrumb-current">{tarea.nombre}</span>
      </div>

      <div className="view-header">
        <div className="view-header-title">
          <button className="btn-link" onClick={onVolver}>
            &larr; Volver a tareas
          </button>
          <div className="title-row">
            <h1>{tarea.nombre}</h1>
            <span className={`badge badge-tarea-${tarea.estado}`}>{ESTADO_LABEL[tarea.estado]}</span>
            <button
              type="button"
              className={`badge-pago ${tarea.pagado ? 'badge-pago-pagado' : 'badge-pago-pendiente'}`}
              title="Cambiar estado de pago"
              onClick={alternarPagado}
            >
              {tarea.pagado ? 'Pagado' : 'Pendiente'}
            </button>
          </div>
          <div className="proyecto-meta">
            {tarea.tipo_cobro === 'hora' ? `${money(tarea.tarifa_hora)} / hora` : `${money(tarea.precio_fijo)} fijo`}
            {tarea.fecha_limite && ` · Fecha límite ${fechaCorta(tarea.fecha_limite)}`}
            {tarea.fecha_cobro && ` · Cobrada el ${fechaCorta(tarea.fecha_cobro)}`}
          </div>
        </div>
        <div className="view-header-actions">
          <button className="btn btn-secondary" onClick={() => setModalAbierto(true)}>
            Editar tarea
          </button>
        </div>
      </div>

      <div className="reporte-panel">
        <form className="subform" onSubmit={agregarLog}>
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
          <button type="submit" className="btn btn-primary btn-sm">
            Agregar tiempo
          </button>
        </form>

        <div className="tabla-wrap tabla-wrap-grande">
          <table className="tabla-entradas">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Horas</th>
                <th>Origen</th>
                <th>Registrado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs === null && (
                <tr>
                  <td colSpan="5" className="mini-empty">
                    Cargando...
                  </td>
                </tr>
              )}
              {logs !== null && logs.length === 0 && (
                <tr>
                  <td colSpan="5" className="mini-empty">
                    Sin tiempo registrado todavía.
                  </td>
                </tr>
              )}
              {logs?.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="date"
                      value={fechas[l.id] ?? ''}
                      onChange={(e) => setFechas((f) => ({ ...f, [l.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-subregistro"
                      value={valores[l.id] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [l.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <span className={`badge-origen badge-origen-${l.origen}`}>{l.origen}</span>
                  </td>
                  <td className="col-creado">{fechaCorta(l.creado_en)}</td>
                  <td>
                    <div className="row-actions-table">
                      <button className="btn-icon" title="Guardar" onClick={() => guardarLog(l)}>
                        &#10003;
                      </button>
                      <button className="btn-icon danger" title="Eliminar" onClick={() => eliminarLog(l)}>
                        &times;
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="subregistros-total">Total: {horasTexto(total)} h</p>
      </div>

      <TareaModal
        open={modalAbierto}
        tarea={tarea}
        proyectoId={proyecto.id}
        onClose={() => setModalAbierto(false)}
        onSaved={async () => {
          await cargarTarea();
          marcarCambio();
        }}
      />
    </section>
  );
}
