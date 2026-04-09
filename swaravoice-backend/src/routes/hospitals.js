const express  = require('express');
const { body, validationResult } = require('express-validator');
const Hospital = require('../models/Hospital');
const User     = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');
const { generateID } = require('../utils/helpers');

const router = express.Router();

// All hospital routes require SuperAdmin
router.use(auth, requireRole('SuperAdmin'));

// ── GET /api/hospitals ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const hospitals = await Hospital.find({ isActive: true })
      .populate('adminID', 'name email specialisation isAlsoDoctor')
      .sort({ createdAt: -1 });
    res.json({ hospitals });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/hospitals/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ _id: req.params.id, isActive: true })
      .populate('adminID', 'name email specialisation isAlsoDoctor');
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ hospital });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/hospitals ───────────────────────────────────────────────────────
// SuperAdmin creates a hospital and its admin account.
// Password is set by SuperAdmin and shared manually with the admin.
router.post('/',
  body('hospitalName').notEmpty().trim(),
  body('hospitalAddress').optional().trim(),
  body('hospitalCity').optional().trim(),
  body('adminName').notEmpty().trim(),
  body('adminEmail').isEmail().normalizeEmail(),
  body('adminPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      hospitalName, hospitalAddress, hospitalCity,
      adminName, adminEmail, adminPassword,
      adminIsAlsoDoctor, adminSpecialisation,
    } = req.body;

    const existing = await User.findOne({ email: adminEmail });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    try {
      // 1. Create hospital
      const hospital = await Hospital.create({
        hospitalID: generateID('HSP'),
        name:       hospitalName,
        address:    hospitalAddress || '',
        city:       hospitalCity || '',
        createdBy:  req.user._id,
      });

      // 2. Create admin user with the provided password.
      // isAlsoDoctor: admin can register patients and record sessions directly.
      // When true, they count toward totalDoctors and show in doctor-mode views.
      const isAlsoDoctor = !!adminIsAlsoDoctor;
      const admin = new User({
        userID:             generateID('USR'),
        role:               'Admin',
        name:               adminName,
        email:              adminEmail,
        hospitalID:         hospital._id,
        createdBy:          req.user._id,
        mustChangePassword: true,
        isAlsoDoctor,
        specialisation:     isAlsoDoctor ? (adminSpecialisation || null) : null,
      });
      await admin.setPassword(adminPassword);
      await admin.save();

      // 3. Link admin to hospital and set initial doctor count
      hospital.adminID = admin._id;
      // Count the admin as a doctor if they'll see patients directly
      if (isAlsoDoctor) hospital.usage.totalDoctors = 1;
      await hospital.save();

      res.status(201).json({
        message:  'Hospital and admin account created successfully.',
        hospital: hospital.toObject(),
        admin:    admin.toSafeObject(),
      });
    } catch (err) {
      console.error('Create hospital error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/hospitals/:id ──────────────────────────────────────────────────
router.patch('/:id',
  body('name').optional().trim().notEmpty(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  async (req, res) => {
    try {
      const hospital = await Hospital.findByIdAndUpdate(
        req.params.id,
        { $set: { name: req.body.name, address: req.body.address, city: req.body.city } },
        { new: true, runValidators: true }
      );
      if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
      res.json({ hospital });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;

// ── PATCH /api/hospitals/:id/admin ────────────────────────────────────────────
// SuperAdmin edits the admin user's profile details linked to a hospital.
// Optionally resets their password too.
router.patch('/:id/admin',
  body('name').optional().trim().notEmpty(),
  body('specialisation').optional().trim(),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const hospital = await Hospital.findById(req.params.id);
      if (!hospital || !hospital.adminID) {
        return res.status(404).json({ error: 'Hospital or admin not found' });
      }

      const admin = await User.findById(hospital.adminID);
      if (!admin) return res.status(404).json({ error: 'Admin user not found' });

      if (req.body.name)           admin.name           = req.body.name;
      if (req.body.specialisation) admin.specialisation = req.body.specialisation;
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