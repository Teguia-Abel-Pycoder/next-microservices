
// routes/offer.routes.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { addEmitter, removeEmitter, getActiveConnections } = require('../SSE/sseManager');
const {
  createOffer, 
  updateOfferStatusBySeller, 
  concludeOfferByUser, 
  getOffersBySeller, 
  getOffersByUsername,
  cancelOfferByUser
} = require('../controllers/offer.controller');

// Rate limiting
const offerLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 offers per windowMs
  message: { 
    success: false, 
    message: 'Too many offers created, please try again later.' 
  }
});

const generalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { 
    success: false, 
    message: 'Too many requests, please try again later.' 
  }
});

// Apply general rate limiting
router.use(generalLimit);

// SSE endpoint for real-time notifications
router.get('/stream/:seller', (req, res) => {
  const { seller } = req.params;
  
  console.log(`🔌 New SSE connection request for seller: ${seller}`);
  
  // Validate seller parameter
  if (!seller || seller.trim().length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Seller parameter is required' 
    });
  }
  
  // Set comprehensive SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    // Register emitter
    addEmitter(seller, res);
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'CONNECTION_ESTABLISHED',
      message: 'Connected to offers stream',
      timestamp: new Date().toISOString(),
      seller: seller
    })}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`🔌 SSE connection closed for seller: ${seller}`);
      removeEmitter(seller, res);
    });
    
    req.on('error', (err) => {
      console.error(`❌ SSE connection error for seller ${seller}:`, err);
      removeEmitter(seller, res);
    });
    
    // Handle response errors
    res.on('error', (err) => {
      console.error(`❌ SSE response error for seller ${seller}:`, err);
      removeEmitter(seller, res);
    });
    
  } catch (error) {
    console.error(`❌ Error setting up SSE for seller ${seller}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to establish SSE connection' 
    });
  }
});

// Offer CRUD operations
router.post('/create', offerLimit, createOffer);
router.post('/:offerId/status', updateOfferStatusBySeller);
router.post('/:offerId/conclude', concludeOfferByUser);
router.post('/:offerId/cancel', cancelOfferByUser);

// Offer listing endpoints
router.get('/seller/:sellerName', getOffersBySeller);
router.get('/user/:userName', getOffersByUsername);

// Debug and monitoring endpoints (should be restricted in production)
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/connections', (req, res) => {
    const connections = getActiveConnections();
    res.json({
      success: true,
      message: 'Active SSE connections',
      data: {
        connections: connections,
        totalSellers: Object.keys(connections).length,
        totalConnections: Object.values(connections).reduce((sum, count) => sum + count, 0)
      }
    });
  });

  // Test endpoint to send a message to a specific seller
  router.post('/test/send/:seller', express.json(), (req, res) => {
    const { seller } = req.params;
    const testData = req.body || { 
      type: 'TEST_MESSAGE',
      message: 'This is a test message',
      payload: { test: true }
    };
    
    const { sendToSeller } = require('../SSE/sseManager');
    const sent = sendToSeller(seller, testData);
    
    res.json({ 
      success: sent,
      message: sent ? 'Message sent successfully' : 'No active connections found',
      seller: seller,
      data: testData 
    });
  });
}

module.exports = router;