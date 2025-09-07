import path from 'path';

import express from 'express';
import session from 'express-session';
import exphbs from 'express-handlebars';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { ensureLoggedIn } from 'connect-ensure-login';

import { streamImage } from './views/mjpeg.js';
import dotenv from 'dotenv';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Always load .env from this directory
dotenv.config({ path: path.join(__dirname, '.env') });

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  ALLOWED_EMAILS,
  SESSION_SECRET,
  PORT = 3000,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !ALLOWED_EMAILS || !SESSION_SECRET) {
  console.error('Missing required env vars. See .env.example');
  process.exit(1);
}

// Resolve image path (absolute if provided, otherwise relative to app dir)
const STREAM_IMAGE = path.isAbsolute(process.env.STREAM_IMAGE || '')
  ? process.env.STREAM_IMAGE
  : path.join(__dirname, process.env.STREAM_IMAGE || 'public/dog.png');

const STREAM_FPS = Math.max(1, parseInt(process.env.STREAM_FPS || '10', 10));

const app = express();
app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  partialsDir: path.join(__dirname, 'partials')
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.set('trust proxy', 1); // trust ngrok/any proxy for secure cookies

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false }
}));

// Flip cookies to secure when behind HTTPS (e.g., ngrok)
app.use((req, _res, next) => {
  if ((req.headers['x-forwarded-proto'] || '').includes('https')) {
    req.session.cookie.secure = true;
  }
  next();
});

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (_at, _rt, profile, done) => {
  const email = (profile.emails?.[0]?.value || '').toLowerCase();
  if (!ALLOWED_EMAILS.split(",").includes(email)) {
    return done(null, false, { message: 'Unauthorized email' });
  }
  return done(null, { id: profile.id, displayName: profile.displayName, email });
}));

app.use(passport.initialize());
app.use(passport.session());

// Static folder (optional)
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/login', (_req, res) => {
  res.render("login")
});

// OAuth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (_req, res) => res.redirect('/')
);

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/login'));
  });
});

// Home page (embeds MJPEG)
app.get('/', ensureLoggedIn('/login'), (_req, res) => {
  res.render("index", { STREAM_IMAGE: path.basename(STREAM_IMAGE), STREAM_FPS, user: _req.user });
});

// MJPEG stream from a static image (PNG/JPG both OK)
app.get('/mjpeg', ensureLoggedIn('/login'), (_req, res) => {
  streamImage(STREAM_IMAGE, STREAM_FPS, _req, res);
});

// Debug: serve the raw image (auth'd)
app.get('/image', ensureLoggedIn('/login'), (_req, res) => {
  res.sendFile(STREAM_IMAGE);
});

// Health
app.get('/healthz', (_req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`DogCam on http://localhost:${PORT}`);
});
