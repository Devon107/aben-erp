const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor, crearCliente, crearProyecto, crearTarea } = require('./helpers');

test('POST /api/proyectos rechaza estado invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, nombre: 'P', estado: 'inexistente' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/proyectos rechaza tipo_cobro invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, nombre: 'P', tipo_cobro: 'otro' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/proyectos acepta tipo_cobro/tarifa_hora/precio_fijo (el precio vive en el proyecto, no en las tareas)', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const porHora = await (
      await fetch(`${base}/api/proyectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, nombre: 'Por hora', tipo_cobro: 'hora', tarifa_hora: 50 }),
      })
    ).json();
    assert.equal(porHora.tipo_cobro, 'hora');
    assert.equal(porHora.tarifa_hora, 50);
    assert.equal(porHora.precio_fijo, null);

    const fijo = await (
      await fetch(`${base}/api/proyectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, nombre: 'Fijo', tipo_cobro: 'fijo', precio_fijo: 5000 }),
      })
    ).json();
    assert.equal(fijo.tipo_cobro, 'fijo');
    assert.equal(fijo.precio_fijo, 5000);
  });
});

test('PUT /api/proyectos/:id actualiza nombre, estado y precio', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'hora', tarifa_hora: 1000 });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Nuevo nombre', estado: 'pausado', tipo_cobro: 'fijo', precio_fijo: 8000 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.nombre, 'Nuevo nombre');
    assert.equal(body.estado, 'pausado');
    assert.equal(body.tipo_cobro, 'fijo');
    assert.equal(body.precio_fijo, 8000);
  });
});

test('POST /api/tareas rechaza pagado con tipo invalido', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'T', pagado: 'si' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/tareas rechaza horas_estimadas negativas', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'T', horas_estimadas: -1 }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/tareas crea la tarea sin depender de ningun cronometro (horas arranca en 0, sin precio propio)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, nombre: 'Nueva tarea', horas_estimadas: 10, fecha_limite: '2026-09-01' }),
    });
    assert.equal(res.status, 201);
    const tarea = await res.json();
    assert.equal(tarea.nombre, 'Nueva tarea');
    assert.equal(tarea.horas, 0);
    assert.equal(tarea.horas_estimadas, 10);
    assert.equal(tarea.pagado, false);
    assert.equal(tarea.fecha_cobro, null);
    assert.equal(tarea.fecha_limite, '2026-09-01');
    assert.equal(tarea.estado, 'pendiente');
    assert.equal(tarea.tipo_cobro, undefined); // el precio ya no vive en la tarea
  });
});

test('PUT /api/tareas/:id marca pagado=true y setea fecha_cobro (usa hoy si no se manda)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: 5000 });
  const tareaId = crearTarea(db, proyectoId);

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

test('PUT /api/tareas/marcar-pagadas marca solo las no pagadas, ignora ids ya pagados o inexistentes', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: 9000 });
  const tareaAId = crearTarea(db, proyectoId, { nombre: 'A' });
  const tareaBId = crearTarea(db, proyectoId, { nombre: 'B' });
  const tareaYaPagadaId = crearTarea(db, proyectoId, { nombre: 'C', pagado: 1, fecha_cobro: '2026-01-01' });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas/marcar-pagadas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [tareaAId, tareaBId, tareaYaPagadaId, 999999], fecha_cobro: '2026-08-10' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.actualizadas.sort(), [tareaAId, tareaBId].sort());
  });

  const tareaA = db.prepare('SELECT * FROM tareas WHERE id = ?').get(tareaAId);
  const tareaB = db.prepare('SELECT * FROM tareas WHERE id = ?').get(tareaBId);
  assert.equal(tareaA.pagado, 1);
  assert.equal(tareaA.fecha_cobro, '2026-08-10');
  assert.equal(tareaB.pagado, 1);
  // la ya pagada conserva su fecha_cobro original, no se toca
  const tareaYaPagada = db.prepare('SELECT * FROM tareas WHERE id = ?').get(tareaYaPagadaId);
  assert.equal(tareaYaPagada.fecha_cobro, '2026-01-01');

  const actividades = db.prepare("SELECT * FROM actividades WHERE tipo = 'pagado' ORDER BY tarea_id").all();
  assert.equal(actividades.length, 2); // solo A y B, no la ya pagada
});

test('GET /api/proyectos/:id/resumen (por hora): ingreso/pendiente = horas pagadas/pendientes * tarifa del proyecto', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'hora', tarifa_hora: 5000 });
  const tareaAId = crearTarea(db, proyectoId, { nombre: 'A', pagado: 1 });
  db.prepare('UPDATE tareas SET horas = 2 WHERE id = ?').run(tareaAId);
  const tareaBId = crearTarea(db, proyectoId, { nombre: 'B', pagado: 0 });
  db.prepare('UPDATE tareas SET horas = 3 WHERE id = ?').run(tareaBId);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/resumen`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_horas, 5);
    assert.equal(body.ingreso_total, 100); // 2h * $50
    assert.equal(body.ingreso_pendiente, 150); // 3h * $50
  });
});

test('GET /api/proyectos/:id/resumen (precio fijo): cada tarea pagada aporta precio_fijo/tareas_totales', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: 40000 }); // $400
  crearTarea(db, proyectoId, { nombre: 'A', pagado: 1 });
  crearTarea(db, proyectoId, { nombre: 'B', pagado: 1 });
  crearTarea(db, proyectoId, { nombre: 'C', pagado: 0 });
  crearTarea(db, proyectoId, { nombre: 'D', pagado: 0 });

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/resumen`);
    const body = await res.json();
    // 2 de 4 tareas pagadas -> mitad del precio fijo cobrada, mitad pendiente
    assert.equal(body.ingreso_total, 200);
    assert.equal(body.ingreso_pendiente, 200);
  });
});

test('GET /api/proyectos/:id/resumen calcula progreso_horas_pct sobre tareas con horas_estimadas', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db, { tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: 10000 });
  const tareaAId = crearTarea(db, proyectoId, { nombre: 'A', horas_estimadas: 10 });
  db.prepare('UPDATE tareas SET horas = 5 WHERE id = ?').run(tareaAId);
  const tareaBId = crearTarea(db, proyectoId, { nombre: 'B', horas_estimadas: 10 });
  db.prepare('UPDATE tareas SET horas = 5 WHERE id = ?').run(tareaBId);
  // tarea sin horas_estimadas: no entra en el cálculo de progreso_horas_pct
  const tareaCId = crearTarea(db, proyectoId, { nombre: 'C' });
  db.prepare('UPDATE tareas SET horas = 100 WHERE id = ?').run(tareaCId);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/${proyectoId}/resumen`);
    const body = await res.json();
    assert.equal(body.horas_estimadas_total, 20);
    assert.equal(body.horas_trabajadas_estimables, 10);
    assert.equal(body.progreso_horas_pct, 50);
  });
});

test('GET /api/proyectos/:id/resumen con proyecto inexistente devuelve 404', async () => {
  const { app } = crearAppDePrueba();
  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/proyectos/9999/resumen`);
    assert.equal(res.status, 404);
  });
});

test('POST y PUT /api/proyectos aceptan fecha_inicio y fecha_entrega_estimada', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const creado = await (
      await fetch(`${base}/api/proyectos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          nombre: 'P',
          fecha_inicio: '2026-03-03',
          fecha_entrega_estimada: '2026-08-28',
        }),
      })
    ).json();
    assert.equal(creado.fecha_inicio, '2026-03-03');
    assert.equal(creado.fecha_entrega_estimada, '2026-08-28');

    const editado = await (
      await fetch(`${base}/api/proyectos/${creado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_entrega_estimada: '2026-09-15' }),
      })
    ).json();
    assert.equal(editado.fecha_inicio, '2026-03-03'); // sin tocar, se preserva
    assert.equal(editado.fecha_entrega_estimada, '2026-09-15');
  });
});

test('PUT /api/tareas/:id registra actividad "estado_cambiado" solo cuando el estado realmente cambia', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId, { nombre: 'Wireframes', estado: 'pendiente' });

  await conServidor(app, async (base) => {
    await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'en_curso' }),
    });
    // segundo PUT sin cambiar el estado: no debe agregar otra actividad
    await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'en_curso' }),
    });
  });

  const actividades = db.prepare("SELECT * FROM actividades WHERE tarea_id = ? AND tipo = 'estado_cambiado'").all(tareaId);
  assert.equal(actividades.length, 1);
  assert.match(actividades[0].descripcion, /Wireframes/);
  assert.match(actividades[0].descripcion, /en_curso/);
});

test('PUT /api/tareas/:id registra actividad "pagado" solo en la transicion pendiente->pagada', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId, { nombre: 'Auditoría', pagado: 0 });

  await conServidor(app, async (base) => {
    await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: true, fecha_cobro: '2026-08-01' }),
    });
    // despagar y volver a pagar no cuenta como una transicion nueva 0->1 en el mismo PUT que ya la despago
    await fetch(`${base}/api/tareas/${tareaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: false }),
    });
  });

  const actividades = db.prepare("SELECT * FROM actividades WHERE tarea_id = ? AND tipo = 'pagado'").all(tareaId);
  assert.equal(actividades.length, 1);
  assert.equal(actividades[0].fecha, '2026-08-01');
  assert.match(actividades[0].descripcion, /Auditoría/);
});

test('POST /api/gastos rechaza monto negativo', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/gastos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, descripcion: 'x', monto: -5 }),
    });
    assert.equal(res.status, 400);
  });
});
