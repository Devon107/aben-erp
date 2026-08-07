const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor } = require('./helpers');

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

test('POST /api/entradas-tiempo rechaza pagado con tipo invalido', async () => {
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
      body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 1, pagado: 'si' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/entradas-tiempo/:id cambia pagado y lo conserva si no se envia', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 10, 'activo')"
    )
    .run(clienteId).lastInsertRowid;
  const entradaId = db
    .prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas) VALUES (?, ?, ?)')
    .run(proyectoId, '2026-07-10', 2).lastInsertRowid;

  await conServidor(app, async (base) => {
    const res1 = await fetch(`${base}/api/entradas-tiempo/${entradaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: true }),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.pagado, true);
    assert.equal(body1.horas, 2);

    // No se envia pagado: debe conservarse el valor previo (true).
    const res2 = await fetch(`${base}/api/entradas-tiempo/${entradaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: 'actualizado' }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.pagado, true);
    assert.equal(body2.descripcion, 'actualizado');
  });
});

test('GET /api/proyectos/:id/rentabilidad refleja solo lo cobrado', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 5000, 'activo')"
    )
    .run(clienteId).lastInsertRowid;
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, pagado) VALUES (?, ?, ?, 1)').run(
    proyectoId,
    '2026-07-10',
    2
  );
  db.prepare('INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, pagado) VALUES (?, ?, ?, 0)').run(
    proyectoId,
    '2026-07-11',
    3
  );

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/rentabilidad`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_horas, 5);
    assert.equal(body.ingreso_total, 100); // solo las 2 horas pagadas * $50
    assert.equal(body.ingreso_pendiente, 150); // 3 horas pendientes * $50
  });
});

test('PUT /api/proyectos/:id cambia pagado y afecta el ingreso de proyectos de precio fijo', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'proyecto')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare(
      "INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, precio_fijo, estado) VALUES (?, 'P', 'fijo', 50000, 'activo')"
    )
    .run(clienteId).lastInsertRowid;

  await conServidor(app, async (base) => {
    const antes = await (await fetch(`${base}/api/proyectos/${proyectoId}/rentabilidad`)).json();
    assert.equal(antes.ingreso_total, 0);
    assert.equal(antes.ingreso_pendiente, 500);

    const putRes = await fetch(`${base}/api/proyectos/${proyectoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: true }),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.pagado, true);

    const despues = await (await fetch(`${base}/api/proyectos/${proyectoId}/rentabilidad`)).json();
    assert.equal(despues.ingreso_total, 500);
    assert.equal(despues.ingreso_pendiente, 0);
  });
});

test('POST /api/proyectos rechaza pagado con tipo invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'proyecto')")
    .run().lastInsertRowid;

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, nombre: 'P', tipo_cobro: 'fijo', precio_fijo: 100, pagado: 'si' }),
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
