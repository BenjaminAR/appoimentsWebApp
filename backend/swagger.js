const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de Citas - Concesionario Multi-Tenant',
      version: '1.0.0',
      description: 'Documentación oficial de los endpoints para autenticación, catálogos y pantalla pública de citas.',
    },
    servers: [
      {
        url: 'http://localhost:4000/api',
        description: 'Servidor local de desarrollo',
      },
    ],
    components: {
      // 1. Definición del esquema de seguridad JWT Bearer
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Ingresa el idToken generado por Firebase Auth',
        },
      },
      // 2. Modelos de datos reutilizables
      schemas: {
        RegisterInput: {
          type: 'object',
          required: ['email', 'password', 'agencyId', 'role'],
          properties: {
            email: { type: 'string', example: 'asesor@amsa.com' },
            password: { type: 'string', example: 'Password123!' },
            agencyId: { type: 'string', example: 'AMSA' },
            role: { type: 'string', example: 'advisor' },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', example: 'asesor@amsa.com' },
            password: { type: 'string', example: 'Password123!' },
          },
        },
        AgencyInput: {
          type: 'object',
          required: [ 'agencyId', 'status', 'plan', 'currentPeriodEnd'],
          properties: {
            agencyId: { type: 'string', example: 'DEMOAGENCY' },
            status: { type: 'string', example: 'active' },
            plan: { type: 'string', example: 'trial' },
            currentPeriodEnd: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59.000Z' },
          },
        },
        LogoutInput: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Sesión cerrada y tokens revocados exitosamente' },
          },
        },
        AppointmentInput: {
          type: 'object',
          required: ['date', 'time', 'activity', 'advisorName', 'clientName', 'make', 'model'],
          properties: {
            date: { type: 'string', example: '2026-08-01' },
            time: { type: 'string', example: '12:00' },
            activity: { type: 'string', example: 'PRUEBA DE MANEJO' },
            advisorName: { type: 'string', example: 'DIEGO CRESPO' },
            clientName: { type: 'string', example: 'MARCO NAVARRETE' },
            make: { type: 'string', example: 'PEUGEOT' },
            model: { type: 'string', example: 'RIFTER' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Mensaje descriptivo del error' },
          },
        },
      },
    },
    // Aplica seguridad globalmente si lo deseas, o por endpoint específico
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  // Patrón para escanear las anotaciones @openapi dentro de src/routes/
  apis: ['./src/routes/*.js', './server.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;