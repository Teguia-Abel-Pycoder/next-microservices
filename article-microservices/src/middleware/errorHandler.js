// Found in middleware/errorHandler.js
const { ValidationError, AuthorizationError, NotFoundError } = require('../utils/errors');

/**
 * Global error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  console.error('❌ Error:', error);

  // Default error response
  let statusCode = 500;
  let response = {
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };

  // Handle specific error types
  if (error instanceof ValidationError) {
    statusCode = 400;
    response.message = error.message;
    response.errors = error.details;
  } else if (error instanceof AuthorizationError) {
    statusCode = 401;
    response.message = error.message;
  } else if (error instanceof NotFoundError) {
    statusCode = 404;
    response.message = error.message;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    response.message = 'Invalid ID format';
  } else if (error.code === 'P2002') {
    // Prisma unique constraint violation
    statusCode = 409;
    response.message = 'Resource already exists';
  } else if (error.code === 'P2025') {
    // Prisma record not found
    statusCode = 404;
    response.message = 'Resource not found';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413;
    response.message = 'Request entity too large';
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    response.message = handleMulterError(error);
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
    response.error = error.message;
  }

  res.status(statusCode).json(response);
};

/**
 * Handle Multer-specific errors
 */
const handleMulterError = (error) => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File too large';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected field';
    default:
      return 'File upload error';
  }
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    availableRoutes: {
      articles: '/api/articles',
      offers: '/offer',
      health: '/health',
      documentation: '/api-docs'
    }
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};

