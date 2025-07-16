// authMiddleware.js

const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Get token from header
  const token = authHeader && authHeader.split(' ')[1]; // Expected format: Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // Verify token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }

    // Attach user info from token payload to request object
    req.user = {
      username: decoded.username
    };
    console.log('Decoded JWT:', decoded);

    next(); // Continue to the next middleware or route handler
  });
};

module.exports = verifyToken;
