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
  migrarClientesDatosEmpresa(db);
  migrarProyectosFechas(db);
  migrarPrecioAProyectoYGastosACliente(db, dbPath);
  // Recién acá gastos.cliente_id existe siempre (fresh o migrada) — ver nota
  // en schema.sql sobre por qué este índice no vive ahí.
  db.exec('CREATE INDEX IF NOT EXISTS idx_gastos_cliente_id ON gastos(cliente_id)');

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

// Bases de datos creadas antes de que clientes tuviera datos de contacto/
// empresa necesitan esta migracion. Mismo patron que migrarGastosFecha:
// cliente_desde no puede ir con un DEFAULT no constante en ADD COLUMN, asi
// que se agrega nullable y se rellena aparte con la fecha de la migracion
// (no se trackeaba antes, es la mejor aproximacion disponible). El resto de
// los campos quedan NULL hasta que se editen a mano.
function migrarClientesDatosEmpresa(db) {
  const columnas = db.prepare('PRAGMA table_info(clientes)').all();
  const nombres = columnas.map((c) => c.name);
  for (const campo of ['email', 'telefono', 'industria', 'sitio_web', 'direccion', 'contacto_principal']) {
    if (!nombres.includes(campo)) {
      db.exec(`ALTER TABLE clientes ADD COLUMN ${campo} TEXT`);
    }
  }
  if (!nombres.includes('cliente_desde')) {
    db.exec('ALTER TABLE clientes ADD COLUMN cliente_desde TEXT');
    db.exec("UPDATE clientes SET cliente_desde = date('now') WHERE cliente_desde IS NULL");
  }
}

// Bases de datos creadas antes de que proyectos trackeara fechas de
// inicio/entrega estimada. Informativas, sin backfill (quedan NULL en
// proyectos existentes hasta que se editen a mano).
function migrarProyectosFechas(db) {
  const columnas = db.prepare('PRAGMA table_info(proyectos)').all();
  const nombres = columnas.map((c) => c.name);
  for (const campo of ['fecha_inicio', 'fecha_entrega_estimada']) {
    if (!nombres.includes(campo)) {
      db.exec(`ALTER TABLE proyectos ADD COLUMN ${campo} TEXT`);
    }
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
// subregistros_tiempo.tarea_id existe <=> la migracion entradas_tiempo ->
// tareas ya se corrio sobre esta base — a partir de ahi entradas_tiempo, si
// reaparece, es un remanente vacio (ver migrarEntradasATareas) y no un shape
// legacy real; las migraciones de abajo asumen `entrada_tiempo_id` y
// rompen si ya tiene `tarea_id`.
function subregistrosYaMigrados(db) {
  return db
    .prepare('PRAGMA table_info(subregistros_tiempo)')
    .all()
    .some((c) => c.name === 'tarea_id');
}

function migrarSubregistrosDesdeEntradas(db) {
  if (!tablaExiste(db, 'entradas_tiempo') || subregistrosYaMigrados(db)) return;
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
// individual que ya tenia cada fila), y renombra
// subregistros_tiempo.entrada_tiempo_id -> tarea_id agregando la columna
// `fecha` (backfillada con la fecha de su entrada_tiempo padre, la mejor
// aproximacion disponible para datos historicos). El tipo_cobro/tarifa_hora/
// precio_fijo del proyecto padre se preservan tal cual en `proyectos` (esta
// migracion solo le quita `pagado`, que pasa a vivir en cada tarea) — el
// precio nunca vivio en `tareas` en este flujo legacy, a diferencia de una
// base que haya pasado por la restructuracion intermedia de tareas (ver
// migrarPrecioAProyectoYGastosACliente mas abajo, que es la que sabe migrar
// esa otra forma vieja). Sigue el mismo patron que migrarMontosACentavos:
// rebuild completo de tabla, con backup de archivo y foreign_key_check al
// final.
function migrarEntradasATareas(db, dbPath) {
  if (!tablaExiste(db, 'entradas_tiempo')) return; // ya migrado, o instalacion nueva

  // entradas_tiempo reapareció (p.ej. por una version vieja de schema.sql
  // que todavia la definia) sobre una base donde esta migracion ya se corrio
  // antes: es un remanente vacio, no un shape legacy real. Solo se limpia.
  if (subregistrosYaMigrados(db)) {
    db.exec('DROP TABLE entradas_tiempo');
    return;
  }

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.pre-tareas.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  db.pragma('foreign_keys = OFF');
  try {
    const migrar = db.transaction(() => {
      // `tareas` ya existe con el shape nuevo (sin tipo_cobro/tarifa_hora/
      // precio_fijo, el precio vive en el proyecto): la crea schema.sql
      // (CREATE TABLE IF NOT EXISTS) antes de llegar acá, porque en una base
      // vieja todavía no existía. Solo hace falta poblarla.
      db.exec(`
        INSERT INTO tareas (id, proyecto_id, nombre, estado, pagado, fecha_cobro, horas, creado_en, actualizado_en)
        SELECT
          e.id, e.proyecto_id, COALESCE(NULLIF(TRIM(e.descripcion), ''), 'Sesión de trabajo'),
          CASE WHEN e.pagado = 1 THEN 'completada' ELSE 'pendiente' END,
          e.pagado, NULL, e.horas, e.creado_en, e.actualizado_en
        FROM entradas_tiempo e;
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
          tipo_cobro TEXT NOT NULL CHECK (tipo_cobro IN ('hora', 'fijo')),
          tarifa_hora INTEGER,
          precio_fijo INTEGER,
          estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        INSERT INTO proyectos_nuevo (id, cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado)
        SELECT id, cliente_id, nombre, tipo_cobro, tarifa_hora, precio_fijo, estado FROM proyectos;
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

// Bases de datos creadas durante la restructuracion de "tareas" tenian el
// precio (tipo_cobro/tarifa_hora/precio_fijo) en `tareas` y los gastos
// colgados de `proyecto_id`. Esta migracion los revierte: el precio vuelve
// a `proyectos` (un proyecto entero se cobra de una sola forma) y los gastos
// pasan a `cliente_id` (son del cliente, no de un proyecto puntual). El pago
// (`pagado`/`fecha_cobro`) se queda en `tareas` — no se toca.
// Guard: si `proyectos` ya tiene `tipo_cobro`, ya se corrio esta migracion
// (o es una instalacion nueva, donde schema.sql ya crea `proyectos` con ese
// shape) — no hay nada que hacer.
function migrarPrecioAProyectoYGastosACliente(db, dbPath) {
  if (tipoColumna(db, 'proyectos', 'tipo_cobro')) return;

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.pre-precio-proyecto.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
  }

  db.pragma('foreign_keys = OFF');
  try {
    const migrar = db.transaction(() => {
      // 1. Derivar tipo_cobro/tarifa_hora/precio_fijo por proyecto a partir
      // de sus tareas actuales (antes de que `tareas` pierda esas
      // columnas): el tipo con mas tareas gana (empate -> 'hora');
      // tarifa_hora = promedio redondeado entre sus tareas 'hora';
      // precio_fijo = suma entre sus tareas 'fijo'. Un proyecto sin tareas
      // (o solo con tareas de un tipo con 0 filas del otro) queda en
      // 'hora'/tarifa 0 por defecto.
      const precioPorProyecto = new Map();
      for (const p of db.prepare('SELECT id FROM proyectos').all()) {
        const conteo = db
          .prepare(
            `SELECT tipo_cobro, COUNT(*) AS n, AVG(tarifa_hora) AS tarifa_prom, SUM(precio_fijo) AS precio_suma
             FROM tareas WHERE proyecto_id = ? GROUP BY tipo_cobro`
          )
          .all(p.id);
        const hora = conteo.find((c) => c.tipo_cobro === 'hora');
        const fijo = conteo.find((c) => c.tipo_cobro === 'fijo');
        if ((fijo?.n || 0) > (hora?.n || 0)) {
          precioPorProyecto.set(p.id, { tipo_cobro: 'fijo', tarifa_hora: null, precio_fijo: Math.round(fijo.precio_suma || 0) });
        } else {
          precioPorProyecto.set(p.id, { tipo_cobro: 'hora', tarifa_hora: Math.round(hora?.tarifa_prom || 0), precio_fijo: null });
        }
      }

      // 2. Rebuild proyectos con las 3 columnas de precio nuevas.
      db.exec(`
        CREATE TABLE proyectos_nuevo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER NOT NULL,
          nombre TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
          tipo_cobro TEXT NOT NULL DEFAULT 'hora' CHECK (tipo_cobro IN ('hora', 'fijo')),
          tarifa_hora INTEGER,
          precio_fijo INTEGER,
          fecha_inicio TEXT,
          fecha_entrega_estimada TEXT,
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
      `);
      const insertarProyecto = db.prepare(
        `INSERT INTO proyectos_nuevo (id, cliente_id, nombre, estado, tipo_cobro, tarifa_hora, precio_fijo, fecha_inicio, fecha_entrega_estimada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of db.prepare('SELECT * FROM proyectos').all()) {
        const precio = precioPorProyecto.get(p.id) || { tipo_cobro: 'hora', tarifa_hora: 0, precio_fijo: null };
        insertarProyecto.run(
          p.id,
          p.cliente_id,
          p.nombre,
          p.estado,
          precio.tipo_cobro,
          precio.tarifa_hora,
          precio.precio_fijo,
          p.fecha_inicio,
          p.fecha_entrega_estimada
        );
      }
      db.exec(`
        DROP TABLE proyectos;
        ALTER TABLE proyectos_nuevo RENAME TO proyectos;
        CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
      `);

      // 3. Rebuild tareas sin tipo_cobro/tarifa_hora/precio_fijo, con la
      // columna nueva horas_estimadas (NULL en filas existentes).
      db.exec(`
        CREATE TABLE tareas_nuevo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          proyecto_id INTEGER NOT NULL,
          nombre TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
          pagado INTEGER NOT NULL DEFAULT 0,
          fecha_cobro TEXT,
          fecha_limite TEXT,
          horas_estimadas REAL,
          horas REAL NOT NULL DEFAULT 0,
          creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
        );
        INSERT INTO tareas_nuevo (id, proyecto_id, nombre, estado, pagado, fecha_cobro, fecha_limite, horas, creado_en, actualizado_en)
        SELECT id, proyecto_id, nombre, estado, pagado, fecha_cobro, fecha_limite, horas, creado_en, actualizado_en
        FROM tareas;
        DROP TABLE tareas;
        ALTER TABLE tareas_nuevo RENAME TO tareas;
        CREATE INDEX IF NOT EXISTS idx_tareas_proyecto_id ON tareas(proyecto_id);
      `);

      // 4. Rebuild gastos con cliente_id (heredado del proyecto al que
      // apuntaba cada gasto — `proyectos` ya tiene el shape nuevo pero
      // `id`/`cliente_id` no cambiaron, el join sigue siendo valido).
      db.exec(`
        CREATE TABLE gastos_nuevo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER NOT NULL,
          descripcion TEXT NOT NULL,
          monto INTEGER NOT NULL,
          fecha TEXT NOT NULL DEFAULT (date('now')),
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        INSERT INTO gastos_nuevo (id, cliente_id, descripcion, monto, fecha)
        SELECT g.id, p.cliente_id, g.descripcion, g.monto, g.fecha
        FROM gastos g
        JOIN proyectos p ON p.id = g.proyecto_id;
        DROP TABLE gastos;
        ALTER TABLE gastos_nuevo RENAME TO gastos;
        CREATE INDEX IF NOT EXISTS idx_gastos_cliente_id ON gastos(cliente_id);
      `);
    });
    migrar();

    const violaciones = db.pragma('foreign_key_check');
    if (violaciones.length > 0) {
      throw new Error(`migrarPrecioAProyectoYGastosACliente dejo referencias invalidas: ${JSON.stringify(violaciones)}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

module.exports = { initDb, DB_PATH };
