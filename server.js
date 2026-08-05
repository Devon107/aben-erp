const path = require('node:path');
const express = require('express');
const { initDb } = require('./db/init');

function notFound(res, entity) {
  return res.status(404).json({ error: `${entity} no encontrado` });
}

function esNumeroNoNegativo(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

// La API habla en dólares (como antes); la base de datos guarda centavos
// (INTEGER) para evitar errores de redondeo de punto flotante en montos.
function aCentavos(dolares) {
  return Math.round(dolares * 100);
}

function aDolares(centavos) {
  return centavos == null ? null : centavos / 100;
}

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

function createApp(db) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

// ---------- Clientes ----------

app.get('/api/clientes', (req, res) => {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY id DESC').all();
  res.json(clientes);
});

app.get('/api/clientes/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return notFound(res, 'Cliente');
  res.json(cliente);
});

app.post('/api/clientes', (req, res) => {
  const { nombre, modo_facturacion } = req.body;
  if (!nombre || !modo_facturacion) {
    return res.status(400).json({ error: 'nombre y modo_facturacion son requeridos' });
  }
  if (!['hora', 'proyecto', 'mixto'].includes(modo_facturacion)) {
    return res.status(400).json({ error: 'modo_facturacion invalido' });
  }
  const info = db
    .prepare('INSERT INTO clientes (nombre, modo_facturacion) VALUES (?, ?)')
    .run(nombre, modo_facturacion);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(cliente);
});

app.put('/api/clientes/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Cliente');

  const nombre = req.body.nombre ?? existing.nombre;
  const modo_facturacion = req.body.modo_facturacion ?? existing.modo_facturacion;
  if (!['hora', 'proyecto', 'mixto'].includes(modo_facturacion)) {
    return res.status(400).json({ error: 'modo_facturacion invalido' });
  }

  db.prepare('UPDATE clientes SET nombre = ?, modo_facturacion = ? WHERE id = ?').run(
    nombre,
    modo_facturacion,
    req.params.id
  );
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json(cliente);
});

app.delete('/api/clientes/:id', (req, res) => {
  const info = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res, 'Cliente');
  res.status(204).end();
});

// ---------- Proyectos ----------

app.get('/api/proyectos', (req, res) => {
  const { cliente_id } = req.query;
  let proyectos;
  if (cliente_id) {
    proyectos = db
      .prepare('SELECT * FROM proyectos WHERE cliente_id = ? ORDER BY id DESC')
      .all(cliente_id);
  } else {
    proyectos = db.prepare('SELECT * FROM proyectos ORDER BY id DESC').all();
  }
  res.json(proyectos.map(serializarProyecto));
});

app.get('/api/proyectos/:id', (req, res) => {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  if (!proyecto) return notFound(res, 'Proyecto');
  res.json(serializarProyecto(proyecto));
});

app.post('/api/proyectos', (req, res) => {
  const { cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado, pagado } = req.body;
  if (!cliente_id || !nombre || !tipo_cobro) {
    return res.status(400).json({ error: 'cliente_id, nombre y tipo_cobro son requeridos' });
  }
  if (!['hora', 'fijo'].includes(tipo_cobro)) {
    return res.status(400).json({ error: 'tipo_cobro invalido' });
  }
  if (tarifa_hora != null && !esNumeroNoNegativo(tarifa_hora)) {
    return res.status(400).json({ error: 'tarifa_hora debe ser un numero no negativo' });
  }
  if (precio_fijo != null && !esNumeroNoNegativo(precio_fijo)) {
    return res.status(400).json({ error: 'precio_fijo debe ser un numero no negativo' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(400).json({ error: 'cliente_id no existe' });

  const estadoFinal = estado || 'activo';
  if (!['activo', 'completado', 'pausado'].includes(estadoFinal)) {
    return res.status(400).json({ error: 'estado invalido' });
  }
  const pagadoFinal = pagado ?? false;
  if (typeof pagadoFinal !== 'boolean') {
    return res.status(400).json({ error: 'pagado debe ser true o false' });
  }

  const info = db
    .prepare(
      `INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado, pagado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cliente_id,
      nombre,
      tipo_cobro,
      tarifa_hora != null ? aCentavos(tarifa_hora) : null,
      precio_fijo != null ? aCentavos(precio_fijo) : null,
      estadoFinal,
      pagadoFinal ? 1 : 0
    );
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializarProyecto(proyecto));
});

app.put('/api/proyectos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Proyecto');
  const existingDolares = serializarProyecto(existing);

  const cliente_id = req.body.cliente_id ?? existing.cliente_id;
  const nombre = req.body.nombre ?? existing.nombre;
  const tipo_cobro = req.body.tipo_cobro ?? existing.tipo_cobro;
  const tarifa_hora = req.body.tarifa_hora !== undefined ? req.body.tarifa_hora : existingDolares.tarifa_hora;
  const precio_fijo = req.body.precio_fijo !== undefined ? req.body.precio_fijo : existingDolares.precio_fijo;
  const estado = req.body.estado ?? existing.estado;
  const pagado = req.body.pagado !== undefined ? req.body.pagado : !!existing.pagado;

  if (!['hora', 'fijo'].includes(tipo_cobro)) {
    return res.status(400).json({ error: 'tipo_cobro invalido' });
  }
  if (!['activo', 'completado', 'pausado'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido' });
  }
  if (tarifa_hora != null && !esNumeroNoNegativo(tarifa_hora)) {
    return res.status(400).json({ error: 'tarifa_hora debe ser un numero no negativo' });
  }
  if (precio_fijo != null && !esNumeroNoNegativo(precio_fijo)) {
    return res.status(400).json({ error: 'precio_fijo debe ser un numero no negativo' });
  }
  if (typeof pagado !== 'boolean') {
    return res.status(400).json({ error: 'pagado debe ser true o false' });
  }

  db.prepare(
    `UPDATE proyectos
     SET cliente_id = ?, nombre = ?, tipo_cobro = ?, tarifa_hora = ?, precio_fijo = ?, estado = ?, pagado = ?
     WHERE id = ?`
  ).run(
    cliente_id,
    nombre,
    tipo_cobro,
    tarifa_hora != null ? aCentavos(tarifa_hora) : null,
    precio_fijo != null ? aCentavos(precio_fijo) : null,
    estado,
    pagado ? 1 : 0,
    req.params.id
  );
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  res.json(serializarProyecto(proyecto));
});

app.delete('/api/proyectos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM proyectos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res, 'Proyecto');
  res.status(204).end();
});

// ---------- Rentabilidad ----------

app.get('/api/proyectos/:id/rentabilidad', (req, res) => {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  if (!proyecto) return notFound(res, 'Proyecto');

  const horas = db
    .prepare(
      `SELECT COALESCE(SUM(horas), 0) AS total_horas
       FROM entradas_tiempo
       WHERE proyecto_id = ?`
    )
    .get(req.params.id).total_horas;

  const horasPagadas = db
    .prepare(
      `SELECT COALESCE(SUM(horas), 0) AS horas_pagadas
       FROM entradas_tiempo
       WHERE proyecto_id = ? AND pagado = 1`
    )
    .get(req.params.id).horas_pagadas;

  // Cálculo interno en centavos (enteros) para no arrastrar errores de
  // redondeo; solo se convierte a dólares al armar la respuesta.
  const gastosCentavos = db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total_gastos
       FROM gastos
       WHERE proyecto_id = ?`
    )
    .get(req.params.id).total_gastos;

  // ingresoCentavos refleja solo lo cobrado: en proyectos por hora, las horas
  // marcadas pagado=1; en precio fijo, el monto completo solo si el proyecto
  // esta marcado como pagado. ingresoPendienteCentavos es el complemento: lo
  // que falta cobrar por el trabajo ya realizado.
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

  res.json({
    proyecto_id: proyecto.id,
    nombre: proyecto.nombre,
    tipo_cobro: proyecto.tipo_cobro,
    total_horas: horas,
    ingreso_total: aDolares(ingresoCentavos),
    ingreso_pendiente: aDolares(ingresoPendienteCentavos),
    total_gastos: aDolares(gastosCentavos),
    margen: aDolares(margenCentavos),
  });
});

// ---------- Entradas de tiempo ----------

app.get('/api/entradas-tiempo', (req, res) => {
  const { proyecto_id } = req.query;
  let entradas;
  if (proyecto_id) {
    entradas = db
      .prepare('SELECT * FROM entradas_tiempo WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC')
      .all(proyecto_id);
  } else {
    entradas = db.prepare('SELECT * FROM entradas_tiempo ORDER BY fecha DESC, id DESC').all();
  }
  res.json(entradas.map(serializarEntrada));
});

app.get('/api/entradas-tiempo/:id', (req, res) => {
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  if (!entrada) return notFound(res, 'Entrada de tiempo');
  res.json(serializarEntrada(entrada));
});

app.post('/api/entradas-tiempo', (req, res) => {
  const { proyecto_id, fecha, horas, descripcion, origen, pagado } = req.body;
  if (!proyecto_id || !fecha || horas === undefined) {
    return res.status(400).json({ error: 'proyecto_id, fecha y horas son requeridos' });
  }
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
    return res.status(400).json({ error: 'horas debe ser un numero mayor a 0' });
  }
  const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
  if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

  const origenFinal = origen || 'manual';
  if (!['timer', 'manual'].includes(origenFinal)) {
    return res.status(400).json({ error: 'origen invalido' });
  }
  const pagadoFinal = pagado ?? false;
  if (typeof pagadoFinal !== 'boolean') {
    return res.status(400).json({ error: 'pagado debe ser true o false' });
  }

  const info = db
    .prepare(
      `INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, descripcion, origen, pagado)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(proyecto_id, fecha, horas, descripcion ?? null, origenFinal, pagadoFinal ? 1 : 0);
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializarEntrada(entrada));
});

app.put('/api/entradas-tiempo/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Entrada de tiempo');

  const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
  const fecha = req.body.fecha ?? existing.fecha;
  const horas = req.body.horas !== undefined ? req.body.horas : existing.horas;
  const descripcion = req.body.descripcion !== undefined ? req.body.descripcion : existing.descripcion;
  const origen = req.body.origen ?? existing.origen;
  const pagado = req.body.pagado !== undefined ? req.body.pagado : !!existing.pagado;

  if (!['timer', 'manual'].includes(origen)) {
    return res.status(400).json({ error: 'origen invalido' });
  }
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
    return res.status(400).json({ error: 'horas debe ser un numero mayor a 0' });
  }
  if (typeof pagado !== 'boolean') {
    return res.status(400).json({ error: 'pagado debe ser true o false' });
  }

  db.prepare(
    `UPDATE entradas_tiempo
     SET proyecto_id = ?, fecha = ?, horas = ?, descripcion = ?, origen = ?, pagado = ?
     WHERE id = ?`
  ).run(proyecto_id, fecha, horas, descripcion, origen, pagado ? 1 : 0, req.params.id);
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  res.json(serializarEntrada(entrada));
});

app.delete('/api/entradas-tiempo/:id', (req, res) => {
  const info = db.prepare('DELETE FROM entradas_tiempo WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res, 'Entrada de tiempo');
  res.status(204).end();
});

// ---------- Gastos ----------

app.get('/api/gastos', (req, res) => {
  const { proyecto_id } = req.query;
  let gastos;
  if (proyecto_id) {
    gastos = db
      .prepare('SELECT * FROM gastos WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC')
      .all(proyecto_id);
  } else {
    gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
  }
  res.json(gastos.map(serializarGasto));
});

app.get('/api/gastos/:id', (req, res) => {
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!gasto) return notFound(res, 'Gasto');
  res.json(serializarGasto(gasto));
});

app.post('/api/gastos', (req, res) => {
  const { proyecto_id, descripcion, monto, fecha } = req.body;
  if (!proyecto_id || !descripcion || monto === undefined) {
    return res.status(400).json({ error: 'proyecto_id, descripcion y monto son requeridos' });
  }
  if (!esNumeroNoNegativo(monto)) {
    return res.status(400).json({ error: 'monto debe ser un numero no negativo' });
  }
  const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
  if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

  const fechaFinal = fecha || new Date().toISOString().slice(0, 10);

  const info = db
    .prepare('INSERT INTO gastos (proyecto_id, descripcion, monto, fecha) VALUES (?, ?, ?, ?)')
    .run(proyecto_id, descripcion, aCentavos(monto), fechaFinal);
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializarGasto(gasto));
});

app.put('/api/gastos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Gasto');

  const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
  const descripcion = req.body.descripcion ?? existing.descripcion;
  const monto = req.body.monto !== undefined ? req.body.monto : aDolares(existing.monto);
  const fecha = req.body.fecha ?? existing.fecha;

  if (!esNumeroNoNegativo(monto)) {
    return res.status(400).json({ error: 'monto debe ser un numero no negativo' });
  }

  db.prepare('UPDATE gastos SET proyecto_id = ?, descripcion = ?, monto = ?, fecha = ? WHERE id = ?').run(
    proyecto_id,
    descripcion,
    aCentavos(monto),
    fecha,
    req.params.id
  );
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  res.json(serializarGasto(gasto));
});

app.delete('/api/gastos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return notFound(res, 'Gasto');
  res.status(204).end();
});

// ---------- Dashboard ----------

const FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/dashboard', (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta || !FECHA_ISO_RE.test(desde) || !FECHA_ISO_RE.test(hasta)) {
    return res.status(400).json({ error: 'desde y hasta son requeridos, formato YYYY-MM-DD' });
  }
  if (desde > hasta) {
    return res.status(400).json({ error: 'desde no puede ser posterior a hasta' });
  }

  // Horas e ingreso quedan naturalmente acotados al rango porque provienen de
  // entradas_tiempo.fecha. ingreso_total refleja solo lo COBRADO, no el valor
  // total del trabajo: en proyectos por hora, solo las horas marcadas pagado=1;
  // en proyectos de precio fijo (que no se prorratean por hora), el precio_fijo
  // completo se atribuye al rango si hubo actividad en él y el proyecto está
  // marcado como pagado (proyectos.pagado).
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
  const clientesResultado = rows.map((r) => {
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

  res.json({ desde, hasta, clientes: clientesResultado });
});

  // Manejo de errores: asegura que la API siempre responda JSON, incluso ante
  // body JSON malformado (express.json() lo reporta como error, no como req.body vacío).
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalido' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };

// Solo levanta el servidor si se ejecuta directamente (node server.js), no cuando
// los tests importan createApp() para probar la API sin abrir un puerto real.
if (require.main === module) {
  const db = initDb();
  const app = createApp(db);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}
