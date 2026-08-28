const { admin } = require('../config/firebase');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Acceso no autorizado: Se requiere token (Bearer <TOKEN>)' 
    });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    // El segundo parámetro `true` fuerza a Firebase a verificar si el token fue revocado
    const checkRevoked = true;
    const decodedToken = await admin.auth().verifyIdToken(token, checkRevoked);
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      agencyId: decodedToken.agencyId || null,
      role: decodedToken.role || 'advisor'
    };

    next();
  } catch (error) {
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'La sesión ha sido cerrada. Inicia sesión nuevamente.' });
    }
    
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

module.exports = authenticateToken;