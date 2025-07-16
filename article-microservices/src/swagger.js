const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); // Directly require the JSON file

module.exports = (app) => {
  // Serve Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument)
  );
  
  // Optional: Serve raw JSON spec
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerDocument);
  });
};