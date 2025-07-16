const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  createArticle,
  getArticleById,
  updateArticleById,
  deleteArticleById,
  togglePublishArticle, 
  getUserArticles,
  getAllArticlesSortedByLatest,
  getArticlesByUsername,
  makeOrUpdateOffer
} = require('../controllers/article.controller');
router.post('/offer/:id', makeOrUpdateOffer);

// To create an article
router.post('/', upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'images', maxCount: 5 }
]), createArticle);

// To get article by ID
router.get('/details/:id', getArticleById);

router.get('/my-articles', getUserArticles);
// Update article by ID (accept file upload if updating image)
router.put('/update/:id', upload.array('images', 5), updateArticleById);

// Delete article by ID
router.delete('/:id', deleteArticleById);

router.put('/publish/:id', togglePublishArticle);

router.get('/latest', getAllArticlesSortedByLatest);

router.get('/user/:username', getArticlesByUsername);

// router.post('/offer/:id', makeOrUpdateOffer);


module.exports = router;
