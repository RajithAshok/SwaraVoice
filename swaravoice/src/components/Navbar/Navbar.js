import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp, getHospitalName } from '../../context/AppContext';
import './Navbar.css';

export default function Navbar() {
  const { state, actions, role, currentUser } = useApp();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (!state.isAuthenticated) return null;

  const user     = currentUser;
  const initials = user?.name
    ?.split(' ').filter((w) => w.match(/^[A-Z]/)).slice(0, 2).map((w) => w[0]).join('') || '??';

  const hospitalName = getHospitalName(user);

  // "My Patients" tab only shows for Admin if they are also a doctor
  const adminIsAlsoDoctor = role === 'Admin' && user?.isAlsoDoctor;

  const NAV_LINKS = role === 'SuperAdmin' ? [
    { path: '/superadmin', label: 'Hospitals',    icon: '⬡' },
    { path: '/profile',    label: 'Settings',     icon: '◈' },
  ] : role === 'Admin' ? [
    { path: '/admin',     label: 'Hospital',      icon: '⬡' },
    ...(adminIsAlsoDoctor
      ? [{ path: '/dashboard', label: 'My Patients', icon: '◎' }]
      : []),
    { path: '/profile',   label: 'Settings',      icon: '◈' },
  ] : [
    { path: '/dashboard', label: 'Dashboard',     icon: '⬡' },
    { path: '/profile',   label: 'Settings',      icon: '◈' },
  ];

  const handleLogout = () => { actions.logout(); navigate('/login'); };

  const roleBadgeColor = role === 'SuperAdmin' ? 'var(--accent-amber)'
    : role === 'Admin' ? 'var(--accent-teal)'
    : 'var(--accent-cyan)';

  const homeRoute = role === 'SuperAdmin' ? '/superadmin'
    : role === 'Admin' ? '/admin'
    : '/dashboard';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <button className="navbar-logo" onClick={() => navigate(homeRoute)}>
          <span className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke="url(#nlg)" strokeWidth="1.5"/>
              <path d="M6 11 Q8 7 11 11 Q14 15 16 11" stroke="url(#nlg)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <defs>
                <linearGradient id="nlg" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38BDF8"/><stop offset="1" stopColor="#3B82F6"/>
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="logo-text">Swara<span>Voice</span></span>
        </button>

        <div className="navbar-links">
          {NAV_LINKS.map(({ path, label, icon }) => (
            <button key={path}
              className={`nav-link ${location.pathname.startsWith(path) ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </div>

        <div className="navbar-right">
          {hospitalName && (
            <div className="hospital-badge">
              <span className="hospital-dot" />
              <span>{hospitalName}</span>
            </div>
          )}

          <div className="profile-wrapper" ref={profileRef}>
            <button className={`profile-btn ${profileOpen ? 'open' : ''}`} onClick={() => setProfileOpen((p) => !p)}>
              <div className="avatar">{initials}</div>
              <div className="profile-info">
                <span className="profile-name">{user?.name}</span>
                <span className="profile-role" style={{ color: roleBadgeColor }}>{role}</span>
              </div>
              <span className="chevron">▾</span>
            </button>

            {profileOpen && (
              <div className="profile-dropdown">
                <div className="dropdown-header">
                  <div className="avatar large">{initials}</div>
                  <div>
                    <p className="dropdown-name">{user?.name}</p>
                    <p className="dropdown-role" style={{ color: roleBadgeColor }}>{role}</p>
                    <p className="dropdown-email">{user?.email}</p>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { navigate('/profile'); setProfileOpen(false); }}>
                  <span>◈</span> Settings
                </button>
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <span>⤷</span> Sign out
                </button>
              </div>
            )}
          </div>

          <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen((p) => !p)}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-drawer">
          {NAV_LINKS.map(({ path, label, icon }) => (
            <button key={path}
              className={`mobile-nav-link ${location.pathname.startsWith(path) ? 'active' : ''}`}
              onClick={() => { navigate(path); setMenuOpen(false); }}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
          <button className="mobile-nav-link danger" onClick={handleLogout}>
            <span>⤷</span> Sign out
          </button>
        </div>
      )}
    </nav>
  );
}