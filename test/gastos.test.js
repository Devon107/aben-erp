const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor, crearCliente } = require('./helpers');

test('POST /api/gastos crea un gasto ligado al cliente (no a un proyecto)', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, descripcion: 'Hosting', monto: 25, fecha: '2026-07-01' }),
    });
    assert.equal(res.status, 201);
    const gasto = await res.json();
    assert.equal(gasto.cliente_id, clienteId);
    assert.equal(gasto.descripcion, 'Hosting');
    assert.equal(gasto.monto, 25);
    assert.equal(gasto.fecha, '2026-07-01');
  });
});

test('POST /api/gastos rechaza cliente_id inexistente', async () => {
  const { app } = crearAppDePrueba();

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 9999, descripcion: 'x', monto: 10 }),
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/gastos?cliente_id= filtra por cliente', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteAId = crearCliente(db, { nombre: 'A' });
  const clienteBId = crearCliente(db, { nombre: 'B' });
  db.prepare("INSERT INTO gastos (cliente_id, descripcion, monto, fecha) VALUES (?, 'Gasto A', 1000, '2026-07-01')").run(
    clienteAId
  );
  db.prepare("INSERT INTO gastos (cliente_id, descripcion, monto, fecha) VALUES (?, 'Gasto B', 2000, '2026-07-01')").run(
    clienteBId
  );

  await conServidor(app, async (base) => {
    const gastosA = await (await fetch(`${base}/api/gastos?cliente_id=${clienteAId}`)).json();
    assert.equal(gastosA.length, 1);
    assert.equal(gastosA[0].descripcion, 'Gasto A');
  });
});

test('PUT y DELETE /api/gastos/:id', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const creado = await (
      await fetch(`${base}/api/gastos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, descripcion: 'Original', monto: 10 }),
      })
    ).json();

    const editado = await (
      await fetch(`${base}/api/gastos/${creado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: 'Editado', monto: 15 }),
      })
    ).json();
    assert.equal(editado.descripcion, 'Editado');
    assert.equal(editado.monto, 15);

    const resDelete = await fetch(`${base}/api/gastos/${creado.id}`, { method: 'DELETE' });
    assert.equal(resDelete.status, 204);

    const resGet = await fetch(`${base}/api/gastos/${creado.id}`);
    assert.equal(resGet.status, 404);
  });
});
