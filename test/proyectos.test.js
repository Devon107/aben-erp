const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor, crearProyecto, crearTarea } = require('./helpers');

test('POST /api/proyectos rechaza estado invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = db
    .prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')")
    .run().lastInsertRowid;

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, nombre: 'P', estado: 'inexistente' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/proyectos/:id actualiza nombre y estado (sin campos de cobro: eso vive en las tareas)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Nuevo nombre', estado: 'pausado' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.nombre, 'Nuevo nombre');
    assert.equal(body.estado, 'pausado');
    assert.equal(body.tipo_cobro, undefined);
  });
});

test('POST /api/tareas rechaza tipo_cobro invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'T', tipo_cobro: 'otro' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/tareas rechaza pagado con tipo invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'T', tipo_cobro: 'hora', tarifa_hora: 10, pagado: 'si' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/tareas crea la tarea sin depender de ningun cronometro (horas arranca en 0)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'Nueva tarea', tipo_cobro: 'hora', tarifa_hora: 25, fecha_limite: '2026-09-01' }),
    });
    assert.equal(res.status, 201);
    const tarea = await res.json();
    assert.equal(tarea.nombre, 'Nueva tarea');
    assert.equal(tarea.horas, 0);
    assert.equal(tarea.pagado, false);
    assert.equal(tarea.fecha_cobro, null);
    assert.equal(tarea.fecha_limite, '2026-09-01');
    assert.equal(tarea.estado, 'pendiente');
  });
});

test('PUT /api/tareas/:id marca pagado=true y setea fecha_cobro (usa hoy si no se manda)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId, { tipo_cobro: 'fijo', precio_fijo: 5000, tarifa_hora: null });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pagado, true);
    assert.ok(body.fecha_cobro, 'fecha_cobro deberia quedar seteada al marcar pagado');
  });
});

test('PUT /api/tareas/:id marca pagado=false y limpia fecha_cobro', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId, { pagado: 1, fecha_cobro: '2026-08-01' });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pagado, false);
    assert.equal(body.fecha_cobro, null);
  });
});

test('GET /api/proyectos/:id/rentabilidad agrega ingreso/pendiente sumando sobre las tareas del proyecto', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  // tarea por hora, pagada: 2h * $50 = $100 de ingreso
  const tareaAId = crearTarea(db, proyectoId, { nombre: 'A', tipo_cobro: 'hora', tarifa_hora: 5000, pagado: 1 });
  db.prepare('UPDATE tareas SET horas = 2 WHERE id = ?').run(tareaAId);
  // tarea por hora, pendiente: 3h * $50 = $150 de pendiente
  const tareaBId = crearTarea(db, proyectoId, { nombre: 'B', tipo_cobro: 'hora', tarifa_hora: 5000, pagado: 0 });
  db.prepare('UPDATE tareas SET horas = 3 WHERE id = ?').run(tareaBId);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/rentabilidad`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_horas, 5);
    assert.equal(body.ingreso_total, 100);
    assert.equal(body.ingreso_pendiente, 150);
  });
});

test('GET /api/proyectos/:id/rentabilidad presupuesto_total suma precio_fijo de las tareas de precio fijo', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  crearTarea(db, proyectoId, { nombre: 'Fija A', tipo_cobro: 'fijo', precio_fijo: 20000, tarifa_hora: null });
  crearTarea(db, proyectoId, { nombre: 'Fija B', tipo_cobro: 'fijo', precio_fijo: 30000, tarifa_hora: null });
  crearTarea(db, proyectoId, { nombre: 'Por hora', tipo_cobro: 'hora', tarifa_hora: 1000 });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/rentabilidad`);
    const body = await res.json();
    assert.equal(body.presupuesto_total, 500); // (200 + 300) en dolares
  });
});

test('POST /api/gastos rechaza monto negativo', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, descripcion: 'x', monto: -5 }),
    });
    assert.equal(res.status, 400);
  });
});
