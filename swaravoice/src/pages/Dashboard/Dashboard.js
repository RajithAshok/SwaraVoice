import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, getHospitalName, calcAge } from '../../context/AppContext';
import './Dashboard.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function ScoreBadge({ score }) {
  if (score == null) return <span className="chip chip-cyan">No sessions</span>;
  if (score >= 80)   return <span className="chip chip-green">{score}</span>;
  if (score >= 60)   return <span className="chip chip-amber">{score}</span>;
  return               <span className="chip chip-rose">{score}</span>;
}

function PatientCard({ patient, onSelect }) {
  const initials    = patient.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const lastSession = patient.latestSession ?? null;
  return (
    <div className="patient-card" onClick={() => onSelect(patient)}>
      <div className="patient-card-avatar">{initials}</div>
      <div className="patient-card-body">
        <div className="patient-card-top">
          <h3 className="patient-name">{patient.name}</h3>
          <ScoreBadge score={lastSession?.compositeScore ?? null} />
        </div>
        <div className="patient-card-meta">
          <span>{patient.dateOfBirth ? calcAge(patient.dateOfBirth) : patient.age} yrs</span>
          <span className="meta-dot">·</span>
          <span>{patient.gender}</span>
          {patient.prevMedicalCond && (
            <><span className="meta-dot">·</span><span className="meta-cond">{patient.prevMedicalCond}</span></>
          )}
        </div>
        <div className="patient-card-footer">
          <span className="recording-count">
            {patient.sessionCount ?? 0} session{(patient.sessionCount ?? 0) !== 1 ? 's' : ''}
          </span>
          {lastSession && (
            <span className="last-recording">
              Last: {new Date(lastSession.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
      <div className="patient-card-arrow">›</div>
    </div>
  );
}

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

function AddPatientModal({ onClose, onSubmit, loading }) {
  const [form,   setForm]   = useState({ name: '', dateOfBirth: '', gender: 'Male', prevMedicalCond: '', initialNote: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.name.trim())   errs.name        = 'Name is required';
    if (!form.dateOfBirth)   errs.dateOfBirth = 'Date of birth is required';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    // Compute age from dateOfBirth before submitting
    const dob = new Date(form.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    onSubmit({ ...form, age, dateOfBirth: form.dateOfBirth });
  };

  const handleChange = (f) => (e) => {
    setForm((p) => ({ ...p, [f]: e.target.value }));
    setErrors((p) => ({ ...p, [f]: '' }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in">
        <div className="modal-header">
          <h3>Register new patient</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <div className={`field-group ${errors.name ? 'has-error' : ''}`}>
              <label>Full name <span className="required">*</span></label>
              <input className="field-input" placeholder="e.g. Ravi Kumar" value={form.name} onChange={handleChange('name')} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>
            <div className={`field-group ${errors.dateOfBirth ? 'has-error' : ''}`}>
              <label>Date of birth <span className="required">*</span></label>
              <input className="field-input" type="date" value={form.dateOfBirth}
                onChange={handleChange('dateOfBirth')}
                max={new Date().toISOString().split('T')[0]} />
              {errors.dateOfBirth && <span className="field-error">{errors.dateOfBirth}</span>}
            </div>
          </div>
          <div className="field-group">
            <label>Gender</label>
            <select className="field-input" value={form.gender} onChange={handleChange('gender')}>
              {GENDERS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Previous medical conditions</label>
            <textarea className="field-input" rows={3} placeholder="e.g. Hypertension, GERD…"
              value={form.prevMedicalCond} onChange={handleChange('prevMedicalCond')} />
          </div>
          <div className="field-group">
            <label>Initial note <span className="optional">(optional)</span></label>
            <textarea className="field-input" rows={3} placeholder="Initial clinical observation…"
              value={form.initialNote} onChange={handleChange('initialNote')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="spinner-sm" /> Saving…</> : 'Register & open →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { actions, currentUser } = useApp();
  const navigate = useNavigate();

  const [patients,     setPatients]     = useState([]);
  const [search,       setSearch]       = useState('');
  const [sortBy,       setSortBy]       = useState('name');
  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [pageLoading,  setPageLoading]  = useState(true);
  const [pageError,    setPageError]    = useState(null);

  useEffect(() => {
    setPageLoading(true);
    actions.fetchPatients()
      .then(({ patients: list }) => setPatients(list))
      .catch(() => setPageError('Failed to load patients. Please refresh.'))
      .finally(() => setPageLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q    = search.toLowerCase();
    let   list = patients.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.prevMedicalCond || '').toLowerCase().includes(q)
    );
    if (sortBy === 'name')   list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'age')    list = [...list].sort((a, b) => a.age - b.age);
    if (sortBy === 'recent') list = [...list].sort((a, b) => {
      const ad = a.latestSession?.createdAt || '';
      const bd = b.latestSession?.createdAt || '';
      return bd.localeCompare(ad);
    });
    return list;
  }, [patients, search, sortBy]);

  const handleSelectPatient = (patient) => {
    actions.selectPatient(patient);
    navigate('/patient');
  };

  const handleAddPatient = async (data) => {
    setModalLoading(true);
    try {
      const patient = await actions.addPatient(data);
      setShowModal(false);
      actions.selectPatient(patient);
      navigate('/patient');
    } catch (err) {
      actions.showToast(err.message || 'Failed to register patient', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const totalSessions = patients.reduce((acc, p) => acc + (p.sessionCount ?? 0), 0);

  if (pageError) {
    return (
      <div className="page-wrapper">
        <div className="content-container empty-state">
          <div className="empty-icon">⚠</div>
          <h3>Failed to load</h3>
          <p>{pageError}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const hospitalName = getHospitalName(currentUser);

  return (
    <div className="page-wrapper">
      <div className="content-container">

        <div className="dashboard-header animate-in">
          <div>
            <p className="dashboard-greeting">Good {getGreeting()},</p>
            <h1 className="dashboard-title">{currentUser?.name}</h1>
            <p className="dashboard-sub">{currentUser?.specialisation}{hospitalName ? ` · ${hospitalName}` : ''}</p>
          </div>
          <button className="btn-primary add-patient-btn" onClick={() => setShowModal(true)}>
            <span>+</span> New patient
          </button>
        </div>

        <div className="stats-row animate-in stagger-1">
          <div className="stat-card">
            <span className="stat-label">Total Patients</span>
            <span className="stat-value">{patients.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Voice Sessions</span>
            <span className="stat-value">{totalSessions}</span>
          </div>

        </div>

        <div className="list-controls animate-in stagger-2">
          <div className="search-wrapper">
            <span className="search-icon">⌕</span>
            <input className="search-input" placeholder="Search by name or condition…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <div className="sort-wrapper">
            <span className="sort-label">Sort:</span>
            <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name A–Z</option>
              <option value="age">Age</option>
              <option value="recent">Most recent</option>
            </select>
          </div>
        </div>

        {pageLoading ? (
          <div className="loading-list">
            {[1, 2, 3].map((i) => <div key={i} className="patient-card-skeleton skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state animate-in">
            <div className="empty-icon">◎</div>
            <h3>{search ? 'No patients found' : 'No patients yet'}</h3>
            <p>{search ? `No results for "${search}"` : 'Register your first patient to get started.'}</p>
            {!search && <button className="btn-primary" onClick={() => setShowModal(true)}>+ New patient</button>}
          </div>
        ) : (
          <div className="patient-list animate-in stagger-3">
            <p className="list-count">{filtered.length} patient{filtered.length !== 1 ? 's' : ''}</p>
            {filtered.map((p, i) => (
              <div key={p._id} style={{ animationDelay: `${i * 0.04}s` }}>
                <PatientCard patient={p} onSelect={handleSelectPatient} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddPatientModal onClose={() => setShowModal(false)} onSubmit={handleAddPatient} loading={modalLoading} />
      )}
    </div>
  );
}
