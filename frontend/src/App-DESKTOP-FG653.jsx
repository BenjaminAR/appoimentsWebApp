import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import DisplayBoard from './pages/DisplayBoard';
import AdminDashboard from './pages/AdminDashboard';

// Componentes temporales de prueba
const Dashboard = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold text-gray-800">Panel Principal</h1>
    <p className="text-gray-600">Bienvenido al sistema.</p>
  </div>
);

const Unauthorized = () => (
  <div className="min-h-screen flex items-center justify-center bg-red-50">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-red-600">403 - Acceso Denegado</h1>
      <p className="mt-2 text-gray-600">No tienes permisos para acceder a esta página.</p>
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Rutas Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Rutas Protegidas (Cualquier usuario autenticado) */}
          <Route element={<ProtectedRoute />}>
            {/* <Route path="/dashboard" element={<Dashboard />} /> */}
            <Route path="/display-board" element={<DisplayBoard />} />
          </Route>

          {/* Rutas Protegidas por Rol (Ejemplo Admin/Superadmin) */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'superadmin']} />}>
            {/* Aquí agregarás tus vistas de administración */}
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
          </Route>

          {/* Redirección por defecto */}
          <Route path="*" element={<Navigate to="/display-board" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}