const express = require('express');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;

      // Must explicitly select passwordHash since it has select: false in schema
      const user = await User.findOne({ email }).select('+passwordHash');
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await user.comparePassword(password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        token,
        user: user.toSafeObject(),
        mustChangePassword: user.mustChangePassword,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns the currently authenticated user. Frontend calls this on load to
// restore session from a stored token.
router.get('/me', auth, async (req, res) => {
  try {
    // Populate hospitalID so frontend gets hospital name
    const user = await User.findById(req.user._id).populate('hospitalID', 'name hospitalID city');
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', auth,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('Minimum 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select('+passwordHash');

      const valid = await user.comparePassword(currentPassword);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

      await user.setPassword(newPassword);
      user.mustChangePassword = false; // clear the first-login flag
      await user.save();

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
