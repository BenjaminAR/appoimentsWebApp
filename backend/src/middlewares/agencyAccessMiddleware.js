// src/middlewares/agencyAccessMiddleware.js
const validateAgencyScope = (req, res, next) => {
  const userRole = req.user.role;
  const userAgencyId = req.user.agencyId;
  
  // Extraer el agencyId que se intenta consultar/modificar desde los params o query
  const targetAgencyId = (req.params.agencyId || req.query.agencyId || req.body.agencyId)?.toUpperCase().trim();

  // El superadmin tiene acceso global a cualquier agencia
  if (userRole === 'superadmin') {
    return next();
  }

  // Admin y Advisor están obligados a tener una agencia asignada
  if (!userAgencyId) {
    return res.status(403).json({ error: 'Acceso denegado: El usuario no tiene una agencia asignada.' });
  }

  // Si la petición especifica una agencia objetivo, debe coincidir con la del usuario
  if (targetAgencyId && targetAgencyId !== userAgencyId) {
    return res.status(403).json({ 
      error: `Acceso denegado: No tienes permisos para gestionar la agencia "${targetAgencyId}".` 
    });
  }

  next();
};

module.exports = validateAgencyScope;