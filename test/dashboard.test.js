const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor, crearProyecto, crearTarea, crearSubregistro } = require('./helpers');

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
  const proyectoId = db
    .prepare("INSERT INTO proyectos (cliente_id, nombre, estado) VALUES (?, 'Proyecto Test', 'activo')")
    .run(clienteId).lastInsertRowid;

  // tarea pagada: 6h * $50/h = $300 de ingreso, dentro del rango.
  const tareaPagadaId = crearTarea(db, proyectoId, { nombre: 'Pagada', tipo_cobro: 'hora', tarifa_hora: 5000, pagado: 1 });
  crearSubregistro(db, tareaPagadaId, 6, '2026-07-10');
  db.prepare('UPDATE tareas SET horas = 6 WHERE id = ?').run(tareaPagadaId);

  // tarea pendiente: 4h * $50/h = $200 de pendiente, dentro del rango.
  const tareaPendienteId = crearTarea(db, proyectoId, { nombre: 'Pendiente', tipo_cobro: 'hora', tarifa_hora: 5000, pagado: 0 });
  crearSubregistro(db, tareaPendienteId, 4, '2026-07-12');
  db.prepare('UPDATE tareas SET horas = 4 WHERE id = ?').run(tareaPendienteId);

  // Fuera de rango: no debe contarse en el resultado (ni horas ni ingreso).
  const tareaFueraId = crearTarea(db, proyectoId, { nombre: 'Fuera de rango', tipo_cobro: 'hora', tarifa_hora: 5000, pagado: 1 });
  crearSubregistro(db, tareaFueraId, 5, '2026-06-01');
  db.prepare('UPDATE tareas SET horas = 5 WHERE id = ?').run(tareaFueraId);

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
    assert.equal(c.ingreso_pendiente, 200);
    assert.equal(c.total_gastos, 100);
    assert.equal(c.margen, 200);
    assert.ok(Array.isArray(body.tendenciaMensual));
    assert.ok(Array.isArray(body.tareasPendientes));
    assert.ok(Array.isArray(body.proyectosEnRiesgo));
  });
});

test('GET /api/dashboard: tarea de precio fijo solo aporta ingreso si esta marcada pagada', async () => {
  const { app, db } = crearAppDePrueba();

  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('Cliente Fijo', 'proyecto')")
    .run().lastInsertRowid;
  const proyectoId = db
    .prepare("INSERT INTO proyectos (cliente_id, nombre, estado) VALUES (?, 'Proyecto Fijo', 'activo')")
    .run(clienteId).lastInsertRowid;
  const tareaId = crearTarea(db, proyectoId, {
    nombre: 'Entrega fija',
    tipo_cobro: 'fijo',
    precio_fijo: 100000, // $1000.00
    tarifa_hora: null,
    pagado: 0,
  });
  crearSubregistro(db, tareaId, 3, '2026-07-10');
  db.prepare('UPDATE tareas SET horas = 3 WHERE id = ?').run(tareaId);

  await conServidor(app, async (base) => {
    const res1 = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    const body1 = await res1.json();
    assert.equal(body1.clientes[0].ingreso_total, 0);
    assert.equal(body1.clientes[0].ingreso_pendiente, 1000);

    db.prepare('UPDATE tareas SET pagado = 1 WHERE id = ?').run(tareaId);

    const res2 = await fetch(`${base}/api/dashboard?desde=2026-07-01&hasta=2026-07-31`);
    const body2 = await res2.json();
    assert.equal(body2.clientes[0].ingreso_total, 1000);
    assert.equal(body2.clientes[0].ingreso_pendiente, 0);
  });
});

test('GET /api/dashboard: tareasPendientes lista tareas no pagadas de cualquier proyecto', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  crearTarea(db, proyectoId, { nombre: 'Sin cobrar', tipo_cobro: 'fijo', precio_fijo: 8000, tarifa_hora: null, pagado: 0 });
  crearTarea(db, proyectoId, { nombre: 'Ya cobrada', tipo_cobro: 'fijo', precio_fijo: 5000, tarifa_hora: null, pagado: 1 });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard?desde=2026-01-01&hasta=2026-12-31`);
    const body = await res.json();
    const nombres = body.tareasPendientes.map((t) => t.nombre);
    assert.ok(nombres.includes('Sin cobrar'));
    assert.ok(!nombres.includes('Ya cobrada'));
  });
});

test('GET /api/dashboard: proyectosEnRiesgo incluye proyectos con tareas no completadas vencidas', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  crearTarea(db, proyectoId, { nombre: 'Vencida', estado: 'pendiente', fecha_limite: '2000-01-01' });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/dashboard?desde=2026-01-01&hasta=2026-12-31`);
    const body = await res.json();
    assert.equal(body.proyectosEnRiesgo.length, 1);
    assert.equal(body.proyectosEnRiesgo[0].vencido, true);
  });
});
