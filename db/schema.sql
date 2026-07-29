PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  modo_facturacion TEXT NOT NULL CHECK (modo_facturacion IN ('hora', 'proyecto', 'mixto'))
);

-- tarifa_hora y precio_fijo se guardan en centavos (INTEGER) para evitar
-- errores de redondeo de punto flotante en montos de dinero. La API convierte
-- a/desde dolares en el limite HTTP; ver db/init.js (migrarMontosACentavos)
-- para bases de datos creadas antes de este cambio.
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo_cobro TEXT NOT NULL CHECK (tipo_cobro IN ('hora', 'fijo')),
  tarifa_hora INTEGER,
  precio_fijo INTEGER,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- monto tambien en centavos (INTEGER), mismo motivo que arriba.
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entradas_tiempo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  horas REAL NOT NULL,
  descripcion TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proyecto_id ON gastos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_entradas_tiempo_proyecto_id ON entradas_tiempo(proyecto_id);
