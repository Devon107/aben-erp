const { aDolares } = require('../lib/http');

function serializarProyecto(row) {
  if (!row) return row;
  return { ...row, tarifa_hora: aDolares(row.tarifa_hora), precio_fijo: aDolares(row.precio_fijo), pagado: !!row.pagado };
}

function serializarGasto(row) {
  if (!row) return row;
  return { ...row, monto: aDolares(row.monto) };
}

// SQLite guarda pagado como 0/1; la API habla en booleano.
function serializarEntrada(row) {
  if (!row) return row;
  return { ...row, pagado: !!row.pagado };
}

// entradas_tiempo.horas se mantiene siempre igual a SUM(subregistros.horas);
// se llama despues de cada insert/update/delete de subregistros.
function recomputarHorasEntrada(db, entradaId) {
  db.prepare(
    `UPDATE entradas_tiempo
     SET horas = (SELECT COALESCE(SUM(horas), 0) FROM subregistros_tiempo WHERE entrada_tiempo_id = ?),
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(entradaId, entradaId);
}

// Cálculo interno en centavos (enteros) para no arrastrar errores de
// redondeo; solo se convierte a dólares al armar la respuesta.
// ingresoCentavos refleja solo lo cobrado: en proyectos por hora, las horas
// marcadas pagado=1; en precio fijo, el monto completo solo si el proyecto
// esta marcado como pagado. ingresoPendienteCentavos es el complemento: lo
// que falta cobrar por el trabajo ya realizado.
function calcularRentabilidad(db, proyectoId) {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyectoId);
  if (!proyecto) return null;

  const horas = db
    .prepare(`SELECT COALESCE(SUM(horas), 0) AS total_horas FROM entradas_tiempo WHERE proyecto_id = ?`)
    .get(proyectoId).total_horas;

  const horasPagadas = db
    .prepare(
      `SELECT COALESCE(SUM(horas), 0) AS horas_pagadas FROM entradas_tiempo WHERE proyecto_id = ? AND pagado = 1`
    )
    .get(proyectoId).horas_pagadas;

  const gastosCentavos = db
    .prepare(`SELECT COALESCE(SUM(monto), 0) AS total_gastos FROM gastos WHERE proyecto_id = ?`)
    .get(proyectoId).total_gastos;

  const ingresoCentavos =
    proyecto.tipo_cobro === 'hora'
      ? Math.round(horasPagadas * (proyecto.tarifa_hora || 0))
      : proyecto.pagado
        ? proyecto.precio_fijo || 0
        : 0;
  const ingresoPendienteCentavos =
    proyecto.tipo_cobro === 'hora'
      ? Math.round((horas - horasPagadas) * (proyecto.tarifa_hora || 0))
      : proyecto.pagado
        ? 0
        : proyecto.precio_fijo || 0;

  const margenCentavos = ingresoCentavos - gastosCentavos;

  return {
    proyecto_id: proyecto.id,
    nombre: proyecto.nombre,
    tipo_cobro: proyecto.tipo_cobro,
    total_horas: horas,
    ingreso_total: aDolares(ingresoCentavos),
    ingreso_pendiente: aDolares(ingresoPendienteCentavos),
    total_gastos: aDolares(gastosCentavos),
    margen: aDolares(margenCentavos),
  };
}

// Horas e ingreso quedan naturalmente acotados al rango porque provienen de
// entradas_tiempo.fecha. ingreso_total refleja solo lo COBRADO, no el valor
// total del trabajo: en proyectos por hora, solo las horas marcadas pagado=1;
// en proyectos de precio fijo (que no se prorratean por hora), el precio_fijo
// completo se atribuye al rango si hubo actividad en él y el proyecto está
// marcado como pagado (proyectos.pagado).
function calcularDashboard(db, desde, hasta) {
  const rows = db
    .prepare(
      `WITH horas_proyecto AS (
         SELECT proyecto_id, SUM(horas) AS horas
         FROM entradas_tiempo
         WHERE fecha BETWEEN ? AND ?
         GROUP BY proyecto_id
       ),
       horas_pagadas_proyecto AS (
         SELECT proyecto_id, SUM(horas) AS horas
         FROM entradas_tiempo
         WHERE fecha BETWEEN ? AND ? AND pagado = 1
         GROUP BY proyecto_id
       ),
       gastos_proyecto AS (
         SELECT proyecto_id, SUM(monto) AS gastos
         FROM gastos
         WHERE fecha BETWEEN ? AND ?
         GROUP BY proyecto_id
       )
       SELECT
         c.id AS cliente_id,
         c.nombre AS cliente_nombre,
         COALESCE(SUM(hp.horas), 0) AS total_horas,
         COALESCE(SUM(hpp.horas), 0) AS horas_pagadas,
         COALESCE(SUM(
           CASE
             WHEN p.tipo_cobro = 'hora' THEN COALESCE(hpp.horas, 0) * COALESCE(p.tarifa_hora, 0)
             WHEN p.tipo_cobro = 'fijo' AND hp.horas IS NOT NULL AND p.pagado = 1 THEN COALESCE(p.precio_fijo, 0)
             ELSE 0
           END
         ), 0) AS ingreso_total,
         COALESCE(SUM(
           CASE
             WHEN p.tipo_cobro = 'hora' THEN (COALESCE(hp.horas, 0) - COALESCE(hpp.horas, 0)) * COALESCE(p.tarifa_hora, 0)
             WHEN p.tipo_cobro = 'fijo' AND hp.horas IS NOT NULL AND p.pagado = 0 THEN COALESCE(p.precio_fijo, 0)
             ELSE 0
           END
         ), 0) AS ingreso_pendiente,
         COALESCE(SUM(gp.gastos), 0) AS total_gastos
       FROM clientes c
       LEFT JOIN proyectos p ON p.cliente_id = c.id
       LEFT JOIN horas_proyecto hp ON hp.proyecto_id = p.id
       LEFT JOIN horas_pagadas_proyecto hpp ON hpp.proyecto_id = p.id
       LEFT JOIN gastos_proyecto gp ON gp.proyecto_id = p.id
       GROUP BY c.id, c.nombre
       ORDER BY c.nombre COLLATE NOCASE`
    )
    .all(desde, hasta, desde, hasta, desde, hasta);

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

module.exports = {
  serializarProyecto,
  serializarGasto,
  serializarEntrada,
  recomputarHorasEntrada,
  calcularRentabilidad,
  calcularDashboard,
};
