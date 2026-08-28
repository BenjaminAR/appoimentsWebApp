const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');
const checkSubscription = require('../middlewares/subscriptionMiddleware');

// Aplicar el middleware de autenticación por JWT a todas las rutas de catálogos
router.use(authenticateToken);
// Aplicar el middleware de verificación de suscripción a todas las rutas de catálogos
router.use(checkSubscription);

/**
 * @openapi
 * /catalogs/advisors:
 *   get:
 *     summary: Obtener el catálogo de asesores de la agencia actual
 *     tags:
 *       - Catálogos
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de asesores pertenecientes a la agencia del usuario autenticado.
 *       401:
 *         description: No autorizado (Token plano o no enviado).
 *       402:
 *         description: "Pago requerido: La suscripción de la agencia ha vencido o se encuentra suspendida."
 */
router.get('/advisors', async (req, res, next) => {
  try {
    const snapshot = await db.collection('advisors')
      .where('agencyId', '==', req.user.agencyId)
      .orderBy('name', 'asc')
      .get();

    const advisors = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ agencyId: req.user.agencyId, advisors });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /catalogs/advisors:
 *   post:
 *     summary: Registrar un nuevo asesor en la agencia actual
 *     tags:
 *       - Catálogos
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "DIEGO CRESPO"
 *     responses:
 *       201:
 *         description: Asesor registrado exitosamente.
 *       400:
 *         description: Nombre del asesor faltante.
 */
router.post('/advisors', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del asesor es obligatorio.' });
    }

    const cleanName = name.toUpperCase().trim();

    // Validar si el asesor ya existe en la misma agencia
    const existing = await db.collection('advisors')
      .where('agencyId', '==', req.user.agencyId)
      .where('name', '==', cleanName)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: `El asesor "${cleanName}" ya está registrado en la agencia ${req.user.agencyId}.` });
    }

    const newAdvisor = {
      name: cleanName,
      agencyId: req.user.agencyId,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection('advisors').add(newAdvisor);

    res.status(201).json({
      message: 'Asesor creado exitosamente',
      data: { id: docRef.id, ...newAdvisor }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /catalogs/activities:
 *   get:
 *     summary: Obtener el catálogo de actividades de la agencia actual
 *     tags:
 *       - Catálogos
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de actividades pertenecientes a la agencia del usuario autenticado.
 *       402:
 *         description: "Pago requerido: La suscripción de la agencia ha vencido o se encuentra suspendida."
 */
router.get('/activities', async (req, res, next) => {
  try {
    const snapshot = await db.collection('activities')
      .where('agencyId', '==', req.user.agencyId)
      .orderBy('name', 'asc')
      .get();

    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ agencyId: req.user.agencyId, activities });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /catalogs/activities:
 *   post:
 *     summary: Registrar una nueva actividad en la agencia actual
 *     tags:
 *       - Catálogos
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "PRUEBA DE MANEJO"
 *     responses:
 *       201:
 *         description: Actividad registrada exitosamente.
 *       400:
 *         description: Nombre de la actividad faltante o duplicado.
 */
router.post('/activities', async (req, res, next) => {
  // Aplicar el middleware de verificación de suscripción a esta ruta
  // await checkSubscription(req, res, next);
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la actividad es obligatorio.' });
    }

    const cleanName = name.toUpperCase().trim();

    // Validar si la actividad ya existe en la misma agencia
    const existing = await db.collection('activities')
      .where('agencyId', '==', req.user.agencyId)
      .where('name', '==', cleanName)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: `La actividad "${cleanName}" ya está registrada en la agencia ${req.user.agencyId}.` });
    }

    const newActivity = {
      name: cleanName,
      agencyId: req.user.agencyId,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection('activities').add(newActivity);

    res.status(201).json({
      message: 'Actividad registrada exitosamente',
      data: { id: docRef.id, ...newActivity }
    });
  } catch (error) {
    next(error);
  }
});


//Catalogos de vehiculos.

/**
 * @openapi
 * /catalogs/vehicles/makes:
 *   get:
 *     summary: Obtener todas las marcas de vehículos disponibles
 *     tags:
 *       - Catálogos Globales
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista global de marcas disponibles.
 */
router.get('/vehicles/makes', async (req, res, next) => {
  try {
    const snapshot = await db.collection('vehicle_makes')
      .orderBy('name', 'asc')
      .get();

    const makes = snapshot.docs.map(doc => doc.id);

    res.json({ makes });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /catalogs/vehicles/makes/{makeId}/models:
 *   get:
 *     summary: Obtener los modelos de una marca específica
 *     tags:
 *       - Catálogos Globales
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: makeId
 *         required: true
 *         schema:
 *           type: string
 *         example: "JEEP"
 *     responses:
 *       200:
 *         description: Lista de modelos para la marca consultada.
 *       404:
 *         description: Marca no encontrada.
 */
router.get('/vehicles/makes/:makeId/models', async (req, res, next) => {
  try {
    const makeId = req.params.makeId.toUpperCase().trim();
    const makeRef = db.collection('vehicle_makes').doc(makeId);
    
    const makeDoc = await makeRef.get();
    if (!makeDoc.exists) {
      return res.status(404).json({ error: `La marca "${makeId}" no existe.` });
    }

    const snapshot = await makeRef.collection('models')
      .orderBy('name', 'asc')
      .get();

    const models = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      make: makeId,
      models
    });
  } catch (error) {
    next(error);
  }
});


module.exports = router;