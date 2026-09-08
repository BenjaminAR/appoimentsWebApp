const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');
const checkSubscription = require('../middlewares/subscriptionMiddleware');

// Importar Day.js y los plugins usando CommonJS
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Extender la funcionalidad
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const MX_TIMEZONE = 'America/Mexico_City';
const STATUS_ENUM = ['waiting', 'in_service', 'open', 'finished', 'canceled'];

// Convierte un valor de fecha/hora (ya validado por dayjs) a un ISO string con el offset local de México,
// sin depender de la zona horaria del contenedor Docker (que normalmente corre en UTC).
function toMexicoISOString(dayjsValue) {
  return dayjs.tz(dayjsValue.format('YYYY-MM-DDTHH:mm:ss'), MX_TIMEZONE).format();
}

// Verifica que el asesor sea un usuario real registrado en la agencia (Firebase Auth), que es la
// misma fuente que alimenta el selector de asesores en el dashboard.
async function advisorExistsInAgency(agencyId, advisorName) {
  const { users } = await admin.auth().listUsers(1000);
  return users.some((u) => {
    const claims = u.customClaims || {};
    if (claims.agencyId !== agencyId) return false;
    return (u.displayName || '').toUpperCase().trim() === advisorName;
  });
}

// Aplicar autenticación y verificación de pago a todas las rutas del módulo
router.use(authenticateToken);
router.use(checkSubscription);

/**
 * @openapi
 * /appointments/display-board:
 *   get:
 *     summary: Obtener la pantalla pública de citas filtrada por agencia
 *     tags:
 *       - Citas
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Información de la cita actual y las siguientes citas.
 *       402:
 *         description: "Pago requerido: La suscripción de la agencia ha vencido."
 */
router.get('/display-board', async (req, res, next) => {
  try {
    const snapshot = await db.collection('appointments')
      .where('agencyId', '==', req.user.agencyId)
      .where('status', 'in', ['waiting', 'in_service', 'open'])
      .get();

    const now = dayjs().tz(MX_TIMEZONE);
    const todayStart = now.startOf('day');
    const todayEnd = now.endOf('day');

    const appointments = snapshot.docs
      .map(doc => {
        const data = doc.data();

        // Normalizar vehículo (soporta legacy string y formato objeto)
        let vehicleObj = { make: '', model: '' };
        if (typeof data.vehicle === 'string') {
          vehicleObj = { make: data.vehicle, model: '' };
        } else if (data.vehicle && typeof data.vehicle === 'object') {
          vehicleObj = data.vehicle;
        }

        return {
          id: doc.id,
          ...data,
          vehicle: vehicleObj,
          activity: data.activity || data.serviceReason || 'SERVICIO GENERAL'
        };
      })
      // Regla de negocio: el tablero solo muestra citas con horario del día en curso (hora local de México).
      // Las citas "open" no tienen scheduledTime (son walk-ins sin fecha) y deben mostrarse siempre
      // mientras sigan abiertas, sin filtrarlas por fecha de creación.
      .filter(a => {
        if (a.status === 'open') return true;
        const referenceDate = dayjs(a.scheduledTime).tz(MX_TIMEZONE);
        return referenceDate.isAfter(todayStart) && referenceDate.isBefore(todayEnd);
      })
      .sort((a, b) => dayjs(a.scheduledTime || a.createdAt).valueOf() - dayjs(b.scheduledTime || b.createdAt).valueOf());

    const currentAppointment = appointments.find(a => a.status === 'in_service') || null;
    const nextAppointments = appointments.filter(a => a.status === 'waiting' || a.status === 'open').slice(0, 6);

    res.json({ agencyId: req.user.agencyId, currentAppointment, nextAppointments });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /appointments:
 *   get:
 *     summary: Listar todas las citas de la agencia del usuario autenticado, ordenadas por fecha ascendente
 *     tags:
 *       - Citas
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista completa de citas de la agencia.
 */
router.get('/', async (req, res, next) => {
  try {
    const snapshot = await db.collection('appointments')
      .where('agencyId', '==', req.user.agencyId)
      .get();

    const appointments = snapshot.docs
      .map(doc => {
        const data = doc.data();
        let vehicleObj = { make: '', model: '' };
        if (typeof data.vehicle === 'string') {
          vehicleObj = { make: data.vehicle, model: '' };
        } else if (data.vehicle && typeof data.vehicle === 'object') {
          vehicleObj = data.vehicle;
        }
        return { id: doc.id, ...data, vehicle: vehicleObj };
      })
      .sort((a, b) => dayjs(a.scheduledTime).valueOf() - dayjs(b.scheduledTime).valueOf());

    res.json({ agencyId: req.user.agencyId, appointments });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /appointments:
 *   post:
 *     summary: Registrar una nueva cita para la agencia del usuario autenticado
 *     tags:
 *       - Citas
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - time
 *               - activity
 *               - advisorName
 *               - clientName
 *               - make
 *               - model
 *             properties:
 *               date:
 *                 type: string
 *                 example: "2026-09-01"
 *               time:
 *                 type: string
 *                 example: "14:30"
 *               activity:
 *                 type: string
 *                 example: "PRUEBA DE MANEJO"
 *               advisorName:
 *                 type: string
 *                 example: "JUAN PEREZ"
 *               clientName:
 *                 type: string
 *                 example: "CARLOS LOPEZ"
 *               make:
 *                 type: string
 *                 example: "JEEP"
 *               model:
 *                 type: string
 *                 example: "WRANGLER"
 *     responses:
 *       201:
 *         description: Cita registrada exitosamente.
 *       400:
 *         description: Faltan campos obligatorios, marca o asesor no registrado.
 *       402:
 *         description: "Pago requerido: La suscripción de la agencia ha vencido."
 */
router.post('/', async (req, res, next) => {
  try {
    const { date, time, activity, advisorName, clientName, make, model, status } = req.body;

    if (status !== undefined && !STATUS_ENUM.includes(status)) {
      return res.status(400).json({ error: `status inválido. Valores permitidos: ${STATUS_ENUM.join(', ')}` });
    }

    const cleanStatus = status || 'waiting';
    // Las citas "abiertas" no tienen horario asignado (walk-in), por lo que date/time dejan de ser obligatorios
    const requiresSchedule = cleanStatus !== 'open';

    if (
      (requiresSchedule && (!date || !time)) ||
      !String(activity || '').trim() ||
      !String(advisorName || '').trim() ||
      !String(clientName || '').trim() ||
      !String(make || '').trim() ||
      !String(model || '').trim()
    ) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const cleanMake = make.toUpperCase().trim();
    const cleanModel = model.toUpperCase().trim();
    const cleanAdvisor = advisorName.toUpperCase().trim();
    const cleanActivity = activity.toUpperCase().trim();
    const cleanClientName = clientName.trim();

    // 1. Validar Asesor dentro de la agencia (debe ser un usuario real registrado, no un catálogo aparte)
    const advisorExists = await advisorExistsInAgency(req.user.agencyId, cleanAdvisor);

    if (!advisorExists) {
      return res.status(400).json({
        error: `El asesor "${cleanAdvisor}" no está registrado en la agencia ${req.user.agencyId}.`
      });
    }

    // 2. Validar Marca en el catálogo global
    const makeDoc = await db.collection('vehicle_makes').doc(cleanMake).get();
    if (!makeDoc.exists) {
      return res.status(400).json({
        error: `La marca de vehículo "${cleanMake}" no existe en el catálogo global.`
      });
    }

    // 3. Insertar en Firestore
    // Soporta ambos formatos de entrada (DD/MM/YYYY o YYYY-MM-DD) usando parseo estricto de dayjs
    // en lugar de `new Date(...)`, evitando RangeError por fechas corruptas.
    let scheduledTime = null;
    if (requiresSchedule) {
      const parsedDate = dayjs(`${date} ${time}`, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm'], true);

      if (!parsedDate.isValid()) {
        return res.status(400).json({ error: 'El formato de fecha u hora es inválido.' });
      }

      // Conserva el offset local de México (-06:00) sin depender de la zona horaria del contenedor
      scheduledTime = toMexicoISOString(parsedDate);
    }

    const newAppointment = {
      agencyId: req.user.agencyId,
      clientName: cleanClientName,
      advisorName: cleanAdvisor,
      activity: cleanActivity,
      vehicle: {
        make: cleanMake,
        model: cleanModel
      },
      scheduledTime,
      status: cleanStatus,
      celebrate: false,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection('appointments').add(newAppointment);

    // 4. Emitir evento en tiempo real vía WebSockets
    const io = req.app.get('io');
    if (io) {
      io.emit('appointments_updated', {
        action: 'CREATED',
        agencyId: req.user.agencyId
      });
    }

    res.status(201).json({
      message: 'Cita registrada exitosamente',
      data: { id: docRef.id, ...newAppointment }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /appointments/{id}:
 *   put:
 *     summary: Actualizar una cita (estado o datos generales)
 *     description: Permite actualizar cualquier campo de una cita existente. Todos los campos del cuerpo son opcionales.
 *     tags:
 *       - Citas
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la cita a actualizar
 *         schema:
 *           type: string
 *         example: "a6U4KMIrViGYXMSwqT9G"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clientName:
 *                 type: string
 *                 example: "GABRIEL PEREZ"
 *               advisorName:
 *                 type: string
 *                 example: "DIEGO CRESPO"
 *               activity:
 *                 type: string
 *                 example: "CITA DOMICILIO"
 *               status:
 *                 type: string
 *                 enum: [waiting, in_service, finished, canceled]
 *                 example: "in_service"
 *               make:
 *                 type: string
 *                 example: "CHRYSLER"
 *               model:
 *                 type: string
 *                 example: "300"
 *               vehicle:
 *                 type: object
 *                 properties:
 *                   make:
 *                     type: string
 *                     example: "CHRYSLER"
 *                   model:
 *                     type: string
 *                     example: "300"
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-08-27"
 *               time:
 *                 type: string
 *                 example: "14:51"
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-08-27T14:51:00.000Z"
 *     responses:
 *       200:
 *         description: Cita actualizada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cita actualizada correctamente"
 *                 data:
 *                   type: object
 *       400:
 *         description: Solicitud incorrecta o datos inválidos.
 *       404:
 *         description: Cita no encontrada o no pertenece a la agencia.
 *       500:
 *         description: Error interno del servidor.
 */
// PUT /api/appointments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('appointments').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data().agencyId !== req.user.agencyId) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    const {
      clientName,
      advisorName,
      activity,
      status,
      make,
      model,
      vehicle,
      date,
      time,
      scheduledTime,
      celebrate
    } = req.body;

    const updateData = {
      updatedAt: new Date().toISOString()
    };

    // Actualización de campos de texto (se rechazan cadenas vacías para evitar escrituras huecas en Firestore)
    if (clientName !== undefined) {
      const trimmed = clientName.trim();
      if (!trimmed) return res.status(400).json({ error: 'clientName no puede estar vacío.' });
      updateData.clientName = trimmed;
    }
    if (advisorName !== undefined) {
      const trimmed = advisorName.toUpperCase().trim();
      if (!trimmed) return res.status(400).json({ error: 'advisorName no puede estar vacío.' });
      if (!(await advisorExistsInAgency(req.user.agencyId, trimmed))) {
        return res.status(400).json({ error: `El asesor "${trimmed}" no está registrado en la agencia ${req.user.agencyId}.` });
      }
      updateData.advisorName = trimmed;
    }
    if (activity !== undefined) {
      const trimmed = activity.toUpperCase().trim();
      if (!trimmed) return res.status(400).json({ error: 'activity no puede estar vacío.' });
      updateData.activity = trimmed;
    }
    if (status !== undefined) {
      if (!STATUS_ENUM.includes(status)) {
        return res.status(400).json({ error: `status inválido. Valores permitidos: ${STATUS_ENUM.join(', ')}` });
      }
      updateData.status = status;
    }
    if (celebrate !== undefined) {
      if (typeof celebrate !== 'boolean') {
        return res.status(400).json({ error: 'celebrate debe ser un valor booleano.' });
      }
      updateData.celebrate = celebrate;
    }

    // Manejo de fecha y hora (siempre se conserva el offset local de México, -06:00)
    if (scheduledTime) {
      const parsed = dayjs(scheduledTime);
      if (!parsed.isValid()) {
        return res.status(400).json({ error: 'La propiedad scheduledTime no es una fecha válida.' });
      }
      updateData.scheduledTime = toMexicoISOString(parsed);
    } else if (date && time) {
      // Parsear soportando ambos formatos (DD/MM/YYYY o YYYY-MM-DD)
      const parsedDate = dayjs(`${date} ${time}`, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm'], true);

      if (!parsedDate.isValid()) {
        return res.status(400).json({ error: 'Formato de fecha u hora inválido.' });
      }

      updateData.scheduledTime = toMexicoISOString(parsedDate);
    } else if (status === 'open') {
      // Una cita que pasa a "abierta" ya no tiene horario asignado (walk-in)
      updateData.scheduledTime = null;
    }

    // Normalización de la estructura del vehículo (por mapa o campos individuales)
    if (vehicle && typeof vehicle === 'object') {
      updateData.vehicle = {
        make: (vehicle.make || '').toUpperCase().trim(),
        model: (vehicle.model || '').toUpperCase().trim()
      };
    } else if (make !== undefined || model !== undefined) {
      const currentVehicle = typeof doc.data().vehicle === 'object' ? doc.data().vehicle : {};
      updateData.vehicle = {
        make: make !== undefined ? make.toUpperCase().trim() : (currentVehicle.make || ''),
        model: model !== undefined ? model.toUpperCase().trim() : (currentVehicle.model || '')
      };
    }

    // 1. Guardar cambios en Firestore
    await docRef.update(updateData);

    // 2. Notificar en tiempo real vía WebSockets al tablero
    const io = req.app.get('io');
    if (io) {
      io.emit('appointments_updated', {
        action: 'UPDATED',
        appointmentId: id,
        agencyId: req.user.agencyId,
        updatedFields: Object.keys(updateData)
      });
    }

    res.json({
      message: 'Cita actualizada correctamente',
      data: { id, ...updateData }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /appointments/{id}:
 *   delete:
 *     summary: Eliminar una cita perteneciente a la agencia del usuario autenticado
 *     tags:
 *       - Citas
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
 *         description: Cita eliminada correctamente.
 *       404:
 *         description: Cita no encontrada o no pertenece a la agencia.
 */
// DELETE /api/appointments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('appointments').doc(id);
    const doc = await docRef.get();

    // Multitenancy estricto: solo se puede borrar una cita de la propia agencia
    if (!doc.exists || doc.data().agencyId !== req.user.agencyId) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    await docRef.delete();

    const io = req.app.get('io');
    if (io) {
      io.emit('appointments_updated', {
        action: 'DELETED',
        appointmentId: id,
        agencyId: req.user.agencyId
      });
    }

    res.json({ message: 'Cita eliminada correctamente', data: { id } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;