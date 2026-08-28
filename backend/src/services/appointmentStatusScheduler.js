const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const MX_TIMEZONE = 'America/Mexico_City';

// Recalcula el estado de las citas de HOY para una agencia:
// - La cita más próxima cuya hora ya llegó pasa a 'in_service'.
// - Las citas anteriores a esa (que ya iniciaron pero fueron superadas por la siguiente) pasan a 'finished'.
// - Las citas futuras permanecen en 'waiting'.
async function tickAgencyStatuses(db, io, agencyId) {
  const snapshot = await db.collection('appointments')
    .where('agencyId', '==', agencyId)
    .where('status', 'in', ['waiting', 'in_service'])
    .get();

  if (snapshot.empty) return;

  const now = dayjs().tz(MX_TIMEZONE);
  const todayStart = now.startOf('day');
  const todayEnd = now.endOf('day');

  const todaysAppointments = snapshot.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((appt) => {
      const scheduled = dayjs(appt.scheduledTime).tz(MX_TIMEZONE);
      return scheduled.isAfter(todayStart) && scheduled.isBefore(todayEnd);
    })
    .sort((a, b) => dayjs(a.scheduledTime).valueOf() - dayjs(b.scheduledTime).valueOf());

  if (todaysAppointments.length === 0) return;

  // Índice de la cita más reciente cuya hora ya llegó
  let currentIndex = -1;
  todaysAppointments.forEach((appt, idx) => {
    if (dayjs(appt.scheduledTime).valueOf() <= now.valueOf()) {
      currentIndex = idx;
    }
  });

  const batch = db.batch();
  let changed = false;

  todaysAppointments.forEach((appt, idx) => {
    let targetStatus = appt.status;
    if (idx < currentIndex) {
      targetStatus = 'finished';
    } else if (idx === currentIndex) {
      targetStatus = 'in_service';
    }

    if (targetStatus !== appt.status) {
      batch.update(appt.ref, { status: targetStatus, updatedAt: new Date().toISOString() });
      changed = true;
    }
  });

  if (changed) {
    await batch.commit();
    io.emit('appointments_updated', { action: 'AUTO_STATUS_TRANSITION', agencyId });
  }
}

async function tickAllAgencies(db, io) {
  try {
    const agenciesSnapshot = await db.collection('agencies').get();
    await Promise.all(
      agenciesSnapshot.docs.map((doc) =>
        tickAgencyStatuses(db, io, doc.id).catch((error) => {
          console.error(`Error al procesar la transición automática de la agencia ${doc.id}:`, error);
        })
      )
    );
  } catch (error) {
    console.error('Error al recorrer agencias para la transición automática de citas:', error);
  }
}

// Inicia el ciclo periódico de recálculo de estados. Devuelve el handle del interval por si se necesita detener.
function startAppointmentStatusScheduler(db, io, intervalMs = 20000) {
  tickAllAgencies(db, io);
  return setInterval(() => tickAllAgencies(db, io), intervalMs);
}

module.exports = { startAppointmentStatusScheduler };
