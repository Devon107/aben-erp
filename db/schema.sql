PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  modo_facturacion TEXT NOT NULL CHECK (modo_facturacion IN ('hora', 'proyecto', 'mixto'))
);

-- El tipo de cobro (hora/fijo), la tarifa y el estado de pago viven a nivel
-- de tarea (ver tabla `tareas` mas abajo), no de proyecto: un proyecto puede
-- tener tareas con tarifas distintas. proyectos.estado es solo el estado
-- general del proyecto (activo/pausado/completado), independiente del
-- estado de cada tarea.
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'pausado')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- monto en centavos (INTEGER) para evitar errores de redondeo de punto
-- flotante en montos de dinero. La API convierte a/desde dolares en el
-- limite HTTP (ver lib/http.js).
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

-- Una tarea es la unidad de trabajo y de cobro dentro de un proyecto: se crea
-- explicitamente (no depende de iniciar un cronometro), y agrupa uno o mas
-- logs de tiempo (subregistros_tiempo). tarifa_hora/precio_fijo en centavos,
-- igual que gastos.monto. pagado/fecha_cobro son de toda la tarea (no por
-- sesion de tiempo individual): se marca cobrada de una vez, con la fecha en
-- que se cobro (alimenta el grafico de ingresos por mes del dashboard).
-- fecha_limite es informativa (sin recordatorios). estado es independiente
-- de pagado: una tarea puede estar completada sin haberse cobrado todavia.
-- horas es DESNORMALIZADO: se mantiene igual a SUM(subregistros_tiempo.horas)
-- (ver db/queries.js, recomputarHorasTarea).
CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo_cobro TEXT NOT NULL CHECK (tipo_cobro IN ('hora', 'fijo')),
  tarifa_hora INTEGER,
  precio_fijo INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
  pagado INTEGER NOT NULL DEFAULT 0,
  fecha_cobro TEXT,
  fecha_limite TEXT,
  horas REAL NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

-- Cada fila es una sesion individual de tiempo (una corrida de cronometro o
-- una carga manual) que compone el total de una tarea. `fecha` es el dia
-- trabajado (editable en logs manuales; = hoy en logs de timer) — permite que
-- una misma tarea acumule sesiones en dias distintos sin perder el detalle de
-- cuando se trabajo cada una. `creado_en`/`actualizado_en` son de auditoria
-- (cuando se registro/edito la fila), no el dia trabajado.
CREATE TABLE IF NOT EXISTS subregistros_tiempo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarea_id INTEGER NOT NULL,
  horas REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('timer', 'manual')),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proyecto_id ON gastos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_proyecto_id ON tareas(proyecto_id);
-- idx_subregistros_tiempo_tarea_id NO va acá: en una base vieja,
-- subregistros_tiempo todavía tiene la columna entrada_tiempo_id (no
-- tarea_id) en este punto — esta tabla se crea "IF NOT EXISTS", así que en
-- una base vieja este CREATE INDEX fallaría antes de que
-- migrarEntradasATareas() la reconstruya. El índice se crea en
-- db/init.js, al final de initDb(), cuando la columna ya existe siempre.
