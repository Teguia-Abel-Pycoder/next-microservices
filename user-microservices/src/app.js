const express = require('express');
const app = express();
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const userRoutes = require('./routes/userRoutes');
require('dotenv').config();
require('./config/passport')(passport); // ✅ This registers the strategy
app.use(cors());
const prisma = require('./lib/prisma');
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
app.use(express.json()); 

app.use('/users', userRoutes); 
app.use(passport.initialize());
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
