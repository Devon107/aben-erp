const test = require('node:test');
const assert = require('node:assert/strict');
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

test('GET /api/dashboard exige desde y hasta', async () => {
  const { app } = crearAppDePrueba();
  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard`);
    assert.equal(res.status, 400);
  });
});

test('GET /api/dashboard calcula horas, ingreso, gastos y margen por cliente dentro del rango', async () => {
  const { app, db } = crearAppDePrueba();

  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('Cliente Test', 'hora')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'Proyecto Test', 'hora', 50, 'activo')"
    )
    .run(clienteId).lastInsertRowid;

  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas) VALUES (?, ?, ?)').run(
    proyectoId,
    '2026-07-10',
    10
  );
  // Fuera de rango: no debe contarse en el resultado.
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas) VALUES (?, ?, ?)').run(
    proyectoId,
    '2026-06-01',
    5
  );
  db.prepare('INSERT INTO gastos (proyecto_id, descripcion, monto, fecha) VALUES (?, ?, ?, ?)').run(
    proyectoId,
    'Gasto test',
    100,
    '2026-07-15'
  );

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.clientes.length, 1);
    const [c] = body.clientes;
    assert.equal(c.total_horas, 10);
    assert.equal(c.ingreso_total, 500);
    assert.equal(c.total_gastos, 100);
    assert.equal(c.margen, 400);
  });
});

test('POST /api/entradas-tiempo rechaza horas negativas o en cero', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 10, 'activo')"
    )
    .run(clienteId).lastInsertRowid;

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/entradas-tiempo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: -1 }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/gastos rechaza monto negativo', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 10, 'activo')"
    )
    .run(clienteId).lastInsertRowid;

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, descripcion: 'x', monto: -5 }),
    });
    assert.equal(res.status, 400);
  });
});
