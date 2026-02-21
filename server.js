const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'oshkosh-flyers-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 hour
}));

app.use(flash());

// Flash message middleware
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.isAdmin = req.session && req.session.isAdmin;
  next();
});

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'images'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// ========== Data helpers ==========

const DATA_DIR = path.join(__dirname, 'data');

function readData(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeData(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// ========== Auth middleware ==========

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ========== Public routes ==========

app.get('/', (req, res) => {
  const site = readData('site.json');
  const home = readData('home.json');
  const announcements = readData('announcements.json');
  res.render('home', { site, home, announcements });
});

app.get('/about', (req, res) => {
  const site = readData('site.json');
  const about = readData('about.json');
  res.render('about', { site, about });
});

app.get('/calendar', (req, res) => {
  const site = readData('site.json');
  const calendar = readData('calendar.json');
  res.render('calendar', { site, calendar });
});

app.get('/contact', (req, res) => {
  const site = readData('site.json');
  const contact = readData('contact.json');
  res.render('contact', { site, contact });
});

app.get('/registration', (req, res) => {
  const site = readData('site.json');
  const registration = readData('registration.json');
  res.render('registration', { site, registration });
});

app.get('/sponsors', (req, res) => {
  const site = readData('site.json');
  const sponsors = readData('sponsors.json');
  res.render('sponsors', { site, sponsors });
});

// ========== Admin routes ==========

app.get('/admin/login', (req, res) => {
  const site = readData('site.json');
  res.render('admin/login', { site });
});

app.post('/admin/login', (req, res) => {
  const admin = readData('admin.json');
  const { username, password } = req.body;
  // Simple plaintext comparison for the default; in production use bcrypt
  if (username === admin.username && password === admin.password) {
    req.session.isAdmin = true;
    req.flash('success', 'Welcome back!');
    res.redirect('/admin');
  } else {
    req.flash('error', 'Invalid credentials');
    res.redirect('/admin/login');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/admin', requireAdmin, (req, res) => {
  const site = readData('site.json');
  res.render('admin/dashboard', { site });
});

// Edit site settings
app.get('/admin/site', requireAdmin, (req, res) => {
  const site = readData('site.json');
  res.render('admin/edit-site', { site });
});

app.post('/admin/site', requireAdmin, (req, res) => {
  const site = readData('site.json');
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
  writeData('site.json', site);
  req.flash('success', 'Site settings updated');
  res.redirect('/admin');
});

// Edit home page
app.get('/admin/home', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const home = readData('home.json');
  res.render('admin/edit-home', { site, home });
});

app.post('/admin/home', requireAdmin, (req, res) => {
  const home = readData('home.json');
  home.heroTitle = req.body.heroTitle || home.heroTitle;
  home.heroSubtitle = req.body.heroSubtitle || home.heroSubtitle;
  home.mission = req.body.mission || home.mission;
  home.registrationOpen = req.body.registrationOpen === 'on';
  home.registrationUrl = req.body.registrationUrl || home.registrationUrl;
  home.achievements = req.body.achievements || home.achievements;
  writeData('home.json', home);
  req.flash('success', 'Home page updated');
  res.redirect('/admin');
});

// Edit about page
app.get('/admin/about', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const about = readData('about.json');
  res.render('admin/edit-about', { site, about });
});

app.post('/admin/about', requireAdmin, (req, res) => {
  const about = readData('about.json');
  about.history = req.body.history || about.history;
  about.missionStatement = req.body.missionStatement || about.missionStatement;
  about.values = req.body.values || about.values;

  // Process coaches
  about.coaches = [];
  if (req.body.coachName) {
    const names = Array.isArray(req.body.coachName) ? req.body.coachName : [req.body.coachName];
    const roles = Array.isArray(req.body.coachRole) ? req.body.coachRole : [req.body.coachRole];
    const bios = Array.isArray(req.body.coachBio) ? req.body.coachBio : [req.body.coachBio];
    for (let i = 0; i < names.length; i++) {
      if (names[i] && names[i].trim()) {
        about.coaches.push({
          name: names[i].trim(),
          role: (roles[i] || '').trim(),
          bio: (bios[i] || '').trim()
        });
      }
    }
  }

  writeData('about.json', about);
  req.flash('success', 'About page updated');
  res.redirect('/admin');
});

// Announcements management
app.get('/admin/announcements', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const announcements = readData('announcements.json');
  res.render('admin/edit-announcements', { site, announcements });
});

app.post('/admin/announcements/add', requireAdmin, (req, res) => {
  const announcements = readData('announcements.json');
  announcements.items.unshift({
    id: Date.now().toString(),
    title: req.body.title,
    content: req.body.content,
    date: req.body.date || new Date().toISOString().split('T')[0],
    pinned: req.body.pinned === 'on'
  });
  writeData('announcements.json', announcements);
  req.flash('success', 'Announcement added');
  res.redirect('/admin/announcements');
});

app.post('/admin/announcements/delete/:id', requireAdmin, (req, res) => {
  const announcements = readData('announcements.json');
  announcements.items = announcements.items.filter(a => a.id !== req.params.id);
  writeData('announcements.json', announcements);
  req.flash('success', 'Announcement deleted');
  res.redirect('/admin/announcements');
});

// Calendar management
app.get('/admin/calendar', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const calendar = readData('calendar.json');
  res.render('admin/edit-calendar', { site, calendar });
});

app.post('/admin/calendar/add', requireAdmin, (req, res) => {
  const calendar = readData('calendar.json');
  calendar.events.push({
    id: Date.now().toString(),
    title: req.body.title,
    date: req.body.date,
    time: req.body.time || '',
    location: req.body.location || '',
    description: req.body.description || '',
    type: req.body.type || 'practice'
  });
  // Sort events by date
  calendar.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  writeData('calendar.json', calendar);
  req.flash('success', 'Event added');
  res.redirect('/admin/calendar');
});

app.post('/admin/calendar/delete/:id', requireAdmin, (req, res) => {
  const calendar = readData('calendar.json');
  calendar.events = calendar.events.filter(e => e.id !== req.params.id);
  writeData('calendar.json', calendar);
  req.flash('success', 'Event deleted');
  res.redirect('/admin/calendar');
});

// Contact page editing
app.get('/admin/contact', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const contact = readData('contact.json');
  res.render('admin/edit-contact', { site, contact });
});

app.post('/admin/contact', requireAdmin, (req, res) => {
  const contact = readData('contact.json');
  contact.address = req.body.address || contact.address;
  contact.mailingAddress = req.body.mailingAddress || contact.mailingAddress;
  contact.email = req.body.email || contact.email;
  contact.phone = req.body.phone || contact.phone;

  // Process board members
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

  writeData('contact.json', contact);
  req.flash('success', 'Contact page updated');
  res.redirect('/admin');
});

// Registration page editing
app.get('/admin/registration', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const registration = readData('registration.json');
  res.render('admin/edit-registration', { site, registration });
});

app.post('/admin/registration', requireAdmin, (req, res) => {
  const registration = readData('registration.json');
  registration.isOpen = req.body.isOpen === 'on';
  registration.season = req.body.season || registration.season;
  registration.registrationUrl = req.body.registrationUrl || registration.registrationUrl;
  registration.description = req.body.description || registration.description;
  registration.deadline = req.body.deadline || registration.deadline;
  registration.fee = req.body.fee || registration.fee;
  registration.ageGroups = req.body.ageGroups || registration.ageGroups;
  registration.requirements = req.body.requirements || registration.requirements;
  writeData('registration.json', registration);
  req.flash('success', 'Registration page updated');
  res.redirect('/admin');
});

// Sponsors page editing
app.get('/admin/sponsors', requireAdmin, (req, res) => {
  const site = readData('site.json');
  const sponsors = readData('sponsors.json');
  res.render('admin/edit-sponsors', { site, sponsors });
});

app.post('/admin/sponsors', requireAdmin, (req, res) => {
  const sponsors = readData('sponsors.json');
  sponsors.headline = req.body.headline || sponsors.headline;
  sponsors.description = req.body.description || sponsors.description;
  sponsors.becomeASponsor = req.body.becomeASponsor || sponsors.becomeASponsor;
  writeData('sponsors.json', sponsors);
  req.flash('success', 'Sponsors page updated');
  res.redirect('/admin/sponsors');
});

app.post('/admin/sponsors/add', requireAdmin, upload.single('logo'), (req, res) => {
  const sponsors = readData('sponsors.json');
  sponsors.sponsors.push({
    id: Date.now().toString(),
    name: req.body.name,
    url: req.body.url || '',
    logo: req.file ? '/images/' + req.file.filename : ''
  });
  writeData('sponsors.json', sponsors);
  req.flash('success', 'Sponsor added');
  res.redirect('/admin/sponsors');
});

app.post('/admin/sponsors/delete/:id', requireAdmin, (req, res) => {
  const sponsors = readData('sponsors.json');
  sponsors.sponsors = sponsors.sponsors.filter(s => s.id !== req.params.id);
  writeData('sponsors.json', sponsors);
  req.flash('success', 'Sponsor removed');
  res.redirect('/admin/sponsors');
});

// Change admin password
app.get('/admin/password', requireAdmin, (req, res) => {
  const site = readData('site.json');
  res.render('admin/change-password', { site });
});

app.post('/admin/password', requireAdmin, (req, res) => {
  const admin = readData('admin.json');
  if (req.body.currentPassword !== admin.password) {
    req.flash('error', 'Current password is incorrect');
    return res.redirect('/admin/password');
  }
  if (req.body.newPassword !== req.body.confirmPassword) {
    req.flash('error', 'New passwords do not match');
    return res.redirect('/admin/password');
  }
  if (req.body.newPassword.length < 6) {
    req.flash('error', 'Password must be at least 6 characters');
    return res.redirect('/admin/password');
  }
  admin.password = req.body.newPassword;
  writeData('admin.json', admin);
  req.flash('success', 'Password changed successfully');
  res.redirect('/admin');
});

// Image upload
app.post('/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: '/images/' + req.file.filename });
});

// Start server
app.listen(PORT, () => {
  console.log(`Oshkosh Flyers website running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
