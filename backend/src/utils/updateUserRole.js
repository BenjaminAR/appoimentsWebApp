const { admin } = require('../config/firebase');

/**
 * Utilidad para promover un usuario existente a rol 'admin'
 * @param {string} email - Correo electrónico del usuario a actualizar
 */
async function promoteToAdmin(email) {
  if (!email) {
    console.error(' Error: Debes proporcionar un correo electrónico.');
    process.exit(1);
  }

  try {
    console.log(`Buscando usuario con el correo: ${email}...`);
    
    // 1. Obtener el usuario por su correo
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // 2. Obtener los Custom Claims actuales
    const currentClaims = userRecord.customClaims || {};

    if (!currentClaims.agencyId) {
      console.warn(`⚠️ Advertencia: El usuario ${email} no tiene un agencyId asignado.`);
    }

    if (currentClaims.role === 'admin') {
      console.log(`ℹ️ El usuario ${email} ya cuenta con el rol 'admin'.`);
      process.exit(0);
    }

    // 3. Actualizar el rol conservando el agencyId existente
    const newClaims = {
      ...currentClaims,
      role: 'admin'
    };

    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

    // 4. Revocar tokens para forzar la actualización del token en el cliente
    await admin.auth().revokeRefreshTokens(userRecord.uid);

    console.log(` ¡Éxito! El usuario ${email} (UID: ${userRecord.uid}) ha sido promovido a 'admin' para la agencia '${newClaims.agencyId}'.`);
    console.log('Se han revocado sus tokens de sesión activos para forzar la actualización del JWT.');
    
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(` Error: No se encontró ningún usuario registrado con el correo ${email}.`);
    } else {
      console.error(' Error al actualizar el rol del usuario:', error);
    }
    process.exit(1);
  }
}

// Obtener el email pasado como argumento desde la terminal
const emailArgument = process.argv[2];
promoteToAdmin(emailArgument);

//Para ejecutar este script desde la terminal, usa:
//node src/utils/updateUserRole.js asesor1@amsa.com
// Nota: Asegúrate de reemplazar "asesor1@amsa.com" con el correo electrónico del usuario que deseas promover a 'admin'.