const express = require('express');
const { notFound, validarEnum } = require('../lib/http');
const { serializarEntrada, recomputarHorasEntrada } = require('../db/queries');

const ORIGENES = ['timer', 'manual'];

function validarHoras(horas) {
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
    return 'horas debe ser un numero mayor a 0';
  }
  return null;
}

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { proyecto_id } = req.query;
    let entradas;
    if (proyecto_id) {
      entradas = db
        .prepare('SELECT * FROM entradas_tiempo WHERE proyecto_id = ? ORDER BY fecha DESC, id DESC')
        .all(proyecto_id);
    } else {
      entradas = db.prepare('SELECT * FROM entradas_tiempo ORDER BY fecha DESC, id DESC').all();
    }
    res.json(entradas.map(serializarEntrada));
  });

  router.get('/:id', (req, res) => {
    const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
    if (!entrada) return notFound(res, 'Entrada de tiempo');
    res.json(serializarEntrada(entrada));
  });

  router.post('/', (req, res) => {
    const { proyecto_id, fecha, horas, descripcion, origen, pagado } = req.body;
    if (!proyecto_id || !fecha || horas === undefined) {
      return res.status(400).json({ error: 'proyecto_id, fecha y horas son requeridos' });
    }
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });
    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return res.status(400).json({ error: 'proyecto_id no existe' });

    const origenFinal = origen || 'manual';
    const errorOrigen = validarEnum(origenFinal, ORIGENES, 'origen');
    if (errorOrigen) return res.status(400).json({ error: errorOrigen });
    const pagadoFinal = pagado ?? false;
    if (typeof pagadoFinal !== 'boolean') {
      return res.status(400).json({ error: 'pagado debe ser true o false' });
    }

    // La entrada y su primer subregistro se crean juntos: horas siempre queda
    // como la suma de subregistros_tiempo (ver recomputarHorasEntrada).
    // creado_en/actualizado_en se setean explícitos (no vía DEFAULT de columna):
    // en bases migradas desde una versión sin estas columnas, ALTER TABLE no
    // pudo dejarles un default (ver migrarEntradasTiempoTimestamps), así que
    // dependen de que el INSERT los pase siempre.
    const crearEntradaConSubregistro = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO entradas_tiempo (proyecto_id, fecha, horas, descripcion, origen, pagado, creado_en, actualizado_en)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .run(proyecto_id, fecha, horas, descripcion ?? null, origenFinal, pagadoFinal ? 1 : 0);
      db.prepare('INSERT INTO subregistros_tiempo (entrada_tiempo_id, horas, origen) VALUES (?, ?, ?)').run(
        info.lastInsertRowid,
        horas,
        origenFinal
      );
      return info.lastInsertRowid;
    });

    const entradaId = crearEntradaConSubregistro();
    const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(entradaId);
    res.status(201).json(serializarEntrada(entrada));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Entrada de tiempo');

    const proyecto_id = req.body.proyecto_id ?? existing.proyecto_id;
    const fecha = req.body.fecha ?? existing.fecha;
    const horas = req.body.horas !== undefined ? req.body.horas : existing.horas;
    const descripcion = req.body.descripcion !== undefined ? req.body.descripcion : existing.descripcion;
    const origen = req.body.origen ?? existing.origen;
    const pagado = req.body.pagado !== undefined ? req.body.pagado : !!existing.pagado;

    const errorOrigen = validarEnum(origen, ORIGENES, 'origen');
    if (errorOrigen) return res.status(400).json({ error: errorOrigen });
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });
    if (typeof pagado !== 'boolean') {
      return res.status(400).json({ error: 'pagado debe ser true o false' });
    }

    db.prepare(
      `UPDATE entradas_tiempo
       SET proyecto_id = ?, fecha = ?, horas = ?, descripcion = ?, origen = ?, pagado = ?, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(proyecto_id, fecha, horas, descripcion, origen, pagado ? 1 : 0, req.params.id);
    const entrada = db.prepare('SELECT * FROM entradas_tiempo WHERE id = ?').get(req.params.id);
    res.json(serializarEntrada(entrada));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM entradas_tiempo WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Entrada de tiempo');
    res.status(204).end();
  });

  // ---------- Subregistros de tiempo ----------
  // Cada entrada de tiempo puede componerse de varias sesiones (subregistros).
  // entradas_tiempo.horas se mantiene siempre igual a SUM(subregistros.horas)
  // vía recomputarHorasEntrada, llamado despues de cada insert/update/delete acá.

  router.get('/:id/subregistros', (req, res) => {
    const entrada = db.prepare('SELECT id FROM entradas_tiempo WHERE id = ?').get(req.params.id);
    if (!entrada) return notFound(res, 'Entrada de tiempo');
    const subregistros = db
      .prepare('SELECT * FROM subregistros_tiempo WHERE entrada_tiempo_id = ? ORDER BY creado_en, id')
      .all(req.params.id);
    res.json(subregistros);
  });

  router.post('/:id/subregistros', (req, res) => {
    const entrada = db.prepare('SELECT id FROM entradas_tiempo WHERE id = ?').get(req.params.id);
    if (!entrada) return notFound(res, 'Entrada de tiempo');

    const { horas, origen } = req.body;
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });
    const origenFinal = origen || 'manual';
    const errorOrigen = validarEnum(origenFinal, ORIGENES, 'origen');
    if (errorOrigen) return res.status(400).json({ error: errorOrigen });

    const info = db
      .prepare('INSERT INTO subregistros_tiempo (entrada_tiempo_id, horas, origen) VALUES (?, ?, ?)')
      .run(req.params.id, horas, origenFinal);
    recomputarHorasEntrada(db, req.params.id);

    const subregistro = db.prepare('SELECT * FROM subregistros_tiempo WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(subregistro);
  });

  router.put('/:id/subregistros/:subId', (req, res) => {
    const subregistro = db
      .prepare('SELECT * FROM subregistros_tiempo WHERE id = ? AND entrada_tiempo_id = ?')
      .get(req.params.subId, req.params.id);
    if (!subregistro) return notFound(res, 'Subregistro de tiempo');

    const { horas } = req.body;
    const errorHoras = validarHoras(horas);
    if (errorHoras) return res.status(400).json({ error: errorHoras });

    db.prepare('UPDATE subregistros_tiempo SET horas = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(
      horas,
      req.params.subId
    );
    recomputarHorasEntrada(db, req.params.id);

    const actualizado = db.prepare('SELECT * FROM subregistros_tiempo WHERE id = ?').get(req.params.subId);
    res.json(actualizado);
  });

  router.delete('/:id/subregistros/:subId', (req, res) => {
    const info = db
      .prepare('DELETE FROM subregistros_tiempo WHERE id = ? AND entrada_tiempo_id = ?')
      .run(req.params.subId, req.params.id);
    if (info.changes === 0) return notFound(res, 'Subregistro de tiempo');
    recomputarHorasEntrada(db, req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = crearRouter;
