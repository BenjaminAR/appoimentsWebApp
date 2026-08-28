import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  {
    key: 'citas',
    label: 'Tablero de citas',
    roles: ['admin', 'superadmin', 'advisor'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'configuracion',
    label: 'Configuración de agencia',
    roles: ['admin', 'superadmin'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
  },
  {
    key: 'usuarios',
    label: 'Gestión de usuarios',
    roles: ['admin', 'superadmin'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeTab, onSelectTab }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = (user?.role || '').toLowerCase();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="w-full md:w-60 md:min-h-screen bg-white border-b md:border-b-0 md:border-r border-gray-200 flex md:flex-col shrink-0">
      <div className="hidden md:flex items-center gap-2 px-5 py-6">
        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F4C22B]" />
        </div>
        <span className="font-bold tracking-tight">Administración</span>
      </div>

      <nav className="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto md:overflow-visible flex-1">
        <Link
          to="/display-board"
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-black"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h18v12H3V4zm5 16h8m-4-4v4" />
          </svg>
          Ver tablero de TV
        </Link>
        {visibleItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelectTab(item.key)}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === item.key
                ? 'bg-black text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-black'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="hidden md:flex flex-col gap-2 p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors px-3.5 py-2 text-left"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
