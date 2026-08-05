const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
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

test('POST /api/entradas-tiempo crea la entrada y su primer subregistro', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/entradas-tiempo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 2, descripcion: 'x' }),
    });
    assert.equal(res.status, 201);
    const entrada = await res.json();
    assert.equal(entrada.horas, 2);

    const subregistros = db.prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ?').all(entrada.id);
    assert.equal(subregistros.length, 1);
    assert.equal(subregistros[0].horas, 2);
    assert.equal(subregistros[0].origen, 'manual');
  });
});

test('POST /api/entradas-tiempo/:id/subregistros agrega tiempo y recalcula el total', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const creada = await (
      await fetch(`${base}/api/entradas-tiempo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 1 }),
      })
    ).json();

    const res = await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1.5, origen: 'timer' }),
    });
    assert.equal(res.status, 201);
    const subregistro = await res.json();
    assert.equal(subregistro.horas, 1.5);
    assert.equal(subregistro.origen, 'timer');

    const entradaActualizada = await (await fetch(`${base}/api/entradas-tiempo/${creada.id}`)).json();
    assert.equal(entradaActualizada.horas, 2.5); // 1 + 1.5
  });
});

test('PUT /api/entradas-tiempo/:id/subregistros/:subId edita horas y recalcula', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const creada = await (
      await fetch(`${base}/api/entradas-tiempo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 3 }),
      })
    ).json();
    const [subregistro] = db.prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ?').all(creada.id);

    const res = await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros/${subregistro.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 5 }),
    });
    assert.equal(res.status, 200);
    const editado = await res.json();
    assert.equal(editado.horas, 5);

    const entradaActualizada = await (await fetch(`${base}/api/entradas-tiempo/${creada.id}`)).json();
    assert.equal(entradaActualizada.horas, 5);
  });
});

test('DELETE /api/entradas-tiempo/:id/subregistros/:subId elimina y recalcula (puede llegar a 0)', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const creada = await (
      await fetch(`${base}/api/entradas-tiempo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 2 }),
      })
    ).json();
    const [subregistro] = db.prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ?').all(creada.id);

    const res = await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros/${subregistro.id}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 204);

    const entradaActualizada = await (await fetch(`${base}/api/entradas-tiempo/${creada.id}`)).json();
    assert.equal(entradaActualizada.horas, 0);

    const restantes = db.prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ?').all(creada.id);
    assert.equal(restantes.length, 0);
  });
});

test('GET /api/entradas-tiempo/:id/subregistros lista ordenado, y valida horas/origen', async () => {
  const { app, db } = crearAppDePrueba();
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const creada = await (
      await fetch(`${base}/api/entradas-tiempo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-07-10', horas: 1 }),
      })
    ).json();
    await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1, origen: 'timer' }),
    });

    const lista = await (await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros`)).json();
    assert.equal(lista.length, 2);

    const resHorasInvalidas = await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: -1 }),
    });
    assert.equal(resHorasInvalidas.status, 400);

    const resOrigenInvalido = await fetch(`${base}/api/entradas-tiempo/${creada.id}/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1, origen: 'otro' }),
    });
    assert.equal(resOrigenInvalido.status, 400);
  });
});

test('subregistros de una entrada/id inexistente devuelven 404', async () => {
  const { app } = crearAppDePrueba();

  await conServidor(app, async (base) => {
    const resGet = await fetch(`${base}/api/entradas-tiempo/9999/subregistros`);
    assert.equal(resGet.status, 404);

    const resPost = await fetch(`${base}/api/entradas-tiempo/9999/subregistros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horas: 1 }),
    });
    assert.equal(resPost.status, 404);
  });
});

test('migrarSubregistrosDesdeEntradas rellena subregistros para filas legacy sin tocar su horas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aben-erp-test-'));
  const dbPath = path.join(dir, 'legacy.db');
  const db = initDb(dbPath); // crea el schema completo, incluyendo subregistros_tiempo
  const proyectoId = crearProyecto(db);

  // Simula una fila "legacy" insertada antes de que existiera subregistros_tiempo:
  // se inserta directo en entradas_tiempo, sin pasar por el POST de la API.
  const entradaId = db
    .prepare("INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, origen) VALUES (?, '2026-05-01', 7.5, 'manual')")
    .run(proyectoId).lastInsertRowid;

  // Re-correr initDb sobre el mismo archivo dispara la migracion de backfill.
  db.close();
  const db2 = initDb(dbPath);

  const subregistros = db2.prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ?').all(entradaId);
  assert.equal(subregistros.length, 1);
  assert.equal(subregistros[0].horas, 7.5);
  assert.equal(subregistros[0].origen, 'manual');

  const entrada = db2.prepare('SELECT horas FROM entradas_tiempo WHERE id = ?').get(entradaId);
  assert.equal(entrada.horas, 7.5); // el backfill no altera el valor preexistente
});

// SQLite no permite ALTER TABLE ADD COLUMN NOT NULL DEFAULT CURRENT_TIMESTAMP
// en una tabla con filas, asi que migrarEntradasTiempoTimestamps agrega la
// columna sin default y la rellena aparte (ver db/init.js). Eso deja la
// columna SIN default a nivel de schema en bases migradas — si el INSERT de
// POST /api/entradas-tiempo no seteara creado_en/actualizado_en de forma
// explicita, las filas nuevas quedarian con esos campos en NULL. Este test
// simula exactamente ese escenario (tabla creada "a mano" sin las columnas,
// como quedaria una base real antes de este cambio).
test('POST /api/entradas-tiempo en una base migrada via ALTER TABLE igual setea creado_en/actualizado_en', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aben-erp-test-'));
  const dbPath = path.join(dir, 'legacy-timestamps.db');

  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE entradas_tiempo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      horas REAL NOT NULL DEFAULT 0,
      descripcion TEXT,
      origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
      pagado INTEGER NOT NULL DEFAULT 0
    );
  `);
  raw.close();

  const db = initDb(dbPath); // dispara migrarEntradasTiempoTimestamps via ALTER TABLE
  const app = createApp(db);
  const proyectoId = crearProyecto(db);

  await conServidor(app, async (base) => {
    const res = await fetch(`${base}/api/entradas-tiempo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, fecha: '2026-08-05', horas: 1 }),
    });
    assert.equal(res.status, 201);
    const entrada = await res.json();
    assert.ok(entrada.creado_en, 'creado_en no deberia quedar null en una base migrada');
    assert.ok(entrada.actualizado_en, 'actualizado_en no deberia quedar null en una base migrada');
  });
});
