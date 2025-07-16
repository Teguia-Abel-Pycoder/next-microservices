const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();
const verifyToken = require('./middleware/authMiddleware'); // 👈 import your logic
const cors = require('cors');
const app = express();
app.use(cors());



// ✳️ Protect microservices with verifyToken
app.use('/article-api', verifyToken);

// Proxy for user service
app.use('/users-api', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL, // must be http://localhost:3000
  changeOrigin: true,
  pathRewrite: { '^/users-api': '' }, // ✅ Critical fix
  logLevel: 'debug',
  timeout: 10000,
  proxyTimeout: 10000,
  onProxyReq: (proxyReq, req) => {
    console.log(`[GATEWAY] Forwarding ${req.method} ${req.originalUrl} → ${proxyReq.path}`);
    if (req.headers['x-user-username']) {
      proxyReq.setHeader('x-user-username', req.headers['x-user-username']);
    }
  },
  onError(err, req, res) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ message: 'Proxy failed', error: err.message });
  }
}));


// articles proxy
app.use('/article-api', createProxyMiddleware({
  target: process.env.ARTICLE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/articles': '/api/articles' }, // map /articles → /api/articles
  logLevel: 'debug',
  onProxyReq: (proxyReq, req) => {
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
    // Forward x-user-username if auth middleware set it
    if (req.headers['x-user-username']) {
      proxyReq.setHeader('x-user-username', req.headers['x-user-username']);
    }
  },
  onError(err, req, res) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ message: 'Proxy failed', error: err.message });
  }
}));

// auth proxy
app.use('/auth-api', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/auth': '/auth' }, // map /auth → /auth (effectively passthrough)
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    if (req.headers['x-user-username']) {
      proxyReq.setHeader('x-user-username', req.headers['x-user-username']);
    }
  },
}));
// Proxy for serving uploaded images via API Gateway
app.use('/uploads', createProxyMiddleware({
  target: process.env.ARTICLE_SERVICE_URL, // → http://localhost:4000
  changeOrigin: true,
  logLevel: 'debug',
  pathRewrite: { '^/uploads': '/uploads' }, // passthrough
  onError(err, req, res) {
    console.error('Image proxy error:', err.message);
    res.status(500).json({ message: 'Image proxy failed', error: err.message });
  }
}));


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Gateway running at http://localhost:${PORT}`);
});
