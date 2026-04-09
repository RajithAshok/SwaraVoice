// const mongoose = require('mongoose');

// const TASK_SUFFIXES = ['aa', 'glide', 'mpt', 'text'];

// const TrackSchema = new mongoose.Schema({
//   taskSuffix: {
//     type:     String,
//     enum:     TASK_SUFFIXES,
//     required: true,
//   },
//   fileName:      { type: String, required: true },
//   r2Key:         { type: String, default: null }, // R2 object key — set after upload
//   r2Url:         { type: String, default: null }, // presigned or public URL — refreshed on demand
//   fileSizeBytes: { type: Number, default: 0 },
// }, { _id: false });

// const SessionSchema = new mongoose.Schema({
//   sessionID: {
//     type:     String,
//     unique:   true,
//     required: true,
//     // Format: SES_<timestamp>
//   },
//   sessionNumber: { type: Number, required: true }, // 1-indexed per patient

//   // Refs — hospitalID stored here so usage counters and admin queries are fast
//   patientID:  { type: mongoose.Schema.Types.ObjectId, ref: 'Patient',  required: true },
//   doctorID:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
//   hospitalID: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

//   // Results — null until ML pipeline processes the session
//   // AWS FUTURE: ML pipeline updates these fields after processing
//   compositeScore: { type: Number, default: null, min: 0, max: 100 },
//   reportPdfLink:  { type: String, default: null },

//   tracks: {
//     type:     [TrackSchema],
//     validate: {
//       validator: (v) => v.length === 4,
//       message:   'A session must have exactly 4 tracks',
//     },
//   },
// }, {
//   timestamps: true,
// });

// // ── Indexes ───────────────────────────────────────────────────────────────────
// SessionSchema.index({ patientID: 1, createdAt: -1 });    // PatientInfo page
// SessionSchema.index({ hospitalID: 1, createdAt: -1 });   // Admin + billing queries
// SessionSchema.index({ doctorID: 1, createdAt: -1 });
// SessionSchema.index({ compositeScore: 1 });              // "awaiting analysis" filter

// module.exports = mongoose.model('Session', SessionSchema);


const mongoose = require('mongoose');

const TASK_SUFFIXES = ['aa', 'glide', 'mpt', 'text'];

const TrackSchema = new mongoose.Schema({
  taskSuffix: {
    type:     String,
    enum:     TASK_SUFFIXES,
    required: true,
  },
  fileName:      { type: String, required: true },
  r2Key:         { type: String, default: null },
  r2Url:         { type: String, default: null },
  fileSizeBytes: { type: Number, default: 0 },
}, { _id: false });

const ScoresSchema = new mongoose.Schema({
  jitter:  { type: Number, default: null },
  shimmer: { type: Number, default: null },
  f0_sd:   { type: Number, default: null },
  hnr:     { type: Number, default: null },
  cpps:    { type: Number, default: null },
  mpt:     { type: Number, default: null },
  glide:   { type: Number, default: null },
}, { _id: false });

const RawSchema = new mongoose.Schema({
  f0_mean:      { type: Number, default: null },
  f0_sd:        { type: Number, default: null },
  f0_min:       { type: Number, default: null },
  f0_max:       { type: Number, default: null },
  jitter:       { type: Number, default: null },
  shimmer:      { type: Number, default: null },
  hnr:          { type: Number, default: null },
  glide_min_f0: { type: Number, default: null },
  glide_max_f0: { type: Number, default: null },
  pitch_range:  { type: Number, default: null },
  mpt:          { type: Number, default: null },
  cpps:         { type: Number, default: null },
}, { _id: false });

const AnalysisSchema = new mongoose.Schema({
  gender:     { type: String },
  composite:  { type: Number },
  stability:  { type: Number },
  clarity:    { type: Number },
  efficiency: { type: Number },
  raw:        { type: RawSchema },
  scores:     { type: ScoresSchema },
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  sessionID: {
    type:     String,
    unique:   true,
    required: true,
  },
  sessionNumber: { type: Number, required: true },

  patientID:  { type: mongoose.Schema.Types.ObjectId, ref: 'Patient',  required: true },
  doctorID:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  hospitalID: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  compositeScore: { type: Number, default: null, min: 0, max: 100 },
  reportPdfLink:  { type: String, default: null },

  // Full analysis output — null until analyser.py runs on session submit
  analysis: { type: AnalysisSchema, default: null },

  tracks: {
    type:     [TrackSchema],
    validate: {
      validator: (v) => v.length === 4,
      message:   'A session must have exactly 4 tracks',
    },
  },
}, {
  timestamps: true,
});

SessionSchema.index({ patientID: 1, createdAt: -1 });
SessionSchema.index({ hospitalID: 1, createdAt: -1 });
SessionSchema.index({ doctorID: 1, createdAt: -1 });
SessionSchema.index({ compositeScore: 1 });

module.exports = mongoose.model('Session', SessionSchema);