/**
 * Generate a friendly, prefixed ID using the current timestamp.
 * Not a UUID — intentionally short and readable for debugging.
 *
 * Examples:
 *   generateID('USR') → 'USR_1718000000000'
 *   generateID('HSP') → 'HSP_1718000000001'
 */
function generateID(prefix) {
  return `${prefix}_${Date.now()}`;
}

/**
 * Generate a temporary password for new accounts.
 * Format: 3 words + 4 digits, e.g. "Vocal-Scan-2025-4821"
 * Memorable enough to read out or paste from an email.
 */
function generateTempPassword() {
  const words = [
    'Vocal','Scan','Voice','Tone','Clear','Sound','Echo',
    'Wave','Pulse','Pitch','Note','Hum','Chord','Forte',
  ];
  const w1   = words[Math.floor(Math.random() * words.length)];
  const w2   = words[Math.floor(Math.random() * words.length)];
  const year = new Date().getFullYear();
  const num  = String(Math.floor(1000 + Math.random() * 9000));
  return `${w1}-${w2}-${year}-${num}`;
  // e.g. "Vocal-Echo-2025-4821" — 20 chars, meets most password policies
}

module.exports = { generateID, generateTempPassword };
