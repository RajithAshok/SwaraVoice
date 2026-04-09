const express  = require('express');
const { body, validationResult } = require('express-validator');
const Patient  = require('../models/Patient');
const Session  = require('../models/Session');
const Hospital = require('../models/Hospital');
const { auth, requireRole } = require('../middleware/auth');
const { generateID } = require('../utils/helpers');

const router = express.Router();

// ── Helper: enrich patient list with sessionCount + latestSession ─────────────
// Called after fetching patients. Runs one aggregate query per list fetch.
async function enrichWithSessions(patients) {
  if (!patients.length) return patients;
  const ids = patients.map((p) => p._id);

  // One aggregation to get count + latest session per patient
  const sessionData = await Session.aggregate([
    { $match: { patientID: { $in: ids } } },
    { $sort:  { createdAt: -1 } },
    { $group: {
      _id:           '$patientID',
      sessionCount:  { $sum: 1 },
      latestSession: { $first: '$$ROOT' },
    }},
  ]);

  const byPatient = {};
  sessionData.forEach((d) => {
    byPatient[d._id.toString()] = {
      sessionCount:  d.sessionCount,
      latestSession: {
        _id:            d.latestSession._id,
        sessionNumber:  d.latestSession.sessionNumber,
        createdAt:      d.latestSession.createdAt,
        compositeScore: d.latestSession.compositeScore,
      },
    };
  });

  return patients.map((p) => {
    const obj  = p.toObject ? p.toObject() : p;
    const data = byPatient[obj._id.toString()] || { sessionCount: 0, latestSession: null };
    return { ...obj, ...data };
  });
}

// ── GET /api/patients ─────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'Doctor') {
      query = { doctorID: req.user._id };
    } else if (req.user.role === 'Admin') {
      query = req.query.all === 'true'
        ? { hospitalID: req.user.hospitalID }
        : { doctorID: req.user._id };
    } else if (req.user.role === 'SuperAdmin') {
      if (req.query.hospitalID) query = { hospitalID: req.query.hospitalID };
      else return res.status(400).json({ error: 'hospitalID query param required for SuperAdmin' });
    }

    const raw      = await Patient.find(query)
      .populate('doctorID', 'name specialisation')
      .sort({ createdAt: -1 });
    const patients = await enrichWithSessions(raw);

    res.json({ patients });
  } catch (err) {
    console.error('Fetch patients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/patients/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('doctorID', 'name specialisation');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    if (req.user.role === 'Doctor' && patient.doctorID._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'Admin' && patient.hospitalID.toString() !== req.user.hospitalID.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ patient: patient.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/patients ────────────────────────────────────────────────────────
router.post('/', auth, requireRole('Doctor', 'Admin'),
  body('name').notEmpty().trim(),
  body('age').isInt({ min: 0, max: 150 }),
  body('gender').isIn(['Male', 'Female', 'Other', 'Prefer not to say']),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('prevMedicalCond').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const patient = await Patient.create({
        patientID:       generateID('PAT'),
        doctorID:        req.user._id,
        hospitalID:      req.user.hospitalID,
        name:            req.body.name,
        age:             req.body.age,
        dateOfBirth:     req.body.dateOfBirth || null,
        gender:          req.body.gender,
        prevMedicalCond: req.body.prevMedicalCond || '',
        doctorNotes:     req.body.initialNote
          ? [{ text: req.body.initialNote }]
          : [],
      });

      await Hospital.findByIdAndUpdate(req.user.hospitalID, {
        $inc: { 'usage.totalPatients': 1 },
        $set: { 'usage.lastActivityAt': new Date() },
      });

      res.status(201).json({ patient: patient.toObject() });
    } catch (err) {
      console.error('Create patient error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/patients/:id ───────────────────────────────────────────────────
router.patch('/:id', auth, requireRole('Doctor', 'Admin'),
  body('prevMedicalCond').optional().trim(),
  async (req, res) => {
    try {
      const patient = await Patient.findById(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      if (req.user.role === 'Doctor' && patient.doctorID.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (req.body.prevMedicalCond !== undefined) {
        patient.prevMedicalCond = req.body.prevMedicalCond;
      }
      await patient.save();
      res.json({ patient: patient.toObject() });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /api/patients/:id/notes ──────────────────────────────────────────────
router.post('/:id/notes', auth, requireRole('Doctor', 'Admin'),
  body('text').notEmpty().trim(),
  async (req, res) => {
    try {
      const patient = await Patient.findById(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      if (req.user.role === 'Doctor' && patient.doctorID.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      patient.doctorNotes.push({ text: req.body.text });
      await patient.save();
      res.json({ notes: patient.doctorNotes });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;