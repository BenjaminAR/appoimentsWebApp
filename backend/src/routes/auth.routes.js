const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/roleMiddleware');
const validateAgencyScope = require('../middlewares/agencyAccessMiddleware');
const axios = require('axios');


/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Registrar una nueva agencia y su usuario administrador inicial
 *     tags:
 *       - Autenticación
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - agencyId
 *               - agencyName
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@amsa.com"
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *               agencyId:
 *                 type: string
 *                 example: "AMSA"
 *               agencyName:
 *                 type: string
 *                 example: "Agencia Motors S.A."
 *               role:
 *                 type: string
 *                 example: "admin"
 *     responses:
 *       201:
 *         description: Agencia y usuario registrados exitosamente con periodo de prueba activo.
 *       400:
 *         description: La agencia o el correo ya se encuentran registrados.
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, agencyId, agencyName, role } = req.body;

    if (!email || !password || !agencyId || !agencyName) {
      return res.status(400).json({ 
        error: 'Los campos email, password, agencyId y agencyName son obligatorios.' 
      });
    }

    const cleanAgencyId = agencyId.toUpperCase().trim();

    // 1. Verificar si la agencia ya existe en Firestore
    const agencyRef = db.collection('agencies').doc(cleanAgencyId);
    const agencyDoc = await agencyRef.get();

    if (agencyDoc.exists) {
      return res.status(400).json({ 
        error: `La agencia con ID "${cleanAgencyId}" ya está registrada.` 
      });
    }

    // 2. Calcular fecha de fin de prueba (ejemplo: 30 días gratis)
    const trialDays = 30;
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + trialDays);

    // 3. Crear el documento de la agencia en Firestore con su suscripción inicial
    const newAgencyData = {
      agencyId: cleanAgencyId,
      name: agencyName.trim(),
      createdAt: new Date().toISOString(),
      subscription: {
        status: 'active', // Estado activo por periodo de prueba (trial)
        plan: 'trial',
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      }
    };

    await agencyRef.set(newAgencyData);

    // 4. Crear el usuario administrador en Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: agencyName.trim()
    });

    // 5. Asignar Custom Claims al JWT (Agencia y Rol)
    const userRole = role || 'admin';
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      agencyId: cleanAgencyId,
      role: userRole
    });

    res.status(201).json({
      message: 'Agencia y usuario administrador creados exitosamente.',
      agency: newAgencyData,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        agencyId: cleanAgencyId,
        role: userRole
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /auth/create-user:
 *   post:
 *     summary: Crear un nuevo usuario colaborador en la agencia (Solo Admins)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 example: "diego.crespo@amsa.com"
 *               password:
 *                 type: string
 *                 example: "AdvisorPass123!"
 *               name:
 *                 type: string
 *                 example: "Diego Crespo"
 *                 description: "Nombre completo del usuario colaborador."
 *               role:
 *                 type: string
 *                 example: "advisor"
 *                 description: "Rol asignado (ej. advisor, receptionist, admin). Por defecto: advisor."
 *     responses:
 *       201:
 *         description: Usuario colaborador creado con éxito e integrado a la agencia del Admin.
 *       400:
 *         description: Faltan campos obligatorios o el correo ya está registrado.
 *       403:
 *         description: Prohibido - Requiere rol de administrador.
 */
router.post('/create-user', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'El correo electrónico y la contraseña son obligatorios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const assignedRole = role ? role.toLowerCase().trim() : 'advisor';
    const targetAgencyId = req.user.agencyId; // Hereda la agencia del Admin que hace la petición

    if (!targetAgencyId) {
      return res.status(400).json({ error: 'El usuario administrador no tiene una agencia vinculada.' });
    }

    // 1. Crear el usuario en Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    // 2. Asignar Custom Claims al JWT (Agencia del admin y nuevo Rol)
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      agencyId: targetAgencyId,
      role: assignedRole
    });

    res.status(201).json({
      message: `Usuario colaborador creado exitosamente para la agencia ${targetAgencyId}`,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
        agencyId: targetAgencyId,
        role: assignedRole
      }
    });

  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado en el sistema.' });
    }
    next(error);
  }
});

/**
 * @openapi
 * /auth/users:
 *   get:
 *     summary: Listar todos los colaboradores pertenecientes a la agencia actual (Solo Admins)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios colaboradores de la agencia.
 *       403:
 *         description: Acceso denegado - Requiere rol de administrador.
 */
router.get('/users', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const targetAgencyId = req.user.agencyId;

    if (!targetAgencyId) {
      return res.status(400).json({ error: 'El usuario autenticado no tiene una agencia asignada.' });
    }

    // 1. Obtener la lista de usuarios desde Firebase Auth (paginado de hasta 1000 usuarios)
    const listUsersResult = await admin.auth().listUsers(1000);

    // 2. Filtrar los usuarios que pertenecen a la agencia del Admin solicitante
    const agencyUsers = listUsersResult.users
      .filter(user => user.customClaims && user.customClaims.agencyId === targetAgencyId)
      .map(user => ({
        uid: user.uid,
        email: user.email,
        role: user.customClaims.role || 'advisor',
        name: user.displayName || '',
        agencyId: user.customClaims.agencyId,
        disabled: user.disabled || false,
        createdAt: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime
      }));

    res.json({
      agencyId: targetAgencyId,
      total: agencyUsers.length,
      users: agencyUsers
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /auth/users/{uid}/name:
 *   patch:
 *     summary: Editar el nombre de un usuario colaborador de la agencia (Solo Admins)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID del usuario a renombrar
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
 *                 example: "Diego Crespo"
 *     responses:
 *       200:
 *         description: Nombre actualizado exitosamente.
 *       400:
 *         description: El nombre no puede estar vacío.
 *       403:
 *         description: No tienes permisos o el usuario pertenece a otra agencia.
 *       404:
 *         description: Usuario no encontrado.
 */
router.patch('/users/:uid/name', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
    }

    // 1. Obtener los datos del usuario objetivo
    const userRecord = await admin.auth().getUser(uid);
    const userClaims = userRecord.customClaims || {};

    // 2. Verificar que el usuario pertenezca a la misma agencia del Admin
    if (userClaims.agencyId !== req.user.agencyId) {
      return res.status(403).json({
        error: 'Acceso denegado: No puedes modificar usuarios de otra agencia.'
      });
    }

    // 3. Actualizar el nombre visible en Firebase Auth
    const updatedUser = await admin.auth().updateUser(uid, {
      displayName: name.trim()
    });

    res.json({
      message: 'Nombre actualizado exitosamente.',
      user: { uid: updatedUser.uid, name: updatedUser.displayName }
    });

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'El usuario especificado no existe.' });
    }
    next(error);
  }
});

/**
 * @openapi
 * /auth/users/{uid}/disable:
 *   patch:
 *     summary: Inhabilitar un usuario colaborador de la agencia (Solo Admins)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID del usuario a inhabilitar
 *     responses:
 *       200:
 *         description: Usuario inhabilitado y sus tokens revocados exitosamente.
 *       403:
 *         description: No tienes permisos o el usuario pertenece a otra agencia.
 *       404:
 *         description: Usuario no encontrado.
 */
router.patch('/users/:uid/disable', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const { uid } = req.params;

    // 1. Obtener los datos del usuario a inhabilitar
    const userRecord = await admin.auth().getUser(uid);
    const userClaims = userRecord.customClaims || {};

    // 2. Verificar que el usuario pertenezca a la misma agencia del Admin
    if (userClaims.agencyId !== req.user.agencyId) {
      return res.status(403).json({ 
        error: 'Acceso denegado: No puedes modificar usuarios de otra agencia.' 
      });
    }

    // 3. Evitar que un admin se inhabilite a sí mismo
    if (uid === req.user.uid) {
      return res.status(400).json({ error: 'No puedes inhabilitar tu propia cuenta.' });
    }

    // 4. Inhabilitar la cuenta en Firebase Auth
    await admin.auth().updateUser(uid, {
      disabled: true
    });

    // 5. Revocar todos los tokens de acceso activos del usuario
    await admin.auth().revokeRefreshTokens(uid);

    res.json({
      message: `El usuario ${userRecord.email} ha sido inhabilitado exitosamente.`
    });

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'El usuario especificado no existe.' });
    }
    next(error);
  }
});

/**
 * @openapi
 * /auth/users/{uid}/enable:
 *   patch:
 *     summary: Reactivar un usuario colaborador inhabilitado (Solo Admins)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID del usuario a reactivar
 *     responses:
 *       200:
 *         description: Usuario reactivado exitosamente.
 *       403:
 *         description: No tienes permisos o el usuario pertenece a otra agencia.
 *       404:
 *         description: Usuario no encontrado.
 */
router.patch('/users/:uid/enable', authenticateToken, requireRole('admin', 'superadmin'), validateAgencyScope, async (req, res, next) => {
  try {
    const { uid } = req.params;

    // 1. Obtener los datos del usuario objetivo
    const userRecord = await admin.auth().getUser(uid);
    const userClaims = userRecord.customClaims || {};

    // 2. Verificar que el usuario pertenezca a la misma agencia del Admin
    if (userClaims.agencyId !== req.user.agencyId) {
      return res.status(403).json({ 
        error: 'Acceso denegado: No puedes modificar usuarios de otra agencia.' 
      });
    }

    // 3. Habilitar la cuenta en Firebase Auth
    await admin.auth().updateUser(uid, {
      disabled: false
    });

    // 4. Revocar tokens de sesión previos para asegurar un login limpio
    await admin.auth().revokeRefreshTokens(uid);

    res.json({
      message: `El usuario ${userRecord.email} ha sido reactivado exitosamente.`
    });

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'El usuario especificado no existe.' });
    }
    next(error);
  }
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     tags:
 *       - Autenticación
 *     security: [] # Ruta pública (sin necesidad de token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso.
 *       400:
 *         description: Credenciales inválidas o error de autenticación.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const apiKey = process.env.FIREBASE_WEB_API_KEY;

    // 1. Autenticar credenciales contra la API REST de Firebase Identity Toolkit
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true
      }
    );

    const { idToken, refreshToken, expiresIn, localId } = response.data;

    // 2. Establecer el Refresh Token en una cookie HttpOnly y SameSite segura
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, // Impide el acceso desde JavaScript (protege contra XSS)
      secure: process.env.NODE_ENV === 'production', // Requiere HTTPS en producción
      sameSite: 'strict', // Protege contra CSRF
      path: '/api/auth/refresh', // La cookie solo viaja hacia el endpoint de renovación
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días de duración
    });

    // 3. Responder solo con el Access Token para la memoria del cliente
    res.json({
      message: 'Inicio de sesión exitoso',
      idToken,
      expiresIn,
      localId
    });

  } catch (error) {
    res.status(400).json({ 
      error: 'Credenciales inválidas o error de autenticación',
      details: error.response?.data?.error?.message || error.message 
    });
  }
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Cerrar sesión (Revoca tokens y destruye la cookie de refresco)
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 */
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    // 1. Revocar los refresh tokens en Firebase para invalidar sesiones activas
    await admin.auth().revokeRefreshTokens(req.user.uid);

    // 2. Destruir la cookie refreshToken en el cliente
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });

    res.json({ message: 'Sesión cerrada y tokens revocados exitosamente.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Renovación silenciosa del idToken (Access Token) mediante la cookie HttpOnly
 *     tags:
 *       - Autenticación
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No se proporcionó un token de refresco.' });
    }

    const apiKey = process.env.FIREBASE_WEB_API_KEY;

    // 1. Solicitar un nuevo idToken a Firebase usando el refreshToken de la cookie
    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const newIdToken = response.data.id_token;
    const newRefreshToken = response.data.refresh_token;
    const expiresIn = response.data.expires_in;

    // 2. Verificar que el token recién generado no haya sido revocado previamente
    const decodedToken = await admin.auth().verifyIdToken(newIdToken, true);

    // 3. (Opcional) Rotación de Refresh Token: Actualizar la cookie si Firebase emitió un nuevo refresh_token
    if (newRefreshToken) {
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
    }

    // 4. Retornar el nuevo idToken en JSON para mantenerlo en la memoria de React
    res.json({
      idToken: newIdToken,
      expiresIn,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.role || 'advisor',
        agencyId: decodedToken.agencyId || null
      }
    });

  } catch (error) {
    // Limpiar la cookie si el token de refresco ya no es válido o expiró
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth/refresh'
    });

    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'La sesión ha sido revocada. Inicia sesión nuevamente.' });
    }

    return res.status(401).json({
      error: 'Token de refresco inválido o expirado.',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Cambiar la contraseña del usuario actual
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *                 description: La nueva contraseña del usuario.
 *             required:
 *               - newPassword
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente.
 *       400:
 *         description: La nueva contraseña no cumple con los requisitos.
 *       401:
 *         description: No autorizado o token inválido.
 *       403:
 *         description: Prohibido. El usuario no tiene permisos para realizar esta acción.
 *       500:
 *         description: Error interno del servidor.
 */
router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    // Actualizar la contraseña del usuario en Firebase Auth
    await admin.auth().updateUser(req.user.uid, {
      password: newPassword
    });

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Generar un enlace de restablecimiento de contraseña
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: El correo electrónico del usuario.
 *             required:
 *               - email
 *     responses:
 *       200:
 *         description: Enlace de restablecimiento generado correctamente.
 *       400:
 *         description: Correo electrónico no proporcionado o inválido.
 *       500:
 *         description: Error interno del servidor.
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    }

    //Firebase envíe el correo automáticamente (Vía REST API)
    const apiKey = process.env.FIREBASE_WEB_API_KEY; 
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        requestType: 'PASSWORD_RESET',
        email: email,
      }
    );

    return res.json({
      message: 'Se ha enviado un correo con las instrucciones para restablecer tu contraseña.',
    });

  } catch (error) {
    // Manejo de errores específicos de Firebase
    const errorCode = error.response?.data?.error?.message || error.code;

    if (errorCode === 'EMAIL_NOT_FOUND' || errorCode === 'auth/user-not-found') {
      return res.status(404).json({
        error: 'No existe ninguna cuenta registrada con este correo electrónico.',
      });
    }

    if (errorCode === 'INVALID_EMAIL' || errorCode === 'auth/invalid-email') {
      return res.status(400).json({
        error: 'El formato del correo electrónico no es válido.',
      });
    }

    // Pasa cualquier otro error no contemplado al errorHandler global
    next(error);
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Obtener información del usuario actual
 *     tags:
 *       - Autenticación
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Información del usuario autenticado.
 *       401:
 *         description: No autorizado o token inválido.
 */
// GET /api/auth/me - Obtener información del usuario actual (Prueba de JWT)
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;