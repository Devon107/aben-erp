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
  return db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 1000, 'activo')"
    )
    .run(clienteId).lastInsertRowid;
}

module.exports = { crearAppDePrueba, conServidor, crearProyecto };
