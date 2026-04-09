/**
 * seed.js — Run once to create the SuperAdmin account.
 *
 * Usage:
 *   node src/utils/seed.js
 *
 * Set SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME in .env first.
 * After running, clear those three vars from .env (or leave them — they're only
 * used by this script, not by the server).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User     = require('../models/User');
const { generateID } = require('./helpers');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME } = process.env;

  if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD || !SUPERADMIN_NAME) {
    console.error('Set SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME in .env');
    process.exit(1);
  }

  const existing = await User.findOne({ email: SUPERADMIN_EMAIL });
  if (existing) {
    console.log('SuperAdmin already exists:', SUPERADMIN_EMAIL);
    process.exit(0);
  }

  const superAdmin = new User({
    userID:             generateID('USR'),
    role:               'SuperAdmin',
    name:               SUPERADMIN_NAME,
    email:              SUPERADMIN_EMAIL,
    hospitalID:         null,
    mustChangePassword: false, // SuperAdmin sets their own password directly
  });
  await superAdmin.setPassword(SUPERADMIN_PASSWORD);
  await superAdmin.save();

  console.log('✓ SuperAdmin created:', SUPERADMIN_EMAIL);
  console.log('  Change your password immediately after first login.');
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
