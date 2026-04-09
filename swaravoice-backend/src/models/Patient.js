const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  // No createdBy — notes are always by the assigned doctor
}, { _id: true });

const PatientSchema = new mongoose.Schema({
  patientID: {
    type:     String,
    unique:   true,
    required: true,
    // Format: PAT_<timestamp>
  },

  // Refs
  doctorID:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  hospitalID: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  // Demographics
  name:            { type: String, required: true, trim: true },
  age:             { type: Number, required: true, min: 0, max: 150 },
  dateOfBirth:     {type: Date, default: null},
  gender:          { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'], required: true },
  prevMedicalCond: { type: String, default: '' },

  doctorNotes: { type: [NoteSchema], default: [] },
}, {
  timestamps: true,
});

// ── Indexes ───────────────────────────────────────────────────────────────────
PatientSchema.index({ doctorID: 1, createdAt: -1 });     // Doctor fetching their patients
PatientSchema.index({ hospitalID: 1, createdAt: -1 });   // Admin fetching all hospital patients
PatientSchema.index({ patientID: 1 });

module.exports = mongoose.model('Patient', PatientSchema);
