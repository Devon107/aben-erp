const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const { initDb } = require('../db/init');
const { crearAppDePrueba, conServidor, crearProyecto, crearTarea } = require('./helpers');

test('POST /api/tareas/:id/subregistros agrega tiempo y recalcula el total (con fecha)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1.5, fecha: '2026-07-10', origen: 'timer' }),
    });
    assert.equal(res.status, 201);
    const subregistro = await res.json();
    assert.equal(subregistro.horas, 1.5);
    assert.equal(subregistro.fecha, '2026-07-10');
    assert.equal(subregistro.origen, 'timer');

    const tareaActualizada = await (await fetch(`${base}/api/tareas/${tareaId}`)).json();
    assert.equal(tareaActualizada.horas, 1.5);
  });
});

test('POST /api/tareas/:id/subregistros usa la fecha de hoy si no se manda', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId);
  const hoy = new Date().toISOString().slice(0, 10);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1 }),
    });
    const subregistro = await res.json();
    assert.equal(subregistro.fecha, hoy);
  });
});

test('PUT /api/tareas/:id/subregistros/:subId edita horas y fecha, recalcula', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId);

  await conServidor(app, async (base) => {
    const creado = await (
      await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horas: 3, fecha: '2026-07-10' }),
      })
    ).json();

    const res = await fetch(`${base}/api/tareas/${tareaId}/subregistros/${creado.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 5, fecha: '2026-07-11' }),
    });
    assert.equal(res.status, 200);
    const editado = await res.json();
    assert.equal(editado.horas, 5);
    assert.equal(editado.fecha, '2026-07-11');

    const tareaActualizada = await (await fetch(`${base}/api/tareas/${tareaId}`)).json();
    assert.equal(tareaActualizada.horas, 5);
  });
});

test('DELETE /api/tareas/:id/subregistros/:subId elimina y recalcula (puede llegar a 0)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId);

  await conServidor(app, async (base) => {
    const creado = await (
      await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horas: 2, fecha: '2026-07-10' }),
      })
    ).json();

    const res = await fetch(`${base}/api/tareas/${tareaId}/subregistros/${creado.id}`, { method: 'DELETE' });
    assert.equal(res.status, 204);

    const tareaActualizada = await (await fetch(`${base}/api/tareas/${tareaId}`)).json();
    assert.equal(tareaActualizada.horas, 0);
  });
});

test('GET /api/tareas/:id/subregistros lista ordenado, y valida horas/origen', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);
  const tareaId = crearTarea(db, proyectoId);

  await conServidor(app, async (base) => {
    await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1, fecha: '2026-07-10', origen: 'timer' }),
    });
    await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1, fecha: '2026-07-11' }),
    });

    const lista = await (await fetch(`${base}/api/tareas/${tareaId}/subregistros`)).json();
    assert.equal(lista.length, 2);

    const resHorasInvalidas = await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: -1 }),
    });
    assert.equal(resHorasInvalidas.status, 400);

    const resOrigenInvalido = await fetch(`${base}/api/tareas/${tareaId}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1, origen: 'otro' }),
    });
    assert.equal(resOrigenInvalido.status, 400);
  });
});

test('subregistros de una tarea/id inexistente devuelven 404', async () => {
  const { app } = crearAppDePrueba();

  await conServidor(app, async (base) => {
    const resGet = await fetch(`${base}/api/tareas/9999/subregistros`);
    assert.equal(resGet.status, 404);

    const resPost = await fetch(`${base}/api/tareas/9999/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1 }),
    });
    assert.equal(resPost.status, 404);
  });
});

// Simula el camino de actualizacion completo de una base creada antes de que
// 'tarea' existiera como entidad: proyectos con tipo_cobro/tarifa_hora,
// entradas_tiempo (una con subregistro ya cargado, otra "legacy" sin ningun
// subregistro y sin columnas de timestamp) y subregistros_tiempo con
// entrada_tiempo_id. Un solo initDb() debe encadenar
// migrarEntradasTiempoTimestamps -> migrarSubregistrosDesdeEntradas ->
// migrarEntradasATareas sin perder ni alterar ningun dato existente.
test('migrarEntradasATareas migra entradas_tiempo legacy a tareas, preservando pagado/horas/fecha de subregistros', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aben-erp-test-'));
  const dbPath = path.join(dir, 'legacy-tareas.db');

  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, modo_facturacion TEXT NOT NULL);
    CREATE TABLE proyectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      tipo_cobro TEXT NOT NULL,
      tarifa_hora INTEGER,
      precio_fijo INTEGER,
      estado TEXT NOT NULL DEFAULT 'activo',
      pagado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE entradas_tiempo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      horas REAL NOT NULL DEFAULT 0,
      descripcion TEXT,
      origen TEXT NOT NULL DEFAULT 'manual',
      pagado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE subregistros_tiempo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrada_tiempo_id INTEGER NOT NULL,
      horas REAL NOT NULL,
      origen TEXT NOT NULL DEFAULT 'manual',
      creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const clienteId = raw.prepare("INSERT INTO clientes (nombre, modo_facturacion) VALUES ('C', 'hora')").run()
    .lastInsertRowid;
  const proyectoId = raw
    .prepare("INSERT INTO proyectos (cliente_id, nombre, tipo_cobro, tarifa_hora, estado) VALUES (?, 'P', 'hora', 5000, 'activo')")
    .run(clienteId).lastInsertRowid;
  const entradaPagadaId = raw
    .prepare("INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, descripcion, pagado) VALUES (?, '2026-06-01', 2, 'Sesion A', 1)")
    .run(proyectoId).lastInsertRowid;
  raw.prepare('INSERT INTO subregistros_tiempo (entrada_tiempo_id, horas, origen) VALUES (?, 2, ?)').run(entradaPagadaId, 'manual');
  // entrada legacy sin ningun subregistro (previa a que existiera esa tabla)
  const entradaSinSubId = raw
    .prepare("INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, descripcion, pagado) VALUES (?, '2026-06-05', 4, '', 0)")
    .run(proyectoId).lastInsertRowid;
  raw.close();

  // Un solo initDb encadena: migrarEntradasTiempoTimestamps (agrega
  // creado_en/actualizado_en a entradas_tiempo) -> migrarSubregistrosDesdeEntradas
  // (backfill del subregistro faltante) -> migrarEntradasATareas.
  const db = initDb(dbPath);

  const tareaPagada = db.prepare('SELECT * FROM tareas WHERE id = ?').get(entradaPagadaId);
  assert.equal(tareaPagada.nombre, 'Sesion A');
  assert.equal(tareaPagada.tipo_cobro, 'hora');
  assert.equal(tareaPagada.tarifa_hora, 5000);
  assert.equal(tareaPagada.pagado, 1);
  assert.equal(tareaPagada.estado, 'completada');
  assert.equal(tareaPagada.horas, 2);
  assert.ok(tareaPagada.creado_en, 'creado_en no deberia quedar null tras la migracion de timestamps');

  const tareaSinNombre = db.prepare('SELECT * FROM tareas WHERE id = ?').get(entradaSinSubId);
  assert.equal(tareaSinNombre.nombre, 'Sesión de trabajo'); // descripcion vacia -> nombre por defecto
  assert.equal(tareaSinNombre.estado, 'pendiente');
  assert.equal(tareaSinNombre.horas, 4); // el backfill de subregistro no altera el valor preexistente

  const subsTareaPagada = db.prepare('SELECT * FROM subregistros_tiempo WHERE tarea_id = ?').all(entradaPagadaId);
  assert.equal(subsTareaPagada.length, 1);
  assert.equal(subsTareaPagada[0].fecha, '2026-06-01'); // heredada de la entrada padre

  const subsTareaSinSub = db.prepare('SELECT * FROM subregistros_tiempo WHERE tarea_id = ?').all(entradaSinSubId);
  assert.equal(subsTareaSinSub.length, 1); // backfill de migrarSubregistrosDesdeEntradas
  assert.equal(subsTareaSinSub[0].horas, 4);
  assert.equal(subsTareaSinSub[0].fecha, '2026-06-05');

  const tablas = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  assert.ok(!tablas.includes('entradas_tiempo'));

  const proyectoCols = db.prepare('PRAGMA table_info(proyectos)').all().map((c) => c.name);
  assert.ok(!proyectoCols.includes('tipo_cobro'));

  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
