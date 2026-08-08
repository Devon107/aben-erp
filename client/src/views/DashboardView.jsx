import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { calcularAlertas } from '../lib/logic.js';
import { fechaCorta, horasTexto, iniciales, mesCorto, money } from '../lib/format.js';
import { useRangoFecha } from '../lib/useRangoFecha.js';
import { useToast } from '../components/Toast.jsx';
import RangoSelector from '../components/RangoSelector.jsx';

function alertaBadge(alerta) {
  if (alerta === 'perdida') {
    return (
      <span className="badge-alerta perdida" title="Este cliente genera pérdida en el período seleccionado">
        ⚠ Pérdida
      </span>
    );
  }
  if (alerta === 'bajo-rendimiento') {
    return (
      <span
        className="badge-alerta bajo"
        title="Muchas horas invertidas con un margen por hora por debajo del promedio de tus clientes en este período"
      >
        ⚠ Bajo rendimiento
      </span>
    );
  }
  return <span className="text-faint">&mdash;</span>;
}

export default function DashboardView({ onIrACliente }) {
  const showToast = useToast();
  const { preset, setPreset, desdeInput, setDesdeInput, hastaInput, setHastaInput, presets, rango } = useRangoFecha();
  const [clientesData, setClientesData] = useState([]);
  const [tendenciaMensual, setTendenciaMensual] = useState([]);
  const [tareasPendientes, setTareasPendientes] = useState([]);
  const [proyectosEnRiesgo, setProyectosEnRiesgo] = useState([]);

  useEffect(() => {
    if (!rango) return;
    api(`/api/dashboard?desde=${rango.desde}&hasta=${rango.hasta}`)
      .then((data) => {
        setClientesData(calcularAlertas(data.clientes));
        setTendenciaMensual(data.tendenciaMensual);
        setTareasPendientes(data.tareasPendientes);
        setProyectosEnRiesgo(data.proyectosEnRiesgo);
      })
      .catch((err) => showToast(err.message, true));
    // rango se deriva de preset/desdeInput/hastaInput; usar sus campos evita
    // refetch por una nueva identidad de objeto en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango?.desde, rango?.hasta]);

  const totales = clientesData.reduce(
    (acc, c) => ({
      ingresos: acc.ingresos + c.ingreso_total,
      gastos: acc.gastos + c.total_gastos,
      margen: acc.margen + c.margen,
      horas: acc.horas + c.total_horas,
      horasPagadas: acc.horasPagadas + c.horas_pagadas,
    }),
    { ingresos: 0, gastos: 0, margen: 0, horas: 0, horasPagadas: 0 }
  );

  return (
    <section>
      <div className="view-header">
        <h1>Dashboard</h1>
        <RangoSelector
          presets={presets}
          preset={preset}
          setPreset={setPreset}
          desdeInput={desdeInput}
          setDesdeInput={setDesdeInput}
          hastaInput={hastaInput}
          setHastaInput={setHastaInput}
        />
      </div>

      {rango && (
        <p className="rango-label">
          Del {fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}
        </p>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ingresos totales</div>
          <div className="kpi-value">{money(totales.ingresos)}</div>
          <div className="kpi-note">En el período seleccionado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Gastos totales</div>
          <div className="kpi-value">{money(totales.gastos)}</div>
          <div className="kpi-note">En el período seleccionado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Margen neto</div>
          <div className={`kpi-value ${totales.margen >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>
            {money(totales.margen)}
          </div>
          <div className="kpi-note">Ingresos menos gastos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Horas registradas</div>
          <div className="kpi-value">{horasTexto(totales.horas)} h</div>
          <div className="kpi-note">{horasTexto(totales.horasPagadas)} h pagadas</div>
        </div>
      </div>

      <div className="card-panel">
        <div className="card-panel-header">
          <div className="card-panel-title">Rendimiento por cliente</div>
        </div>
        <div className="table-wrap">
          <table id="tabla-dashboard">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Pagadas</th>
                <th>Pendientes</th>
                <th>Ingreso</th>
                <th>Por cobrar</th>
                <th>Margen</th>
                <th>Rendimiento</th>
              </tr>
            </thead>
            <tbody>
              {clientesData.map((c) => {
                const filaClase =
                  c.alerta === 'perdida' ? 'fila-perdida' : c.alerta === 'bajo-rendimiento' ? 'fila-bajo-rendimiento' : '';
                const margenClase = c.margen >= 0 ? 'valor-positivo' : 'valor-negativo';
                return (
                  <tr key={c.cliente_id} className={filaClase}>
                    <td>
                      <button className="link-cliente entity-with-avatar" onClick={() => onIrACliente(c.cliente_id, c.cliente_nombre)}>
                        <span className="avatar-initials">{iniciales(c.cliente_nombre)}</span>
                        {c.cliente_nombre}
                      </button>
                    </td>
                    <td>{horasTexto(c.horas_pagadas)} h</td>
                    <td>{horasTexto(c.horas_pendientes)} h</td>
                    <td>{money(c.ingreso_total)}</td>
                    <td>{money(c.ingreso_pendiente)}</td>
                    <td className={margenClase}>{money(c.margen)}</td>
                    <td>{alertaBadge(c.alerta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {clientesData.length === 0 && <p className="empty-state">No hay datos para el rango seleccionado.</p>}
      </div>

      {tendenciaMensual.length > 0 && <TendenciaMensualChart datos={tendenciaMensual} />}

      <div className="dashboard-bottom-row">
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-panel-title">Tareas pendientes de cobro</div>
          </div>
          {tareasPendientes.length === 0 ? (
            <p className="mini-empty">No hay tareas pendientes de cobro.</p>
          ) : (
            <ul className="mini-list mini-list-grande">
              {tareasPendientes.map((t) => (
                <li key={t.id}>
                  <div className="item-main">
                    <span className="item-title">{t.nombre}</span>
                    <span className="item-sub">
                      {t.cliente} · {t.proyecto}
                      {t.fecha_limite && ` · vence ${fechaCorta(t.fecha_limite)}`}
                    </span>
                  </div>
                  <span className="item-value">{money(t.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-panel">
          <div className="card-panel-header">
            <div className="card-panel-title">Proyectos en riesgo</div>
          </div>
          {proyectosEnRiesgo.length === 0 ? (
            <p className="mini-empty">Ningún proyecto tiene tareas con fecha límite próxima o vencida.</p>
          ) : (
            <ul className="mini-list mini-list-grande">
              {proyectosEnRiesgo.map((p) => (
                <li key={p.proyecto_id}>
                  <div className="item-main">
                    <span className="item-title">{p.proyecto_nombre}</span>
                    <span className="item-sub">{p.cliente_nombre}</span>
                  </div>
                  <span className={`badge-alerta ${p.vencido ? 'perdida' : 'bajo'}`}>
                    {p.vencido ? 'Vencida' : `vence ${fechaCorta(p.fecha_limite)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function TendenciaMensualChart({ datos }) {
  const maxValor = Math.max(...datos.flatMap((m) => [m.ingresos, m.gastos]), 1);

  return (
    <div className="card-panel">
      <div className="card-panel-header">
        <div className="card-panel-title">Ingresos vs. gastos</div>
        <div className="chart-legend">
          <span className="chart-legend-item">
            <span className="chart-legend-dot ingresos" /> Ingresos
          </span>
          <span className="chart-legend-item">
            <span className="chart-legend-dot gastos" /> Gastos
          </span>
        </div>
      </div>
      <div className="chart-bars">
        {datos.map((m) => (
          <div className="chart-bar-group" key={m.mes}>
            <div className="chart-bar-pair">
              <div className="chart-bar ingresos" style={{ height: `${(m.ingresos / maxValor) * 100}%` }} title={money(m.ingresos)} />
              <div className="chart-bar gastos" style={{ height: `${(m.gastos / maxValor) * 100}%` }} title={money(m.gastos)} />
            </div>
            <div className="chart-bar-label">{mesCorto(m.mes)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
