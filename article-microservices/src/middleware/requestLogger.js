// middleware/requestLogger.js
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip}`);
  
  // Log request body for POST/PUT requests (exclude file uploads)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('multipart/form-data')) {
    console.log('📄 Body:', JSON.stringify(req.body, null, 2));
  }
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : '🟢';
    console.log(`📤 ${statusColor} ${res.statusCode} ${req.method} ${req.originalUrl} - ${duration}ms`);
  });
  
  next();
};

module.exports = requestLogger;
