const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.registerUser = async (req, res) => {
  const { email, phone, username, password } = req.body;

  try {
    if (!email || !phone || !username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!/^\d+$/.test(phone)) {
      return res.status(400).json({ message: 'Phone number must contain only digits' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email,
        phone,
        username,
        password: hashedPassword,
        location: null,
        fullname: `${username}`,
        rate: null,
        image: null,
        badge: false
      }
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        phone: newUser.phone,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    console.log('Logging in user:', user);
    console.log('Username:', user.username);

    const token = jwt.sign(
      { username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );  


    res.json({ token }); // or send token + user info
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong', error: err.message });
  }
};

exports.updateUserLocation = async (req, res) => {
  try{
    const username = req.user?.username;
    const { location } = req.body;

    if (!location || typeof location !== 'string') {
      return res.status(400).json({ message: 'Valid location is required' });
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { username },
        data: { location },
      });

      res.status(200).json({
        message: 'Location updated successfully',
        location: updatedUser.location,
      });
    } catch (error) {
      console.error('Error updating location:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUserImage = async (req, res) => {
  try{
    const username = req.user?.username;

    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { username },
        data: {
          image: req.file.filename,
        },
      });

      res.status(200).json({
        message: 'Image updated successfully',
        image: updatedUser.image,
      });
    } catch (error) {
      console.error('Error updating image:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.rateUser = async (req, res) => {
  const gradingUsername = req.user.username; // Extracted from JWT
  const targetUsername = req.params.username;
  const { grade } = req.body;

  try {
    // 1. Validate grade input
    if (typeof grade !== 'number' || grade < 0 || grade > 5) {
      return res.status(400).json({ message: 'Grade must be a number between 0 and 5' });
    }

    // 2. Prevent self-rating
    if (gradingUsername === targetUsername) {
      return res.status(403).json({ message: 'You cannot rate yourself' });
    }

    // 3. Find the target user to rate
    const userToRate = await prisma.user.findUnique({
      where: { username: targetUsername }
    });

    if (!userToRate) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 4. Merge the new rating into the JSON field
    const updatedRate = {
      ...(userToRate.rate || {}),
      [gradingUsername]: grade
    };

    await prisma.user.update({
      where: { username: targetUsername },
      data: { rate: updatedRate }
    });

    res.status(200).json({ message: `You rated ${targetUsername} with ${grade}` });

  } catch (error) {
    console.error('Rate user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const username = req.user?.username;

    if (!username) {
      return res.status(400).json({ error: 'Username missing from token' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        fullname: true,
        phone: true,
        username: true,
        createdAt: true,
        location: true,
        rate: true,
        image: true,
        badge: true
      }
    });


    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUsername = async (req, res) => {
  const { newUsername } = req.body;
  try {
    const username = req.user?.username;

    if (!username) {
      return res.status(400).json({ error: 'Username missing from token' });
    }

    if (!newUsername || newUsername.trim().length < 3) {
      return res.status(400).json({ error: 'Invalid new username' });
    }

    try {
      // Check if new username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username: newUsername }
      });

      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      // Update the username
      const updatedUser = await prisma.user.update({
        where: { username},
        data: { username: newUsername }
      });

      res.json({
        message: 'Username updated successfully',
        username: updatedUser.username
      });

    } catch (error) {
      console.error('Error updating username:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};