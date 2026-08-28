import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import dayjs from 'dayjs';
import AppointmentDateTimePicker from '../components/AppointmentDateTimePicker';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';

// Debe permanecer alineado con el enum de estado del backend: waiting | in_service | finished | canceled
const STATUS_LABELS = {
  waiting: 'Activa / En espera',
  in_service: 'En atención',
  finished: 'Completada',
  canceled: 'Cancelada',
};

const RESTRICTED_TABS = { configuracion: true, usuarios: true };

export default function AdminDashboard() {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin';

  const [activeTab, setActiveTab] = useState('citas');
  const [appointments, setAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  // Estados para catálogos dinámicos
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [activities, setActivities] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingAdvisors, setLoadingAdvisors] = useState(false);

  // Estados del Modal de Cita
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [formData, setFormData] = useState({
    clientName: '',
    brand: '',
    model: '',
    reason: '',
    status: '',
    datetime: '',
    advisor: '',
  });

  // Configuración
  const [logoUrl, setLogoUrl] = useState('');
  const [videosList, setVideosList] = useState([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState(null);

  const MAX_VIDEOS = 100;

  // Gestión de usuarios
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'advisor' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userActionError, setUserActionError] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [savingUserName, setSavingUserName] = useState(false);

  useEffect(() => {
    // Evita que un usuario sin rol admin/superadmin quede en una pestaña restringida (p. ej. por estado stale)
    if (RESTRICTED_TABS[activeTab] && !isAdmin) {
      setActiveTab('citas');
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    fetchAppointments();
    fetchConfig();
    if (isAdmin) {
      fetchAdvisors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatAppointmentItem = (item) => {
    if (!item || typeof item !== 'object') return null;
    return {
      id: item.id || item._id,
      clientName: item.clientName || item.client || '',
      vehicle: item.vehicle || (item.make ? { make: item.make, model: item.model } : null),
      reason: item.activity || item.serviceReason || item.reason || item.service || '',
      datetime: item.scheduledTime || item.datetime || item.date || '',
      advisor: item.advisorName || item.advisor || '',
      status: item.status || 'waiting',
    };
  };

  const fetchAppointments = async () => {
    setLoadingAppointments(true);
    try {
      // Vista global del dashboard: todas las citas de la agencia, ordenadas cronológicamente
      const res = await api.get('/appointments');
      const list = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
      setAppointments(list.map(formatAppointmentItem).filter(Boolean));
    } catch (err) {
      console.error('Error al cargar citas:', err);
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await api.get('/administration/videos');
      const list = Array.isArray(res.data) ? res.data : res.data.videos || [];
      setVideosList(list);
    } catch (err) {
      console.error('Error al cargar videos:', err);
      setVideosList([]);
    }

    try {
      const agencyRes = await api.get('/agencies/me');
      if (agencyRes.data?.logoUrl) {
        setLogoUrl(agencyRes.data.logoUrl);
      }
    } catch (err) {
      console.error('Error al cargar el perfil de la agencia:', err);
    }
  };

  const fetchMakes = async () => {
    setLoadingMakes(true);
    try {
      const res = await api.get('/catalogs/vehicles/makes');
      const makesData = Array.isArray(res.data) ? res.data : res.data.makes || [];
      setMakes(makesData);
    } catch (err) {
      console.error('Error al cargar marcas de vehículos:', err);
      setMakes([]);
    } finally {
      setLoadingMakes(false);
    }
  };

  const fetchModelsByMake = async (makeId) => {
    if (!makeId) {
      setModels([]);
      return;
    }
    setLoadingModels(true);
    try {
      const res = await api.get(`/catalogs/vehicles/makes/${encodeURIComponent(makeId)}/models`);
      const modelsData = Array.isArray(res.data) ? res.data : res.data.models || [];
      setModels(modelsData);
    } catch (err) {
      console.error(`Error al cargar modelos para la marca ${makeId}:`, err);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchActivities = async () => {
    setLoadingActivities(true);
    try {
      const res = await api.get('/catalogs/activities');
      const activitiesData = Array.isArray(res.data)
        ? res.data
        : res.data.activities || [];
      setActivities(activitiesData);
    } catch (err) {
      console.error('Error al cargar actividades:', err);
      setActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  };

  const fetchAdvisors = async () => {
    setLoadingAdvisors(true);
    try {
      const res = await api.get('/auth/users');
      const usersList = Array.isArray(res.data)
        ? res.data
        : res.data.users || [];
      setAdvisors(usersList);
    } catch (err) {
      console.error('Error al cargar asesores:', err);
      setAdvisors([]);
    } finally {
      setLoadingAdvisors(false);
    }
  };

  const handleOpenModal = async (appointment = null) => {
    await Promise.all([fetchMakes(), fetchActivities(), fetchAdvisors()]);

    if (appointment) {
      setEditingAppointment(appointment);
      let brand = '';
      let model = '';

      if (typeof appointment.vehicle === 'object' && appointment.vehicle !== null) {
        brand = appointment.vehicle.make || '';
        model = appointment.vehicle.model || '';
      } else if (typeof appointment.vehicle === 'string') {
        const parts = appointment.vehicle.split(' ');
        brand = parts[0] || '';
        model = parts.slice(1).join(' ') || '';
      }

      setFormData({
        clientName: appointment.clientName || '',
        brand: brand,
        model: model,
        reason: appointment.activity || appointment.reason || '',
        status: appointment.status || 'waiting',
        datetime: appointment.scheduledTime
          ? dayjs(appointment.scheduledTime).format('YYYY-MM-DDTHH:mm')
          : dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
        advisor: appointment.advisorName || appointment.advisor || '',
      });

      if (brand) {
        fetchModelsByMake(brand);
      }
    } else {
      setEditingAppointment(null);
      setModels([]);
      setFormData({
        clientName: '',
        brand: '',
        model: '',
        reason: '',
        status: 'waiting',
        datetime: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
        advisor: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAppointment(null);
    setModels([]);
  };

  const handleBrandChange = (e) => {
    const selectedMake = e.target.value;
    setFormData((prev) => ({
      ...prev,
      brand: selectedMake,
      model: '',
    }));
    fetchModelsByMake(selectedMake);
  };

  const handleSaveAppointment = async (e) => {
    e.preventDefault();

    const dateObj = dayjs(formData.datetime);

    const payload = {
      date: dateObj.format('DD/MM/YYYY'),
      time: dateObj.format('HH:mm'),
      scheduledTime: dateObj.format(),
      activity: formData.reason,
      advisorName: formData.advisor,
      clientName: formData.clientName,
      make: formData.brand,
      model: formData.model,
      status: formData.status,
    };

    try {
      if (editingAppointment) {
        await api.put(`/appointments/${editingAppointment.id}`, payload);
      } else {
        await api.post('/appointments', payload);
      }
      handleCloseModal();
      fetchAppointments();
    } catch (err) {
      console.error('Error al guardar cita:', err.response?.data || err);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta cita?')) return;
    try {
      await api.delete(`/appointments/${id}`);
      fetchAppointments();
    } catch (err) {
      console.error('Error al eliminar cita:', err);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        setLogoUrl(dataUrl);
        // Persiste de inmediato: antes solo se guardaba en el estado local y se perdía al recargar
        persistLogo(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const persistLogo = async (value) => {
    if (!value) return;
    setSavingLogo(true);
    try {
      await api.patch('/agencies/me/logo', { logoUrl: value });
    } catch (err) {
      console.error('Error al guardar el logo:', err);
      alert(err.response?.data?.error || 'No se pudo guardar el logo.');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleSaveLogo = () => persistLogo(logoUrl);

  const handleAddVideo = async () => {
    const trimmedUrl = newVideoUrl.trim();
    if (!trimmedUrl) {
      alert('Por favor ingresa una URL de YouTube válida');
      return;
    }
    if (videosList.length >= MAX_VIDEOS) {
      alert(`Se alcanzó el límite máximo de ${MAX_VIDEOS} videos.`);
      return;
    }

    setSavingConfig(true);
    try {
      await api.post('/administration/add-video', { url: trimmedUrl });
      setNewVideoUrl('');
      fetchConfig();
    } catch (err) {
      console.error('Error al guardar el video:', err);
      alert(err.response?.data?.error || 'No se pudo guardar el video.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!window.confirm('¿Eliminar este video de la lista?')) return;
    setDeletingVideoId(id);
    try {
      await api.delete(`/administration/videos/${id}`);
      fetchConfig();
    } catch (err) {
      console.error('Error al eliminar el video:', err);
      alert(err.response?.data?.error || 'No se pudo eliminar el video.');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const getEmbedUrl = (url) => {
    if (!url) return '';
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    } else if (url.includes('watch?v=')) {
      videoId = url.split('watch?v=')[1]?.split('&')[0];
    } else if (url.includes('embed/')) {
      videoId = url.split('embed/')[1]?.split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const formatVehicle = (vehicle) => {
    if (!vehicle) return 'N/A';
    if (typeof vehicle === 'object') {
      const make = vehicle.make || '';
      const model = vehicle.model || '';
      return `${make} ${model}`.trim() || 'N/A';
    }
    return String(vehicle);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserActionError('');

    if (!newUserForm.email || !newUserForm.password) {
      setUserActionError('El correo y la contraseña son obligatorios.');
      return;
    }

    setCreatingUser(true);
    try {
      await api.post('/users/create-user', newUserForm);
      setNewUserForm({ name: '', email: '', password: '', role: 'advisor' });
      fetchAdvisors();
    } catch (err) {
      setUserActionError(err.response?.data?.error || 'No se pudo crear el usuario.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleUserStatus = async (targetUser) => {
    const action = targetUser.disabled ? 'enable' : 'disable';
    try {
      await api.patch(`/users/users/${targetUser.uid}/${action}`);
      fetchAdvisors();
    } catch (err) {
      console.error(`Error al ${action === 'enable' ? 'reactivar' : 'inhabilitar'} usuario:`, err);
      alert(err.response?.data?.error || 'No se pudo actualizar el usuario.');
    }
  };

  const handleStartEditUserName = (targetUser) => {
    setEditingUserId(targetUser.uid);
    setEditingUserName(targetUser.name || '');
  };

  const handleCancelEditUserName = () => {
    setEditingUserId(null);
    setEditingUserName('');
  };

  const handleSaveUserName = async (uid) => {
    if (!editingUserName.trim()) {
      alert('El nombre no puede estar vacío.');
      return;
    }
    setSavingUserName(true);
    try {
      await api.patch(`/users/users/${uid}/name`, { name: editingUserName.trim() });
      setEditingUserId(null);
      setEditingUserName('');
      fetchAdvisors();
    } catch (err) {
      console.error('Error al actualizar el nombre del usuario:', err);
      alert(err.response?.data?.error || 'No se pudo actualizar el nombre.');
    } finally {
      setSavingUserName(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#15171B] font-sans flex flex-col md:flex-row">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="flex-1 p-6 md:px-10 md:py-8 max-w-6xl w-full mx-auto">
        {/* Encabezado */}
        <header className="flex items-center justify-between gap-3 mb-6 md:hidden">
          <Link
            to="/display-board"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-black transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Administración</h1>
        </header>

        {/* PESTAÑA: CITAS */}
        {activeTab === 'citas' && (
        <section className="w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Gestión de citas</h2>
            <button
              onClick={() => handleOpenModal()}
              className="bg-black hover:bg-gray-800 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Nueva cita
            </button>
          </div>

          {/* Vista de tabla (md en adelante) */}
          <div className="hidden md:block border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium text-gray-400 uppercase">
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Vehículo</th>
                  <th className="py-3.5 px-4">Motivo</th>
                  <th className="py-3.5 px-4">Horario</th>
                  <th className="py-3.5 px-4">Asesor</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loadingAppointments ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-400">
                      Cargando citas...
                    </td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-gray-400">
                      No hay citas programadas.
                    </td>
                  </tr>
                ) : (
                  appointments.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4 font-semibold text-black">{item.clientName || 'N/A'}</td>
                      <td className="py-4 px-4">{formatVehicle(item.vehicle)}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-md text-xs font-semibold ${['ENTREGA', 'Entrega'].includes(item.reason)
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                          {item.reason || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-600">{formatDate(item.datetime)}</td>
                      <td className="py-4 px-4 text-gray-600">{item.advisor || 'N/A'}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium border ${item.status === 'finished'
                            ? 'bg-gray-50 text-gray-500 border-gray-200'
                            : 'bg-white text-gray-800 border-gray-300'
                            }`}
                        >
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-3 text-gray-400">
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="hover:text-black transition-colors"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteAppointment(item.id)}
                            className="hover:text-red-500 transition-colors"
                            title="Eliminar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Vista de tarjetas (móvil) */}
          <div className="md:hidden flex flex-col gap-3">
            {loadingAppointments ? (
              <p className="text-center text-gray-400 py-6">Cargando citas...</p>
            ) : appointments.length === 0 ? (
              <p className="text-center text-gray-400 py-6">No hay citas programadas.</p>
            ) : (
              appointments.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-black">{item.clientName || 'N/A'}</span>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${item.status === 'finished'
                        ? 'bg-gray-50 text-gray-500 border-gray-200'
                        : 'bg-white text-gray-800 border-gray-300'
                        }`}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{formatVehicle(item.vehicle)}</p>
                  <p className="text-sm text-gray-600">{item.reason || 'N/A'}</p>
                  <p className="text-sm text-gray-600">{formatDate(item.datetime)} · {item.advisor || 'N/A'}</p>
                  <div className="flex items-center gap-4 mt-3 text-gray-400">
                    <button onClick={() => handleOpenModal(item)} className="text-xs font-semibold hover:text-black transition-colors">
                      Editar
                    </button>
                    <button onClick={() => handleDeleteAppointment(item.id)} className="text-xs font-semibold hover:text-red-500 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        )}

        {/* PESTAÑA: CONFIGURACIÓN */}
        {activeTab === 'configuracion' && isAdmin && (
        <section className="max-w-4xl mx-auto border border-gray-200 rounded-xl p-8 shadow-sm">
          <div className="mb-8">
            <h3 className="text-base font-bold mb-1">Logo de la empresa</h3>
            <p className="text-sm text-gray-500 mb-4">Sube el logo que se mostrará en la pantalla principal.</p>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 bg-black rounded-xl p-2 flex items-center justify-center overflow-hidden border border-gray-200">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo Previsto" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-cyan-400 font-bold text-xs text-center">Sin Logo</div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="border border-gray-300 hover:border-black text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 w-fit transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Subir logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {logoUrl && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveLogo}
                      disabled={savingLogo}
                      className="text-black text-xs text-left font-semibold hover:underline disabled:opacity-50"
                    >
                      {savingLogo ? 'Guardando...' : 'Reintentar guardado'}
                    </button>
                    <button
                      onClick={() => setLogoUrl('')}
                      className="text-red-500 text-xs text-left font-medium hover:underline"
                    >
                      Quitar logo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-2">
            <h3 className="text-base font-bold mb-1 flex items-center gap-2">
              <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              Videos de YouTube
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Agrega hasta {MAX_VIDEOS} enlaces. Se reproducirán en bucle, uno tras otro, en la pantalla principal.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black"
              />
              <button
                onClick={handleAddVideo}
                disabled={savingConfig || videosList.length >= MAX_VIDEOS}
                className="bg-black hover:bg-gray-800 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {savingConfig ? 'Agregando...' : 'Agregar video'}
              </button>
            </div>

            <span className="block text-xs font-semibold text-gray-500 mb-2">
              {videosList.length} / {MAX_VIDEOS} videos en la lista de reproducción
            </span>

            {videosList.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
                No hay videos configurados.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videosList.map((video) => (
                  <div key={video.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="aspect-video bg-black">
                      <iframe
                        className="w-full h-full border-0"
                        src={getEmbedUrl(video.url)}
                        title={video.title || video.url}
                        allowFullScreen
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-gray-500 truncate">{video.url}</span>
                      <button
                        onClick={() => handleDeleteVideo(video.id)}
                        disabled={deletingVideoId === video.id}
                        className="text-red-500 text-xs font-semibold hover:underline disabled:opacity-50 flex-shrink-0 ml-2"
                      >
                        {deletingVideoId === video.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        )}

        {/* PESTAÑA: USUARIOS */}
        {activeTab === 'usuarios' && isAdmin && (
        <section className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Gestión de usuarios</h2>

          <div className="border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
            <h3 className="text-base font-bold mb-4">Nuevo colaborador</h3>
            {userActionError && (
              <p className="text-red-500 text-xs mb-3">{userActionError}</p>
            )}
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" htmlFor="name">Nombre completo</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Nombre completo"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="Correo electrónico"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" htmlFor="password">Contraseña temporal</label>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="Contraseña temporal"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" htmlFor="role">Rol</label>
                <select
                  id="role"
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white"
                >
                  <option value="advisor">Asesor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={creatingUser}
                className="md:col-span-2 bg-black hover:bg-gray-800 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {creatingUser ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium text-gray-400 uppercase">
                  <th className="py-3 px-4">Nombre</th>
                  <th className="py-3 px-4">Correo</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loadingAdvisors ? (
                  <tr><td colSpan="5" className="py-6 text-center text-gray-400">Cargando usuarios...</td></tr>
                ) : advisors.length === 0 ? (
                  <tr><td colSpan="5" className="py-6 text-center text-gray-400">No hay colaboradores registrados.</td></tr>
                ) : (
                  advisors.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        {editingUserId === u.uid ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              value={editingUserName}
                              onChange={(e) => setEditingUserName(e.target.value)}
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-36 focus:outline-none focus:border-black"
                            />
                            <button
                              onClick={() => handleSaveUserName(u.uid)}
                              disabled={savingUserName}
                              className="text-xs font-semibold text-green-600 hover:underline disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={handleCancelEditUserName}
                              className="text-xs font-semibold text-gray-400 hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{u.name || 'N/A'}</span>
                            <button
                              onClick={() => handleStartEditUserName(u)}
                              className="text-gray-400 hover:text-black transition-colors"
                              title="Editar nombre"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{u.email}</td>
                      <td className="py-3 px-4 text-gray-600 capitalize">{u.role}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${u.disabled ? 'bg-red-50 text-red-500 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                          {u.disabled ? 'Inhabilitado' : 'Activo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className="text-xs font-semibold hover:underline"
                        >
                          {u.disabled ? 'Reactivar' : 'Inhabilitar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {/* MODAL NUEVA / EDITAR CITA */}
        {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative">
            <button
              onClick={handleCloseModal}
              className="absolute top-5 right-5 text-gray-400 hover:text-black transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold mb-5">
              {editingAppointment ? 'Editar cita' : 'Nueva cita'}
            </h3>

            <form onSubmit={handleSaveAppointment} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Nombre del cliente</label>
                <input
                  type="text"
                  required
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black"
                />
              </div>

              {/* Marca y Modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Marca</label>
                  <select
                    required
                    value={formData.brand}
                    onChange={handleBrandChange}
                    disabled={loadingMakes}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white disabled:bg-gray-100"
                  >
                    <option value="">{loadingMakes ? 'Cargando marcas...' : 'Seleccionar marca'}</option>
                    {makes.map((item, idx) => {
                      const makeName = typeof item === 'string' ? item : item.name || item.id;
                      return (
                        <option key={idx} value={makeName}>
                          {makeName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Modelo</label>
                  <select
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    disabled={!formData.brand || loadingModels}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white disabled:bg-gray-100"
                  >
                    <option value="">
                      {!formData.brand
                        ? 'Primero elija marca'
                        : loadingModels
                          ? 'Cargando modelos...'
                          : 'Seleccionar modelo'}
                    </option>
                    {models.map((item, idx) => {
                      const modelName = typeof item === 'string' ? item : item.name || item.id;
                      return (
                        <option key={idx} value={modelName}>
                          {modelName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Motivo de visita</label>
                  <select
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white"
                  >
                    <option value="">{loadingActivities ? 'Cargando motivos...' : 'Seleccionar motivo'}</option>
                    {activities.map((item, idx) => {
                      const reasonName = typeof item === 'string' ? item : item.name || item.id;
                      return (
                        <option key={idx} value={reasonName}>
                          {reasonName}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold mb-1">Estado</label>
                  <select
                    value={formData.status || 'waiting'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white"
                  >
                    <option value="waiting">Activa / En espera</option>
                    <option value="in_service">En atención</option>
                    <option value="finished">Completada</option>
                    <option value="canceled">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Horario</label>
                  <AppointmentDateTimePicker
                    value={formData.datetime}
                    onChange={(newIsoDate) =>
                      setFormData((prev) => ({ ...prev, datetime: newIsoDate }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Asesor</label>
                  <select
                    required
                    value={formData.advisor}
                    onChange={(e) => setFormData({ ...formData, advisor: e.target.value })}
                    disabled={loadingAdvisors}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-black bg-white disabled:bg-gray-100"
                  >
                    <option value="">
                      {loadingAdvisors ? 'Cargando asesores...' : 'Seleccionar asesor'}
                    </option>
                    {advisors.map((advisorUser) => {
                      const displayName = advisorUser.name && advisorUser.name.trim() !== '' ? advisorUser.name : advisorUser.email;
                      return (
                        <option key={advisorUser.uid || advisorUser._id || displayName} value={displayName}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}