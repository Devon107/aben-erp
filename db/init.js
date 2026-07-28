const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'tracker.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function initDb() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  migrarGastosFecha(db);

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

module.exports = { initDb, DB_PATH };
