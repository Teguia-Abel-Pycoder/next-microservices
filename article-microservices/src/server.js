
// server.js
const app = require('./app');
const { startHeartbeat } = require('./SSE/sseManager');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📡 SSE endpoint: http://${HOST}:${PORT}/offer/stream/:seller`);
  console.log(`📚 API Documentation: http://${HOST}:${PORT}/api-docs`);
  console.log(`🏥 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🧪 Test endpoint: http://${HOST}:${PORT}/offer/test/send/:seller`);
    console.log(`🔍 Debug endpoint: http://${HOST}:${PORT}/offer/debug/connections`);
  }
});

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      console.error(`❌ ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ ${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('🛑 Starting graceful shutdown...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = server;