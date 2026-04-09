const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ROLES = ['Doctor', 'Admin', 'SuperAdmin'];

const UserSchema = new mongoose.Schema({
  userID: {
    type:     String,
    unique:   true,
    required: true,
    // Format: USR_<timestamp>
  },
  role: {
    type:     String,
    enum:     ROLES,
    required: true,
  },
  name:  { type: String, required: true, trim: true },
  email: {
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true,
  },
  passwordHash: {
    type:     String,
    required: true,
    select:   false, // never returned in queries unless explicitly requested
  },

  // Null for SuperAdmin only
  hospitalID: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Hospital',
    default: null,
  },

  // Doctor / Admin fields
  specialisation: { type: String, trim: true, default: null },
  address:        { type: String, trim: true, default: null },

  // Admin-specific: can this admin also register and record patients directly?
  isAlsoDoctor: { type: Boolean, default: false },

  // Account management
  isActive:           { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: true }, // true for all new accounts created by Admin/SuperAdmin
  createdBy: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'User',
    default: null, // null for the SuperAdmin seed account
  },
}, {
  timestamps: true,
});

// ── Indexes ──────────────────────────────────────────────────────────────────
UserSchema.index({ hospitalID: 1, role: 1 }); // Admin fetching their hospital's doctors
UserSchema.index({ email: 1 });

// ── Instance methods ──────────────────────────────────────────────────────────

// Hash a plain password and store it
UserSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 12);
};

// Compare a plain password against the stored hash
UserSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Safe user object for API responses — strips passwordHash
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);