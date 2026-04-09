import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './SuperAdmin.css';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Create Hospital Modal ─────────────────────────────────────────────────────
function CreateHospitalModal({ onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    hospitalName: '', hospitalCity: '', hospitalAddress: '',
    adminName: '', adminEmail: '', adminPassword: '',
    adminIsAlsoDoctor: false, adminSpecialisation: '',
  });
  const [errors, setErrors] = useState({});
  const [showPw, setShowPw] = useState(false);

  const validate = () => {
    const errs = {};
    if (!form.hospitalName.trim())                            errs.hospitalName  = 'Required';
    if (!form.adminName.trim())                               errs.adminName     = 'Required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) errs.adminEmail    = 'Enter a valid email';
    if (form.adminPassword.length < 8)                        errs.adminPassword = 'Minimum 8 characters';
    return errs;
  };

  const handleChange = (f) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((p) => ({ ...p, [f]: val }));
    setErrors((p) => ({ ...p, [f]: '' }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card animate-in">
        <div className="modal-header">
          <h3>Add new hospital</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-section-label">Hospital details</p>
          <div className={`field-group ${errors.hospitalName ? 'has-error' : ''}`}>
            <label>Hospital name <span className="required">*</span></label>
            <input className="field-input" placeholder="e.g. Apollo Hospitals Bengaluru"
              value={form.hospitalName} onChange={handleChange('hospitalName')} />
            {errors.hospitalName && <span className="field-error">{errors.hospitalName}</span>}
          </div>
          <div className="modal-row">
            <div className="field-group">
              <label>City</label>
              <input className="field-input" placeholder="e.g. Bengaluru"
                value={form.hospitalCity} onChange={handleChange('hospitalCity')} />
            </div>
            <div className="field-group">
              <label>Address</label>
              <input className="field-input" placeholder="Street / Area"
                value={form.hospitalAddress} onChange={handleChange('hospitalAddress')} />
            </div>
          </div>

          <div className="modal-divider" />

          <p className="modal-section-label">Admin account</p>
          <p className="modal-note">
            Share these credentials with the admin manually. They'll be prompted to change their password on first login.
          </p>

          {/* Admin is also a doctor toggle */}
          <div className="toggle-row">
            <label className="toggle-label">
              <input type="checkbox" checked={form.adminIsAlsoDoctor} onChange={handleChange('adminIsAlsoDoctor')} />
              <span className="toggle-switch" />
              <span>This admin will also see patients directly (acts as a doctor)</span>
            </label>
          </div>
          {form.adminIsAlsoDoctor && (
            <div className="field-group">
              <label>Specialisation</label>
              <input className="field-input" placeholder="e.g. ENT Surgeon"
                value={form.adminSpecialisation} onChange={handleChange('adminSpecialisation')} />
            </div>
          )}

          <div className="field-group">
            <label>Full name <span className="required">*</span></label>
            <input className="field-input" placeholder="Full name"
              value={form.adminName} onChange={handleChange('adminName')} />
            {errors.adminName && <span className="field-error">{errors.adminName}</span>}
          </div>
          <div className={`field-group ${errors.adminEmail ? 'has-error' : ''}`}>
            <label>Email <span className="required">*</span></label>
            <input className="field-input" type="email" placeholder="admin@hospital.com"
              value={form.adminEmail} onChange={handleChange('adminEmail')} />
            {errors.adminEmail && <span className="field-error">{errors.adminEmail}</span>}
          </div>
          <div className={`field-group ${errors.adminPassword ? 'has-error' : ''}`}>
            <label>Temporary password <span className="required">*</span></label>
            <div className="input-wrapper">
              <input className="field-input with-toggle" type={showPw ? 'text' : 'password'}
                placeholder="Min. 8 characters" value={form.adminPassword} onChange={handleChange('adminPassword')} />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(p => !p)}>
                {showPw ? '◎' : '◉'}
              </button>
            </div>
            {errors.adminPassword && <span className="field-error">{errors.adminPassword}</span>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={() => { const e = validate(); if (Object.keys(e).length > 0) { setErrors(e); return; } onSubmit(form); }} disabled={loading}>
            {loading ? <><span className="spinner-sm" /> Creating…</> : 'Create hospital'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Info Rows (used inside drawer) ─────────────────────────────────────
function AdminInfoRows({ admin }) {
  // isAlsoDoctor may be absent for accounts created before the field was added.
  // Fall back to checking specialisation as the legacy signal.
  const isDoc = admin.isAlsoDoctor === true ||
    (admin.isAlsoDoctor == null && !!admin.specialisation);
  return (
    <div className="info-rows">
      <div className="info-row"><span>Name</span><span>{admin.name}</span></div>
      <div className="info-row"><span>Email</span><span>{admin.email}</span></div>
      {admin.specialisation && (
        <div className="info-row"><span>Specialisation</span><span>{admin.specialisation}</span></div>
      )}
      
      <div className="info-row">
        <span>Also sees patients</span>
        <span style={{ color: isDoc ? 'var(--accent-green)' : 'var(--text-muted)' }}>
          {isDoc ? 'Yes' : 'No'}
        </span>
      </div>
    </div>
  );
}

// ── Hospital Detail Drawer ────────────────────────────────────────────────────
function HospitalDrawer({ hospital, onClose, onSaved }) {
  const { actions } = useApp();

  const [editingHospital, setEditingHospital] = useState(false);
  const [editingAdmin,    setEditingAdmin]    = useState(false);
  const [hospForm,  setHospForm]  = useState({ name: hospital.name, city: hospital.city || '', address: hospital.address || '' });
  const [adminForm, setAdminForm] = useState({
    name:           hospital.adminID?.name           || '',
    specialisation: hospital.adminID?.specialisation || '',
    newPassword:    '',
  });
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);

  const handleSaveHospital = async () => {
    setSaving(true);
    try {
      await actions.updateHospital(hospital._id, hospForm);
      setEditingHospital(false);
      onSaved({ ...hospital, name: hospForm.name, city: hospForm.city, address: hospForm.address });
    } catch (err) {
      actions.showToast(err.message || 'Failed to update hospital', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdmin = async () => {
    setSaving(true);
    try {
      const data = {};
      if (adminForm.name)           data.name           = adminForm.name;
      if (adminForm.specialisation) data.specialisation = adminForm.specialisation;
      if (adminForm.newPassword)    data.newPassword    = adminForm.newPassword;
      await actions.updateHospitalAdmin(hospital._id, data);
      setEditingAdmin(false);
      setAdminForm((p) => ({ ...p, newPassword: '' }));
      onSaved(hospital); // refresh hospital list
    } catch (err) {
      actions.showToast(err.message || 'Failed to update admin', 'error');
    } finally {
      setSaving(false);
    }
  };

  const { usage } = hospital;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card hospital-modal animate-in">
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">{hospital.name}</h2>
            {hospital.city && <p className="drawer-subtitle">{hospital.city}</p>}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          {/* Usage stats */}
          <div className="drawer-stats">
            {[
              { label: 'Doctors',  value: usage?.totalDoctors  ?? 0 },
              { label: 'Patients', value: usage?.totalPatients ?? 0 },
              { label: 'Sessions', value: usage?.totalSessions ?? 0 },
              { label: 'Storage',  value: formatBytes(usage?.storageBytes) },
            ].map(({ label, value }) => (
              <div key={label} className="dstat">
                <span className="dstat-value">{value}</span>
                <span className="dstat-label">{label}</span>
              </div>
            ))}
          </div>

          {/* Hospital details section */}
          <div className="drawer-section">
            <div className="drawer-section-header">
              <h4>Hospital details</h4>
              {!editingHospital && (
                <button className="edit-btn" onClick={() => setEditingHospital(true)}>✎ Edit</button>
              )}
            </div>
            {editingHospital ? (
              <div className="edit-block">
                {[
                  { label: 'Name',    field: 'name',    placeholder: 'Hospital name' },
                  { label: 'City',    field: 'city',    placeholder: 'City' },
                  { label: 'Address', field: 'address', placeholder: 'Address' },
                ].map(({ label, field, placeholder }) => (
                  <div key={field} className="field-group">
                    <label>{label}</label>
                    <input className="field-input" placeholder={placeholder}
                      value={hospForm[field]} onChange={(e) => setHospForm(p => ({ ...p, [field]: e.target.value }))} />
                  </div>
                ))}
                <div className="edit-actions">
                  <button className="btn-ghost small" onClick={() => setEditingHospital(false)} disabled={saving}>Cancel</button>
                  <button className="btn-primary small" onClick={handleSaveHospital} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="info-rows">
                <div className="info-row"><span>Name</span><span>{hospital.name}</span></div>
                <div className="info-row"><span>City</span><span>{hospital.city || '—'}</span></div>
                <div className="info-row"><span>Address</span><span>{hospital.address || '—'}</span></div>
                <div className="info-row"><span>Created</span><span>{formatDate(hospital.createdAt)}</span></div>
                <div className="info-row"><span>ID</span><span className="mono">{hospital.hospitalID}</span></div>
              </div>
            )}
          </div>

          {/* Admin details section */}
          <div className="drawer-section">
            <div className="drawer-section-header">
              <h4>Admin account</h4>
              {!editingAdmin && (
                <button className="edit-btn" onClick={() => setEditingAdmin(true)}>✎ Edit</button>
              )}
            </div>
            {editingAdmin ? (
              <div className="edit-block">
                <div className="field-group">
                  <label>Name</label>
                  <input className="field-input" value={adminForm.name}
                    onChange={(e) => setAdminForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>Specialisation <span className="optional">(if admin sees patients)</span></label>
                  <input className="field-input" placeholder="e.g. ENT Surgeon" value={adminForm.specialisation}
                    onChange={(e) => setAdminForm(p => ({ ...p, specialisation: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>Reset password <span className="optional">(leave blank to keep current)</span></label>
                  <div className="input-wrapper">
                    <input className="field-input with-toggle" type={showPw ? 'text' : 'password'}
                      placeholder="New password (min. 8 chars)" value={adminForm.newPassword}
                      onChange={(e) => setAdminForm(p => ({ ...p, newPassword: e.target.value }))} />
                    <button type="button" className="toggle-pw" onClick={() => setShowPw(p => !p)}>
                      {showPw ? '◎' : '◉'}
                    </button>
                  </div>
                </div>
                <div className="edit-actions">
                  <button className="btn-ghost small" onClick={() => { setEditingAdmin(false); setAdminForm(p => ({ ...p, newPassword: '' })); }} disabled={saving}>Cancel</button>
                  <button className="btn-primary small" onClick={handleSaveAdmin} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              hospital.adminID ? (
                <AdminInfoRows admin={hospital.adminID} />
              ) : (
                <p className="info-empty">No admin assigned yet.</p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hospital Card ─────────────────────────────────────────────────────────────
function HospitalCard({ hospital, onClick }) {
  const { usage } = hospital;
  return (
    <div className="hospital-card animate-in" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="hospital-card-header">
        <div className="hospital-card-icon">🏥</div>
        <div className="hospital-card-title">
          <h3 className="hospital-name">{hospital.name}</h3>
          {hospital.city && <p className="hospital-city">{hospital.city}</p>}
        </div>
        <span className={`hospital-status ${hospital.isActive ? 'active' : 'inactive'}`}>
          {hospital.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="hospital-stats">
        {[
          { label: 'Doctors',  value: usage?.totalDoctors  ?? 0 },
          { label: 'Patients', value: usage?.totalPatients ?? 0 },
          { label: 'Sessions', value: usage?.totalSessions ?? 0 },
          { label: 'Storage',  value: formatBytes(usage?.storageBytes) },
        ].map(({ label, value }, i, arr) => (
          <React.Fragment key={label}>
            <div className="hstat">
              <span className="hstat-value">{value}</span>
              <span className="hstat-label">{label}</span>
            </div>
            {i < arr.length - 1 && <div className="hstat-divider" />}
          </React.Fragment>
        ))}
      </div>
      <div className="hospital-card-footer">
        <div className="hospital-meta-row">
          <span className="hospital-meta-label">Admin</span>
          <span className="hospital-meta-value">
            {hospital.adminID?.name ?? <span className="text-muted-val">Not set</span>}
          </span>
        </div>
        <div className="hospital-meta-row">
          <span className="hospital-meta-label">Created</span>
          <span className="hospital-meta-value">{formatDate(hospital.createdAt)}</span>
        </div>
        <div className="hospital-card-cta">View details →</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { actions, currentUser } = useApp();

  const [hospitals,     setHospitals]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [modalLoading,  setModalLoading]  = useState(false);
  const [search,        setSearch]        = useState('');
  const [activeHospital, setActiveHospital] = useState(null);

  useEffect(() => {
    setLoading(true);
    actions.fetchHospitals()
      .then(({ hospitals: list }) => setHospitals(list))
      .catch(() => actions.showToast('Failed to load hospitals', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateHospital = async (data) => {
    setModalLoading(true);
    try {
      const { hospital } = await actions.createHospital(data);
      setHospitals((prev) => [hospital, ...prev]);
      setShowModal(false);
    } catch (err) {
      actions.showToast(err.message || 'Failed to create hospital', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDrawerSaved = (updated) => {
    setHospitals((prev) => prev.map((h) => h._id === updated._id ? { ...h, ...updated } : h));
    setActiveHospital((prev) => prev ? { ...prev, ...updated } : prev);
  };

  const filtered = hospitals.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    (h.city || '').toLowerCase().includes(search.toLowerCase())
  );

  const totals = hospitals.reduce((acc, h) => ({
    doctors:  acc.doctors  + (h.usage?.totalDoctors  ?? 0),
    patients: acc.patients + (h.usage?.totalPatients ?? 0),
    sessions: acc.sessions + (h.usage?.totalSessions ?? 0),
    storage:  acc.storage  + (h.usage?.storageBytes  ?? 0),
  }), { doctors: 0, patients: 0, sessions: 0, storage: 0 });

  return (
    <div className="page-wrapper">
      <div className="content-container">

        <div className="sa-header animate-in">
          <div>
            <p className="dashboard-greeting">SuperAdmin</p>
            <h1 className="dashboard-title">Platform Overview</h1>
            <p className="dashboard-sub">{currentUser?.name} · SwaraVoice</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New hospital</button>
        </div>

        <div className="sa-stats animate-in stagger-1">
          {[
            { label: 'Hospitals', value: hospitals.length },
            { label: 'Doctors',   value: totals.doctors },
            { label: 'Patients',  value: totals.patients },
            { label: 'Sessions',  value: totals.sessions },
            { label: 'Storage',   value: formatBytes(totals.storage) },
          ].map(({ label, value }) => (
            <div key={label} className="sa-stat-card">
              <span className="sa-stat-value">{value}</span>
              <span className="sa-stat-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="list-controls animate-in stagger-2">
          <div className="search-wrapper">
            <span className="search-icon">⌕</span>
            <input className="search-input" placeholder="Search hospitals by name or city…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <p className="list-count">{filtered.length} hospital{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="hospital-grid">
            {[1, 2, 3].map((i) => <div key={i} className="hospital-card-skeleton skeleton" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state animate-in">
            <div className="empty-icon">🏥</div>
            <h3>{search ? 'No hospitals found' : 'No hospitals yet'}</h3>
            <p>{search ? `No results for "${search}"` : 'Add the first hospital to get started.'}</p>
            {!search && <button className="btn-primary" onClick={() => setShowModal(true)}>+ New hospital</button>}
          </div>
        ) : (
          <div className="hospital-grid animate-in stagger-3">
            {filtered.map((h) => (
              <HospitalCard key={h._id} hospital={h} onClick={() => setActiveHospital(h)} />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateHospitalModal onClose={() => setShowModal(false)} onSubmit={handleCreateHospital} loading={modalLoading} />
      )}
      {activeHospital && (
        <HospitalDrawer
          hospital={activeHospital}
          onClose={() => setActiveHospital(null)}
          onSaved={handleDrawerSaved}
        />
      )}
    </div>
  );
}