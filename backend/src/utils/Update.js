const { db } = require('../config/firebase');

async function actualizarAgencyId() {
    const collectionName = 'appointments';

  try {
    // 1. Obtener todos los documentos de la colección
    const snapshot = await db.collection(collectionName).get();

    if (snapshot.empty) {
      console.log(`No se encontraron documentos en la colección "${collectionName}".`);
      return;
    }

    // 2. Usar un WriteBatch para actualizar todos los documentos de forma atómica
    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      const docRef = db.collection(collectionName).doc(doc.id);
      batch.update(docRef, { agencyId: 'TEST' });
    });

    // 3. Ejecutar la actualización masiva
    await batch.commit();

    console.log(`¡Éxito! Se actualizaron ${snapshot.size} registros en "${collectionName}".`);
  } catch (error) {
    console.error('Error al actualizar los documentos:', error);
  }
}

// Ejecutar la función
actualizarAgencyId();