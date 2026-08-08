const express = require('express');
const { notFound, validarEnum } = require('../lib/http');
const { serializarProyecto, calcularRentabilidad } = require('../db/queries');

const ESTADOS = ['activo', 'completado', 'pausado'];

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { cliente_id } = req.query;
    let proyectos;
    if (cliente_id) {
      proyectos = db.prepare('SELECT * FROM proyectos WHERE cliente_id = ? ORDER BY id DESC').all(cliente_id);
    } else {
      proyectos = db.prepare('SELECT * FROM proyectos ORDER BY id DESC').all();
    }
    res.json(proyectos.map(serializarProyecto));
  });

  router.get('/:id', (req, res) => {
    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!proyecto) return notFound(res, 'Proyecto');
    res.json(serializarProyecto(proyecto));
  });

  router.post('/', (req, res) => {
    const { cliente_id, nombre, estado } = req.body;
    if (!cliente_id || !nombre) {
      return res.status(400).json({ error: 'cliente_id y nombre son requeridos' });
    }
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) return res.status(400).json({ error: 'cliente_id no existe' });

    const estadoFinal = estado || 'activo';
    const errorEstado = validarEnum(estadoFinal, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });

    const info = db
      .prepare('INSERT INTO proyectos (cliente_id, nombre, estado) VALUES (?, ?, ?)')
      .run(cliente_id, nombre, estadoFinal);
    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializarProyecto(proyecto));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Proyecto');

    const cliente_id = req.body.cliente_id ?? existing.cliente_id;
    const nombre = req.body.nombre ?? existing.nombre;
    const estado = req.body.estado ?? existing.estado;

    const errorEstado = validarEnum(estado, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });

    db.prepare('UPDATE proyectos SET cliente_id = ?, nombre = ?, estado = ? WHERE id = ?').run(
      cliente_id,
      nombre,
      estado,
      req.params.id
    );
    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    res.json(serializarProyecto(proyecto));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM proyectos WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Proyecto');
    res.status(204).end();
  });

  router.get('/:id/rentabilidad', (req, res) => {
    const rentabilidad = calcularRentabilidad(db, req.params.id);
    if (!rentabilidad) return notFound(res, 'Proyecto');
    res.json(rentabilidad);
  });

  return router;
}

module.exports = crearRouter;
