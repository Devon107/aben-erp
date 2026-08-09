const express = require('express');
const { notFound, validarEnum, requerirNumeroPositivo } = require('../lib/http');
const { serializarTarea, recomputarHorasTarea, registrarActividad } = require('../db/queries');

const ORIGENES = ['timer', 'manual'];
const ESTADOS = ['pendiente', 'en_curso', 'completada'];

function validarHoras(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
    return 'horas debe ser un numero mayor a 0';
  }
  return null;
}

function clienteIdDeProyecto(db, proyectoId) {
  return db.prepare('SELECT cliente_id FROM proyectos WHERE id = ?').get(proyectoId).cliente_id;
}

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { proyecto_id } = req.query;
    let tareas;
    if (proyecto_id) {
      tareas = db.prepare('SELECT * FROM tareas WHERE proyecto_id = ? ORDER BY id DESC').all(proyecto_id);
    } else {
      tareas = db.prepare('SELECT * FROM tareas ORDER BY id DESC').all();
    }
    res.json(tareas.map(serializarTarea));
  });

  // Ruta literal, tiene que ir antes de '/:id' para que Express no la
  // matchee como un id.
  router.put('/marcar-pagadas', (req, res) => {
    const { ids, fecha_cobro } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids debe ser un array no vacío' });
    }
    const fechaCobroFinal = fecha_cobro || new Date().toISOString().slice(0, 10);

    const actualizadas = [];
    for (const id of ids) {
      const existing = db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
      if (!existing || existing.pagado) continue; // inexistente o ya pagada: se ignora

      db.prepare('UPDATE tareas SET pagado = 1, fecha_cobro = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(
        fechaCobroFinal,
        id
      );
      registrarActividad(db, {
        cliente_id: clienteIdDeProyecto(db, existing.proyecto_id),
        proyecto_id: existing.proyecto_id,
        tarea_id: id,
        tipo: 'pagado',
        descripcion: `Tarea "${existing.nombre}" marcada como pagada`,
        fecha: fechaCobroFinal,
      });
      actualizadas.push(id);
    }
    res.json({ actualizadas });
  });

  router.get('/:id', (req, res) => {
    const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id);
    if (!tarea) return notFound(res, 'Tarea');
    res.json(serializarTarea(tarea));
  });

  router.post('/', (req, res) => {
    const { proyecto_id, nombre, estado, fecha_limite, horas_estimadas, pagado, fecha_cobro } = req.body;
    if (!proyecto_id || !nombre) {
      return res.status(400).json({ error: 'proyecto_id y nombre son requeridos' });
    }
    if (horas_estimadas != null) {
      const errorHorasEstimadas = requerirNumeroPositivo(horas_estimadas, 'horas_estimadas');
      if (errorHorasEstimadas) return res.status(400).json({ error: errorHorasEstimadas });
    }
    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

    const estadoFinal = estado || 'pendiente';
    const errorEstado = validarEnum(estadoFinal, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });
    const pagadoFinal = pagado ?? false;
    if (typeof pagadoFinal !== 'boolean') {
      return res.status(400).json({ error: 'pagado debe ser true o false' });
    }
    // fecha_cobro solo tiene sentido si la tarea esta pagada: si no lo esta
    // se ignora/limpia, si lo esta y no se manda una fecha se usa hoy.
    const fechaCobroFinal = pagadoFinal ? fecha_cobro || new Date().toISOString().slice(0, 10) : null;

    const info = db
      .prepare(
        `INSERT INTO tareas (proyecto_id, nombre, estado, pagado, fecha_cobro, fecha_limite, horas_estimadas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(proyecto_id, nombre, estadoFinal, pagadoFinal ? 1 : 0, fechaCobroFinal, fecha_limite || null, horas_estimadas ?? null);
    const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializarTarea(tarea));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Tarea');

    const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
    const nombre = req.body.nombre ?? existing.nombre;
    const estado = req.body.estado ?? existing.estado;
    const fecha_limite = req.body.fecha_limite !== undefined ? req.body.fecha_limite : existing.fecha_limite;
    const horas_estimadas =
      req.body.horas_estimadas !== undefined ? req.body.horas_estimadas : existing.horas_estimadas;
    const pagado = req.body.pagado !== undefined ? req.body.pagado : !!existing.pagado;

    const errorEstado = validarEnum(estado, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });
    if (horas_estimadas != null) {
      const errorHorasEstimadas = requerirNumeroPositivo(horas_estimadas, 'horas_estimadas');
      if (errorHorasEstimadas) return res.status(400).json({ error: errorHorasEstimadas });
    }
    if (typeof pagado !== 'boolean') {
      return res.status(400).json({ error: 'pagado debe ser true o false' });
    }
    const fechaCobroFinal = pagado ? req.body.fecha_cobro || existing.fecha_cobro || new Date().toISOString().slice(0, 10) : null;

    db.prepare(
      `UPDATE tareas
       SET proyecto_id = ?, nombre = ?, estado = ?, pagado = ?, fecha_cobro = ?, fecha_limite = ?,
           horas_estimadas = ?, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(proyecto_id, nombre, estado, pagado ? 1 : 0, fechaCobroFinal, fecha_limite || null, horas_estimadas ?? null, req.params.id);

    // Historial de actividad: solo las dos transiciones pedidas (cambio de
    // estado, y pasar de pendiente de cobro a pagada). fecha de
    // 'estado_cambiado' es hoy (no hay fecha historica de cuando cambio el
    // estado); fecha de 'pagado' es la fecha de cobro.
    const clienteId = clienteIdDeProyecto(db, proyecto_id);
    if (estado !== existing.estado) {
      registrarActividad(db, {
        cliente_id: clienteId,
        proyecto_id,
        tarea_id: req.params.id,
        tipo: 'estado_cambiado',
        descripcion: `Tarea "${nombre}" pasó a ${estado}`,
        fecha: new Date().toISOString().slice(0, 10),
      });
    }
    if (pagado && !existing.pagado) {
      registrarActividad(db, {
        cliente_id: clienteId,
        proyecto_id,
        tarea_id: req.params.id,
        tipo: 'pagado',
        descripcion: `Tarea "${nombre}" marcada como pagada`,
        fecha: fechaCobroFinal,
      });
    }

    const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id);
    res.json(serializarTarea(tarea));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM tareas WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Tarea');
    res.status(204).end();
  });

  // ---------- Subregistros de tiempo (logs) ----------
  // Cada tarea puede componerse de varias sesiones (subregistros), cada una
  // con su propia fecha trabajada. tareas.horas se mantiene siempre igual a
  // SUM(subregistros.horas) vía recomputarHorasTarea, llamado despues de
  // cada insert/update/delete acá.

  router.get('/:id/subregistros', (req, res) => {
    const tarea = db.prepare('SELECT id FROM tareas WHERE id = ?').get(req.params.id);
    if (!tarea) return notFound(res, 'Tarea');
    const subregistros = db
      .prepare('SELECT * FROM subregistros_tiempo WHERE tarea_id = ? ORDER BY fecha DESC, id DESC')
      .all(req.params.id);
    res.json(subregistros);
  });

  router.post('/:id/subregistros', (req, res) => {
    const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id);
    if (!tarea) return notFound(res, 'Tarea');

    const { horas, origen, fecha } = req.body;
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });
    const origenFinal = origen || 'manual';
    const errorOrigen = validarEnum(origenFinal, ORIGENES, 'origen');
    if (errorOrigen) return res.status(400).json({ error: errorOrigen });
    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);

    const info = db
      .prepare('INSERT INTO subregistros_tiempo (tarea_id, horas, fecha, origen) VALUES (?, ?, ?, ?)')
      .run(req.params.id, horas, fechaFinal, origenFinal);
    recomputarHorasTarea(db, req.params.id);

    registrarActividad(db, {
      cliente_id: clienteIdDeProyecto(db, tarea.proyecto_id),
      proyecto_id: tarea.proyecto_id,
      tarea_id: req.params.id,
      tipo: 'tiempo_registrado',
      descripcion: `Se registraron ${horas}h en "${tarea.nombre}"`,
      fecha: fechaFinal,
    });

    const subregistro = db.prepare('SELECT * FROM subregistros_tiempo WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(subregistro);
  });

  router.put('/:id/subregistros/:subId', (req, res) => {
    const subregistro = db
      .prepare('SELECT * FROM subregistros_tiempo WHERE id = ? AND tarea_id = ?')
      .get(req.params.subId, req.params.id);
    if (!subregistro) return notFound(res, 'Subregistro de tiempo');

    const horas = req.body.horas !== undefined ? req.body.horas : subregistro.horas;
    const fecha = req.body.fecha ?? subregistro.fecha;
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });

    db.prepare('UPDATE subregistros_tiempo SET horas = ?, fecha = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(
      horas,
      fecha,
      req.params.subId
    );
    recomputarHorasTarea(db, req.params.id);

    const actualizado = db.prepare('SELECT * FROM subregistros_tiempo WHERE id = ?').get(req.params.subId);
    res.json(actualizado);
  });

  router.delete('/:id/subregistros/:subId', (req, res) => {
    const info = db
      .prepare('DELETE FROM subregistros_tiempo WHERE id = ? AND tarea_id = ?')
      .run(req.params.subId, req.params.id);
    if (info.changes === 0) return notFound(res, 'Subregistro de tiempo');
    recomputarHorasTarea(db, req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = crearRouter;
