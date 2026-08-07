const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor } = require('./helpers');

test('GET /api/dashboard exige desde y hasta', async () => {
  const { app } = crearAppDePrueba();
  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard`);
    assert.equal(res.status, 400);
  });
});

test('GET /api/dashboard calcula horas, ingreso (solo cobrado), gastos y margen por cliente dentro del rango', async () => {
  const { app, db } = crearAppDePrueba();

  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('Cliente Test', 'hora')")
    .run().lastInsertRowid;
  // tarifa_hora y monto se guardan en centavos: 5000 = $50.00/hora.
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'Proyecto Test', 'hora', 5000, 'activo')"
    )
    .run(clienteId).lastInsertRowid;

  // 6 pagadas + 4 pendientes = 10 horas totales dentro del rango; ingreso solo
  // cuenta las 6 pagadas (6 * $50 = $300).
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, pagado) VALUES (?, ?, ?, 1)').run(
    proyectoId,
    '2026-07-10',
    6
  );
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, pagado) VALUES (?, ?, ?, 0)').run(
    proyectoId,
    '2026-07-12',
    4
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
    10000, // $100.00 en centavos
    '2026-07-15'
  );

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.clientes.length, 1);
    const [c] = body.clientes;
    assert.equal(c.total_horas, 10);
    assert.equal(c.horas_pagadas, 6);
    assert.equal(c.horas_pendientes, 4);
    assert.equal(c.ingreso_total, 300);
    assert.equal(c.ingreso_pendiente, 200); // 4 horas pendientes * $50
    assert.equal(c.total_gastos, 100);
    assert.equal(c.margen, 200);
  });
});

test('GET /api/dashboard: proyecto de precio fijo solo aporta ingreso si esta marcado pagado', async () => {
  const { app, db } = crearAppDePrueba();

  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('Cliente Fijo', 'proyecto')")
    .run().lastInsertRowid;
  // precio_fijo en centavos: 100000 = $1000.00.
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, precio_fijo, estado, pagado) VALUES (?, 'Proyecto Fijo', 'fijo', 100000, 'activo', 0)"
    )
    .run(clienteId).lastInsertRowid;
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas) VALUES (?, ?, ?)').run(
    proyectoId,
    '2026-07-10',
    3
  );

  await conServidor(app, async (base) => {
    const res1 = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    const body1 = await res1.json();
    assert.equal(body1.clientes[0].ingreso_total, 0);
    assert.equal(body1.clientes[0].ingreso_pendiente, 1000);

    db.prepare('UPDATE proyectos SET pagado = 1 WHERE id = ?').run(proyectoId);

    const res2 = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    const body2 = await res2.json();
    assert.equal(body2.clientes[0].ingreso_total, 1000);
    assert.equal(body2.clientes[0].ingreso_pendiente, 0);
  });
});
