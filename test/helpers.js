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

function crearProyecto(db) {
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;
  return db.prepare("INSERT INTO proyectos (cliente_id, nombre, estado) VALUES (?, 'P', 'activo')").run(clienteId)
    .lastInsertRowid;
}

// El tipo de cobro/tarifa vive por tarea (no por proyecto): cada test que
// necesite una tarea concreta puede pisar cualquiera de estos defaults.
function crearTarea(db, proyectoId, overrides = {}) {
  const datos = {
    nombre: 'T',
    tipo_cobro: 'hora',
    tarifa_hora: 1000,
    precio_fijo: null,
    estado: 'pendiente',
    pagado: 0,
    fecha_cobro: null,
    fecha_limite: null,
    ...overrides,
  };
  return db
    .prepare(
      `INSERT INTO tareas (proyecto_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado, pagado, fecha_cobro, fecha_limite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      proyectoId,
      datos.nombre,
      datos.tipo_cobro,
      datos.tarifa_hora,
      datos.precio_fijo,
      datos.estado,
      datos.pagado,
      datos.fecha_cobro,
      datos.fecha_limite
    ).lastInsertRowid;
}

function crearSubregistro(db, tareaId, horas, fecha, origen = 'manual') {
  return db
    .prepare('INSERT INTO subregistros_tiempo (tarea_id, horas, fecha, origen) VALUES (?, ?, ?, ?)')
    .run(tareaId, horas, fecha, origen).lastInsertRowid;
}

module.exports = { crearAppDePrueba, conServidor, crearProyecto, crearTarea, crearSubregistro };
