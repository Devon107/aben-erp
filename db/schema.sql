PRAGMA foreign_keys = ON;

-- email/telefono/industria/sitio_web/direccion/contacto_principal son
-- opcionales (datos de contacto/empresa, panel "Datos de la empresa" del
-- detalle de cliente). cliente_desde es la fecha desde la que se trabaja con
-- el cliente (informativa, no de auditoria de la fila).
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  modo_facturacion TEXT NOT NULL CHECK (modo_facturacion IN ('hora', 'proyecto', 'mixto')),
  email TEXT,
  telefono TEXT,
  industria TEXT,
  sitio_web TEXT,
  direccion TEXT,
  contacto_principal TEXT,
  cliente_desde TEXT
);

-- El tipo de cobro (hora/fijo) y la tarifa viven a nivel de proyecto: un
-- proyecto entero se cobra de una sola forma. tarifa_hora/precio_fijo en
-- centavos, igual que gastos.monto. estado es el estado general del proyecto
-- (activo/pausado/completado), independiente del estado de cada tarea.
-- fecha_inicio/fecha_entrega_estimada son informativas (sin recordatorios),
-- para el header del detalle de proyecto.
CREATE TABLE IF NOT EXISTS proyectos (
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

-- monto en centavos (INTEGER) para evitar errores de redondeo de punto
-- flotante en montos de dinero. La API convierte a/desde dolares en el
-- limite HTTP (ver lib/http.js). Los gastos son del cliente (gastos
-- generales, no siempre atribuibles a un proyecto puntual) — ver panel
-- "Gastos" en la vista de cliente.
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- Una tarea es la unidad de trabajo dentro de un proyecto: se crea
-- explicitamente (no depende de iniciar un cronometro), y agrupa uno o mas
-- logs de tiempo (subregistros_tiempo). El precio vive en el proyecto (ver
-- arriba), no acá — pero el pago sí es por tarea: en proyectos por hora no
-- se cobra el proyecto entero de una vez, se van cobrando tareas puntuales a
-- medida que se facturan. El ingreso de una tarea pagada se calcula con el
-- precio del proyecto (ver calcularIngresoProyecto en db/queries.js).
-- horas_estimadas es opcional (informativo, para trackear avance por horas
-- en proyectos de precio fijo — ver progreso_horas_pct). fecha_limite es
-- informativa (sin recordatorios). estado es independiente de pagado: una
-- tarea puede estar completada sin haberse cobrado todavia. horas es
-- DESNORMALIZADO: se mantiene igual a SUM(subregistros_tiempo.horas) (ver
-- db/queries.js, recomputarHorasTarea).
CREATE TABLE IF NOT EXISTS tareas (
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

-- Historial de actividad: una fila por evento relevante de una tarea
-- (tiempo agregado, cambio de estado, marcada pagada). cliente_id/
-- proyecto_id quedan denormalizados (no solo tarea_id) para poder listar por
-- cliente o por proyecto sin joins; tarea_id es SET NULL (no CASCADE) para
-- conservar el registro aunque la tarea se borre despues (la descripcion ya
-- tiene el nombre como texto). `fecha` es la fecha del evento en si (dia
-- trabajado, o fecha de cobro), no de auditoria — ver registrarActividad en
-- db/queries.js.
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  proyecto_id INTEGER NOT NULL,
  tarea_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('tiempo_registrado', 'estado_cambiado', 'pagado')),
  descripcion TEXT NOT NULL,
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tareas_proyecto_id ON tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_actividades_cliente_id ON actividades(cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_actividades_proyecto_id ON actividades(proyecto_id, fecha DESC);
-- idx_gastos_cliente_id NO va acá: en una base vieja, `gastos` todavía tiene
-- la columna proyecto_id (no cliente_id) en este punto — igual que pasa con
-- idx_subregistros_tiempo_tarea_id mas abajo, este CREATE INDEX fallaría
-- antes de que migrarPrecioAProyectoYGastosACliente() reconstruya la tabla.
-- El índice se crea en db/init.js, al final de initDb(), cuando la columna
-- ya existe siempre.
-- idx_subregistros_tiempo_tarea_id NO va acá: en una base vieja,
-- subregistros_tiempo todavía tiene la columna entrada_tiempo_id (no
-- tarea_id) en este punto — esta tabla se crea "IF NOT EXISTS", así que en
-- una base vieja este CREATE INDEX fallaría antes de que
-- migrarEntradasATareas() la reconstruya. El índice se crea en
-- db/init.js, al final de initDb(), cuando la columna ya existe siempre.
