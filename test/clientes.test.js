const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAppDePrueba, conServidor, crearCliente, crearProyecto, crearTarea } = require('./helpers');

test('POST y PUT /api/clientes aceptan los datos de la empresa', async () => {
  const { app } = crearAppDePrueba();

  await conServidor(app, async (base) => {
    const creado = await (
      await fetch(`${base}/api/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Bluepeak Software',
          modo_facturacion: 'hora',
          email: 'contacto@bluepeak.io',
          telefono: '+1 415 555 0148',
          industria: 'Tecnología',
          sitio_web: 'bluepeak.io',
          direccion: 'San Francisco, CA',
          contacto_principal: 'Diego Salas — CTO',
          cliente_desde: '2024-01-15',
        }),
      })
    ).json();
    assert.equal(creado.email, 'contacto@bluepeak.io');
    assert.equal(creado.contacto_principal, 'Diego Salas — CTO');
    assert.equal(creado.cliente_desde, '2024-01-15');

    const editado = await (
      await fetch(`${base}/api/clientes/${creado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitio_web: 'bluepeak.com' }),
      })
    ).json();
    assert.equal(editado.sitio_web, 'bluepeak.com');
    assert.equal(editado.email, 'contacto@bluepeak.io'); // sin tocar, se preserva
  });
});

test('GET /api/clientes/:id/resumen agrega horas/ingresos/gastos de todos los proyectos del cliente', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db, { nombre: 'Bluepeak' });
  const proyectoActivoId = crearProyecto(db, {
    clienteId,
    nombre: 'Rediseño',
    estado: 'activo',
    tipo_cobro: 'hora',
    tarifa_hora: 5000,
  });
  const proyectoCompletadoId = crearProyecto(db, {
    clienteId,
    nombre: 'App móvil',
    estado: 'completado',
    tipo_cobro: 'fijo',
    tarifa_hora: null,
    precio_fijo: 20000,
  });

  // proyecto por hora: una tarea pagada (2h * $50 = $100) y una pendiente (3h * $50 = $150)
  const tareaPagadaId = crearTarea(db, proyectoActivoId, { pagado: 1 });
  db.prepare('UPDATE tareas SET horas = 2 WHERE id = ?').run(tareaPagadaId);
  const tareaPendienteId = crearTarea(db, proyectoActivoId, { pagado: 0 });
  db.prepare('UPDATE tareas SET horas = 3 WHERE id = ?').run(tareaPendienteId);
  db.prepare("INSERT INTO gastos (cliente_id, descripcion, monto, fecha) VALUES (?, 'Hosting', 2000, '2026-07-01')").run(
    clienteId
  );

  // proyecto de precio fijo con una sola tarea pagada: se cobra el precio_fijo completo
  crearTarea(db, proyectoCompletadoId, { pagado: 1, estado: 'completada' });

  await conServidor(app, async (base) => {
    const resumen = await (await fetch(`${base}/api/clientes/${clienteId}/resumen`)).json();

    assert.equal(resumen.kpis.proyectos_totales, 2);
    assert.equal(resumen.kpis.proyectos_activos, 1);
    assert.equal(resumen.kpis.total_horas, 5);
    assert.equal(resumen.kpis.ingreso_total, 300); // 100 (hora) + 200 (fijo)
    assert.equal(resumen.kpis.ingreso_pendiente, 150);
    assert.equal(resumen.kpis.total_gastos, 20);
    assert.equal(resumen.kpis.margen, 280);

    assert.equal(resumen.proyectos.length, 2);
    const activo = resumen.proyectos.find((p) => p.id === proyectoActivoId);
    assert.equal(activo.horas, 5);
    assert.equal(activo.tareas_totales, 2);
    assert.equal(activo.tareas_completadas, 0);
    assert.equal(activo.progreso_pct, 0);
    const completado = resumen.proyectos.find((p) => p.id === proyectoCompletadoId);
    assert.equal(completado.tareas_completadas, 1);
    assert.equal(completado.progreso_pct, 100);
    assert.equal(completado.presupuesto_total, 200);

    assert.deepEqual(resumen.actividad, []); // sin eventos todavia
  });
});

test('GET /api/clientes/:id/resumen incluye la actividad generada al registrar tiempo en una tarea', async () => {
  const { app, db } = crearAppDePrueba();
  const clienteId = crearCliente(db);
  const proyectoId = crearProyecto(db, { clienteId });
  const tareaId = crearTarea(db, proyectoId, { nombre: 'Sprint 1' });

  await conServidor(app, async (base) => {
    await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 4, fecha: '2026-07-15' }),
    });

    const resumen = await (await fetch(`${base}/api/clientes/${clienteId}/resumen`)).json();
    assert.equal(resumen.actividad.length, 1);
    assert.equal(resumen.actividad[0].tipo, 'tiempo_registrado');
    assert.equal(resumen.actividad[0].fecha, '2026-07-15');
    assert.match(resumen.actividad[0].descripcion, /Sprint 1/);
  });
});

test('GET /api/clientes/:id/resumen con cliente inexistente devuelve 404', async () => {
  const { app } = crearAppDePrueba();

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/clientes/9999/resumen`);
    assert.equal(res.status, 404);
  });
});
