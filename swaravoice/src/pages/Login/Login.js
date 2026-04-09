import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './Login.css';

function defaultRoute(role) {
  if (role === 'SuperAdmin') return '/superadmin';
  if (role === 'Admin')      return '/admin';
  return '/dashboard';
}

export default function Login() {
  const { actions } = useApp();
  const navigate    = useNavigate();

  const [form,        setForm]        = useState({ email: '', password: '' });
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [forgotMode,  setForgotMode]  = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent,  setForgotSent]  = useState(false);

  const validate = () => {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setLoading(true);
    try {
      const user = await actions.login(form.email, form.password);
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(defaultRoute(user.role), { replace: true });
      }
    } catch (err) {
      setErrors({ general: err.message || 'Invalid email or password' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: '', general: '' }));
  };

  if (forgotMode) {
    return (
      <div className="login-root">
        <div className="login-bg-decoration" />
        <div className="login-right" style={{ flex: 1 }}>
          <div className="login-card animate-in">
            <button className="back-btn" onClick={() => { setForgotMode(false); setForgotSent(false); }}>← Back to login</button>
            <h2 className="login-title">Reset password</h2>
            <p className="login-subtitle">Contact your SwaraVoice administrator to reset your password.</p>
            <div className="success-box">
              <span className="success-icon">ℹ</span>
              <div>
                <p className="success-title">Contact your admin</p>
                <p className="success-sub">Password resets are handled by your hospital admin or SwaraVoice support.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-root">
      <div className="login-bg-decoration" />
      <div className="login-left">
        <div className="login-left-inner animate-in">
          <div className="login-brand">
            <span className="login-logo-icon small">
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="10" stroke="url(#lg3)" strokeWidth="1.5"/>
                <path d="M6 11 Q8 7 11 11 Q14 15 16 11" stroke="url(#lg3)" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <defs><linearGradient id="lg3" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stopColor="#38BDF8"/><stop offset="1" stopColor="#3B82F6"/></linearGradient></defs>
              </svg>
            </span>
            <span className="brand-name">SwaraVoice</span>
          </div>
          <div className="login-hero">
            <h1>Voice-based<br /><span className="gradient-text">cancer detection</span><br />made clinical.</h1>
            <p>Longitudinal voice monitoring platform for ENT surgeons and speech-language pathologists.</p>
          </div>
          <div className="login-features">
            {[
              { icon: '⬡', text: 'Real-time ambient noise detection' },
              { icon: '◈', text: 'Multi-task standardized recording protocol' },
              { icon: '◎', text: 'AI-powered composite voice scoring' },
            ].map((f, i) => (
              <div key={i} className="feature-row">
                <span className="feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card animate-in stagger-2">
          <div className="login-header">
            <h2 className="login-title">Doctor portal</h2>
            <p className="login-subtitle">Sign in with your credentials provided by your hospital admin.</p>
          </div>

          {errors.general && <div className="error-banner">{errors.general}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className={`field-group ${errors.email ? 'has-error' : ''}`}>
              <label>Email address</label>
              <div className="input-wrapper">
                <span className="input-icon">@</span>
                <input type="email" placeholder="doctor@hospital.com" value={form.email}
                  onChange={handleChange('email')} className="field-input with-icon" autoComplete="email" />
              </div>
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>

            <div className={`field-group ${errors.password ? 'has-error' : ''}`}>
              <label>Password</label>
              <div className="input-wrapper">
                <span className="input-icon">⚿</span>
                <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={form.password}
                  onChange={handleChange('password')} className="field-input with-icon with-toggle" autoComplete="current-password" />
                <button type="button" className="toggle-pw" onClick={() => setShowPw(p => !p)}>
                  {showPw ? '◎' : '◉'}
                </button>
              </div>
              {errors.password && <span className="field-error">{errors.password}</span>}
            </div>

            <button type="button" className="forgot-link" onClick={() => setForgotMode(true)}>
              Forgot password?
            </button>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in to portal'}
            </button>
          </form>

          <p className="login-note">No self-registration. Contact your hospital admin for access.</p>
        </div>
      </div>
    </div>
  );
}
