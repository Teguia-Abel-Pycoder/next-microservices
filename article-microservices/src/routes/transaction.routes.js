// routes/transaction.routes.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  initiateTransaction,
  markAsShipped,
  confirmDelivery,
  openDispute,
  getUserTransactions,
  getTransactionById,
  getTransactionStats,
  cancelTransaction
} = require('../controllers/transaction.controller');

// Rate limiting
const transactionLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { 
    success: false, 
    message: 'Too many transaction requests, please try again later.' 
  }
});

const disputeLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 dispute requests per hour
  message: { 
    success: false, 
    message: 'Too many dispute requests, please try again later.' 
  }
});

// Apply general rate limiting to all routes
router.use(transactionLimit);

// Transaction management routes
router.post('/initiate', initiateTransaction);
router.put('/:id/ship', markAsShipped);
router.put('/:id/confirm-delivery', confirmDelivery);
router.put('/:id/dispute', disputeLimit, openDispute);
router.put('/:id/cancel', cancelTransaction);

// Transaction query routes
router.get('/stats', getTransactionStats);
router.get('/', getUserTransactions);
router.get('/:id', getTransactionById);

module.exports = router;