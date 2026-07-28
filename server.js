const path = require('node:path');
const express = require('express');
const { initDb } = require('./db/init');

const db = initDb();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function notFound(res, entity) {
  return res.status(404).json({ error: `${entity} no encontrado` });
}

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
  res.json(proyectos);
});

app.get('/api/proyectos/:id', (req, res) => {
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  if (!proyecto) return notFound(res, 'Proyecto');
  res.json(proyecto);
});

app.post('/api/proyectos', (req, res) => {
  const { cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado } = req.body;
  if (!cliente_id || !nombre || !tipo_cobro) {
    return res.status(400).json({ error: 'cliente_id, nombre y tipo_cobro son requeridos' });
  }
  if (!['hora', 'fijo'].includes(tipo_cobro)) {
    return res.status(400).json({ error: 'tipo_cobro invalido' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(400).json({ error: 'cliente_id no existe' });

  const estadoFinal = estado || 'activo';
  if (!['activo', 'completado', 'pausado'].includes(estadoFinal)) {
    return res.status(400).json({ error: 'estado invalido' });
  }

  const info = db
    .prepare(
      `INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(cliente_id, nombre, tipo_cobro, tarifa_hora ?? null, precio_fijo ?? null, estadoFinal);
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(proyecto);
});

app.put('/api/proyectos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Proyecto');

  const cliente_id = req.body.cliente_id ?? existing.cliente_id;
  const nombre = req.body.nombre ?? existing.nombre;
  const tipo_cobro = req.body.tipo_cobro ?? existing.tipo_cobro;
  const tarifa_hora = req.body.tarifa_hora !== undefined ? req.body.tarifa_hora : existing.tarifa_hora;
  const precio_fijo = req.body.precio_fijo !== undefined ? req.body.precio_fijo : existing.precio_fijo;
  const estado = req.body.estado ?? existing.estado;

  if (!['hora', 'fijo'].includes(tipo_cobro)) {
    return res.status(400).json({ error: 'tipo_cobro invalido' });
  }
  if (!['activo', 'completado', 'pausado'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido' });
  }

  db.prepare(
    `UPDATE proyectos
     SET cliente_id = ?, nombre = ?, tipo_cobro = ?, tarifa_hora = ?, precio_fijo = ?, estado = ?
     WHERE id = ?`
  ).run(cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado, req.params.id);
  const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  res.json(proyecto);
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

  const gastos = db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total_gastos
       FROM gastos
       WHERE proyecto_id = ?`
    )
    .get(req.params.id).total_gastos;

  const ingreso =
    proyecto.tipo_cobro === 'hora'
      ? horas * (proyecto.tarifa_hora || 0)
      : proyecto.precio_fijo || 0;

  const margen = ingreso - gastos;

  res.json({
    proyecto_id: proyecto.id,
    nombre: proyecto.nombre,
    tipo_cobro: proyecto.tipo_cobro,
    total_horas: horas,
    ingreso_total: ingreso,
    total_gastos: gastos,
    margen,
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
  res.json(entradas);
});

app.get('/api/entradas-tiempo/:id', (req, res) => {
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  if (!entrada) return notFound(res, 'Entrada de tiempo');
  res.json(entrada);
});

app.post('/api/entradas-tiempo', (req, res) => {
  const { proyecto_id, fecha, horas, descripcion, origen } = req.body;
  if (!proyecto_id || !fecha || horas === undefined) {
    return res.status(400).json({ error: 'proyecto_id, fecha y horas son requeridos' });
  }
  const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
  if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

  const origenFinal = origen || 'manual';
  if (!['timer', 'manual'].includes(origenFinal)) {
    return res.status(400).json({ error: 'origen invalido' });
  }

  const info = db
    .prepare(
      `INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, descripcion, origen)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(proyecto_id, fecha, horas, descripcion ?? null, origenFinal);
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(entrada);
});

app.put('/api/entradas-tiempo/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Entrada de tiempo');

  const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
  const fecha = req.body.fecha ?? existing.fecha;
  const horas = req.body.horas !== undefined ? req.body.horas : existing.horas;
  const descripcion = req.body.descripcion !== undefined ? req.body.descripcion : existing.descripcion;
  const origen = req.body.origen ?? existing.origen;

  if (!['timer', 'manual'].includes(origen)) {
    return res.status(400).json({ error: 'origen invalido' });
  }

  db.prepare(
    `UPDATE entradas_tiempo
     SET proyecto_id = ?, fecha = ?, horas = ?, descripcion = ?, origen = ?
     WHERE id = ?`
  ).run(proyecto_id, fecha, horas, descripcion, origen, req.params.id);
  const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
  res.json(entrada);
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
  res.json(gastos);
});

app.get('/api/gastos/:id', (req, res) => {
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!gasto) return notFound(res, 'Gasto');
  res.json(gasto);
});

app.post('/api/gastos', (req, res) => {
  const { proyecto_id, descripcion, monto, fecha } = req.body;
  if (!proyecto_id || !descripcion || monto === undefined) {
    return res.status(400).json({ error: 'proyecto_id, descripcion y monto son requeridos' });
  }
  const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
  if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

  const fechaFinal = fecha || new Date().toISOString().slice(0, 10);

  const info = db
    .prepare('INSERT INTO gastos (proyecto_id, descripcion, monto, fecha) VALUES (?, ?, ?, ?)')
    .run(proyecto_id, descripcion, monto, fechaFinal);
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(gasto);
});

app.put('/api/gastos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!existing) return notFound(res, 'Gasto');

  const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
  const descripcion = req.body.descripcion ?? existing.descripcion;
  const monto = req.body.monto !== undefined ? req.body.monto : existing.monto;
  const fecha = req.body.fecha ?? existing.fecha;

  db.prepare('UPDATE gastos SET proyecto_id = ?, descripcion = ?, monto = ?, fecha = ? WHERE id = ?').run(
    proyecto_id,
    descripcion,
    monto,
    fecha,
    req.params.id
  );
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  res.json(gasto);
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
  // entradas_tiempo.fecha. Para proyectos de precio fijo (que no se prorratean
  // por hora) se atribuye el precio_fijo completo al rango si hubo al menos
  // una entrada de tiempo dentro de él; si no, no se cuenta en ese período.
  const rows = db
    .prepare(
      `WITH horas_proyecto AS (
         SELECT proyecto_id, SUM(horas) AS horas
         FROM entradas_tiempo
         WHERE fecha BETWEEN ? AND ?
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
         COALESCE(SUM(
           CASE
             WHEN p.tipo_cobro = 'hora' THEN COALESCE(hp.horas, 0) * COALESCE(p.tarifa_hora, 0)
             WHEN p.tipo_cobro = 'fijo' AND hp.horas IS NOT NULL THEN COALESCE(p.precio_fijo, 0)
             ELSE 0
           END
         ), 0) AS ingreso_total,
         COALESCE(SUM(gp.gastos), 0) AS total_gastos
       FROM clientes c
       LEFT JOIN proyectos p ON p.cliente_id = c.id
       LEFT JOIN horas_proyecto hp ON hp.proyecto_id = p.id
       LEFT JOIN gastos_proyecto gp ON gp.proyecto_id = p.id
       GROUP BY c.id, c.nombre
       ORDER BY c.nombre COLLATE NOCASE`
    )
    .all(desde, hasta, desde, hasta);

  const clientesResultado = rows.map((r) => ({
    cliente_id: r.cliente_id,
    cliente_nombre: r.cliente_nombre,
    total_horas: r.total_horas,
    ingreso_total: r.ingreso_total,
    total_gastos: r.total_gastos,
    margen: r.ingreso_total - r.total_gastos,
  }));

  res.json({ desde, hasta, clientes: clientesResultado });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
