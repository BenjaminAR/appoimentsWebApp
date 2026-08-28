import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Importante para permitir cookies en /auth/refresh
  headers: {
    'Content-Type': 'application/json',
  },
});

// Variable en módulo para guardar el getter del token desde AuthContext
let getAccessToken = () => null;
let onTokenRefreshed = () => {};

export const setupAxiosInterceptors = (getToken, updateToken) => {
  getAccessToken = getToken;
  onTokenRefreshed = updateToken;
};

// Interceptor de Petición: Inyecta el Access Token en memoria en los Headers
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor de Respuesta: Si expira el token (401), intenta refrescarlo automáticamente
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Si es error 401 y no hemos reintentado ya esta petición
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Solicitar nuevo Access Token a través de la Cookie HttpOnly
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = res.data.accessToken;
        onTokenRefreshed(newAccessToken); // Actualiza la memoria en AuthContext

        // Reintentar la petición original con el nuevo token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Si el Refresh Token también expiró (pasaron los 7 días), el usuario debe volver a iniciar sesión
        onTokenRefreshed(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;