const express = require('express');
const router = express.Router();

// Capture at module load - updates when nodemon restarts
const serverStartTime = new Date().toISOString();
const pkg = require('../../package.json');
const { verifyToken } = require('../controllers/authController');

// Health check (public - returns version and server start time)
router.get('/health', (req, res) => res.json({
    status: 'OK',
    version: pkg.version,
    serverStartTime
}));

// Protected Routes
router.use(verifyToken);

// User Profile
const { updateProfile, getProfile } = require('../controllers/userController');
router.post('/user/profile', updateProfile);
router.get('/user/profile', getProfile);

// Notes (example domain)
const { getNotes, getNote, createNote, updateNote, deleteNote } = require('../controllers/notesController');
router.get('/notes', getNotes);
router.get('/notes/:id', getNote);
router.post('/notes', createNote);
router.put('/notes/:id', updateNote);
router.delete('/notes/:id', deleteNote);

module.exports = router;
