
// middleware/auth.js
/**
 * Authentication middleware to extract user from headers
 * In a real application, you'd validate JWT tokens here
 */
const authenticate = (req, res, next) => {
  const username = req.headers['x-user-username'];
  
  if (!username) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide x-user-username header.'
    });
  }
  
  // In a real app, you'd validate the token and get user info
  req.user = {
    username: username,
    isAuthenticated: true
  };
  
  next();
};

/**
 * Optional authentication - doesn't fail if no auth provided
 */
const optionalAuth = (req, res, next) => {
  const username = req.headers['x-user-username'];
  
  if (username) {
    req.user = {
      username: username,
      isAuthenticated: true
    };
  }
  
  next();
};

/**
 * Authorization middleware to check if user owns resource
 */
const authorize = (resourceOwnerField = 'owner') => {
  return (req, res, next) => {
    const username = req.headers['x-user-username'];
    const resourceOwner = req.body[resourceOwnerField] || req.params[resourceOwnerField];
    
    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (resourceOwner && resourceOwner !== username) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this resource'
      });
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize
};