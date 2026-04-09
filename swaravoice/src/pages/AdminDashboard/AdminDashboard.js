import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, getHospitalName } from '../../context/AppContext';
import './AdminDashboard.css';

// ── Create Doctor Modal ───────────────────────────────────────────────────────
function CreateDoctorModal({ onClose, onSubmit, loading }) {
  const [form,   setForm]   = useState({ name: '', email: '', password: '', specialisation: '' });
  const [errors, setErrors] = useState({});
  const [showPw, setShowPw] = useState(false);

  const validate = () => {
    const errs = {};
    if (!form.name.trim())                                     errs.name     = 'Name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))       errs.email    = 'Enter a valid email';
    if (form.password.length < 8)                              errs.password = 'Minimum 8 characters';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit(form);
  };

  const handleChange = (f) => (e) => {
    setForm((p) => ({ ...p, [f]: e.target.value }));
    setErrors((p) => ({ ...p, [f]: '' }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in">
        <div className="modal-header">
          <h3>Create doctor account</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-note">Share these credentials with the doctor manually. They'll be prompted to change their password on first login.</p>
          <div className={`field-group ${errors.name ? 'has-error' : ''}`}>
            <label>Full name <span className="required">*</span></label>
            <input className="field-input" placeholder="Dr. Full Name" value={form.name} onChange={handleChange('name')} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className={`field-group ${errors.email ? 'has-error' : ''}`}>
            <label>Email address <span className="required">*</span></label>
            <input className="field-input" type="email" placeholder="doctor@hospital.com" value={form.email} onChange={handleChange('email')} />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <div className={`field-group ${errors.password ? 'has-error' : ''}`}>
            <label>Temporary password <span className="required">*</span></label>
            <div className="input-wrapper">
              <input className="field-input with-toggle" type={showPw ? 'text' : 'password'}
                placeholder="Min. 8 characters" value={form.password} onChange={handleChange('password')} />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(p => !p)}>
                {showPw ? '◎' : '◉'}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
          <div className="field-group">
            <label>Specialisation <span className="optional">(optional)</span></label>
            <input className="field-input" placeholder="e.g. ENT Surgeon" value={form.specialisation} onChange={handleChange('specialisation')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="spinner-sm" /> Creating…</> : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Doctor Modal ─────────────────────────────────────────────────────────
function EditDoctorModal({ doctor, onClose, onSave, loading }) {
  const [form,   setForm]   = useState({ name: doctor.name, specialisation: doctor.specialisation || '', newPassword: '' });
  const [showPw, setShowPw] = useState(false);
  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in">
        <div className="modal-header">
          <h3>Edit doctor — {doctor.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>Full name</label>
            <input className="field-input" value={form.name} onChange={handleChange('name')} />
          </div>
          <div className="field-group">
            <label>Specialisation</label>
            <input className="field-input" placeholder="e.g. ENT Surgeon" value={form.specialisation} onChange={handleChange('specialisation')} />
          </div>
          <div className="field-group">
            <label>Reset password <span className="optional">(leave blank to keep current)</span></label>
            <div className="input-wrapper">
              <input className="field-input with-toggle" type={showPw ? 'text' : 'password'}
                placeholder="New password (min. 8 chars)" value={form.newPassword} onChange={handleChange('newPassword')} />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(p => !p)}>
                {showPw ? '◎' : '◉'}
              </button>
            </div>
          </div>
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

// ── Doctor Card ───────────────────────────────────────────────────────────────
function DoctorCard({ doctor, isSelected, onClick }) {
  const initials = doctor.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div className={`doctor-card-item ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <div className="doctor-card-avatar">{initials}</div>
      <div className="doctor-card-body">
        <p className="doctor-card-name">{doctor.name}</p>
        <p className="doctor-card-spec">{doctor.specialisation || 'Doctor'}</p>
        <p className="doctor-card-email">{doctor.email}</p>
      </div>
      <span className="doctor-card-arrow">›</span>
    </div>
  );
}

// ── Patient Row ───────────────────────────────────────────────────────────────
function PatientRow({ patient, onSelect }) {
  const lastSession = patient.latestSession;
  const scoreColor  = !lastSession ? 'var(--text-muted)'
    : lastSession.compositeScore >= 80 ? 'var(--accent-green)'
    : lastSession.compositeScore >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  return (
    <div className="patient-row" onClick={() => onSelect(patient)}>
      <div className="patient-row-left">
        <div className="patient-row-avatar">{patient.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div>
          <p className="patient-row-name">{patient.name}</p>
          <p className="patient-row-meta">{patient.age} yrs · {patient.gender}</p>
        </div>
      </div>
      <div className="patient-row-right">
        <span className="patient-row-sessions">{patient.sessionCount ?? 0} sessions</span>
        {lastSession && (
          <span className="patient-row-score" style={{ color: scoreColor }}>
            {lastSession.compositeScore != null ? `${lastSession.compositeScore}/100` : 'Pending'}
          </span>
        )}
        <span className="patient-row-arrow">›</span>
      </div>
    </div>
  );
}

// ── Doctor Detail Panel (right side when doctor is selected) ──────────────────
function DoctorDetailPanel({ doctor, patients, patientsLoading, search, onSearchChange, onSelectPatient, onEditDoctor }) {
  return (
    <div className="admin-patients-col">
      {/* Doctor info header */}
      <div className="doctor-detail-header">
        <div className="doctor-detail-avatar">
          {doctor.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="doctor-detail-info">
          <h3>{doctor.name}</h3>
          <p>{doctor.specialisation || 'Doctor'}</p>
          <p className="doctor-detail-email">{doctor.email}</p>
        </div>
        <button className="edit-btn" onClick={onEditDoctor}>✎ Edit</button>
      </div>

      {/* Patient list */}
      <div className="admin-col-header">
        <h3>Patients <span className="section-count">({patients.length})</span></h3>
        <div className="search-wrapper small">
          <span className="search-icon">⌕</span>
          <input className="search-input" placeholder="Search…" value={search} onChange={(e) => onSearchChange(e.target.value)} />
          {search && <button className="search-clear" onClick={() => onSearchChange('')}>✕</button>}
        </div>
      </div>

      {patientsLoading ? (
        <div className="loading-list">
          {[1,2,3].map((i) => <div key={i} className="patient-row-skeleton skeleton" />)}
        </div>
      ) : patients.length === 0 ? (
        <div className="col-empty">
          <p>{search ? `No results for "${search}"` : 'This doctor has no patients yet.'}</p>
        </div>
      ) : (
        <div className="patients-rows">
          {patients.map((p) => (
            <PatientRow key={p._id} patient={p} onSelect={onSelectPatient} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Admin Dashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { actions, currentUser } = useApp();
  const navigate = useNavigate();

  const [doctors,         setDoctors]         = useState([]);
  const [selectedDoc,     setSelectedDoc]     = useState(null);
  const [docPatients,     setDocPatients]     = useState([]);
  const [search,          setSearch]          = useState('');
  const [loading,         setLoading]         = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoctor,   setEditingDoctor]   = useState(null);
  const [createLoading,   setCreateLoading]   = useState(false);
  const [editLoading,     setEditLoading]     = useState(false);

  useEffect(() => {
    setLoading(true);
    actions.fetchDoctors()
      .then(({ doctors: dList }) => setDoctors(dList))
      .catch(() => actions.showToast('Failed to load doctors', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDoc) return;
    setPatientsLoading(true);
    setSearch('');
    actions.fetchPatients(true)
      .then(({ patients: all }) => {
        setDocPatients(all.filter((p) => {
          const id = p.doctorID?._id ?? p.doctorID;
          return id === selectedDoc._id;
        }));
      })
      .catch(() => actions.showToast('Failed to load patients', 'error'))
      .finally(() => setPatientsLoading(false));
  }, [selectedDoc?._id]);

  const handleCreateDoctor = async (data) => {
    setCreateLoading(true);
    try {
      const { doctor } = await actions.createDoctor(data);
      setDoctors((prev) => [...prev, doctor]);
      setShowCreateModal(false);
    } catch (err) {
      actions.showToast(err.message || 'Failed to create doctor', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditDoctor = async (form) => {
    setEditLoading(true);
    try {
      const data = {};
      if (form.name)           data.name           = form.name;
      if (form.specialisation) data.specialisation = form.specialisation;
      if (form.newPassword)    data.newPassword    = form.newPassword;
      const { doctor } = await actions.updateDoctor(editingDoctor._id, data);
      setDoctors((prev) => prev.map((d) => d._id === doctor._id ? doctor : d));
      if (selectedDoc?._id === doctor._id) setSelectedDoc(doctor);
      setEditingDoctor(null);
    } catch (err) {
      actions.showToast(err.message || 'Failed to update doctor', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    actions.selectPatient(patient);
    navigate('/patient');
  };

  const filteredPatients = useMemo(() => {
    const q = search.toLowerCase();
    return docPatients.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.prevMedicalCond || '').toLowerCase().includes(q)
    );
  }, [docPatients, search]);

  const hospitalName = getHospitalName(currentUser) || 'Hospital';

  return (
    <div className="page-wrapper">
      <div className="content-container">

        <div className="admin-header animate-in">
          <div>
            <p className="dashboard-greeting">Admin dashboard</p>
            <h1 className="dashboard-title">{hospitalName}</h1>
            <p className="dashboard-sub">{currentUser?.name} · Administrator</p>
          </div>
          <div className="admin-header-actions">
            {currentUser?.isAlsoDoctor && (
              <button className="btn-ghost" onClick={() => navigate('/dashboard')}>My patients</button>
            )}
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ New doctor</button>
          </div>
        </div>

        <div className="stats-row animate-in stagger-1">
          <div className="stat-card">
            <span className="stat-label">Doctors</span>
            <span className="stat-value">{doctors.length}</span>
          </div>
        </div>

        <div className="admin-grid animate-in stagger-2">
          {/* Doctors list column */}
          <div className="admin-doctors-col">
            <div className="admin-col-header">
              <h3>Doctors</h3>
              <span className="section-count">({doctors.length})</span>
            </div>
            {loading ? (
              <div className="loading-list">
                {[1,2,3].map((i) => <div key={i} className="doctor-card-skeleton skeleton" />)}
              </div>
            ) : doctors.length === 0 ? (
              <div className="col-empty">
                <p>No doctors yet.</p>
                <button className="btn-primary small" onClick={() => setShowCreateModal(true)}>+ Add first doctor</button>
              </div>
            ) : (
              <div className="doctors-list">
                {doctors.map((d) => (
                  <DoctorCard key={d._id} doctor={d}
                    isSelected={selectedDoc?._id === d._id}
                    onClick={() => setSelectedDoc(d)} />
                ))}
              </div>
            )}
          </div>

          {/* Right panel */}
          {!selectedDoc ? (
            <div className="admin-patients-col">
              <div className="col-empty" style={{ paddingTop: '4rem' }}>
                <div className="col-empty-icon">←</div>
                <p>Select a doctor to view their details and patients.</p>
              </div>
            </div>
          ) : (
            <DoctorDetailPanel
              doctor={selectedDoc}
              patients={filteredPatients}
              patientsLoading={patientsLoading}
              search={search}
              onSearchChange={setSearch}
              onSelectPatient={handleSelectPatient}
              onEditDoctor={() => setEditingDoctor(selectedDoc)}
            />
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateDoctorModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateDoctor} loading={createLoading} />
      )}
      {editingDoctor && (
        <EditDoctorModal doctor={editingDoctor} onClose={() => setEditingDoctor(null)} onSave={handleEditDoctor} loading={editLoading} />
      )}
    </div>
  );
}
