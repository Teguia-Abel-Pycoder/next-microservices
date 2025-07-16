const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to generate a unique 
async function generateUniqueUsername(firstName, lastName) {
  let baseUsername = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/\s+/g, '');
  let username = baseUsername;
  let counter = 1;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username; 
}


module.exports = (passport) => {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google Profile:', profile);

        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Email not found in Google profile'), null);
        }

        // Check if user already exists
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          const firstName = profile.name?.givenName || 'user';
          const lastName = profile.name?.familyName || Math.floor(Math.random() * 10000).toString();
          const fullName = `${firstName} ${lastName}`;
          const username = await generateUniqueUsername(firstName, lastName);

          // Create new user
          user = await prisma.user.create({
            data: {
              fullname: fullName,
              username,
              email,
              image: profile.photos?.[0]?.value || null
            }
          });
        }

        console.log("Authenticated user:", user.username);
        return done(null, user); // Return user object for token signing in callback

      } catch (err) {
        console.error('Google strategy error:', err);
        return done(err, null);
      }
    }
  ));
};
