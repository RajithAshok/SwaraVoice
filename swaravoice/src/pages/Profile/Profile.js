import React, { useState } from 'react';
import { useApp, getHospitalName } from '../../context/AppContext';
import './Profile.css';

function SectionCard({ title, children }) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-items">{children}</div>
    </div>
  );
}

function SettingRow({ icon, label, desc, onClick, danger }) {
  return (
    <button className={`setting-row ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="setting-icon">{icon}</span>
      <div className="setting-info">
        <span className="setting-label">{label}</span>
        {desc && <span className="setting-desc">{desc}</span>}
      </div>
      <span className="setting-arrow">›</span>
    </button>
  );
}

function EditProfileModal({ user, onClose, onSave, loading }) {
  const [form, setForm] = useState({
    name:           user.name           || '',
    specialisation: user.specialisation || '',
    address:        user.address        || '',
  });
  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in">
        <div className="modal-header">
          <h3>Edit profile</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {[
            { label: 'Full name',       field: 'name',           placeholder: 'Dr. Name' },
            { label: 'Specialisation',  field: 'specialisation', placeholder: 'e.g. ENT Surgeon' },
            { label: 'Address',         field: 'address',        placeholder: 'Clinic address', multi: true },
          ].map(({ label, field, placeholder, multi }) => (
            <div key={field} className="field-group">
              <label>{label}</label>
              {multi ? (
                <textarea className="field-input" rows={3} value={form[field]}
                  onChange={handleChange(field)} placeholder={placeholder} />
              ) : (
                <input className="field-input" value={form[field]}
                  onChange={handleChange(field)} placeholder={placeholder} />
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)} disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, onSave, loading }) {
  const [form,   setForm]   = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.current)                       errs.current = 'Required';
    if (form.next.length < 8)                errs.next    = 'Minimum 8 characters';
    if (form.next !== form.confirm)          errs.confirm = 'Passwords do not match';
    if (form.next === form.current)          errs.next    = 'Must differ from current password';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave(form.current, form.next);
  };

  const handleChange = (f) => (e) => {
    setForm((p) => ({ ...p, [f]: e.target.value }));
    setErrors((p) => ({ ...p, [f]: '' }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>Change password</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {[
            { label: 'Current password',      field: 'current' },
            { label: 'New password',           field: 'next' },
            { label: 'Confirm new password',   field: 'confirm' },
          ].map(({ label, field }) => (
            <div key={field} className={`field-group ${errors[field] ? 'has-error' : ''}`}>
              <label>{label}</label>
              <input className="field-input" type="password" value={form[field]}
                onChange={handleChange(field)} placeholder="••••••••" />
              {errors[field] && <span className="field-error">{errors[field]}</span>}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoModal({ title, content, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body info-modal-body"><p>{content}</p></div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { currentUser, actions } = useApp();
  const [activeModal,    setActiveModal]    = useState(null);
  const [modalLoading,   setModalLoading]   = useState(false);

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(' ').filter((w) => w.match(/^[A-Z]/)).slice(0, 2).map((w) => w[0]).join('') || 'U';

  const hospitalName = getHospitalName(currentUser) || null;

  const handleSaveProfile = async (data) => {
    setModalLoading(true);
    try {
      await actions.updateProfile(data);
      setActiveModal(null);
    } catch (err) {
      actions.showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleChangePassword = async (current, next) => {
    setModalLoading(true);
    try {
      await actions.changePassword(current, next);
      actions.showToast('Password updated successfully', 'success');
      setActiveModal(null);
    } catch (err) {
      actions.showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const MODALS = {
    editProfile:    <EditProfileModal user={currentUser} onClose={() => setActiveModal(null)} onSave={handleSaveProfile} loading={modalLoading} />,
    changePassword: <ChangePasswordModal onClose={() => setActiveModal(null)} onSave={handleChangePassword} loading={modalLoading} />,
    reportBug:  <InfoModal title="Report a bug" content="Email support@swaravoice.com with the issue description, steps to reproduce, and your browser/device. We typically respond within 24 hours." onClose={() => setActiveModal(null)} />,
    faqs:       <InfoModal title="FAQs" content="Q: How do I register a patient? — Use the New Patient button on the dashboard. Q: What microphone should I use? — A condenser mic at 15cm, 45° angle. Q: How often should recordings be made? — Pre-treatment, mid-treatment, and post-treatment as a minimum." onClose={() => setActiveModal(null)} />,
    about:      <InfoModal title="About SwaraVoice" content="SwaraVoice v1.0.0 — Longitudinal voice monitoring for ENT surgeons and Speech-Language Pathologists. © 2025 SwaraVoice Health Technologies." onClose={() => setActiveModal(null)} />,
    privacy:    <InfoModal title="Privacy Policy" content="SwaraVoice handles patient data in compliance with healthcare data protection regulations. Voice recordings and patient information are encrypted in transit and at rest. No data is shared with third parties without explicit consent." onClose={() => setActiveModal(null)} />,
    terms:      <InfoModal title="Terms & Conditions" content="By using SwaraVoice, you agree to use this platform solely for legitimate clinical purposes. This tool is a decision-support aid, not a diagnostic device." onClose={() => setActiveModal(null)} />,
    contact:    <InfoModal title="Contact Us" content="Support: support@swaravoice.com | Billing: billing@swaravoice.com | Office hours: Mon–Fri, 9am–6pm IST" onClose={() => setActiveModal(null)} />,
  };

  return (
    <div className="page-wrapper">
      <div className="content-container profile-layout">
        <h1 className="page-title animate-in">Settings</h1>

        {/* User card */}
        <div className="doctor-card animate-in stagger-1">
          <div className="doctor-card-avatar">{initials}</div>
          <div className="doctor-card-info">
            <h2 className="doctor-card-name">{currentUser.name}</h2>
            <p className="doctor-card-role">{currentUser.specialisation || currentUser.role}</p>
            {hospitalName && <p className="doctor-card-hospital">{hospitalName}</p>}
            {currentUser.address && <p className="doctor-card-address">{currentUser.address}</p>}
          </div>
          <div className="doctor-card-id">
            <span className="chip chip-cyan">{currentUser.role}</span>
          </div>
        </div>

        <div className="settings-grid">
          <SectionCard title="Account">
            <SettingRow icon="✎" label="Edit profile" desc="Update your name and specialisation" onClick={() => setActiveModal('editProfile')} />
            <SettingRow icon="⚿" label="Change password" desc="Update your login credentials" onClick={() => setActiveModal('changePassword')} />
          </SectionCard>
          <SectionCard title="Support">
            <SettingRow icon="⚑" label="Report a bug"    desc="Something not working?"         onClick={() => setActiveModal('reportBug')} />
            <SettingRow icon="?" label="FAQs"             desc="Common questions answered"       onClick={() => setActiveModal('faqs')} />
            <SettingRow icon="◑" label="About SwaraVoice"  desc="Version and platform info"       onClick={() => setActiveModal('about')} />
            <SettingRow icon="⌂" label="Contact us"      desc="Get in touch with our team"      onClick={() => setActiveModal('contact')} />
          </SectionCard>
          <SectionCard title="Legal">
            <SettingRow icon="⊙" label="Privacy policy"     onClick={() => setActiveModal('privacy')} />
            <SettingRow icon="⊗" label="Terms & conditions" onClick={() => setActiveModal('terms')} />
          </SectionCard>
        </div>

        <p className="app-version animate-in">SwaraVoice v1.0.0 · Built for clinical voice monitoring</p>
      </div>
      {activeModal && MODALS[activeModal]}
    </div>
  );
}
