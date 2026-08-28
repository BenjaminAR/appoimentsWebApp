const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/roleMiddleware');
const checkSubscription = require('../middlewares/subscriptionMiddleware');

/**
 * Helper para validar enlaces de YouTube (Soporta shorts, watch?v=, y youtu.be)
 */
function isValidYouTubeUrl(url) {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]{11}(\S+)?$/;
  return youtubeRegex.test(url);
}

const MAX_VIDEOS_PER_AGENCY = 100;

// 1. Aplicar la autenticación de JWT a TODAS las rutas de este router
router.use(authenticateToken);

// 2. Opcional: Si requieres que la agencia tenga suscripción activa para usar estas rutas,
// asegúrate de que el middleware 'checkSubscription' llame a next() correctamente.
router.use(checkSubscription);

/**
 * @openapi
 * /administration/add-video:
 *   post:
 *     summary: Add a new video for the authenticated user's agency.
 *     tags:
 *       - Videos
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *     responses:
 *       201:
 *         description: Video added successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 */
router.post('/add-video', requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'URL must be a valid YouTube link.' });
    }

    if (!req.user || !req.user.agencyId) {
      return res.status(400).json({ error: 'User does not belong to any agency.' });
    }

    const existingCount = await db.collection('videos')
      .where('agencyId', '==', req.user.agencyId)
      .where('active', '==', true)
      .count()
      .get();

    if (existingCount.data().count >= MAX_VIDEOS_PER_AGENCY) {
      return res.status(400).json({ error: `Se alcanzó el límite máximo de ${MAX_VIDEOS_PER_AGENCY} videos por agencia.` });
    }

    const newVideo = {
      agencyId: req.user.agencyId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      url,
      active: true
    };

    const docRef = await db.collection('videos').add(newVideo);
    res.status(201).json({ 
      message: 'Video added successfully.', 
      videoId: docRef.id 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /administration/videos:
 *   get:
 *     summary: Get all active videos for the authenticated user's agency.
 *     tags:
 *       - Videos
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: A list of active videos.
 *       401:
 *         description: Unauthorized.
 */
router.get('/videos', requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    if (!req.user || !req.user.agencyId) {
      return res.status(400).json({ error: 'User does not belong to any agency.' });
    }

    const snapshot = await db.collection('videos')
      .where('agencyId', '==', req.user.agencyId)
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const videos = snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      };
    });

    res.json({ videos });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /administration/videos/{id}:
 *   delete:
 *     summary: Elimina un video de la lista de reproducción de la agencia (Solo Admins)
 *     tags:
 *       - Videos
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Video eliminado correctamente.
 *       404:
 *         description: Video no encontrado o no pertenece a la agencia.
 */
router.delete('/videos/:id', requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('videos').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data().agencyId !== req.user.agencyId) {
      return res.status(404).json({ error: 'Video no encontrado.' });
    }

    await docRef.delete();
    res.json({ message: 'Video eliminado correctamente.', id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;