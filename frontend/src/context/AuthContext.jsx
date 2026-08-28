import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import api, { setupAxiosInterceptors } from '../services/api';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Configurar los interceptores de Axios conectados al estado de React
  useEffect(() => {
    setupAxiosInterceptors(
      () => token,
      (newToken) => setToken(newToken)
    );
  }, [token]);

  // Al recargar la aplicación (F5), intenta renovar el token de acceso usando la cookie HttpOnly
  useEffect(() => {
    const silentRefresh = async () => {
      try {
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { idToken, user: userData } = response.data;
        setToken(idToken);
        setUser(userData);
      } catch (error) {
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    silentRefresh();
  }, []);

  // Función para iniciar sesión (almacena únicamente en memoria React)
  const login = (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
  };

  // Función para cerrar sesión y revocar/limpiar cookies en el backend
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Error durante el cierre de sesión:', error);
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};