const express  = require('express');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const Hospital = require('../models/Hospital');
const { auth, requireRole } = require('../middleware/auth');
const { generateID } = require('../utils/helpers');

const router = express.Router();

// ── GET /api/users/doctors ────────────────────────────────────────────────────
// Admin: list all doctors in their hospital
router.get('/doctors', auth, requireRole('Admin', 'SuperAdmin'), async (req, res) => {
  try {
    const hospitalID = req.user.role === 'SuperAdmin'
      ? req.query.hospitalID
      : req.user.hospitalID;

    if (!hospitalID) return res.status(400).json({ error: 'hospitalID required' });

    // Include both Doctors AND Admins who are also doctors.
    // Match isAlsoDoctor: true OR (isAlsoDoctor not set AND specialisation is set)
    // The second condition handles admin accounts created before the isAlsoDoctor field was added.
    const doctors = await User.find({
      hospitalID,
      isActive: true,
      $or: [
        { role: 'Doctor' },
        { role: 'Admin', isAlsoDoctor: true },
        { role: 'Admin', isAlsoDoctor: { $exists: false }, specialisation: { $nin: [null, ''] } },
      ],
    })
      .select('-passwordHash')
      .sort({ name: 1 });

    res.json({ doctors });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/users/doctors ───────────────────────────────────────────────────
// Admin creates a Doctor account. Password is set by Admin and shared manually.
router.post('/doctors', auth, requireRole('Admin'),
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('specialisation').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, specialisation } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    try {
      const doctor = new User({
        userID:             generateID('USR'),
        role:               'Doctor',
        name,
        email,
        hospitalID:         req.user.hospitalID,
        specialisation:     specialisation || null,
        createdBy:          req.user._id,
        mustChangePassword: true,
      });
      await doctor.setPassword(password);
      await doctor.save();

      await Hospital.findByIdAndUpdate(req.user.hospitalID, {
        $inc: { 'usage.totalDoctors': 1 },
        $set: { 'usage.lastActivityAt': new Date() },
      });

      res.status(201).json({
        message: 'Doctor account created successfully.',
        doctor:  doctor.toSafeObject(),
      });
    } catch (err) {
      console.error('Create doctor error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
router.patch('/me', auth,
  body('name').optional().trim().notEmpty(),
  body('specialisation').optional().trim(),
  body('address').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const allowed = {};
      if (req.body.name)           allowed.name           = req.body.name;
      if (req.body.specialisation) allowed.specialisation = req.body.specialisation;
      if (req.body.address)        allowed.address        = req.body.address;

      const updated = await User.findByIdAndUpdate(
        req.user._id,
        { $set: allowed },
        { new: true, runValidators: true }
      );
      res.json({ user: updated.toSafeObject() });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/users/admin/:hospitalId ───────────────────────────────────────
// SuperAdmin updates a hospital's admin name, specialisation, or resets password
router.patch('/admin/:hospitalId', auth, requireRole('SuperAdmin'),
  body('name').optional().trim().notEmpty(),
  body('specialisation').optional().trim(),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('Minimum 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const Hospital = require('../models/Hospital');
      const hospital = await Hospital.findById(req.params.hospitalId).select('adminID');
      if (!hospital || !hospital.adminID) return res.status(404).json({ error: 'Hospital or admin not found' });

      const admin = await User.findById(hospital.adminID).select('+passwordHash');
      if (!admin) return res.status(404).json({ error: 'Admin user not found' });

      if (req.body.name)           admin.name           = req.body.name;
      if (req.body.specialisation !== undefined) admin.specialisation = req.body.specialisation;
      if (req.body.newPassword) {
        await admin.setPassword(req.body.newPassword);
        admin.mustChangePassword = true;
      }
      await admin.save();

      res.json({ admin: admin.toSafeObject() });
    } catch (err) {
      console.error('Update admin error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/users/doctors/:id ─────────────────────────────────────────────
// Admin updates a doctor's name or specialisation
router.patch('/doctors/:id', auth, requireRole('Admin', 'SuperAdmin'),
  body('name').optional().trim().notEmpty(),
  body('specialisation').optional().trim(),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('Minimum 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const doctor = await User.findOne({
        _id:  req.params.id,
        role: 'Doctor',
        ...(req.user.role === 'Admin' ? { hospitalID: req.user.hospitalID } : {}),
      }).select('+passwordHash');
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      if (req.body.name)           doctor.name           = req.body.name;
      if (req.body.specialisation !== undefined) doctor.specialisation = req.body.specialisation;
      if (req.body.newPassword) {
        await doctor.setPassword(req.body.newPassword);
        doctor.mustChangePassword = true;
      }
      await doctor.save();

      res.json({ doctor: doctor.toSafeObject() });
    } catch (err) {
      console.error('Update doctor error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── DELETE /api/users/doctors/:id ─────────────────────────────────────────────
router.delete('/doctors/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    const doctor = await User.findOne({
      _id:        req.params.id,
      hospitalID: req.user.hospitalID,
      role:       'Doctor',
    });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found in your hospital' });

    doctor.isActive = false;
    await doctor.save();

    await Hospital.findByIdAndUpdate(req.user.hospitalID, {
      $inc: { 'usage.totalDoctors': -1 },
    });

    res.json({ message: 'Doctor account deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// ── PATCH /api/users/doctors/:id ──────────────────────────────────────────────
// Admin edits a doctor's profile (name, specialisation).
// Optionally resets their password.
router.patch('/doctors/:id', auth, requireRole('Admin'),
  body('name').optional().trim().notEmpty(),
  body('specialisation').optional().trim(),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const doctor = await User.findOne({
        _id:        req.params.id,
        hospitalID: req.user.hospitalID,
        role:       'Doctor',
      });
      if (!doctor) return res.status(404).json({ error: 'Doctor not found in your hospital' });

      if (req.body.name)           doctor.name           = req.body.name;
      if (req.body.specialisation) doctor.specialisation = req.body.specialisation;
      if (req.body.newPassword) {
        await doctor.setPassword(req.body.newPassword);
        doctor.mustChangePassword = true;
      }

      await doctor.save();
      res.json({ doctor: doctor.toSafeObject() });
    } catch (err) {
      console.error('Update doctor error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);