const { aDolares } = require('../lib/http');

// El precio (tipo_cobro/tarifa_hora/precio_fijo) vive en el proyecto; acá se
// convierte de centavos a dólares para la respuesta HTTP (igual patrón que
// serializarTarea).
function serializarProyecto(row) {
  if (!row) return row;
  return { ...row, tarifa_hora: aDolares(row.tarifa_hora), precio_fijo: aDolares(row.precio_fijo) };
}

function serializarTarea(row) {
  if (!row) return row;
  return { ...row, pagado: !!row.pagado };
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

// Ingreso/pendiente de un proyecto a partir de su tipo de cobro y el
// agregado de sus tareas (agg: {tareas_totales, tareas_pagadas,
// horas_pagadas, horas_pendientes}). Por hora: horas pagadas/pendientes ×
// tarifa. Por precio fijo: una tarea individual no tiene "su" porción del
// precio — se reparte proporcional a cuántas de las tareas del proyecto
// están pagadas (cada tarea pagada aporta precio_fijo / tareas_totales).
// Esto evita depender de un pago único a nivel proyecto (el pago se marca
// por tarea, ver nota en schema.sql sobre por qué) y es simétrico con la
// fórmula por hora. `proyecto.tarifa_hora`/`precio_fijo` deben venir en
// centavos (fila cruda de DB, no serializada); devuelve centavos.
function calcularIngresoProyecto(proyecto, agg) {
  if (proyecto.tipo_cobro === 'hora') {
    return {
      ingresoCentavos: Math.round(agg.horas_pagadas * (proyecto.tarifa_hora || 0)),
      pendienteCentavos: Math.round(agg.horas_pendientes * (proyecto.tarifa_hora || 0)),
    };
  }
  if (!agg.tareas_totales) return { ingresoCentavos: 0, pendienteCentavos: 0 };
  const precioFijoCentavos = proyecto.precio_fijo || 0;
  const ingresoCentavos = Math.round((precioFijoCentavos * agg.tareas_pagadas) / agg.tareas_totales);
  return { ingresoCentavos, pendienteCentavos: precioFijoCentavos - ingresoCentavos };
}

// Resumen de un proyecto: horas, ingreso/pendiente (vía calcularIngresoProyecto),
// progreso de tareas, y progreso por horas estimadas (solo tiene sentido en
// proyectos de precio fijo — ver ProyectoDetalleView, la barra de
// presupuesto solo se muestra ahí). Ya no calcula margen/gastos: esos viven
// a nivel cliente (ver calcularResumenCliente), porque los gastos son del
// cliente, no del proyecto.
function calcularResumenProyecto(db, proyectoId) {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyectoId);
  if (!proyecto) return null;

  const agregado = db
    .prepare(
      `SELECT
         COUNT(*) AS tareas_totales,
         COUNT(CASE WHEN estado = 'completada' THEN 1 END) AS tareas_completadas,
         COUNT(CASE WHEN pagado = 1 THEN 1 END) AS tareas_pagadas,
         COALESCE(SUM(horas), 0) AS total_horas,
         COALESCE(SUM(CASE WHEN pagado = 1 THEN horas ELSE 0 END), 0) AS horas_pagadas,
         COALESCE(SUM(CASE WHEN pagado = 0 THEN horas ELSE 0 END), 0) AS horas_pendientes,
         COALESCE(SUM(horas_estimadas), 0) AS horas_estimadas_total,
         COALESCE(SUM(CASE WHEN horas_estimadas IS NOT NULL THEN horas ELSE 0 END), 0) AS horas_trabajadas_estimables
       FROM tareas WHERE proyecto_id = ?`
    )
    .get(proyectoId);

  const { ingresoCentavos, pendienteCentavos } = calcularIngresoProyecto(proyecto, agregado);

  return {
    proyecto_id: proyecto.id,
    nombre: proyecto.nombre,
    tipo_cobro: proyecto.tipo_cobro,
    tarifa_hora: aDolares(proyecto.tarifa_hora),
    precio_fijo: aDolares(proyecto.precio_fijo),
    total_horas: agregado.total_horas,
    ingreso_total: aDolares(ingresoCentavos),
    ingreso_pendiente: aDolares(pendienteCentavos),
    tareas_totales: agregado.tareas_totales,
    tareas_completadas: agregado.tareas_completadas,
    tareas_abiertas: agregado.tareas_totales - agregado.tareas_completadas,
    horas_estimadas_total: agregado.horas_estimadas_total,
    horas_trabajadas_estimables: agregado.horas_trabajadas_estimables,
    progreso_horas_pct:
      agregado.horas_estimadas_total > 0
        ? Math.round((agregado.horas_trabajadas_estimables / agregado.horas_estimadas_total) * 100)
        : null,
  };
}

// Registra un evento en el historial de actividad. Alcance deliberadamente
// acotado a lo pedido: tiempo agregado a una tarea, cambio de estado, y
// transición a pagada (ver routes/tareas.js) — no se loguean otros eventos.
function registrarActividad(db, { cliente_id, proyecto_id, tarea_id, tipo, descripcion, fecha }) {
  db.prepare(
    `INSERT INTO actividades (cliente_id, proyecto_id, tarea_id, tipo, descripcion, fecha)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(cliente_id, proyecto_id, tarea_id ?? null, tipo, descripcion, fecha);
}

function listarActividadesCliente(db, clienteId, limite = 8) {
  return db
    .prepare('SELECT * FROM actividades WHERE cliente_id = ? ORDER BY fecha DESC, id DESC LIMIT ?')
    .all(clienteId, limite);
}

function listarActividadesProyecto(db, proyectoId, limite = 8) {
  return db
    .prepare('SELECT * FROM actividades WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC LIMIT ?')
    .all(proyectoId, limite);
}

// Resumen histórico (sin acotar por rango de fechas, a diferencia de
// calcularDashboard) de un cliente: agrega ingreso/pendiente por proyecto
// (vía calcularIngresoProyecto, cada proyecto tiene su propio precio) y
// gastos directo por cliente_id (los gastos ya no pasan por proyecto).
function calcularResumenCliente(db, clienteId) {
  const proyectos = db.prepare('SELECT * FROM proyectos WHERE cliente_id = ?').all(clienteId);
  const aggPorProyecto = db
    .prepare(
      `SELECT
         proyecto_id,
         COUNT(*) AS tareas_totales,
         COUNT(CASE WHEN pagado = 1 THEN 1 END) AS tareas_pagadas,
         COALESCE(SUM(horas), 0) AS horas_totales,
         COALESCE(SUM(CASE WHEN pagado = 1 THEN horas ELSE 0 END), 0) AS horas_pagadas,
         COALESCE(SUM(CASE WHEN pagado = 0 THEN horas ELSE 0 END), 0) AS horas_pendientes
       FROM tareas
       WHERE proyecto_id IN (SELECT id FROM proyectos WHERE cliente_id = ?)
       GROUP BY proyecto_id`
    )
    .all(clienteId);
  const aggMap = new Map(aggPorProyecto.map((a) => [a.proyecto_id, a]));

  let totalHoras = 0;
  let ingresoCentavos = 0;
  let pendienteCentavos = 0;
  let proyectosActivos = 0;
  for (const p of proyectos) {
    const agg =
      aggMap.get(p.id) || { tareas_totales: 0, tareas_pagadas: 0, horas_totales: 0, horas_pagadas: 0, horas_pendientes: 0 };
    totalHoras += agg.horas_totales;
    const ingreso = calcularIngresoProyecto(p, agg);
    ingresoCentavos += ingreso.ingresoCentavos;
    pendienteCentavos += ingreso.pendienteCentavos;
    if (p.estado === 'activo') proyectosActivos += 1;
  }

  const gastosCentavos = db
    .prepare('SELECT COALESCE(SUM(monto), 0) AS total_gastos FROM gastos WHERE cliente_id = ?')
    .get(clienteId).total_gastos;

  const ingresoRedondeado = Math.round(ingresoCentavos);

  return {
    proyectos_totales: proyectos.length,
    proyectos_activos: proyectosActivos,
    total_horas: totalHoras,
    ingreso_total: aDolares(ingresoRedondeado),
    ingreso_pendiente: aDolares(Math.round(pendienteCentavos)),
    total_gastos: aDolares(gastosCentavos),
    margen: aDolares(ingresoRedondeado - gastosCentavos),
  };
}

// Lista de proyectos de un cliente con su progreso (% de tareas completadas)
// y presupuesto, en una sola consulta — evita el N+1 de pedir /resumen por
// cada proyecto. presupuesto_total es el precio_fijo del proyecto directo
// (ya no una suma sobre tareas: el precio vive en el proyecto).
function listarProyectosConProgreso(db, clienteId) {
  const rows = db
    .prepare(
      `SELECT
         p.id, p.nombre, p.estado, p.tipo_cobro, p.precio_fijo,
         p.fecha_inicio, p.fecha_entrega_estimada,
         COALESCE(SUM(t.horas), 0) AS horas,
         COUNT(t.id) AS tareas_totales,
         COUNT(CASE WHEN t.estado = 'completada' THEN 1 END) AS tareas_completadas
       FROM proyectos p
       LEFT JOIN tareas t ON t.proyecto_id = p.id
       WHERE p.cliente_id = ?
       GROUP BY p.id
       ORDER BY p.id DESC`
    )
    .all(clienteId);

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    estado: r.estado,
    fecha_inicio: r.fecha_inicio,
    fecha_entrega_estimada: r.fecha_entrega_estimada,
    horas: r.horas,
    presupuesto_total: r.tipo_cobro === 'fijo' ? aDolares(r.precio_fijo) : null,
    tareas_totales: r.tareas_totales,
    tareas_completadas: r.tareas_completadas,
    progreso_pct: r.tareas_totales > 0 ? Math.round((r.tareas_completadas / r.tareas_totales) * 100) : 0,
  }));
}

// Últimos logs de tiempo de un proyecto (a través de todas sus tareas), para
// el panel "Registro de tiempos" del detalle de proyecto. El costo usa la
// tarifa del proyecto (no de la tarea, que ya no tiene precio); solo aplica
// a proyectos por hora (en uno de precio fijo una sesión individual no tiene
// un costo propio que atribuirle).
function listarSubregistrosRecientesProyecto(db, proyectoId, limite = 8) {
  const proyecto = db.prepare('SELECT tipo_cobro, tarifa_hora FROM proyectos WHERE id = ?').get(proyectoId);
  const rows = db
    .prepare(
      `SELECT s.id, s.horas, s.fecha, s.origen, t.nombre AS tarea_nombre
       FROM subregistros_tiempo s
       JOIN tareas t ON t.id = s.tarea_id
       WHERE t.proyecto_id = ?
       ORDER BY s.fecha DESC, s.id DESC
       LIMIT ?`
    )
    .all(proyectoId, limite);

  return rows.map((r) => ({
    id: r.id,
    tarea_nombre: r.tarea_nombre,
    fecha: r.fecha,
    horas: r.horas,
    origen: r.origen,
    costo: proyecto?.tipo_cobro === 'hora' ? aDolares(Math.round(r.horas * (proyecto.tarifa_hora || 0))) : null,
  }));
}

// Horas e ingreso quedan acotados al rango porque provienen de
// subregistros_tiempo.fecha (el dia trabajado de cada sesion). ingreso_total
// refleja solo lo COBRADO (tareas.pagado=1), no el valor total del trabajo.
// gastos se calculan en una consulta SEPARADA agrupada por cliente_id y se
// mezclan en JS (no se unen en el SQL principal): si se unieran ahí se
// duplicaría el gasto una vez por cada proyecto del cliente (fanout de
// "un cliente tiene varios proyectos" — mismo tipo de bug que ya se evitó
// antes con CTEs separadas).
function calcularDashboard(db, desde, hasta) {
  const rows = db
    .prepare(
      `WITH horas_tarea_rango AS (
         SELECT tarea_id, SUM(horas) AS horas
         FROM subregistros_tiempo
         WHERE fecha BETWEEN ? AND ?
         GROUP BY tarea_id
       ),
       tareas_conteo AS (
         SELECT proyecto_id, COUNT(*) AS tareas_totales
         FROM tareas
         GROUP BY proyecto_id
       ),
       ingreso_por_proyecto AS (
         SELECT
           t.proyecto_id,
           SUM(COALESCE(htr.horas, 0)) AS horas,
           SUM(CASE WHEN t.pagado = 1 THEN COALESCE(htr.horas, 0) ELSE 0 END) AS horas_pagadas,
           SUM(CASE
             WHEN p.tipo_cobro = 'hora' AND t.pagado = 1 THEN COALESCE(htr.horas, 0) * COALESCE(p.tarifa_hora, 0)
             WHEN p.tipo_cobro = 'fijo' AND htr.horas IS NOT NULL AND t.pagado = 1 THEN COALESCE(p.precio_fijo, 0) * 1.0 / tc.tareas_totales
             ELSE 0
           END) AS ingreso,
           SUM(CASE
             WHEN p.tipo_cobro = 'hora' AND t.pagado = 0 THEN COALESCE(htr.horas, 0) * COALESCE(p.tarifa_hora, 0)
             WHEN p.tipo_cobro = 'fijo' AND htr.horas IS NOT NULL AND t.pagado = 0 THEN COALESCE(p.precio_fijo, 0) * 1.0 / tc.tareas_totales
             ELSE 0
           END) AS pendiente
         FROM tareas t
         JOIN proyectos p ON p.id = t.proyecto_id
         JOIN tareas_conteo tc ON tc.proyecto_id = t.proyecto_id
         LEFT JOIN horas_tarea_rango htr ON htr.tarea_id = t.id
         GROUP BY t.proyecto_id
       )
       SELECT
         c.id AS cliente_id,
         c.nombre AS cliente_nombre,
         COALESCE(SUM(ipp.horas), 0) AS total_horas,
         COALESCE(SUM(ipp.horas_pagadas), 0) AS horas_pagadas,
         COALESCE(SUM(ipp.ingreso), 0) AS ingreso_total,
         COALESCE(SUM(ipp.pendiente), 0) AS ingreso_pendiente
       FROM clientes c
       LEFT JOIN proyectos p ON p.cliente_id = c.id
       LEFT JOIN ingreso_por_proyecto ipp ON ipp.proyecto_id = p.id
       GROUP BY c.id, c.nombre
       ORDER BY c.nombre COLLATE NOCASE`
    )
    .all(desde, hasta);

  const gastosPorCliente = db
    .prepare('SELECT cliente_id, SUM(monto) AS gastos FROM gastos WHERE fecha BETWEEN ? AND ? GROUP BY cliente_id')
    .all(desde, hasta);
  const gastosMap = new Map(gastosPorCliente.map((g) => [g.cliente_id, g.gastos]));

  // ingreso_total/ingreso_pendiente salen de SQL en centavos pero pueden ser
  // fraccionarios (horas decimales * tarifa en centavos, o el reparto
  // proporcional de precio fijo); se redondean antes de pasar a dólares.
  return rows.map((r) => {
    const ingresoCentavos = Math.round(r.ingreso_total);
    const pendienteCentavos = Math.round(r.ingreso_pendiente);
    const gastosCentavos = Math.round(gastosMap.get(r.cliente_id) || 0);
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
// (cuándo se cobró, no cuándo se trabajó), usando la tarifa/precio del
// proyecto (con el mismo reparto proporcional de precio fijo que
// calcularIngresoProyecto). Gastos por mes = gastos.fecha (ya no pasa por
// proyecto_id, la consulta es igual de simple que antes). Devuelve los
// últimos `meses` con algún dato (ingreso o gasto), ordenados ascendente —
// pensado para el gráfico de barras del dashboard.
function calcularTendenciaMensual(db, meses = 6) {
  const ingresosPorMes = db
    .prepare(
      `SELECT strftime('%Y-%m', t.fecha_cobro) AS mes,
              SUM(CASE
                WHEN p.tipo_cobro = 'hora' THEN t.horas * COALESCE(p.tarifa_hora, 0)
                ELSE COALESCE(p.precio_fijo, 0) * 1.0 / tc.tareas_totales
              END) AS centavos
       FROM tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       JOIN (SELECT proyecto_id, COUNT(*) AS tareas_totales FROM tareas GROUP BY proyecto_id) tc ON tc.proyecto_id = t.proyecto_id
       WHERE t.pagado = 1 AND t.fecha_cobro IS NOT NULL
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
// dashboard. `monto` usa la tarifa/precio del proyecto (reparto proporcional
// para precio fijo). Ordenadas por fecha límite (las sin fecha límite al
// final).
function listarTareasPendientesDeCobro(db, limite = 5) {
  const rows = db
    .prepare(
      `SELECT t.id, t.nombre, t.horas, t.fecha_limite,
              p.tipo_cobro, p.tarifa_hora, p.precio_fijo,
              p.nombre AS proyecto_nombre, c.nombre AS cliente_nombre,
              tc.tareas_totales
       FROM tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       JOIN clientes c ON c.id = p.cliente_id
       JOIN (SELECT proyecto_id, COUNT(*) AS tareas_totales FROM tareas GROUP BY proyecto_id) tc ON tc.proyecto_id = t.proyecto_id
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
    monto: aDolares(
      Math.round(r.tipo_cobro === 'hora' ? r.horas * (r.tarifa_hora || 0) : (r.precio_fijo || 0) / r.tareas_totales)
    ),
    fecha_limite: r.fecha_limite,
  }));
}

// Proyectos con al menos una tarea no completada cuya fecha límite está
// vencida o próxima, para el panel "Proyectos en riesgo" del dashboard. Sin
// cambios respecto a antes: usa tareas.estado/fecha_limite, nunca tocó
// precio.
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
  calcularIngresoProyecto,
  calcularResumenProyecto,
  calcularDashboard,
  calcularTendenciaMensual,
  listarTareasPendientesDeCobro,
  listarProyectosEnRiesgo,
  registrarActividad,
  listarActividadesCliente,
  listarActividadesProyecto,
  calcularResumenCliente,
  listarProyectosConProgreso,
  listarSubregistrosRecientesProyecto,
};
