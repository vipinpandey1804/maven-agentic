const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils/helpers');

const ROLES = ['admin', 'ca', 'hr', 'employee'];

function sign(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, employeeId: user.employee_id || null },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

// requireRole('admin', 'hr') -> allows any of the listed roles
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do this.'));
    }
    next();
  };
}

module.exports = { sign, requireAuth, requireRole, ROLES };
