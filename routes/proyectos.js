const express = require('express');
const { notFound, aCentavos, validarEnum, requerirNumeroPositivo } = require('../lib/http');
const {
  serializarProyecto,
  calcularResumenProyecto,
  listarActividadesProyecto,
  listarSubregistrosRecientesProyecto,
} = require('../db/queries');

const ESTADOS = ['activo', 'completado', 'pausado'];
const TIPOS_COBRO = ['hora', 'fijo'];

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
    const { cliente_id, nombre, estado, tipo_cobro, tarifa_hora, precio_fijo, fecha_inicio, fecha_entrega_estimada } = req.body;
    if (!cliente_id || !nombre) {
      return res.status(400).json({ error: 'cliente_id y nombre son requeridos' });
    }
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) return res.status(400).json({ error: 'cliente_id no existe' });

    const estadoFinal = estado || 'activo';
    const errorEstado = validarEnum(estadoFinal, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });

    const tipoCobroFinal = tipo_cobro || 'hora';
    const errorTipo = validarEnum(tipoCobroFinal, TIPOS_COBRO, 'tipo_cobro');
    if (errorTipo) return res.status(400).json({ error: errorTipo });
    if (tarifa_hora != null) {
      const errorTarifa = requerirNumeroPositivo(tarifa_hora, 'tarifa_hora');
      if (errorTarifa) return res.status(400).json({ error: errorTarifa });
    }
    if (precio_fijo != null) {
      const errorPrecio = requerirNumeroPositivo(precio_fijo, 'precio_fijo');
      if (errorPrecio) return res.status(400).json({ error: errorPrecio });
    }

    const info = db
      .prepare(
        `INSERT INTO proyectos (cliente_id, nombre, estado, tipo_cobro, tarifa_hora, precio_fijo, fecha_inicio, fecha_entrega_estimada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cliente_id,
        nombre,
        estadoFinal,
        tipoCobroFinal,
        tarifa_hora != null ? aCentavos(tarifa_hora) : null,
        precio_fijo != null ? aCentavos(precio_fijo) : null,
        fecha_inicio || null,
        fecha_entrega_estimada || null
      );
    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializarProyecto(proyecto));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Proyecto');
    const existingDolares = serializarProyecto(existing);

    const cliente_id = req.body.cliente_id ?? existing.cliente_id;
    const nombre = req.body.nombre ?? existing.nombre;
    const estado = req.body.estado ?? existing.estado;
    const tipo_cobro = req.body.tipo_cobro ?? existing.tipo_cobro;
    const tarifa_hora = req.body.tarifa_hora !== undefined ? req.body.tarifa_hora : existingDolares.tarifa_hora;
    const precio_fijo = req.body.precio_fijo !== undefined ? req.body.precio_fijo : existingDolares.precio_fijo;
    const fecha_inicio = req.body.fecha_inicio !== undefined ? req.body.fecha_inicio || null : existing.fecha_inicio;
    const fecha_entrega_estimada =
      req.body.fecha_entrega_estimada !== undefined ? req.body.fecha_entrega_estimada || null : existing.fecha_entrega_estimada;

    const errorEstado = validarEnum(estado, ESTADOS, 'estado');
    if (errorEstado) return res.status(400).json({ error: errorEstado });
    const errorTipo = validarEnum(tipo_cobro, TIPOS_COBRO, 'tipo_cobro');
    if (errorTipo) return res.status(400).json({ error: errorTipo });
    if (tarifa_hora != null) {
      const errorTarifa = requerirNumeroPositivo(tarifa_hora, 'tarifa_hora');
      if (errorTarifa) return res.status(400).json({ error: errorTarifa });
    }
    if (precio_fijo != null) {
      const errorPrecio = requerirNumeroPositivo(precio_fijo, 'precio_fijo');
      if (errorPrecio) return res.status(400).json({ error: errorPrecio });
    }

    db.prepare(
      `UPDATE proyectos
       SET cliente_id = ?, nombre = ?, estado = ?, tipo_cobro = ?, tarifa_hora = ?, precio_fijo = ?,
           fecha_inicio = ?, fecha_entrega_estimada = ?
       WHERE id = ?`
    ).run(
      cliente_id,
      nombre,
      estado,
      tipo_cobro,
      tarifa_hora != null ? aCentavos(tarifa_hora) : null,
      precio_fijo != null ? aCentavos(precio_fijo) : null,
      fecha_inicio,
      fecha_entrega_estimada,
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

  router.get('/:id/resumen', (req, res) => {
    const resumen = calcularResumenProyecto(db, req.params.id);
    if (!resumen) return notFound(res, 'Proyecto');
    res.json(resumen);
  });

  router.get('/:id/actividades', (req, res) => {
    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(req.params.id);
    if (!proyecto) return notFound(res, 'Proyecto');
    res.json(listarActividadesProyecto(db, req.params.id));
  });

  router.get('/:id/subregistros-recientes', (req, res) => {
    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(req.params.id);
    if (!proyecto) return notFound(res, 'Proyecto');
    res.json(listarSubregistrosRecientesProyecto(db, req.params.id));
  });

  return router;
}

module.exports = crearRouter;
