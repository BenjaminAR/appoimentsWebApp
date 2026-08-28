const { db } = require('../config/firebase');

const carCatalogData= [
  {
    make: 'ALFA ROMEO',
    models: [
      // Históricos / usados
      '145',
      '146',
      '147',
      '156',
      '166',
      'GT',
      'GTV',
      'SPIDER',
      '159',
      'BRERA',
      'MITO',
      'GIULIETTA',
      '4C',

      // Actuales / recientes
      'GIULIA',
      'STELVIO',
      'TONALE',
      'JUNIOR'
    ]
  },

  {
    make: 'CHRYSLER',
    models: [
      // 2000-2010
      'NEON',
      'CIRRUS',
      'SEBRING',
      'PT CRUISER',
      'PACIFICA',
      'TOWN & COUNTRY',
      'VOYAGER',
      'GRAND VOYAGER',
      '300',
      '300C',
      'ASPEN',
      'CROSSFIRE',

      // 2010-2020
      '200',
      '200S',
      '200C',
      '300',
      '300C',
      'PACIFICA',
      'TOWN & COUNTRY',
      'VOYAGER'
    ]
  },

  {
    make: 'DODGE',
    models: [
      // 2000-2010
      'NEON',
      'STRATUS',
      'INTREPID',
      'CARAVAN',
      'GRAND CARAVAN',
      'DAKOTA',
      'DURANGO',
      'RAM',
      'RAM 1500',
      'RAM 2500',
      'RAM 3500',
      'VIPER',
      'VIPER GTS',
      'VIPER SRT-10',
      'CHARGER',
      'CHALLENGER',
      'MAGNUM',
      'CALIBER',
      'NITRO',
      'AVENGER',

      // 2010-2020
      'ATTITUDE',
      'DART',
      'JOURNEY',
      'CHARGER',
      'CHALLENGER',
      'DURANGO',
      'GRAND CARAVAN',

      // 2020-2026
      'ATTITUDE',
      'CHARGER',
      'DURANGO'
    ]
  },

  {
    make: 'FIAT',
    models: [
      // 2000-2010
      'PALIO',
      'PALIO ADVENTURE',
      'SIENA',
      'STRADA',
      'UNO',
      'PUNTO',
      'GRANDE PUNTO',
      'LINEA',
      'DOBLO',
      'DUCATO',
      'FIORINO',
      '500',

      // 2010-2020
      '500',
      '500C',
      '500L',
      '500X',
      'PANDA',
      'PUNTO',
      'PALIO',
      'SIENA',
      'STRADA',
      'ARGO',
      'MOBI',
      'TIPO',
      'TORO',
      'DUCATO',
      'FIORINO',

      // 2020-2026
      'MOBI',
      'ARGO',
      'PULSE',
      'PULSE ABARTH',
      'FASTBACK',
      'FASTBACK ABARTH',
      '500E',
      'DUCATO'
    ]
  },

  {
    make: 'JEEP',
    models: [
      // 2000-2010
      'WRANGLER',
      'CHEROKEE',
      'LIBERTY',
      'GRAND CHEROKEE',
      'COMMANDER',

      // 2010-2020
      'WRANGLER',
      'CHEROKEE',
      'GRAND CHEROKEE',
      'COMMANDER',
      'COMPASS',
      'PATRIOT',
      'RENEGADE',

      // 2020-2026
      'RENEGADE',
      'COMPASS',
      'COMMANDER',
      'CHEROKEE',
      'GRAND CHEROKEE',
      'WRANGLER',
      'JT',
      'GLADIATOR',
      'WAGONEER',
      'GRAND WAGONEER',
      'GRAND WAGONEER L'
    ]
  },

  {
    make: 'PEUGEOT',
    models: [
      // 2000-2010
      '106',
      '206',
      '206 CC',
      '206 SW',
      '306',
      '306 BREAK',
      '307',
      '307 SEDAN',
      '307 SW',
      '307 CC',
      '406',
      '406 COUPE',
      '407',
      '607',
      '807',
      'PARTNER',
      'PARTNER RAPID',
      'PARTNER MAXI',
      'EXPERT',
      'MANAGER',
      '308',

      // 2010-2020
      '207',
      '207 CC',
      '208',
      '208 GT',
      '301',
      '308',
      '308 GT',
      '408',
      '508',
      '2008',
      '3008',
      '5008',
      'PARTNER',
      'PARTNER TEPEE',
      'PARTNER MAXI',
      'EXPERT',
      'TRAVELLER',
      'MANAGER',
      'RIFTER',
      'LANDTREK',

      // 2020-2026
      '208',
      '2008',
      '3008',
      '5008',
      '301',
      '308',
      '408',
      '508',
      'RIFTER',
      'PARTNER',
      'PARTNER RAPID',
      'EXPERT',
      'MANAGER',
      'LANDTREK',
      'E-PARTNER'
    ]
  },

  {
    make: 'RAM',
    models: [
      // 2000-2010 / transición Dodge-Ram
      '1500',
      '2500',
      '3500',
      '4000',

      // 2010-2020
      '700',
      '1200',
      '1500',
      '2500',
      '3500',
      '4000',
      'PROMASTER',
      'PROMASTER CITY',
      'PROMASTER RAPID',

      // 2020-2026
      '700',
      '1200',
      '1500',
      '1500 TRX',
      '1500 RHO',
      '1500 TRADESMAN',
      '2500',
      '2500 HD',
      '2500 HD LIMITED',
      '2500 HD POWER WAGON',
      '4000',
      'PROMASTER',
      'PROMASTER CITY',
      'PROMASTER RAPID'
    ]
  },

  {
    make: 'WAGONEER',
    models: [
      'WAGONEER',
      'GRAND WAGONEER',
      'GRAND WAGONEER L'
    ]
  },

  {
    make: 'LEAPMOTOR',
    models: [
      'T03',
      'C10'
    ]
  }
];

async function seedCarCatalog() {
  try {
    console.log('Iniciando la carga del catálogo en Firestore...');

    const operations = [];

    for (const item of carCatalogData) {
      const makeId = item.make.toUpperCase().trim();
      const makeRef = db.collection('vehicle_makes').doc(makeId);

      // Operación para guardar la marca
      operations.push({
        ref: makeRef,
        data: {
          name: makeId,
          createdAt: new Date().toISOString()
        }
      });

      // Operaciones para guardar los modelos
      for (const modelName of item.models) {
        const cleanModel = modelName.toUpperCase().trim();

        const modelRef = makeRef
          .collection('models')
          .doc(cleanModel);

        operations.push({
          ref: modelRef,
          data: {
            name: cleanModel,
            makeId: makeId,
            createdAt: new Date().toISOString()
          }
        });
      }
    }

    // Firestore permite máximo 500 operaciones por batch
    const BATCH_SIZE = 500;

    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = db.batch();

      const currentOperations = operations.slice(
        i,
        i + BATCH_SIZE
      );

      for (const operation of currentOperations) {
        batch.set(
          operation.ref,
          operation.data,
          { merge: true }
        );
      }

      await batch.commit();

      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} completado: ` +
        `${currentOperations.length} operaciones.`
      );
    }

    console.log(
      `¡Éxito! Se cargaron ${operations.length} operaciones ` +
      `en Firestore.`
    );

  } catch (error) {
    console.error('Error al poblar el catálogo:', error);
  }
}

seedCarCatalog();