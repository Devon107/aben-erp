const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { initDb } = require('../db/init');
const { createApp } = require('../server');

// Cada test usa su propia base de datos SQLite temporal (nunca data/tracker.db).
function crearAppDePrueba() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aben-erp-test-'));
  const db = initDb(path.join(dir, 'test.db'));
  return { db, app: createApp(db) };
}

async function conServidor(app, fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

function crearCliente(db, overrides = {}) {
  const datos = { nombre: 'C', modo_facturacion: 'hora', ...overrides };
  return db
    .prepare('INSERT INTO clientes (nombre, modo_facturacion) VALUES (?, ?)')
    .run(datos.nombre, datos.modo_facturacion).lastInsertRowid;
}

// El tipo de cobro/tarifa vive por proyecto (no por tarea): cada test que
// necesite un proyecto concreto puede pisar cualquiera de estos defaults.
function crearProyecto(db, overrides = {}) {
  const clienteId = overrides.clienteId ?? crearCliente(db);
  const datos = { nombre: 'P', estado: 'activo', tipo_cobro: 'hora', tarifa_hora: 1000, precio_fijo: null, ...overrides };
  return db
    .prepare('INSERT INTO proyectos (cliente_id, nombre, estado, tipo_cobro, tarifa_hora, precio_fijo) VALUES (?, ?, ?, ?, ?, ?)')
    .run(clienteId, datos.nombre, datos.estado, datos.tipo_cobro, datos.tarifa_hora, datos.precio_fijo).lastInsertRowid;
}

function crearTarea(db, proyectoId, overrides = {}) {
  const datos = {
    nombre: 'T',
    estado: 'pendiente',
    pagado: 0,
    fecha_cobro: null,
    fecha_limite: null,
    horas_estimadas: null,
    ...overrides,
  };
  return db
    .prepare(
      `INSERT INTO tareas (proyecto_id, nombre, estado, pagado, fecha_cobro, fecha_limite, horas_estimadas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(proyectoId, datos.nombre, datos.estado, datos.pagado, datos.fecha_cobro, datos.fecha_limite, datos.horas_estimadas)
    .lastInsertRowid;
}

function crearSubregistro(db, tareaId, horas, fecha, origen = 'manual') {
  return db
    .prepare('INSERT INTO subregistros_tiempo (tarea_id, horas, fecha, origen) VALUES (?, ?, ?, ?)')
    .run(tareaId, horas, fecha, origen).lastInsertRowid;
}

module.exports = { crearAppDePrueba, conServidor, crearCliente, crearProyecto, crearTarea, crearSubregistro };
