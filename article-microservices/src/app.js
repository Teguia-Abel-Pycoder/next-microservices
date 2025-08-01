// found in app.js
const express = require('express');
const cors = require('cors');
// const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Import routes
const articleRoutes = require('./routes/article.routes');
const offerRoutes = require('./routes/offer.routes');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

// Security middleware
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", "data:", "https:"],
//     },
//   },
//   crossOriginEmbedderPolicy: false // Disable for SSE compatibility
// }));

// Compression middleware
app.use(compression());

// CORS configuration optimized for SSE
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://your-frontend-domain.com'
    ];

    // ✅ Always allow requests in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // ✅ In production, allow if origin is in the whitelist
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // ❌ Otherwise, block the request
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Cache-Control',
    'X-Requested-With',
    'X-User-Username'
  ],
  credentials: false
}));


// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static(
  path.join(__dirname, '..', 'uploads'),
  {
    maxAge: '1d', // Cache static files for 1 day
    etag: true
  }
));

// Request logging (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

// Health check endpoint
app.get('/health', (req, res) => {
  const { getConnectionStats } = require('./SSE/sseManager');
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    sse: getConnectionStats()
  });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Articles & Offers API Documentation'
}));

// Additional headers for SSE optimization
app.use('/offer/stream', (req, res, next) => {
  res.set({
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'X-Content-Type-Options': 'nosniff'
  });
  next();
});

// API Routes
app.use('/api/articles', articleRoutes);
app.use('/offer', offerRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Articles & Offers API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'API for managing articles and offers with real-time notifications',
    documentation: '/api-docs',
    endpoints: {
      articles: '/api/articles',
      offers: '/offer',
      health: '/health',
      sse: '/offer/stream/:seller'
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
