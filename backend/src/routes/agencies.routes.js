const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/roleMiddleware');
const validateAgencyScope = require('../middlewares/agencyAccessMiddleware');

// ~700KB, deja margen bajo el límite de 1MiB por documento de Firestore
const MAX_LOGO_BYTES = 700 * 1024;
const DATA_URL_IMAGE_REGEX = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/;

/**
 * @openapi
 * /agencies/me:
 *   get:
 *     summary: Obtener el perfil (nombre, logo) de la agencia del usuario autenticado
 *     tags:
 *       - Agencias
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil de la agencia.
 *       404:
 *         description: Agencia no encontrada.
 */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const agencyId = req.user.agencyId;
    if (!agencyId) {
      return res.status(400).json({ error: 'El usuario no tiene una agencia asignada.' });
    }

    const doc = await db.collection('agencies').doc(agencyId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Agencia no encontrada.' });
    }

    const data = doc.data();
    res.json({ agencyId, name: data.name || '', logoUrl: data.logoUrl || null });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /agencies/me/logo:
 *   patch:
 *     summary: Actualizar el logo de la agencia del usuario autenticado (Solo Admins)
 *     tags:
 *       - Agencias
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - logoUrl
 *             properties:
 *               logoUrl:
 *                 type: string
 *                 description: URL http(s) o imagen codificada en base64 (data URL).
 *     responses:
 *       200:
 *         description: Logo actualizado correctamente.
 *       400:
 *         description: logoUrl inválido, ausente o demasiado grande.
 */
router.patch('/me/logo', authenticateToken, requireRole('admin', 'superadmin'), async (req, res, next) => {
  try {
    const { logoUrl } = req.body;
    const agencyId = req.user.agencyId;

    if (!agencyId) {
      return res.status(400).json({ error: 'El usuario no tiene una agencia asignada.' });
    }

    if (!logoUrl || typeof logoUrl !== 'string' || !logoUrl.trim()) {
      return res.status(400).json({ error: 'logoUrl es obligatorio.' });
    }

    if (Buffer.byteLength(logoUrl, 'utf8') > MAX_LOGO_BYTES) {
      return res.status(400).json({ error: 'La imagen del logo es demasiado grande (máx. ~700KB).' });
    }

    // Solo se aceptan URLs http(s) o data URLs de imagen; nunca se ejecuta ni interpreta el contenido
    const isDataUrlImage = DATA_URL_IMAGE_REGEX.test(logoUrl);
    const isHttpUrl = /^https?:\/\//.test(logoUrl);
    if (!isDataUrlImage && !isHttpUrl) {
      return res.status(400).json({ error: 'logoUrl debe ser una URL http(s) o una imagen codificada en base64 válida.' });
    }

    const agencyRef = db.collection('agencies').doc(agencyId);
    const agencyDoc = await agencyRef.get();
    if (!agencyDoc.exists) {
      return res.status(404).json({ error: 'Agencia no encontrada.' });
    }

    await agencyRef.update({ logoUrl, logoUpdatedAt: new Date().toISOString() });

    res.json({ message: 'Logo actualizado correctamente.', logoUrl });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /agencies/{agencyId}/subscription:
 *   patch:
 *     summary: Actualizar la suscripción de una agencia (Admin / Webhook)
 *     tags:
 *       - Agencias
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agencyId
 *         required: true
 *         schema:
 *           type: string
 *         example: "AMSA"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, past_due, canceled, trial]
 *                 example: "active"
 *               plan:
 *                 type: string
 *                 example: "monthly_pro"
 *               currentPeriodEnd:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-09-30T23:59:59.000Z"
 *     responses:
 *       200:
 *         description: Suscripción actualizada correctamente.
 *       400:
 *         description: Datos de entrada inválidos.
 *       404:
 *         description: Agencia no encontrada.
 */
router.patch('/:agencyId/subscription', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { status, plan, currentPeriodEnd } = req.body;
    const cleanAgencyId = agencyId.toUpperCase().trim();
    const agencyRef = db.collection('agencies').doc(cleanAgencyId);
    const agencyDoc = await agencyRef.get();

    if (!agencyDoc.exists) {
      return res.status(404).json({ error: `La agencia "${cleanAgencyId}" no existe.` });
    }

    // 2. Construir objeto de actualización dinámico usando notación de punto para campos anidados
    const updates = {};
    const validStatuses = ['active', 'past_due', 'canceled', 'trial'];

    if (status) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}` 
        });
      }
      updates['subscription.status'] = status;
    }

    if (plan) {
      updates['subscription.plan'] = plan.trim();
    }

    if (currentPeriodEnd) {
      const parsedDate = new Date(currentPeriodEnd);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'La fecha currentPeriodEnd debe tener un formato ISO 8601 válido.' });
      }
      updates['subscription.currentPeriodEnd'] = parsedDate.toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Debes proporcionar al menos un campo a actualizar (status, plan, currentPeriodEnd).' });
    }

    updates['subscription.updatedAt'] = new Date().toISOString();

    // 3. Aplicar actualización en Firestore
    await agencyRef.update(updates);

    const updatedDoc = await agencyRef.get();

    res.json({
      message: `Suscripción de la agencia ${cleanAgencyId} actualizada exitosamente.`,
      subscription: updatedDoc.data().subscription
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;