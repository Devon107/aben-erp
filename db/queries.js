const { aDolares } = require('../lib/http');

function serializarProyecto(row) {
  return row;
}

function serializarTarea(row) {
  if (!row) return row;
  return { ...row, tarifa_hora: aDolares(row.tarifa_hora), precio_fijo: aDolares(row.precio_fijo), pagado: !!row.pagado };
}

function serializarGasto(row) {
  if (!row) return row;
  return { ...row, monto: aDolares(row.monto) };
}

// tareas.horas se mantiene siempre igual a SUM(subregistros.horas); se llama
// despues de cada insert/update/delete de subregistros.
function recomputarHorasTarea(db, tareaId) {
  db.prepare(
    `UPDATE tareas
     SET horas = (SELECT COALESCE(SUM(horas), 0) FROM subregistros_tiempo WHERE tarea_id = ?),
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(tareaId, tareaId);
}

// Cálculo interno en centavos (enteros) para no arrastrar errores de
// redondeo; solo se convierte a dólares al armar la respuesta. El tipo de
// cobro/tarifa vive por tarea (no por proyecto): se agrega sumando sobre
// todas las tareas del proyecto. ingresoCentavos refleja solo lo cobrado
// (tareas con pagado=1); ingresoPendienteCentavos es el complemento (tareas
// pagado=0). presupuestoCentavos es la suma de precio_fijo de las tareas de
// precio fijo — alimenta la barra de presupuesto en la vista de proyecto.
function calcularRentabilidad(db, proyectoId) {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyectoId);
  if (!proyecto) return null;

  const agregado = db
    .prepare(
      `SELECT
         COALESCE(SUM(horas), 0) AS total_horas,
         COALESCE(SUM(CASE
           WHEN tipo_cobro = 'hora' AND pagado = 1 THEN horas * COALESCE(tarifa_hora, 0)
           WHEN tipo_cobro = 'fijo' AND pagado = 1 THEN COALESCE(precio_fijo, 0)
           ELSE 0
         END), 0) AS ingreso_centavos,
         COALESCE(SUM(CASE
           WHEN tipo_cobro = 'hora' AND pagado = 0 THEN horas * COALESCE(tarifa_hora, 0)
           WHEN tipo_cobro = 'fijo' AND pagado = 0 THEN COALESCE(precio_fijo, 0)
           ELSE 0
         END), 0) AS pendiente_centavos,
         COALESCE(SUM(CASE WHEN tipo_cobro = 'fijo' THEN COALESCE(precio_fijo, 0) ELSE 0 END), 0) AS presupuesto_centavos
       FROM tareas WHERE proyecto_id = ?`
    )
    .get(proyectoId);

  const gastosCentavos = db
    .prepare(`SELECT COALESCE(SUM(monto), 0) AS total_gastos FROM gastos WHERE proyecto_id = ?`)
    .get(proyectoId).total_gastos;

  const ingresoCentavos = Math.round(agregado.ingreso_centavos);
  const ingresoPendienteCentavos = Math.round(agregado.pendiente_centavos);
  const presupuestoCentavos = Math.round(agregado.presupuesto_centavos);
  const margenCentavos = ingresoCentavos - gastosCentavos;

  return {
    proyecto_id: proyecto.id,
    nombre: proyecto.nombre,
    total_horas: agregado.total_horas,
    ingreso_total: aDolares(ingresoCentavos),
    ingreso_pendiente: aDolares(ingresoPendienteCentavos),
    total_gastos: aDolares(gastosCentavos),
    margen: aDolares(margenCentavos),
    presupuesto_total: aDolares(presupuestoCentavos),
  };
}

// Horas e ingreso quedan acotados al rango porque provienen de
// subregistros_tiempo.fecha (el dia trabajado de cada sesion). ingreso_total
// refleja solo lo COBRADO (tareas.pagado=1), no el valor total del trabajo.
// Se pre-agrega por proyecto en CTEs antes de unir con clientes para evitar
// contar gastos/ingreso mas de una vez por el fanout de "un proyecto tiene
// varias tareas".
function calcularDashboard(db, desde, hasta) {
  const rows = db
    .prepare(
      `WITH horas_tarea_rango AS (
         SELECT tarea_id, SUM(horas) AS horas
         FROM subregistros_tiempo
         WHERE fecha BETWEEN ? AND ?
         GROUP BY tarea_id
       ),
       ingreso_por_proyecto AS (
         SELECT
           t.proyecto_id,
           SUM(COALESCE(htr.horas, 0)) AS horas,
           SUM(CASE WHEN t.pagado = 1 THEN COALESCE(htr.horas, 0) ELSE 0 END) AS horas_pagadas,
           SUM(CASE
             WHEN t.tipo_cobro = 'hora' AND t.pagado = 1 THEN COALESCE(htr.horas, 0) * COALESCE(t.tarifa_hora, 0)
             WHEN t.tipo_cobro = 'fijo' AND htr.horas IS NOT NULL AND t.pagado = 1 THEN COALESCE(t.precio_fijo, 0)
             ELSE 0
           END) AS ingreso,
           SUM(CASE
             WHEN t.tipo_cobro = 'hora' AND t.pagado = 0 THEN COALESCE(htr.horas, 0) * COALESCE(t.tarifa_hora, 0)
             WHEN t.tipo_cobro = 'fijo' AND htr.horas IS NOT NULL AND t.pagado = 0 THEN COALESCE(t.precio_fijo, 0)
             ELSE 0
           END) AS pendiente
         FROM tareas t
         LEFT JOIN horas_tarea_rango htr ON htr.tarea_id = t.id
         GROUP BY t.proyecto_id
       ),
       gastos_por_proyecto AS (
         SELECT proyecto_id, SUM(monto) AS gastos
         FROM gastos
         WHERE fecha BETWEEN ? AND ?
         GROUP BY proyecto_id
       )
       SELECT
         c.id AS cliente_id,
         c.nombre AS cliente_nombre,
         COALESCE(SUM(ipp.horas), 0) AS total_horas,
         COALESCE(SUM(ipp.horas_pagadas), 0) AS horas_pagadas,
         COALESCE(SUM(ipp.ingreso), 0) AS ingreso_total,
         COALESCE(SUM(ipp.pendiente), 0) AS ingreso_pendiente,
         COALESCE(SUM(gpp.gastos), 0) AS total_gastos
       FROM clientes c
       LEFT JOIN proyectos p ON p.cliente_id = c.id
       LEFT JOIN ingreso_por_proyecto ipp ON ipp.proyecto_id = p.id
       LEFT JOIN gastos_por_proyecto gpp ON gpp.proyecto_id = p.id
       GROUP BY c.id, c.nombre
       ORDER BY c.nombre COLLATE NOCASE`
    )
    .all(desde, hasta, desde, hasta);

  // ingreso_total/ingreso_pendiente salen de SQL en centavos pero pueden ser
  // fraccionarios (horas decimales * tarifa en centavos); se redondean antes
  // de pasar a dólares.
  return rows.map((r) => {
    const ingresoCentavos = Math.round(r.ingreso_total);
    const pendienteCentavos = Math.round(r.ingreso_pendiente);
    const gastosCentavos = Math.round(r.total_gastos);
    return {
      cliente_id: r.cliente_id,
      cliente_nombre: r.cliente_nombre,
      total_horas: r.total_horas,
      horas_pagadas: r.horas_pagadas,
      horas_pendientes: r.total_horas - r.horas_pagadas,
      ingreso_total: aDolares(ingresoCentavos),
      ingreso_pendiente: aDolares(pendienteCentavos),
      total_gastos: aDolares(gastosCentavos),
      margen: aDolares(ingresoCentavos - gastosCentavos),
    };
  });
}

// Ingresos por mes = tareas pagadas agrupadas por el mes de fecha_cobro
// (cuándo se cobró, no cuándo se trabajó). Gastos por mes = gastos.fecha.
// Devuelve los últimos `meses` con algún dato (ingreso o gasto), ordenados
// ascendente — pensado para el gráfico de barras del dashboard.
function calcularTendenciaMensual(db, meses = 6) {
  const ingresosPorMes = db
    .prepare(
      `SELECT strftime('%Y-%m', fecha_cobro) AS mes,
              SUM(CASE WHEN tipo_cobro = 'hora' THEN horas * COALESCE(tarifa_hora, 0) ELSE COALESCE(precio_fijo, 0) END) AS centavos
       FROM tareas
       WHERE pagado = 1 AND fecha_cobro IS NOT NULL
       GROUP BY mes`
    )
    .all();
  const gastosPorMes = db
    .prepare(`SELECT strftime('%Y-%m', fecha) AS mes, SUM(monto) AS centavos FROM gastos GROUP BY mes`)
    .all();

  const mapa = new Map();
  for (const r of ingresosPorMes) {
    mapa.set(r.mes, { ...(mapa.get(r.mes) || {}), ingresos: Math.round(r.centavos) });
  }
  for (const r of gastosPorMes) {
    mapa.set(r.mes, { ...(mapa.get(r.mes) || {}), gastos: Math.round(r.centavos) });
  }

  const mesesOrdenados = [...mapa.keys()].sort().slice(-meses);
  return mesesOrdenados.map((mes) => {
    const v = mapa.get(mes);
    return { mes, ingresos: aDolares(v.ingresos || 0), gastos: aDolares(v.gastos || 0) };
  });
}

// Tareas sin cobrar, para el panel "Tareas pendientes de cobro" del
// dashboard. Ordenadas por fecha límite (las sin fecha límite al final).
function listarTareasPendientesDeCobro(db, limite = 5) {
  const rows = db
    .prepare(
      `SELECT t.id, t.nombre, t.tipo_cobro, t.tarifa_hora, t.precio_fijo, t.horas, t.fecha_limite,
              p.nombre AS proyecto_nombre, c.nombre AS cliente_nombre
       FROM tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       JOIN clientes c ON c.id = p.cliente_id
       WHERE t.pagado = 0
       ORDER BY (t.fecha_limite IS NULL), t.fecha_limite ASC, t.id DESC
       LIMIT ?`
    )
    .all(limite);

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    proyecto: r.proyecto_nombre,
    cliente: r.cliente_nombre,
    monto: aDolares(Math.round(r.tipo_cobro === 'hora' ? r.horas * (r.tarifa_hora || 0) : r.precio_fijo || 0)),
    fecha_limite: r.fecha_limite,
  }));
}

// Proyectos con al menos una tarea no completada cuya fecha límite está
// vencida o próxima, para el panel "Proyectos en riesgo" del dashboard.
function listarProyectosEnRiesgo(db) {
  const rows = db
    .prepare(
      `SELECT p.id AS proyecto_id, p.nombre AS proyecto_nombre, c.nombre AS cliente_nombre,
              MIN(t.fecha_limite) AS proxima_fecha_limite
       FROM tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       JOIN clientes c ON c.id = p.cliente_id
       WHERE t.estado != 'completada' AND t.fecha_limite IS NOT NULL
       GROUP BY p.id, p.nombre, c.nombre
       ORDER BY proxima_fecha_limite ASC`
    )
    .all();

  const hoy = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    proyecto_id: r.proyecto_id,
    proyecto_nombre: r.proyecto_nombre,
    cliente_nombre: r.cliente_nombre,
    fecha_limite: r.proxima_fecha_limite,
    vencido: r.proxima_fecha_limite < hoy,
  }));
}

module.exports = {
  serializarProyecto,
  serializarTarea,
  serializarGasto,
  recomputarHorasTarea,
  calcularRentabilidad,
  calcularDashboard,
  calcularTendenciaMensual,
  listarTareasPendientesDeCobro,
  listarProyectosEnRiesgo,
};
