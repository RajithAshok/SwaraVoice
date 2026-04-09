const mongoose = require('mongoose');

const UsageSchema = new mongoose.Schema({
  totalDoctors:   { type: Number, default: 0 },
  totalPatients:  { type: Number, default: 0 },
  totalSessions:  { type: Number, default: 0 },
  storageBytes:   { type: Number, default: 0 }, // sum of all audio file sizes in bytes
  lastActivityAt: { type: Date,   default: null },
}, { _id: false });

const HospitalSchema = new mongoose.Schema({
  hospitalID: {
    type:     String,
    unique:   true,
    required: true,
    // Format: HSP_<timestamp> — generated in the route before save
  },
  name:    { type: String, required: true, trim: true },
  address: { type: String, trim: true, default: '' },
  city:    { type: String, trim: true, default: '' },

  // Each hospital has exactly one admin — stored as a ref to the User
  // Set when SuperAdmin creates an admin account for this hospital
  adminID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  usage:     { type: UsageSchema, default: () => ({}) },
}, {
  timestamps: true, // adds createdAt, updatedAt automatically
});

// Index for SuperAdmin dashboard queries
HospitalSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Hospital', HospitalSchema);
