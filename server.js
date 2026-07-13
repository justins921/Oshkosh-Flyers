const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'oshkosh-flyers-jwt-secret-change-me';
const IS_VERCEL = process.env.VERCEL === '1';

// --- Image uploads ---

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

async function uploadImage(file) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    || Object.keys(process.env).filter(k => k.endsWith('_READ_WRITE_TOKEN')).map(k => process.env[k])[0];
  if (blobToken) {
    const { put } = require('@vercel/blob');
    const blob = await put(file.originalname, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: blobToken
    });
    return blob.url;
  }
  if (IS_VERCEL) {
    throw new Error('Connect Vercel Blob storage to enable image uploads.');
  }
  const imagesDir = path.join(__dirname, 'public', 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const filename = Date.now() + path.extname(file.originalname);
  fs.writeFileSync(path.join(imagesDir, filename), file.buffer);
  return '/images/' + filename;
}

// --- Document uploads ---

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) return cb(null, true);
    cb(new Error('Only document files are allowed (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV)'));
  }
});

async function uploadDocument(file) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    || Object.keys(process.env).filter(k => k.endsWith('_READ_WRITE_TOKEN')).map(k => process.env[k])[0];
  if (blobToken) {
    const { put } = require('@vercel/blob');
    const blob = await put(file.originalname, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: blobToken
    });
    return blob.url;
  }
  if (IS_VERCEL) {
    throw new Error('Connect Vercel Blob storage to enable file uploads.');
  }
  const docsDir = path.join(__dirname, 'public', 'documents');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = Date.now() + '-' + safeName;
  fs.writeFileSync(path.join(docsDir, filename), file.buffer);
  return '/documents/' + filename;
}

// --- Password hashing (Node.js built-in crypto) ---

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --- Upstash Redis for persistent storage (optional) ---

let redis = null;
if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) {
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
    });
  } catch {}
}

const DATA_DIR = path.join(__dirname, 'data');

const DATA_DEFAULTS = {
  'site.json': { teamName: 'Oshkosh Flyers', tagline: 'Youth Football Club', email: '', phone: '', facebook: '', hudl: '', instagram: '', league: '', gradeRange: '', mailingAddress: '', address: '', presidentEmail: '', fundraisingEmail: '' },
  'home.json': { heroTitle: 'Oshkosh Flyers Football', heroSubtitle: '', mission: '', registrationOpen: false, registrationUrl: '', achievements: '' },
  'about.json': { history: '', missionStatement: '', values: '', coaches: [] },
  'announcements.json': { items: [] },
  'calendar.json': { events: [] },
  'contact.json': { address: '', mailingAddress: '', email: '', phone: '', boardMembers: [] },
  'registration.json': { isOpen: false, season: '', registrationUrl: '', description: '', deadline: '', fee: '', ageGroups: '', requirements: '' },
  'sponsors.json': { headline: 'Thank you to our sponsors!', description: '', becomeASponsor: '', sponsors: [] },
  'resources.json': { headline: 'Resources', description: '', resources: [] },
  'users.json': { users: [] }
};

async function readData(filename) {
  if (redis) {
    try {
      const data = await redis.get(`flyers:${filename}`);
      if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch {}
  }
  const filepath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }
  return DATA_DEFAULTS[filename] || null;
}

async function writeData(filename, data) {
  if (redis) {
    await redis.set(`flyers:${filename}`, JSON.stringify(data));
    return;
  }
  if (!IS_VERCEL) {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return;
  }
  throw new Error('Connect Vercel KV to enable content editing on production.');
}

async function getUsers() {
  let users = await readData('users.json');
  if (users && users.users && users.users.length > 0) return users;
  const admin = await readData('admin.json');
  const pw = (admin && admin.password) || 'flyersadmin2026';
  const un = (admin && admin.username) || 'admin';
  const hash = await hashPassword(pw);
  users = {
    users: [{
      id: '1',
      username: un,
      passwordHash: hash,
      role: 'admin',
      createdAt: new Date().toISOString()
    }]
  };
  await writeData('users.json', users);
  return users;
}

// --- Cookie-based flash messages (replaces connect-flash + express-session) ---

function flash(res, type, message) {
  res.cookie(`flash_${type}`, message, { maxAge: 10000, httpOnly: true, path: '/' });
}

app.use((req, res, next) => {
  res.locals.success = req.cookies.flash_success ? [req.cookies.flash_success] : [];
  res.locals.error = req.cookies.flash_error ? [req.cookies.flash_error] : [];
  if (req.cookies.flash_success) res.clearCookie('flash_success', { path: '/' });
  if (req.cookies.flash_error) res.clearCookie('flash_error', { path: '/' });

  res.locals.isAdmin = false;
  res.locals.currentUser = null;
  const token = req.cookies.admin_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.locals.currentUser = decoded;
      if (decoded.role === 'admin') {
        res.locals.isAdmin = true;
      }
    } catch {}
  }
  next();
});

// --- Auth ---

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.redirect('/admin/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      flash(res, 'error', 'Admin access required');
      return res.redirect('/admin/login');
    }
    req.user = decoded;
    next();
  } catch {
    res.clearCookie('admin_token');
    res.redirect('/admin/login');
  }
}

// --- Public routes ---

app.get('/', async (req, res) => {
  const [site, home, announcements] = await Promise.all([
    readData('site.json'), readData('home.json'), readData('announcements.json')
  ]);
  res.render('home', { site, home, announcements });
});

app.get('/about', async (req, res) => {
  const [site, about] = await Promise.all([readData('site.json'), readData('about.json')]);
  res.render('about', { site, about });
});

app.get('/calendar', async (req, res) => {
  const [site, calendar] = await Promise.all([readData('site.json'), readData('calendar.json')]);
  res.render('calendar', { site, calendar });
});

app.get('/contact', async (req, res) => {
  const [site, contact] = await Promise.all([readData('site.json'), readData('contact.json')]);
  res.render('contact', { site, contact });
});

app.get('/registration', async (req, res) => {
  const [site, registration] = await Promise.all([readData('site.json'), readData('registration.json')]);
  res.render('registration', { site, registration });
});

app.get('/sponsors', async (req, res) => {
  const [site, sponsors] = await Promise.all([readData('site.json'), readData('sponsors.json')]);
  res.render('sponsors', { site, sponsors });
});

app.get('/resources', async (req, res) => {
  const [site, resources] = await Promise.all([readData('site.json'), readData('resources.json')]);
  res.render('resources', { site, resources });
});

// --- Admin routes ---

app.get('/admin/login', async (req, res) => {
  const site = await readData('site.json');
  res.render('admin/login', { site });
});

app.post('/admin/login', async (req, res) => {
  try {
    const usersData = await getUsers();
    const { username, password } = req.body;
    const user = usersData.users.find(u => u.username === username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      flash(res, 'error', 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    if (user.role === 'pending') {
      flash(res, 'error', 'Your account is pending admin approval');
      return res.redirect('/admin/login');
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    res.cookie('admin_token', token, { httpOnly: true, maxAge: 7200000, path: '/', sameSite: 'lax', secure: IS_VERCEL });
    flash(res, 'success', 'Welcome back!');
    res.redirect('/admin');
  } catch (e) {
    flash(res, 'error', 'Login failed');
    res.redirect('/admin/login');
  }
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.redirect('/');
});

// Registration
app.get('/admin/register', async (req, res) => {
  const site = await readData('site.json');
  res.render('admin/register', { site });
});

app.post('/admin/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;
    if (!username || !password) {
      flash(res, 'error', 'Username and password are required');
      return res.redirect('/admin/register');
    }
    if (password !== confirmPassword) {
      flash(res, 'error', 'Passwords do not match');
      return res.redirect('/admin/register');
    }
    if (password.length < 6) {
      flash(res, 'error', 'Password must be at least 6 characters');
      return res.redirect('/admin/register');
    }
    if (username.trim().length < 3) {
      flash(res, 'error', 'Username must be at least 3 characters');
      return res.redirect('/admin/register');
    }
    const usersData = await getUsers();
    if (usersData.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
      flash(res, 'error', 'Username already taken');
      return res.redirect('/admin/register');
    }
    usersData.users.push({
      id: Date.now().toString(),
      username: username.trim(),
      passwordHash: await hashPassword(password),
      role: 'pending',
      createdAt: new Date().toISOString()
    });
    await writeData('users.json', usersData);
    flash(res, 'success', 'Account created! An administrator will review your account.');
    res.redirect('/admin/login');
  } catch (e) {
    flash(res, 'error', e.message);
    res.redirect('/admin/register');
  }
});

app.get('/admin', requireAdmin, async (req, res) => {
  const site = await readData('site.json');
  res.render('admin/dashboard', { site });
});

// Site settings
app.get('/admin/site', requireAdmin, async (req, res) => {
  const site = await readData('site.json');
  res.render('admin/edit-site', { site });
});

app.post('/admin/site', requireAdmin, async (req, res) => {
  try {
    const site = await readData('site.json');
    site.teamName = req.body.teamName || site.teamName;
    site.tagline = req.body.tagline || site.tagline;
    site.phone = req.body.phone || '';
    site.email = req.body.email || site.email;
    site.presidentEmail = req.body.presidentEmail || '';
    site.fundraisingEmail = req.body.fundraisingEmail || '';
    site.address = req.body.address || site.address;
    site.mailingAddress = req.body.mailingAddress || site.mailingAddress;
    site.facebook = req.body.facebook || '';
    site.instagram = req.body.instagram || '';
    site.hudl = req.body.hudl || '';
    site.league = req.body.league || '';
    site.gradeRange = req.body.gradeRange || '';
    await writeData('site.json', site);
    flash(res, 'success', 'Site settings updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// Home page
app.get('/admin/home', requireAdmin, async (req, res) => {
  const [site, home] = await Promise.all([readData('site.json'), readData('home.json')]);
  res.render('admin/edit-home', { site, home });
});

app.post('/admin/home', requireAdmin, async (req, res) => {
  try {
    const home = await readData('home.json');
    home.heroTitle = req.body.heroTitle || home.heroTitle;
    home.heroSubtitle = req.body.heroSubtitle || home.heroSubtitle;
    home.mission = req.body.mission || home.mission;
    home.registrationOpen = req.body.registrationOpen === 'on';
    home.registrationUrl = req.body.registrationUrl || home.registrationUrl;
    home.achievements = req.body.achievements || home.achievements;
    await writeData('home.json', home);
    flash(res, 'success', 'Home page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// About page
app.get('/admin/about', requireAdmin, async (req, res) => {
  const [site, about] = await Promise.all([readData('site.json'), readData('about.json')]);
  res.render('admin/edit-about', { site, about });
});

app.post('/admin/about', requireAdmin, upload.any(), async (req, res) => {
  try {
    const about = await readData('about.json');
    about.history = req.body.history || about.history;
    about.missionStatement = req.body.missionStatement || about.missionStatement;
    about.values = req.body.values || about.values;
    about.coaches = [];
    if (req.body.coachName) {
      const names = Array.isArray(req.body.coachName) ? req.body.coachName : [req.body.coachName];
      const roles = Array.isArray(req.body.coachRole) ? req.body.coachRole : [req.body.coachRole];
      const bios = Array.isArray(req.body.coachBio) ? req.body.coachBio : [req.body.coachBio];
      const existingPhotos = req.body.coachExistingPhoto
        ? (Array.isArray(req.body.coachExistingPhoto) ? req.body.coachExistingPhoto : [req.body.coachExistingPhoto])
        : [];
      for (let i = 0; i < names.length; i++) {
        if (names[i] && names[i].trim()) {
          let photo = (existingPhotos[i] || '').trim();
          const file = req.files && req.files.find(f => f.fieldname === 'coachPhoto_' + i);
          if (file) {
            photo = await uploadImage(file);
          }
          about.coaches.push({
            name: names[i].trim(),
            role: (roles[i] || '').trim(),
            bio: (bios[i] || '').trim(),
            photo: photo
          });
        }
      }
    }
    await writeData('about.json', about);
    flash(res, 'success', 'About page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// Announcements
app.get('/admin/announcements', requireAdmin, async (req, res) => {
  const [site, announcements] = await Promise.all([readData('site.json'), readData('announcements.json')]);
  res.render('admin/edit-announcements', { site, announcements });
});

app.post('/admin/announcements/add', requireAdmin, async (req, res) => {
  try {
    const announcements = await readData('announcements.json');
    announcements.items.unshift({
      id: Date.now().toString(),
      title: req.body.title,
      content: req.body.content,
      date: req.body.date || new Date().toISOString().split('T')[0],
      pinned: req.body.pinned === 'on'
    });
    await writeData('announcements.json', announcements);
    flash(res, 'success', 'Announcement added');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/announcements');
});

app.post('/admin/announcements/delete/:id', requireAdmin, async (req, res) => {
  try {
    const announcements = await readData('announcements.json');
    announcements.items = announcements.items.filter(a => a.id !== req.params.id);
    await writeData('announcements.json', announcements);
    flash(res, 'success', 'Announcement deleted');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/announcements');
});

// Calendar
app.get('/admin/calendar', requireAdmin, async (req, res) => {
  const [site, calendar] = await Promise.all([readData('site.json'), readData('calendar.json')]);
  res.render('admin/edit-calendar', { site, calendar });
});

app.post('/admin/calendar/add', requireAdmin, async (req, res) => {
  try {
    const calendar = await readData('calendar.json');
    calendar.events.push({
      id: Date.now().toString(),
      title: req.body.title,
      date: req.body.date,
      time: req.body.time || '',
      location: req.body.location || '',
      description: req.body.description || '',
      type: req.body.type || 'practice'
    });
    calendar.events.sort((a, b) => new Date(a.date) - new Date(b.date));
    await writeData('calendar.json', calendar);
    flash(res, 'success', 'Event added');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/calendar');
});

app.post('/admin/calendar/delete/:id', requireAdmin, async (req, res) => {
  try {
    const calendar = await readData('calendar.json');
    calendar.events = calendar.events.filter(e => e.id !== req.params.id);
    await writeData('calendar.json', calendar);
    flash(res, 'success', 'Event deleted');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/calendar');
});

// Contact
app.get('/admin/contact', requireAdmin, async (req, res) => {
  const [site, contact] = await Promise.all([readData('site.json'), readData('contact.json')]);
  res.render('admin/edit-contact', { site, contact });
});

app.post('/admin/contact', requireAdmin, async (req, res) => {
  try {
    const contact = await readData('contact.json');
    contact.address = req.body.address || contact.address;
    contact.mailingAddress = req.body.mailingAddress || contact.mailingAddress;
    contact.email = req.body.email || contact.email;
    contact.phone = req.body.phone || contact.phone;
    contact.boardMembers = [];
    if (req.body.memberName) {
      const names = Array.isArray(req.body.memberName) ? req.body.memberName : [req.body.memberName];
      const roles = Array.isArray(req.body.memberRole) ? req.body.memberRole : [req.body.memberRole];
      const emails = Array.isArray(req.body.memberEmail) ? req.body.memberEmail : [req.body.memberEmail];
      for (let i = 0; i < names.length; i++) {
        if (names[i] && names[i].trim()) {
          contact.boardMembers.push({
            name: names[i].trim(),
            role: (roles[i] || '').trim(),
            email: (emails[i] || '').trim()
          });
        }
      }
    }
    await writeData('contact.json', contact);
    flash(res, 'success', 'Contact page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// Registration
app.get('/admin/registration', requireAdmin, async (req, res) => {
  const [site, registration] = await Promise.all([readData('site.json'), readData('registration.json')]);
  res.render('admin/edit-registration', { site, registration });
});

app.post('/admin/registration', requireAdmin, async (req, res) => {
  try {
    const registration = await readData('registration.json');
    registration.isOpen = req.body.isOpen === 'on';
    registration.season = req.body.season || registration.season;
    registration.registrationUrl = req.body.registrationUrl || registration.registrationUrl;
    registration.description = req.body.description || registration.description;
    registration.deadline = req.body.deadline || registration.deadline;
    registration.fee = req.body.fee || registration.fee;
    registration.ageGroups = req.body.ageGroups || registration.ageGroups;
    registration.requirements = req.body.requirements || registration.requirements;
    await writeData('registration.json', registration);
    flash(res, 'success', 'Registration page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// Sponsors
app.get('/admin/sponsors', requireAdmin, async (req, res) => {
  const [site, sponsors] = await Promise.all([readData('site.json'), readData('sponsors.json')]);
  res.render('admin/edit-sponsors', { site, sponsors });
});

app.post('/admin/sponsors', requireAdmin, async (req, res) => {
  try {
    const sponsors = await readData('sponsors.json');
    sponsors.headline = req.body.headline || sponsors.headline;
    sponsors.description = req.body.description || sponsors.description;
    sponsors.becomeASponsor = req.body.becomeASponsor || sponsors.becomeASponsor;
    await writeData('sponsors.json', sponsors);
    flash(res, 'success', 'Sponsors page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/sponsors');
});

app.post('/admin/sponsors/add', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const sponsors = await readData('sponsors.json');
    let logoUrl = '';
    if (req.file) {
      logoUrl = await uploadImage(req.file);
    }
    sponsors.sponsors.push({
      id: Date.now().toString(),
      name: req.body.name,
      url: req.body.url || '',
      logo: logoUrl
    });
    await writeData('sponsors.json', sponsors);
    flash(res, 'success', 'Sponsor added');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/sponsors');
});

app.post('/admin/sponsors/edit/:id', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const sponsors = await readData('sponsors.json');
    const sponsor = sponsors.sponsors.find(s => s.id === req.params.id);
    if (!sponsor) { flash(res, 'error', 'Sponsor not found'); return res.redirect('/admin/sponsors'); }
    sponsor.name = req.body.name || sponsor.name;
    sponsor.url = req.body.url || '';
    if (req.file) {
      sponsor.logo = await uploadImage(req.file);
    } else if (req.body.existingLogo) {
      sponsor.logo = req.body.existingLogo;
    }
    await writeData('sponsors.json', sponsors);
    flash(res, 'success', 'Sponsor updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/sponsors');
});

app.post('/admin/sponsors/delete/:id', requireAdmin, async (req, res) => {
  try {
    const sponsors = await readData('sponsors.json');
    sponsors.sponsors = sponsors.sponsors.filter(s => s.id !== req.params.id);
    await writeData('sponsors.json', sponsors);
    flash(res, 'success', 'Sponsor removed');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/sponsors');
});

// Resources
app.get('/admin/resources', requireAdmin, async (req, res) => {
  const [site, resources] = await Promise.all([readData('site.json'), readData('resources.json')]);
  res.render('admin/edit-resources', { site, resources });
});

app.post('/admin/resources', requireAdmin, async (req, res) => {
  try {
    const resources = await readData('resources.json');
    resources.headline = req.body.headline || resources.headline;
    resources.description = req.body.description || resources.description;
    await writeData('resources.json', resources);
    flash(res, 'success', 'Resources page updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/resources');
});

app.post('/admin/resources/add', requireAdmin, docUpload.single('file'), async (req, res) => {
  try {
    const resources = await readData('resources.json');
    if (!req.file) { flash(res, 'error', 'Please select a file to upload'); return res.redirect('/admin/resources'); }
    const fileUrl = await uploadDocument(req.file);
    resources.resources.push({
      id: Date.now().toString(),
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      category: req.body.category || 'General',
      filename: req.file.originalname,
      url: fileUrl,
      uploadedAt: new Date().toISOString()
    });
    await writeData('resources.json', resources);
    flash(res, 'success', 'Resource added');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/resources');
});

app.post('/admin/resources/edit/:id', requireAdmin, docUpload.single('file'), async (req, res) => {
  try {
    const resources = await readData('resources.json');
    const resource = resources.resources.find(r => r.id === req.params.id);
    if (!resource) { flash(res, 'error', 'Resource not found'); return res.redirect('/admin/resources'); }
    resource.title = req.body.title || resource.title;
    resource.description = req.body.description || '';
    resource.category = req.body.category || resource.category;
    if (req.file) {
      resource.url = await uploadDocument(req.file);
      resource.filename = req.file.originalname;
    }
    await writeData('resources.json', resources);
    flash(res, 'success', 'Resource updated');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/resources');
});

app.post('/admin/resources/delete/:id', requireAdmin, async (req, res) => {
  try {
    const resources = await readData('resources.json');
    resources.resources = resources.resources.filter(r => r.id !== req.params.id);
    await writeData('resources.json', resources);
    flash(res, 'success', 'Resource removed');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/resources');
});

// User management
app.get('/admin/users', requireAdmin, async (req, res) => {
  const [site, usersData] = await Promise.all([readData('site.json'), getUsers()]);
  res.render('admin/users', { site, users: usersData.users });
});

app.post('/admin/users/promote/:id', requireAdmin, async (req, res) => {
  try {
    const usersData = await getUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (user) {
      user.role = 'admin';
      await writeData('users.json', usersData);
      flash(res, 'success', `${user.username} promoted to admin`);
    }
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/users');
});

app.post('/admin/users/demote/:id', requireAdmin, async (req, res) => {
  try {
    const usersData = await getUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (user && user.id !== req.user.userId) {
      user.role = 'pending';
      await writeData('users.json', usersData);
      flash(res, 'success', `${user.username} demoted`);
    } else if (user && user.id === req.user.userId) {
      flash(res, 'error', 'Cannot demote yourself');
    }
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/users');
});

app.post('/admin/users/delete/:id', requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.userId) {
      flash(res, 'error', 'Cannot delete your own account');
      return res.redirect('/admin/users');
    }
    const usersData = await getUsers();
    usersData.users = usersData.users.filter(u => u.id !== req.params.id);
    await writeData('users.json', usersData);
    flash(res, 'success', 'User deleted');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin/users');
});

// Change password
app.get('/admin/password', requireAdmin, async (req, res) => {
  const site = await readData('site.json');
  res.render('admin/change-password', { site });
});

app.post('/admin/password', requireAdmin, async (req, res) => {
  try {
    const usersData = await getUsers();
    const user = usersData.users.find(u => u.id === req.user.userId);
    if (!user) {
      flash(res, 'error', 'User not found');
      return res.redirect('/admin/password');
    }
    if (!(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
      flash(res, 'error', 'Current password is incorrect');
      return res.redirect('/admin/password');
    }
    if (req.body.newPassword !== req.body.confirmPassword) {
      flash(res, 'error', 'New passwords do not match');
      return res.redirect('/admin/password');
    }
    if (req.body.newPassword.length < 6) {
      flash(res, 'error', 'Password must be at least 6 characters');
      return res.redirect('/admin/password');
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    await writeData('users.json', usersData);
    flash(res, 'success', 'Password changed successfully');
  } catch (e) {
    flash(res, 'error', e.message);
  }
  res.redirect('/admin');
});

// General image upload
app.post('/admin/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = await uploadImage(req.file);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Local development server
if (!IS_VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Oshkosh Flyers website running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
