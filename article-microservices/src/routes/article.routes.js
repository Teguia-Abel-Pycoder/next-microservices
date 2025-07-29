// Found in article.routes.js
const express = require('express');
const router = express.Router(); // 🟢 use this instead of articleRouter
// const upload = require('../middleware/errorHandler');
const upload = require('../middleware/upload');
const rateLimit = require('express-rate-limit');
const {
  createArticle,
  getArticleById,
  updateArticleById,
  deleteArticleById,
  togglePublishArticle, 
  getUserArticles,
  getAllArticlesSortedByLatest,
  getArticlesByUsername,
} = require('../controllers/article.controller');

// Rate limiting
const createArticleLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { 
    success: false, 
    message: 'Too many articles created, please try again later.' 
  }
});

const articleGeneralLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { 
    success: false, 
    message: 'Too many requests, please try again later.' 
  }
});

// Apply general rate limiting to all routes
router.use(articleGeneralLimit);

// Article CRUD operations
router.post('/', createArticleLimit, upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'images', maxCount: 5 }
]), createArticle);

router.get('/details/:id', getArticleById);
router.put('/update/:id', upload.array('images', 5), updateArticleById);
router.delete('/:id', deleteArticleById);
router.put('/publish/:id', togglePublishArticle);

// Article listing endpoints
router.get('/my-articles', getUserArticles);
router.get('/latest', getAllArticlesSortedByLatest);
router.get('/user/:username', getArticlesByUsername);

module.exports = router;
