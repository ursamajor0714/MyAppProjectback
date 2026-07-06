const jwt = require('jsonwebtoken');

// 안전한 JWT 비밀키 검증 (운영 환경 시 강력 권제 및 크래시 유도)
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!');
  }
  console.warn('⚠️ WARNING: JWT_SECRET environment variable is missing. Using a fallback key. DO NOT USE IN PRODUCTION!');
}

const JWT_SECRET = process.env.JWT_SECRET || 'antigravity-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 누락되었습니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }
    req.user = user; // { id, email, role }
    next();
  });
}

// 역할(Role) 기반 인가 필터 미들웨어
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '이 작업을 수행할 권한이 없습니다.' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET,
};
