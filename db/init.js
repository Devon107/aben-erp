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

  return db;
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

module.exports = { initDb, DB_PATH };
