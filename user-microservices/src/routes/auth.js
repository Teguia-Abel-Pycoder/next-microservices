const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Start Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);



router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    try {
      const user = req.user;

      if (!user || !user.username || !user.id) {
        return res.status(400).json({ error: 'Invalid user data from Google strategy' });
      }

      // Create a JWT with user ID and username
      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      // Send token back as JSON
      res.json({ token });

      // OR if you're using a frontend, you can redirect with the token
      // res.redirect(`http://your-frontend-app.com/auth/success?token=${token}`);

      // OR set as HTTP-only cookie (recommended for security)
      // res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 86400000 }).redirect('http://your-frontend-app.com');

    } catch (error) {
      console.error('Token generation error:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  }
);
module.exports = router;
