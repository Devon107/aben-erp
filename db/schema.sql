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
-- pagado solo tiene sentido para tipo_cobro = 'fijo': marca si el precio fijo
-- ya se cobro. Para tipo_cobro = 'hora' el estado de pago se trackea por
-- entrada de tiempo (entradas_tiempo.pagado), no a nivel proyecto.
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo_cobro TEXT NOT NULL CHECK (tipo_cobro IN ('hora', 'fijo')),
  tarifa_hora INTEGER,
  precio_fijo INTEGER,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
  pagado INTEGER NOT NULL DEFAULT 0,
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

-- pagado: 0 = pendiente de cobro, 1 = pagado. Default 0 porque las entradas
-- existentes antes de este campo no tenian este seguimiento.
-- horas es un valor DESNORMALIZADO: se mantiene igual a
-- SUM(subregistros_tiempo.horas) para esta fila (ver server.js,
-- recomputarHorasEntrada). Puede quedar en 0 si se eliminan todos sus
-- subregistros. creado_en/actualizado_en son de auditoria, no editables
-- por el usuario.
CREATE TABLE IF NOT EXISTS entradas_tiempo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  horas REAL NOT NULL DEFAULT 0,
  descripcion TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
  pagado INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

-- Cada fila es una sesion individual de tiempo (una corrida de cronometro o
-- una carga manual) que compone el total de una entrada_tiempo. El total se
-- cachea en entradas_tiempo.horas para no tener que recalcular SUM() en cada
-- query de dashboard/rentabilidad.
CREATE TABLE IF NOT EXISTS subregistros_tiempo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entrada_tiempo_id INTEGER NOT NULL,
  horas REAL NOT NULL,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entrada_tiempo_id) REFERENCES entradas_tiempo(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proyecto_id ON gastos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_entradas_tiempo_proyecto_id ON entradas_tiempo(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_subregistros_tiempo_entrada_id ON subregistros_tiempo(entrada_tiempo_id);
