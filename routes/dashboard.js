const express = require('express');
const { calcularDashboard } = require('../db/queries');

const FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { desde, hasta } = req.query;
    if (!desde || !hasta || !FECHA_ISO_RE.test(desde) || !FECHA_ISO_RE.test(hasta)) {
      return res.status(400).json({ error: 'desde y hasta son requeridos, formato YYYY-MM-DD' });
    }
    if (desde > hasta) {
      return res.status(400).json({ error: 'desde no puede ser posterior a hasta' });
    }

    const clientesResultado = calcularDashboard(db, desde, hasta);
    res.json({ desde, hasta, clientes: clientesResultado });
  });

  return router;
}

module.exports = crearRouter;
