const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Acceso denegado: Usuario sin rol asignado.' });
    }

    const userRole = req.user.role.toLowerCase().trim();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase().trim());

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: `Acceso denegado: Se requiere alguno de los siguientes roles: [${allowedRoles.join(', ')}].` 
      });
    }

    next();
  };
};

module.exports = requireRole;