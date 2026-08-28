const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

const authRoutes = require('./src/routes/auth.routes');
const appointmentRoutes = require('./src/routes/appointments.routes');
const catalogRoutes = require('./src/routes/catalog.routes');
const agencyRoutes = require('./src/routes/agencies.routes');
const administrationRoutes = require('./src/routes/administration.routes');
const { db } = require('./src/config/firebase');
const { startAppointmentStatusScheduler } = require('./src/services/appointmentStatusScheduler');

const app = express();
const PORT = process.env.PORT || 4000;
// Origen(es) permitidos configurables por entorno (soporta lista separada por comas para múltiples despliegues)
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

// Evita que rechazos de promesas no controlados o excepciones inesperadas reinicien el contenedor en silencio
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// 1. Inicialización de Servidor HTTP y WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Cliente conectado vía WebSocket:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// 2. Middlewares Globales
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// 3. Documentación y Verificación
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 4. Rutas Modulares
app.use('/api/auth', authRoutes);
// Alias solicitado por el frontend de gestión de usuarios (misma implementación que /api/auth)
app.use('/api/users', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/administration', administrationRoutes);

// 5. Manejo Centralizado de Errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 6. Arrancar Servidor (Única llamada al final)
server.listen(PORT, () => {
  console.log(`Servidor HTTP y WebSockets corriendo en puerto ${PORT}`);
  // Motor de transición automática de estados de citas (waiting -> in_service -> finished)
  startAppointmentStatusScheduler(db, io);
});