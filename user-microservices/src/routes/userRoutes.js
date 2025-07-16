const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const userController = require('../controllers/userController');
router.post('/login', userController.loginUser);
// Protected route
router.get('/me', verifyToken, userController.getMyProfile);

// Registration endpoint
router.post('/register', userController.registerUser);

router.put('/location', verifyToken, userController.updateUserLocation);

// New route for user profile image
router.put('/image', verifyToken, upload.single('image'), userController.updateUserImage);

router.post('/rate/:username', verifyToken, userController.rateUser);

router.put('/username', verifyToken, userController.updateUsername);

module.exports = router;
