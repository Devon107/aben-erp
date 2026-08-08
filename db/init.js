const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'tracker.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function initDb(dbPath = DB_PATH) {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  migrarGastosFecha(db);
  migrarMontosACentavos(db, dbPath);
  migrarEntradasTiempoPagado(db);
  migrarEntradasTiempoTimestamps(db);
  migrarSubregistrosDesdeEntradas(db);
  migrarEntradasATareas(db, dbPath);
  // Recién acá subregistros_tiempo.tarea_id existe siempre (fresh o
  // migrada) — ver nota en schema.sql sobre por qué este índice no vive ahí.
  db.exec('CREATE INDEX IF NOT EXISTS idx_subregistros_tiempo_tarea_id ON subregistros_tiempo(tarea_id)');

  return db;
}

function tablaExiste(db, tabla) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tabla);
}

// Bases de datos creadas antes de que 'gastos' tuviera columna 'fecha' necesitan
// esta migración: SQLite no permite ALTER TABLE ... ADD COLUMN NOT NULL con
// expresiones no constantes, así que se agrega nullable y se rellena aparte.
function migrarGastosFecha(db) {
  const columnas = db.prepare('PRAGMA table_info(gastos)').all();
  const tieneFecha = columnas.some((c) => c.name === 'fecha');
  if (!tieneFecha) {
    db.exec('ALTER TABLE gastos ADD COLUMN fecha TEXT');
    db.exec("UPDATE gastos SET fecha = date('now') WHERE fecha IS NULL");
  }
}

// Bases de datos creadas antes de que entradas_tiempo trackeara el estado de
// pago necesitan esta migracion. A diferencia de migrarMontosACentavos, no
// hace falta reconstruir la tabla: SQLite permite ADD COLUMN con un default
// constante directamente.
function migrarEntradasTiempoPagado(db) {
  if (!tablaExiste(db, 'entradas_tiempo')) return; // ya migrada a `tareas` (ver migrarEntradasATareas)
  const columnas = db.prepare('PRAGMA table_info(entradas_tiempo)').all();
  const tienePagado = columnas.some((c) => c.name === 'pagado');
  if (!tienePagado) {
    db.exec('ALTER TABLE entradas_tiempo ADD COLUMN pagado INTEGER NOT NULL DEFAULT 0');
  }
}

// Bases de datos creadas antes de trackear cuando se crea/actualiza cada
// entrada de tiempo necesitan esta migracion. SQLite rechaza ADD COLUMN NOT
// NULL DEFAULT CURRENT_TIMESTAMP en una tabla con filas (lo trata como
// default no-constante), asi que se agrega nullable y se rellena aparte
// (mismo patron que migrarGastosFecha). Para las filas preexistentes esto
// deja creado_en/actualizado_en en el momento de la migracion, no en su
// fecha real de creacion (nunca se trackeo).
function migrarEntradasTiempoTimestamps(db) {
  if (!tablaExiste(db, 'entradas_tiempo')) return; // ya migrada a `tareas` (ver migrarEntradasATareas)
  const columnas = db.prepare('PRAGMA table_info(entradas_tiempo)').all();
  if (!columnas.some((c) => c.name === 'creado_en')) {
    db.exec('ALTER TABLE entradas_tiempo ADD COLUMN creado_en TEXT');
    db.exec("UPDATE entradas_tiempo SET creado_en = datetime('now') WHERE creado_en IS NULL");
  }
  if (!columnas.some((c) => c.name === 'actualizado_en')) {
    db.exec('ALTER TABLE entradas_tiempo ADD COLUMN actualizado_en TEXT');
    db.exec("UPDATE entradas_tiempo SET actualizado_en = datetime('now') WHERE actualizado_en IS NULL");
  }
}

// Backfill: entradas_tiempo.horas pasa a ser la suma de subregistros_tiempo.
// Toda fila que todavia no tenga ningun subregistro (bases de datos previas a
// este cambio) recibe uno que replica su horas/origen actuales, para que la
// suma quede exactamente igual al valor que ya tenia — no se pierde ni se
// altera ningun dato existente.
function migrarSubregistrosDesdeEntradas(db) {
  if (!tablaExiste(db, 'entradas_tiempo')) return; // ya migrada a `tareas` (ver migrarEntradasATareas)
  const sinSubregistros = db
    .prepare(
      `SELECT e.id, e.horas, e.origen, e.creado_en
       FROM entradas_tiempo e
       LEFT JOIN subregistros_tiempo s ON s.entrada_tiempo_id = e.id
       WHERE s.id IS NULL`
    )
    .all();
  if (sinSubregistros.length === 0) return;

  const insertar = db.prepare(
    `INSERT INTO subregistros_tiempo (entrada_tiempo_id, horas, origen, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?)`
  );
  const backfill = db.transaction((filas) => {
    for (const fila of filas) {
      insertar.run(fila.id, fila.horas, fila.origen, fila.creado_en, fila.creado_en);
    }
  });
  backfill(sinSubregistros);
}

function tipoColumna(db, tabla, columna) {
  const info = db.prepare(`PRAGMA table_info(${tabla})`).all();
  return info.find((c) => c.name === columna)?.type;
}

// Bases de datos creadas antes de que proyectos.tarifa_hora/precio_fijo y
// gastos.monto pasaran de REAL (dólares) a INTEGER (centavos) necesitan esta
// migración. SQLite no permite cambiar el tipo de una columna existente, así
// que cada tabla se reconstruye entera (procedimiento recomendado por SQLite
// para cambios de schema: https://www.sqlite.org/lang_altertable.html).
// Antes de tocar nada se hace una copia de respaldo del archivo .db.
function migrarMontosACentavos(db, dbPath) {
  const necesitaProyectos = tipoColumna(db, 'proyectos', 'tarifa_hora') === 'REAL';
  const necesitaGastos = tipoColumna(db, 'gastos', 'monto') === 'REAL';
  if (!necesitaProyectos && !necesitaGastos) return;

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  // foreign_keys debe apagarse fuera de la transacción: SQLite ignora cambios
  // a ese pragma mientras hay una transacción activa.
  db.pragma('foreign_keys = OFF');
  try {
    const migrar = db.transaction(() => {
      if (necesitaProyectos) {
        db.exec(`
          CREATE TABLE proyectos_nuevo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            tipo_cobro TEXT NOT NULL CHECK (tipo_cobro IN ('hora', 'fijo')),
            tarifa_hora INTEGER,
            precio_fijo INTEGER,
            estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
          );
          INSERT INTO proyectos_nuevo (id, cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado)
          SELECT
            id, cliente_id, nombre, tipo_cobro,
            CASE WHEN tarifa_hora IS NULL THEN NULL ELSE CAST(ROUND(tarifa_hora * 100) AS INTEGER) END,
            CASE WHEN precio_fijo IS NULL THEN NULL ELSE CAST(ROUND(precio_fijo * 100) AS INTEGER) END,
            estado
          FROM proyectos;
          DROP TABLE proyectos;
          ALTER TABLE proyectos_nuevo RENAME TO proyectos;
          CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
        `);
      }
      if (necesitaGastos) {
        db.exec(`
          CREATE TABLE gastos_nuevo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL,
            descripcion TEXT NOT NULL,
            monto INTEGER NOT NULL,
            fecha TEXT NOT NULL DEFAULT (date('now')),
            FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
          );
          INSERT INTO gastos_nuevo (id, proyecto_id, descripcion, monto, fecha)
          SELECT id, proyecto_id, descripcion, CAST(ROUND(monto * 100) AS INTEGER), fecha
          FROM gastos;
          DROP TABLE gastos;
          ALTER TABLE gastos_nuevo RENAME TO gastos;
          CREATE INDEX IF NOT EXISTS idx_gastos_proyecto_id ON gastos(proyecto_id);
        `);
      }
    });
    migrar();

    const violaciones = db.pragma('foreign_key_check');
    if (violaciones.length > 0) {
      throw new Error(`migrarMontosACentavos dejo referencias invalidas: ${JSON.stringify(violaciones)}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// Bases de datos creadas antes de que 'tarea' existiera como entidad propia:
// tipo_cobro/tarifa_hora/precio_fijo/pagado vivian en proyectos y cada fila
// de entradas_tiempo era, en la practica, una tarea (su descripcion). Esta
// migracion reconstruye entradas_tiempo -> tareas 1:1 (sin perder el pagado
// individual que ya tenia cada fila), heredando el tipo de cobro del
// proyecto padre al momento de migrar, y renombra
// subregistros_tiempo.entrada_tiempo_id -> tarea_id agregando la columna
// `fecha` (backfillada con la fecha de su entrada_tiempo padre, la mejor
// aproximacion disponible para datos historicos). Sigue el mismo patron que
// migrarMontosACentavos: rebuild completo de tabla, con backup de archivo y
// foreign_key_check al final.
function migrarEntradasATareas(db, dbPath) {
  if (!tablaExiste(db, 'entradas_tiempo')) return; // ya migrado, o instalacion nueva

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.pre-tareas.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  db.pragma('foreign_keys = OFF');
  try {
    const migrar = db.transaction(() => {
      // `tareas` ya existe con el shape nuevo: la crea schema.sql (CREATE
      // TABLE IF NOT EXISTS) antes de llegar acá, porque en una base vieja
      // todavía no existía. Solo hace falta poblarla.
      db.exec(`
        INSERT INTO tareas (id, proyecto_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado, pagado, fecha_cobro, horas, creado_en, actualizado_en)
        SELECT
          e.id, e.proyecto_id, COALESCE(NULLIF(TRIM(e.descripcion), ''), 'Sesión de trabajo'),
          p.tipo_cobro, p.tarifa_hora, p.precio_fijo,
          CASE WHEN e.pagado = 1 THEN 'completada' ELSE 'pendiente' END,
          e.pagado, NULL, e.horas, e.creado_en, e.actualizado_en
        FROM entradas_tiempo e
        JOIN proyectos p ON p.id = e.proyecto_id;
      `);

      db.exec(`
        CREATE TABLE subregistros_tiempo_nuevo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tarea_id INTEGER NOT NULL,
          horas REAL NOT NULL,
          fecha TEXT NOT NULL DEFAULT (date('now')),
          origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
          creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
        );
        INSERT INTO subregistros_tiempo_nuevo (id, tarea_id, horas, fecha, origen, creado_en, actualizado_en)
        SELECT s.id, s.entrada_tiempo_id, s.horas, e.fecha, s.origen, s.creado_en, s.actualizado_en
        FROM subregistros_tiempo s
        JOIN entradas_tiempo e ON e.id = s.entrada_tiempo_id;
        DROP TABLE subregistros_tiempo;
        ALTER TABLE subregistros_tiempo_nuevo RENAME TO subregistros_tiempo;
        CREATE INDEX IF NOT EXISTS idx_subregistros_tiempo_tarea_id ON subregistros_tiempo(tarea_id);
      `);

      db.exec(`
        CREATE TABLE proyectos_nuevo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER NOT NULL,
          nombre TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        INSERT INTO proyectos_nuevo (id, cliente_id, nombre, estado)
        SELECT id, cliente_id, nombre, estado FROM proyectos;
        DROP TABLE proyectos;
        ALTER TABLE proyectos_nuevo RENAME TO proyectos;
        CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
        CREATE INDEX IF NOT EXISTS idx_tareas_proyecto_id ON tareas(proyecto_id);
      `);

      db.exec('DROP TABLE entradas_tiempo;');
    });
    migrar();

    const violaciones = db.pragma('foreign_key_check');
    if (violaciones.length > 0) {
      throw new Error(`migrarEntradasATareas dejo referencias invalidas: ${JSON.stringify(violaciones)}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

module.exports = { initDb, DB_PATH };
