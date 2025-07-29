
// utils/errors.js
class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

module.exports = {
  ValidationError,
  AuthorizationError,
  NotFoundError
};