import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import api from '../services/api';

// Deriva la URL del socket a partir de la misma variable de entorno usada por la API REST,
// para no romper la conexión en Docker/producción cuando el backend no está en localhost:4000
const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');
const socket = io(SOCKET_URL);

const DELIVERY_ACTIVITY = 'ENTREGA DE UNIDAD';
const CELEBRATION_DURATION_MS = 5 * 60 * 1000; // 5 minutos
const CONFETTI_INTERVAL_MS = 350;

export default function DisplayBoard() {
  const [boardData, setBoardData] = useState({ currentAppointment: null, nextAppointments: [] });
  const [clock, setClock] = useState({ time: '--:--:--', date: '---' });
  const [videos, setVideos] = useState([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [agencyLogo, setAgencyLogo] = useState(null);
  const [ytApiReady, setYtApiReady] = useState(false);
  const [showDeliveryOverlay, setShowDeliveryOverlay] = useState(false);
  const lastCelebratedIdRef = useRef(null);
  const celebrationHideTimeoutRef = useRef(null);
  const celebrationConfettiIntervalRef = useRef(null);
  const playerRef = useRef(null);
  const videosRef = useRef([]);
  const currentVideoIndexRef = useRef(0);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    currentVideoIndexRef.current = currentVideoIndex;
  }, [currentVideoIndex]);

  // 1. Reloj en tiempo real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const timeFmt = new Intl.DateTimeFormat('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const dateFmt = new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      setClock({
        time: timeFmt.format(now),
        date: dateFmt.format(now),
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Carga de datos del Display Board (ya filtrado por el backend: solo hoy, orden ascendente)
  const fetchBoardData = useCallback(async () => {
    try {
      const boardRes = await api.get('/appointments/display-board');
      if (boardRes.data) {
        setBoardData({
          currentAppointment: boardRes.data.currentAppointment || null,
          nextAppointments: boardRes.data.nextAppointments || [],
        });
      }
    } catch (error) {
      console.error('Error al obtener datos del tablero de citas:', error);
    }
  }, []);

  // Carga de videos de administración
  const fetchVideos = useCallback(async () => {
    try {
      const videosRes = await api.get('/administration/videos');
      if (videosRes.data && videosRes.data.videos) {
        setVideos(videosRes.data.videos);
      }
    } catch (error) {
      console.error('Error al obtener lista de videos:', error);
    }
  }, []);

  // Carga del logo de la agencia (con fallback a la marca por defecto)
  const fetchAgencyProfile = useCallback(async () => {
    try {
      const res = await api.get('/agencies/me');
      setAgencyLogo(res.data?.logoUrl || null);
    } catch (error) {
      console.error('Error al obtener el perfil de la agencia:', error);
    }
  }, []);

  useEffect(() => {
    fetchBoardData();
    fetchVideos();
    fetchAgencyProfile();
  }, [fetchBoardData, fetchVideos, fetchAgencyProfile]);

  // 3. Escuchar actualizaciones en tiempo real vía Socket.io
  useEffect(() => {
    const handleAppointmentsUpdated = (data) => {
      console.log('Evento de citas recibido vía WebSocket:', data);
      fetchBoardData();
    };

    socket.on('appointments_updated', handleAppointmentsUpdated);

    return () => {
      socket.off('appointments_updated', handleAppointmentsUpdated);
    };
  }, [fetchBoardData]);

  // Evento especial: entrega de unidad -> overlay de celebración cuando la cita pasa a "in_service"
  // Los timers viven en refs para no cortarse cuando boardData se refresca por polling/sockets.
  useEffect(() => {
    const current = boardData.currentAppointment;
    if (
      current &&
      current.status === 'in_service' &&
      (current.activity || '').toUpperCase().trim() === DELIVERY_ACTIVITY &&
      lastCelebratedIdRef.current !== current.id
    ) {
      lastCelebratedIdRef.current = current.id;
      setShowDeliveryOverlay(true);

      if (celebrationConfettiIntervalRef.current) clearInterval(celebrationConfettiIntervalRef.current);
      if (celebrationHideTimeoutRef.current) clearTimeout(celebrationHideTimeoutRef.current);

      // Confeti constante durante toda la celebración
      celebrationConfettiIntervalRef.current = setInterval(() => {
        confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0 }, colors: ['#F4C22B', '#15171B', '#EEF0F2'] });
        confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1 }, colors: ['#F4C22B', '#15171B', '#EEF0F2'] });
      }, CONFETTI_INTERVAL_MS);

      celebrationHideTimeoutRef.current = setTimeout(() => {
        setShowDeliveryOverlay(false);
        clearInterval(celebrationConfettiIntervalRef.current);
        celebrationConfettiIntervalRef.current = null;
      }, CELEBRATION_DURATION_MS);
    }
  }, [boardData.currentAppointment]);

  // Limpieza de timers de la celebración solo al desmontar el componente
  useEffect(() => {
    return () => {
      if (celebrationHideTimeoutRef.current) clearTimeout(celebrationHideTimeoutRef.current);
      if (celebrationConfettiIntervalRef.current) clearInterval(celebrationConfettiIntervalRef.current);
    };
  }, []);

  // Extrae el videoId de distintos formatos de enlace de YouTube
  const extractVideoId = (url) => {
    if (!url) return '';
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0] || '';
    if (url.includes('watch?v=')) return url.split('watch?v=')[1]?.split('&')[0] || '';
    if (url.includes('embed/')) return url.split('embed/')[1]?.split('?')[0] || '';
    return '';
  };

  // Helper para formatear la hora ISO recibida de la API
  const formatScheduledTime = (isoString) => {
    if (!isoString) return '--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return '--:--';
    }
  };

  // 4. Reproducción en bucle vía la API oficial de YouTube (postMessage manual no es fiable)
  const playVideoAtIndex = useCallback((index) => {
    const list = videosRef.current;
    if (!playerRef.current || list.length === 0) return;
    const videoId = extractVideoId(list[index]?.url);
    if (!videoId || typeof playerRef.current.loadVideoById !== 'function') return;
    playerRef.current.loadVideoById(videoId);
  }, []);

  const handlePlayerStateChange = useCallback((event) => {
    // 0 = YT.PlayerState.ENDED
    if (event.data !== 0) return;

    const list = videosRef.current;
    if (list.length === 0) return;

    const nextIndex = (currentVideoIndexRef.current + 1) % list.length;
    if (nextIndex === currentVideoIndexRef.current) {
      // Solo hay un video: repetirlo en bucle desde el inicio
      event.target.seekTo(0);
      event.target.playVideo();
    } else {
      setCurrentVideoIndex(nextIndex);
      playVideoAtIndex(nextIndex);
    }
  }, [playVideoAtIndex]);

  // Carga el script de la IFrame API de YouTube una sola vez
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtApiReady(true);
      return;
    }

    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === 'function') previousCallback();
      setYtApiReady(true);
    };
  }, []);

  // Crea el reproductor una sola vez que la API está lista y ya hay videos cargados
  useEffect(() => {
    if (!ytApiReady || videos.length === 0 || playerRef.current) return;

    const videoId = extractVideoId(videos[0].url);
    if (!videoId) return;

    playerRef.current = new window.YT.Player('yt-player-container', {
      videoId,
      playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
      events: { onStateChange: handlePlayerStateChange },
    });
  }, [ytApiReady, videos, handlePlayerStateChange]);

  // Si el índice actual queda fuera de rango (p. ej. se eliminó un video), reinicia al primero
  useEffect(() => {
    if (playerRef.current && videos.length > 0 && currentVideoIndex >= videos.length) {
      setCurrentVideoIndex(0);
      playVideoAtIndex(0);
    }
  }, [videos, currentVideoIndex, playVideoAtIndex]);

  // Destruye el reproductor solo al desmontar el componente
  useEffect(() => {
    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
      }
    };
  }, []);

  const { currentAppointment, nextAppointments } = boardData;
  // Modo teatro: no hay cita en curso ni citas pendientes para hoy
  const isTheaterMode = !currentAppointment && nextAppointments.length === 0;

  return (
    <div className="min-h-screen bg-[#EEF0F2] dark:bg-[#101216] text-[#15171B] dark:text-[#F2F3F5] font-sans transition-colors duration-300 p-7 lg:px-10 lg:py-9 flex flex-col justify-between">

      {/* Topbar */}
      <header className="flex items-center justify-between mb-9">
        <div className="flex items-center gap-3.5">
          {agencyLogo ? (
            <img
              src={agencyLogo}
              alt="Logo de la agencia"
              className="w-14 h-14 xl:w-16 xl:h-16 rounded-full object-contain border-[2.5px] border-[#15171B] dark:border-[#F2F3F5] bg-white flex-shrink-0"
            />
          ) : (
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 xl:w-14 xl:h-14 rounded-full border-[2.5px] border-[#15171B] dark:border-[#F2F3F5] flex items-center justify-center relative flex-shrink-0">
                <span className="w-4 h-4 xl:w-5 xl:h-5 rounded-full bg-[#F4C22B]"></span>
              </div>
              <div className="font-oswald leading-none">
                <div className="text-xl xl:text-2xl font-semibold tracking-[1.5px]">AUTOMOTORES</div>
                <div className="text-xs xl:text-sm font-medium tracking-[3px] text-[#767C87] dark:text-[#8A9099] mt-0.5">
                  DE MÉXICO
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4.5">
          <div className="text-right font-mono leading-tight">
            <div className="text-2xl xl:text-4xl font-bold tabular-nums">{clock.time}</div>
            <div className="text-sm xl:text-base text-[#767C87] dark:text-[#8A9099] capitalize">{clock.date}</div>
          </div>
          <Link
            to="/admin-dashboard"
            className="w-8 h-8 rounded-lg bg-transparent text-[#767C87] dark:text-[#8A9099] flex items-center justify-center opacity-60 hover:opacity-100 hover:text-[#15171B] dark:hover:text-white transition-all transform hover:rotate-45"
            title="Ajustes de panel"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </Link>
        </div>
      </header>

      {/* Main Grid: modo teatro expande el video a pantalla completa cuando no hay citas */}
      <main className={`grid grid-cols-1 ${isTheaterMode ? '' : 'lg:grid-cols-[1.15fr_1fr]'} gap-5.5 items-start flex-1`}>

        {/* Panel de Video */}
        <section className={`bg-[#15171B] rounded-[20px] overflow-hidden shadow-lg flex flex-col w-full ${isTheaterMode ? 'lg:col-span-1 max-w-5xl mx-auto w-full' : ''}`}>
          <div className="flex items-center justify-between px-4 py-3 font-mono text-[11.5px] tracking-[1.5px] text-[#C7CBD1] uppercase">
            <span>{videos[currentVideoIndex]?.title || 'INFORMACIÓN OFICIAL'}</span>
            <span className="text-[#F4C22B]">COMERCIAL OFICIAL</span>
          </div>
          <div className="relative w-full aspect-video bg-black">
            {videos.length > 0 ? (
              <div id="yt-player-container" className="absolute inset-0 w-full h-full" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#767C87] p-6 text-center">
                <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">No hay videos configurados</p>
              </div>
            )}
          </div>
        </section>

        {/* Panel de Citas (oculto en modo teatro) */}
        {!isTheaterMode && (
        <section className="flex flex-col gap-4">

          {/* Atendiendo ahora */}
          <div>
            <div className="font-oswald text-sm xl:text-base font-semibold tracking-[2.5px] text-[#767C87] dark:text-[#8A9099] uppercase mb-1 ml-0.5">
              EN ATENCIÓN.
            </div>
            <AnimatePresence mode="wait">
              {currentAppointment ? (
                <motion.div
                  key={currentAppointment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35 }}
                  className="relative grid grid-cols-[92px_1fr] xl:grid-cols-[120px_1fr] bg-white dark:bg-[#1A1D22] rounded-[14px] shadow-sm border border-[#F4C22B]"
                >
                  <div className="flex flex-col items-center justify-center gap-1.5 p-4">
                    <span className="bg-[#15171B] dark:bg-[#101216] text-[#EEF0F2] font-mono text-sm xl:text-lg font-semibold tracking-[0.5px] px-2 py-1 rounded-md text-center">
                      {formatScheduledTime(currentAppointment.scheduledTime)}
                    </span>
                  </div>
                  <div className="p-4 border-l border-[#E1E4E8] dark:border-[#2B2F36] relative">
                    <span className="absolute top-3.5 right-4 font-semibold text-[11px] xl:text-xs tracking-[0.5px] uppercase text-[#B23A2E] bg-[#B23A2E]/10 px-2 py-0.5 rounded">
                      EN SERVICIO
                    </span>
                    <div className="font-oswald font-semibold tracking-[0.2px] text-lg xl:text-2xl">
                      {currentAppointment.clientName}
                    </div>
                    <span className="text-xs xl:text-sm font-semibold text-[#3A2C00] dark:text-[#F4C22B] bg-[#F4C22B]/30 dark:bg-[#F4C22B]/10 inline-block px-2 py-0.5 rounded-full my-1.5">
                      {currentAppointment.vehicle?.make} {currentAppointment.vehicle?.model}
                    </span>
                    <div className="text-[12.5px] xl:text-sm text-[#767C87] dark:text-[#8A9099]">
                      {currentAppointment.activity}
                    </div>
                    <div className="text-[11.5px] xl:text-sm text-[#767C87] dark:text-[#8A9099] mt-2 pt-2 border-t border-[#E1E4E8] dark:border-[#2B2F36]">
                      Asesor de servicio: <b className="text-[#15171B] dark:text-white font-semibold">{currentAppointment.advisorName}</b>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="no-current"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4 bg-white dark:bg-[#1A1D22] rounded-[14px] text-sm xl:text-base text-[#767C87] text-center border border-[#E1E4E8] dark:border-[#2B2F36]"
                >
                  Sin servicio en curso
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* En cola */}
          <div>
            <div className="font-oswald text-sm xl:text-base font-semibold tracking-[2.5px] text-[#767C87] dark:text-[#8A9099] uppercase mb-1 ml-0.5">
              SIGUIENTES CITAS.
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {nextAppointments.length > 0 ? (
                  nextAppointments.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.3 }}
                      className="relative grid grid-cols-[92px_1fr] xl:grid-cols-[120px_1fr] bg-white dark:bg-[#1A1D22] rounded-[14px] shadow-sm border border-[#E1E4E8] dark:border-[#2B2F36]"
                    >
                      <div className="flex flex-col items-center justify-center gap-1.5 p-4">
                        <span className="bg-[#15171B] dark:bg-[#101216] text-[#EEF0F2] font-mono text-sm xl:text-lg font-semibold tracking-[0.5px] px-2 py-1 rounded-md text-center">
                          {formatScheduledTime(item.scheduledTime)}
                        </span>
                      </div>
                      <div className="p-4 border-l border-[#E1E4E8] dark:border-[#2B2F36]">
                        <div className="font-oswald font-semibold tracking-[0.2px] text-lg xl:text-2xl">
                          {item.clientName}
                        </div>
                        <span className="text-xs xl:text-sm font-semibold text-[#3A2C00] dark:text-[#F4C22B] bg-[#F4C22B]/30 dark:bg-[#F4C22B]/10 inline-block px-2 py-0.5 rounded-full my-1.5">
                          {item.vehicle?.make} {item.vehicle?.model}
                        </span>
                        <div className="text-[12.5px] xl:text-sm text-[#767C87] dark:text-[#8A9099]">
                          {item.activity}
                        </div>
                        <div className="text-[11.5px] xl:text-sm text-[#767C87] dark:text-[#8A9099] mt-2 pt-2 border-t border-[#E1E4E8] dark:border-[#2B2F36]">
                          Asesor de servicio: <b className="text-[#15171B] dark:text-white font-semibold">{item.advisorName}</b>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div
                    key="no-next"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-white dark:bg-[#1A1D22] rounded-[14px] text-sm xl:text-base text-[#767C87] text-center border border-[#E1E4E8] dark:border-[#2B2F36]"
                  >
                    No hay citas pendientes en la cola
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] xl:text-sm text-[#767C87] dark:text-[#8A9099] mt-0.5 ml-0.5">
            <span className="text-[#2E8B57] font-semibold">●</span> Taller operando con normalidad
          </div>

        </section>
        )}
      </main>

      <footer className="mt-11 pt-5 border-t border-[#E1E4E8] dark:border-[#2B2F36] flex flex-col items-center gap-1.5 text-center text-xs text-[#767C87] dark:text-[#8A9099]">
        <p>Deploy by DEVYIOS</p>
        <p>Automotores de México © 2026 · Todos los derechos reservados</p>
      </footer>

      {/* Overlay de celebración: Entrega de unidad */}
      <AnimatePresence>
        {showDeliveryOverlay && currentAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#15171B]/95 flex flex-col items-center justify-center text-center p-8"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            >
              <div className="text-[#F4C22B] text-6xl xl:text-8xl mb-4">🎉</div>
              <h2 className="font-oswald text-4xl xl:text-6xl font-bold text-white tracking-wide mb-3">
                ¡ENTREGA DE UNIDAD!
              </h2>
              <p className="text-xl xl:text-3xl text-[#F2F3F5] mb-1">{currentAppointment.clientName}</p>
              <p className="text-lg xl:text-2xl text-[#F4C22B] font-semibold">
                {currentAppointment.vehicle?.make} {currentAppointment.vehicle?.model}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
