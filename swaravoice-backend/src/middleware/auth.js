const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifies the JWT from the Authorization header and attaches
 * the full user document to req.user.
 *
 * Usage: router.get('/protected', auth, handler)
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user fresh from DB so we catch deactivated accounts
    const user = await User.findById(decoded.id).select('+passwordHash');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role-based access gate. Use after auth middleware.
 *
 * Usage: router.post('/admin-only', auth, requireRole('Admin', 'SuperAdmin'), handler)
 *
 * @param {...string} roles - Allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

/**
 * Ensures a Doctor or Admin can only access resources within their own hospital.
 * SuperAdmin bypasses this check.
 * Must run after auth middleware.
 *
 * Attach hospitalID to req.body or req.params as 'hospitalID' for this to work,
 * or compare against the resource's hospitalID after fetching it in the route.
 */
function requireSameHospital(req, res, next) {
  if (req.user.role === 'SuperAdmin') return next();
  const targetHospitalID = req.params.hospitalID || req.body.hospitalID;
  if (!targetHospitalID) return next(); // will be validated in route
  if (req.user.hospitalID?.toString() !== targetHospitalID.toString()) {
    return res.status(403).json({ error: 'Access denied — different hospital' });
  }
  next();
}

module.exports = { auth, requireRole, requireSameHospital };
