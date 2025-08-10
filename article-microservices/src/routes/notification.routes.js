// routes/notification.routes.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats
} = require('../controllers/notification.controller');

// Rate limiting for notifications
const notificationLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { 
    success: false, 
    message: 'Too many notification requests, please try again later.' 
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all notification routes
router.use(notificationLimit);

// Authentication middleware for notifications
const requireAuth = (req, res, next) => {
  const username = req.headers['x-user-username'];
  if (!username) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

// Apply authentication to all routes
router.use(requireAuth);

// Get user notifications with pagination and filtering
router.get('/', getUserNotifications);

// Get notification statistics
router.get('/stats', getNotificationStats);

// Mark notification as read
router.put('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', markAllAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

module.exports = router;