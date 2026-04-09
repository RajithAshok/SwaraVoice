import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import './ForceChangePassword.css';

export default function ForceChangePassword() {
  const { state, actions, role } = useApp();
  const navigate = useNavigate();

  const [form, setForm]     = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // If not authenticated, redirect to login
  if (!state.isAuthenticated) {
    navigate('/login', { replace: true });
    return null;
  }

  const validate = () => {
    const errs = {};
    if (!form.current) errs.current = 'Required';
    if (form.next.length < 8) errs.next = 'Minimum 8 characters';
    if (form.next !== form.confirm) errs.confirm = 'Passwords do not match';
    if (form.next === form.current) errs.next = 'New password must differ from current';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    try {
      await actions.changePassword(form.current, form.next);
      // Redirect to their home page
      if (role === 'SuperAdmin')    navigate('/superadmin', { replace: true });
      else if (role === 'Admin')    navigate('/admin',      { replace: true });
      else                          navigate('/dashboard',  { replace: true });
    } catch (err) {
      setErrors({ general: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: '', general: '' }));
  };

  return (
    <div className="fcp-root">
      <div className="fcp-card animate-in">
        <div className="fcp-icon">🔐</div>
        <h1 className="fcp-title">Set your password</h1>
        <p className="fcp-desc">
          Your account was created with a temporary password.
          Please set a new password before continuing.
        </p>

        {errors.general && <div className="error-banner">{errors.general}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {[
            { label: 'Temporary password',  field: 'current',  placeholder: 'Your temporary password' },
            { label: 'New password',         field: 'next',     placeholder: 'At least 8 characters' },
            { label: 'Confirm new password', field: 'confirm',  placeholder: 'Repeat new password' },
          ].map(({ label, field, placeholder }) => (
            <div key={field} className={`field-group ${errors[field] ? 'has-error' : ''}`}>
              <label>{label}</label>
              <input
                type="password"
                className="field-input"
                placeholder={placeholder}
                value={form[field]}
                onChange={handleChange(field)}
                autoComplete={field === 'current' ? 'current-password' : 'new-password'}
              />
              {errors[field] && <span className="field-error">{errors[field]}</span>}
            </div>
          ))}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <><span className="spinner" /> Updating…</> : 'Set new password →'}
          </button>
        </form>
      </div>
    </div>
  );
}
