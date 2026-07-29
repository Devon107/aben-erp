import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { calcularAlertas } from '../lib/logic.js';
import { calcularRangoPreset, fechaCorta, money } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';

const PRESETS = [
  { value: 'mes-actual', label: 'Este mes' },
  { value: 'mes-pasado', label: 'Mes pasado' },
  { value: 'anio-actual', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
];

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
  const [preset, setPreset] = useState('mes-actual');
  const [desdeInput, setDesdeInput] = useState('');
  const [hastaInput, setHastaInput] = useState('');
  const [clientesData, setClientesData] = useState([]);

  const rango =
    preset === 'personalizado'
      ? desdeInput && hastaInput
        ? { desde: desdeInput, hasta: hastaInput }
        : null
      : calcularRangoPreset(preset);

  useEffect(() => {
    if (!rango) return;
    api(`/api/dashboard?desde=${rango.desde}&hasta=${rango.hasta}`)
      .then((data) => setClientesData(calcularAlertas(data.clientes)))
      .catch((err) => showToast(err.message, true));
    // rango se deriva de preset/desdeInput/hastaInput; usar sus campos evita
    // refetch por una nueva identidad de objeto en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango?.desde, rango?.hasta]);

  return (
    <section>
      <div className="view-header">
        <h1>Dashboard</h1>
        <div className="rango-selector">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === 'personalizado' && (
            <>
              <input type="date" value={desdeInput} onChange={(e) => setDesdeInput(e.target.value)} />
              <span>&ndash;</span>
              <input type="date" value={hastaInput} onChange={(e) => setHastaInput(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {rango && (
        <p className="rango-label">
          Del {fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}
        </p>
      )}

      <div className="table-wrap">
        <table id="tabla-dashboard">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Horas</th>
              <th>Ingreso</th>
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
                    <button className="link-cliente" onClick={() => onIrACliente(c.cliente_id, c.cliente_nombre)}>
                      {c.cliente_nombre}
                    </button>
                  </td>
                  <td>{c.total_horas} h</td>
                  <td>{money(c.ingreso_total)}</td>
                  <td className={margenClase}>{money(c.margen)}</td>
                  <td>{alertaBadge(c.alerta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {clientesData.length === 0 && <p className="empty-state">No hay datos para el rango seleccionado.</p>}
    </section>
  );
}
