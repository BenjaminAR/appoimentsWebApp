const { db } = require('../config/firebase');

const checkSubscription = async (req, res, next) => {
  try {
    const agencyId = req.user.agencyId;

    if (!agencyId) {
      return res.status(400).json({ error: 'El usuario no tiene una agencia asignada.' });
    }

    // Consultar el estado de la agencia en Firestore
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();

    if (!agencyDoc.exists) {
      return res.status(403).json({ 
        error: 'Agencia no registrada en el sistema de facturación.' 
      });
    }

    const agencyData = agencyDoc.data();
    const subscription = agencyData.subscription;
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);

    // Validar si la suscripción está activa y no ha vencido
    if (subscription.status !== 'active' || now > periodEnd) {
      return res.status(402).json({ 
        error: 'Pago requerido: La suscripción de la agencia ha vencido o se encuentra suspendida.',
        code: 'SUBSCRIPTION_PAST_DUE',
        agencyId
      });
    }

    next();
  } catch (error) {
    console.error('Error al verificar suscripción:', error);
    res.status(500).json({ error: 'Error al verificar el estado de la suscripción.' });
  }
};

module.exports = checkSubscription;