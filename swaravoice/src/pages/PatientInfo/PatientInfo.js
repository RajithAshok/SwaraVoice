import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, calcAge } from '../../context/AppContext';
import { generateReport } from '../../utils/generateReport';
import './PatientInfo.css';

const TASK_LABELS = { aa: 'Sustained Vowel', glide: 'Pitch Glide', mpt: 'Maximum Phonation Time', text: 'Reading Passage' };
const TASK_ICONS  = { aa: '①', glide: '②', mpt: '③', text: '④' };

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  if (score == null) return (
    <div className="score-ring pending">
      <span className="score-label">—</span>
      <span className="score-sub">Pending</span>
    </div>
  );
  const color = score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  const r = 36; const circ = 2 * Math.PI * r;
  return (
    <div className="score-ring">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round" transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="score-inner">
        <span className="score-label" style={{ color }}>{score}</span>
        <span className="score-sub">Score</span>
      </div>
    </div>
  );
}

// ── Track Row ─────────────────────────────────────────────────────────────────
function TrackRow({ track }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };

  return (
    <div className="track-row">
      <div className="track-left">
        <span className="track-icon">{TASK_ICONS[track.taskSuffix] ?? '◎'}</span>
        <span className="track-label">{TASK_LABELS[track.taskSuffix] ?? track.taskSuffix}</span>
        <code className="track-suffix">_{track.taskSuffix}.wav</code>
      </div>
      <div className="track-right">
        {track.r2Url && (
          <audio ref={audioRef} src={track.r2Url} onEnded={() => setPlaying(false)} />
        )}
        <button
          className={`track-play-btn ${playing ? 'playing' : ''} ${!track.r2Url ? 'disabled' : ''}`}
          onClick={toggle} disabled={!track.r2Url}
          title={track.r2Url ? (playing ? 'Pause' : 'Play') : 'Not yet stored'}
        >
          {playing ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, isLatest, patient, currentUser }) {
  const [expanded, setExpanded] = useState(isLatest);
  const date      = new Date(session.createdAt);
  const dateStr   = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr   = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const scoreColor = session.compositeScore == null ? 'var(--text-muted)'
    : session.compositeScore >= 80 ? 'var(--accent-green)'
    : session.compositeScore >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  const handleDownloadPdf = (e) => {
    e.stopPropagation();
    // If no analysis stored yet, show a message rather than a blank PDF
    if (!session.analysis) {
      alert('No analysis available for this session yet.');
      return;
    }
    generateReport({
      patient,
      session,
      analysis:     session.analysis,
      doctor:       currentUser,
      hospitalName: currentUser?.hospitalID?.name || '',
    });
  };

  return (
    <div className={`session-card ${expanded ? 'expanded' : ''}`}>
      <button className="session-header" onClick={() => setExpanded((p) => !p)}>
        <div className="session-header-left">
          <div className="session-num-badge">S{session.sessionNumber}</div>
          <div className="session-header-info">
            <span className="session-date">{dateStr}</span>
            <span className="session-time">{timeStr} · {session.tracks?.length ?? 0} tracks</span>
          </div>
        </div>
        <div className="session-header-right">
          <div className="session-score" style={{ color: scoreColor }}>
            {session.compositeScore != null
              ? <><span className="session-score-val">{session.compositeScore}</span><span className="session-score-denom">/100</span></>
              : <span className="session-score-pending">Pending</span>}
          </div>
          <button
            className={`session-pdf-btn ${!session.analysis ? 'disabled' : ''}`}
            onClick={handleDownloadPdf}
            title={session.analysis ? 'Download PDF report' : 'No analysis available'}
          >
            ⬇ Report
          </button>
          <span className={`session-chevron ${expanded ? 'open' : ''}`}>›</span>
        </div>
      </button>
      {expanded && (
        <div className="session-body">
          <div className="session-tracks">
            {(session.tracks ?? []).map((track) => (
              <TrackRow key={track.taskSuffix} track={track} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PatientInfo() {
  const { selectedPatient, selectedSessions, actions, role, currentUser } = useApp();
  const navigate = useNavigate();

  const [editingCond,      setEditingCond]      = useState(false);
  const [condDraft,        setCondDraft]        = useState('');
  const [addingNote,       setAddingNote]       = useState(false);
  const [noteDraft,        setNoteDraft]        = useState('');
  const [sessionsLoading,  setSessionsLoading]  = useState(false);
  const [noteSaving,       setNoteSaving]       = useState(false);
  const [condSaving,       setCondSaving]       = useState(false);

  useEffect(() => {
    if (!selectedPatient?._id) return;
    setSessionsLoading(true);
    actions.fetchSessions(selectedPatient._id)
      .catch(() => actions.showToast('Failed to load sessions', 'error'))
      .finally(() => setSessionsLoading(false));
  }, [selectedPatient?._id]);

  if (!selectedPatient) {
    return (
      <div className="page-wrapper">
        <div className="content-container empty-state">
          <div className="empty-icon">◎</div>
          <h3>No patient selected</h3>
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>← Dashboard</button>
        </div>
      </div>
    );
  }

  const p          = selectedPatient;
  const sessions   = selectedSessions;
  const latestScore = sessions.length > 0 ? sessions[0].compositeScore : null;

  const handleSaveCond = async () => {
    setCondSaving(true);
    try {
      await actions.updatePatientCondition(p._id, condDraft);
      setEditingCond(false);
    } catch (err) {
      actions.showToast(err.message || 'Failed to update', 'error');
    } finally {
      setCondSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      await actions.addNote(p._id, noteDraft.trim());
      setNoteDraft('');
      setAddingNote(false);
    } catch (err) {
      actions.showToast(err.message || 'Failed to add note', 'error');
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="content-container patient-info-layout">
        <button className="back-nav" onClick={() => navigate(role === 'Admin' ? '/admin' : '/dashboard')}>
          ← {role === 'Admin' ? 'Hospital dashboard' : 'Dashboard'}
        </button>

        {/* Patient header */}
        <div className="patient-header animate-in">
          <div className="patient-hero-left">
            <div className="patient-big-avatar">{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
            <div>
              <h1 className="patient-hero-name">{p.name}</h1>
              <div className="patient-hero-meta">
                <span className="chip chip-cyan">{p.patientID}</span>
                <span>{p.dateOfBirth ? calcAge(p.dateOfBirth) : p.age} yrs</span><span>·</span><span>{p.gender}</span>
              </div>
            </div>
          </div>
          <div className="patient-hero-right">
            <ScoreRing score={latestScore} />
            {/* Only the assigned doctor (or admin who is also that doctor) can record */}
            {(role !== 'Admin' || currentUser?._id === p.doctorID?._id || currentUser?._id === p.doctorID) && (
              <button className="btn-primary record-btn" onClick={() => navigate('/recording')}>
                + New Recording
              </button>
            )}
          </div>
        </div>

        <div className="patient-info-grid">
          {/* Left col */}
          <div className="patient-left-col">
            <section className="info-section animate-in stagger-1">
              <div className="section-header">
                <h3>Medical conditions</h3>
                {!editingCond && (role !== 'Admin' || currentUser?._id === (p.doctorID?._id ?? p.doctorID)) && (
                  <button className="edit-btn" onClick={() => { setEditingCond(true); setCondDraft(p.prevMedicalCond || ''); }}>
                    ✎ Edit
                  </button>
                )}
              </div>
              {editingCond ? (
                <div className="edit-block">
                  <textarea className="field-input" rows={4} value={condDraft} autoFocus
                    onChange={(e) => setCondDraft(e.target.value)} placeholder="e.g. Hypertension, GERD…" />
                  <div className="edit-actions">
                    <button className="btn-ghost small" onClick={() => setEditingCond(false)} disabled={condSaving}>Cancel</button>
                    <button className="btn-primary small" onClick={handleSaveCond} disabled={condSaving}>
                      {condSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="info-text">{p.prevMedicalCond || <span className="info-empty">None recorded</span>}</p>
              )}
            </section>

            <section className="info-section animate-in stagger-2">
              <div className="section-header">
                <h3>Doctor notes</h3>
                {(role !== 'Admin' || currentUser?._id === (p.doctorID?._id ?? p.doctorID)) && (
                  <button className="edit-btn" onClick={() => setAddingNote(true)}>+ Add</button>
                )}
              </div>
              {addingNote && (
                <div className="edit-block">
                  <textarea className="field-input" rows={4} value={noteDraft} autoFocus
                    onChange={(e) => setNoteDraft(e.target.value)} placeholder="Enter clinical observation…" />
                  <div className="edit-actions">
                    <button className="btn-ghost small" onClick={() => { setAddingNote(false); setNoteDraft(''); }} disabled={noteSaving}>Cancel</button>
                    <button className="btn-primary small" onClick={handleAddNote} disabled={noteSaving}>
                      {noteSaving ? 'Saving…' : 'Save note'}
                    </button>
                  </div>
                </div>
              )}
              {(p.doctorNotes?.length === 0) && !addingNote ? (
                <p className="info-empty">No notes yet.</p>
              ) : (
                <div className="notes-list">
                  {[...(p.doctorNotes || [])].reverse().map((note) => (
                    <div key={note._id} className="note-item">
                      <p className="note-text">{note.text}</p>
                      <p className="note-date">
                        {new Date(note.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        &nbsp;·&nbsp;
                        {new Date(note.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right col — sessions */}
          <div className="patient-right-col">
            <section className="info-section animate-in stagger-3">
              <div className="section-header">
                <h3>Voice sessions <span className="section-count">({sessions.length})</span></h3>
                {(role !== 'Admin' || currentUser?._id === (p.doctorID?._id ?? p.doctorID)) && (
                  <button className="btn-primary small" onClick={() => navigate('/recording')}>+ Record</button>
                )}
              </div>
              {sessionsLoading ? (
                <div className="sessions-loading">
                  {[1, 2].map((i) => <div key={i} className="session-skeleton skeleton" />)}
                </div>
              ) : sessions.length === 0 ? (
                <div className="no-recordings">
                  <div className="no-rec-icon">🎙</div>
                  <p>No recordings yet for this patient.</p>
                  <button className="btn-primary" onClick={() => navigate('/recording')}>Start first recording</button>
                </div>
              ) : (
                <div className="sessions-list">
                  {sessions.map((s, i) => (
                    <SessionCard key={s._id} session={s} isLatest={i === 0} patient={p} currentUser={currentUser} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}