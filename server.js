const path = require('node:path');
const express = require('express');
const { initDb } = require('./db/init');

function createApp(db) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/clientes', require('./routes/clientes')(db));
  app.use('/api/proyectos', require('./routes/proyectos')(db));
  app.use('/api/entradas-tiempo', require('./routes/entradasTiempo')(db));
  app.use('/api/gastos', require('./routes/gastos')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));

  // Manejo de errores: asegura que la API siempre responda JSON, incluso ante
  // body JSON malformado (express.json() lo reporta como error, no como req.body vacío).
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalido' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = { createApp };

// Solo levanta el servidor si se ejecuta directamente (node server.js), no cuando
// los tests importan createApp() para probar la API sin abrir un puerto real.
if (require.main === module) {
  const db = initDb();
  const app = createApp(db);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}
