import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { sessionsAPI } from '../../services/api';
import './Recording.css';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STAGES = {
  SETUP:       'setup',
  CHECKING:    'checking',
  READY:       'ready',
  TASK_INTRO:  'task_intro',  // Show instructions before each individual task
  RECORDING:   'recording',   // Recording one task
  TASK_REVIEW: 'task_review', // Review one task before moving on
  ALL_DONE:    'all_done',    // All 4 tasks recorded — final submit screen
  SUBMITTING:  'submitting',
  DONE:        'done',
};

// The 4 recording tasks in protocol order
const TASKS = [
  {
    id:     'aa',
    label:  'Sustained Vowel',
    suffix: 'aa',
    icon:   '①',
    desc:   'Ask the patient to say "Ahhh" at a comfortable pitch and volume, holding it as steadily as possible.',
    hint:   'Aim for a continuous, unwavering tone. Stop naturally when they run out of breath.',
  },
  {
    id:     'glide',
    label:  'Pitch Glide',
    suffix: 'glide',
    icon:   '②',
    desc:   'Ask the patient to glide smoothly from their lowest comfortable pitch up to their highest, on a vowel sound.',
    hint:   "Go slowly and continuously — don't jump. One smooth sweep from bottom to top.",
  },
  {
    id:     'mpt',
    label:  'Maximum Phonation Time',
    suffix: 'mpt',
    icon:   '③',
    desc:   'Ask the patient to take a deep breath, then sustain the "Ahhh" sound for as long as possible on a single breath.',
    hint:   'This measures maximum sustained voicing duration. Stop when they run out of breath.',
  },
  {
    id:     'text',
    label:  'Reading Passage',
    suffix: 'text',
    icon:   '④',
    desc:   'Ask the patient to read the following passage aloud at a natural pace:\n\n"Please call Stella. Ask her to bring these things with her from the store: six spoons of fresh snow peas, five thick slabs of blue cheese, and maybe a snack for her brother Bob."',
    hint:   'Use a standardized passage for consistency across all patient sessions.',
  },
];

// ─────────────────────────────────────────────
// WAV ENCODER
// The doctor requires WAV files regardless of OS. Since MediaRecorder
// outputs webm on Chrome and mp4 on Safari, we bypass it entirely and
// capture raw PCM via ScriptProcessorNode, then encode to WAV ourselves.
// This guarantees a true .wav file on every browser and OS.
// ─────────────────────────────────────────────

function encodeWAV(pcmChunks, sampleRate) {
  // Concatenate all Float32 PCM chunks
  const totalSamples = pcmChunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert float32 → int16
  const int16 = new Int16Array(merged.length);
  for (let i = 0; i < merged.length; i++) {
    const s = Math.max(-1, Math.min(1, merged[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const numChannels = 1;
  const bitDepth    = 16;
  const dataSize    = int16.length * 2;
  const buffer      = new ArrayBuffer(44 + dataSize);
  const view        = new DataView(buffer);

  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  str(0,  'RIFF');
  view.setUint32( 4, 36 + dataSize, true);
  str(8,  'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,  true);                                         // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);  // byte rate
  view.setUint16(32, numChannels * (bitDepth / 8), true);               // block align
  view.setUint16(34, bitDepth, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < int16.length; i++) view.setInt16(44 + i * 2, int16[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

// ─────────────────────────────────────────────
// AUTO-SELECT EXTERNAL MIC
// Prefers any device whose label contains keywords suggesting it is an
// external/USB/condenser microphone. Falls back to any non-built-in device,
// then to the first available device.
// ─────────────────────────────────────────────

const EXTERNAL_KEYWORDS = [
  'usb', 'condenser', 'external', 'headset', 'yeti', 'samson', 'rode',
  'blue', 'shure', 'audio-technica', 'focusrite', 'scarlett', 'zoom',
  'behringer', 'line', 'xlr', 'interface', 'podcast', 'studio',
];

function pickBestMic(devices) {
  if (!devices.length) return null;
  const external  = devices.find((d) => EXTERNAL_KEYWORDS.some((kw) => d.label.toLowerCase().includes(kw)));
  if (external) return external;
  const nonBuiltin = devices.find((d) => !/(built.?in|internal|default)/i.test(d.label));
  if (nonBuiltin) return nonBuiltin;
  return devices[0];
}

// ─────────────────────────────────────────────
// dB METER COMPONENT
// ─────────────────────────────────────────────

function DbMeter({ level, threshold, calibration }) {
  const adjusted = Math.max(0, level - calibration);
  const isOk     = adjusted < threshold;
  const pct      = Math.min(100, (adjusted / 80) * 100);
  return (
    <div className="db-meter-wrap">
      <div className="db-meter-bar-bg">
        <div
          className={`db-meter-bar ${isOk ? 'ok' : 'loud'}`}
          style={{ width: `${pct}%`, transition: 'width 0.08s ease' }}
        />
        <div className="db-threshold-line" style={{ left: `${(threshold / 80) * 100}%` }} />
      </div>
      <div className="db-meter-labels">
        <span className="db-current" style={{ color: isOk ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
          {adjusted.toFixed(1)} dB
          {calibration !== 0 && <span className="db-cal-tag"> (offset −{calibration})</span>}
        </span>
        <span className="db-threshold-label">Threshold: {threshold} dB</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WAVEFORM BARS
// ─────────────────────────────────────────────

function WaveformBars({ active }) {
  return (
    <div className={`waveform-bars ${active ? 'active' : ''}`}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="wave-bar" style={{ animationDelay: `${(i * 0.07) % 0.8}s` }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────


export default function Recording() {
  const { selectedPatient, selectedSessions, actions, currentUser } = useApp();
  const navigate = useNavigate();

  // Stage & task flow
  const [stage,          setStage]          = useState(STAGES.SETUP);
  const [taskIndex,      setTaskIndex]       = useState(0);
  const [taskRecordings, setTaskRecordings]  = useState([]); // [{ task, blob, url, secs }]

  // Mic
  const [mics,            setMics]            = useState([]);
  const [selectedMic,     setSelectedMic]     = useState('');
  const [showMicDropdown, setShowMicDropdown] = useState(false);

  // Calibration — persisted to localStorage
  const [calibration,     setCalibration]     = useState(() => {
    const s = localStorage.getItem('vocascan_db_calibration');
    return s ? parseFloat(s) : 0;
  });
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibDraft,      setCalibDraft]      = useState('');

  // Audio / recording state
  const [dbLevel,        setDbLevel]        = useState(0);
  const [ambientOkSecs,  setAmbientOkSecs]  = useState(0);
  const [isPaused,       setIsPaused]       = useState(false);
  const [recordingSecs,  setRecordingSecs]  = useState(0);
  const [currentBlob,    setCurrentBlob]    = useState(null);
  const [currentUrl,     setCurrentUrl]     = useState(null);
  const [resultVisible,  setResultVisible]  = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [sessionResult,  setSessionResult]  = useState(null);
  const [pdfLoading,     setPdfLoading]     = useState(false);

  // Refs
  const streamRef      = useRef(null);
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const scriptNodeRef  = useRef(null);
  const pcmChunksRef   = useRef([]);       // raw Float32 PCM chunks
  const isCapturingRef = useRef(false);    // guard for ScriptProcessor callback
  const timerRef       = useRef(null);

  const DB_THRESHOLD = 40;
  const currentTask  = TASKS[taskIndex];
  const adjustedDb   = Math.max(0, dbLevel - calibration);

  // ── Enumerate microphones on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices     = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        setMics(audioInputs);
        const best = pickBestMic(audioInputs);
        if (best) setSelectedMic(best.deviceId);
      } catch {
        const fallback = [{ deviceId: 'default', label: 'Default Microphone' }];
        setMics(fallback);
        setSelectedMic('default');
      }
    })();
    return () => cleanup();
  }, []);

  // ── Full cleanup ───────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    isCapturingRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    clearInterval(timerRef.current);
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }
    if (audioCtxRef.current)   { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (streamRef.current)     { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    pcmChunksRef.current = [];
  }, []);

  // ── Start audio analysis (dB meter only) ─────────────────────────────
  const startAudioAnalysis = useCallback(async (micId) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:         micId ? { exact: micId } : undefined,
          echoCancellation: false, // must be off for clinical audio fidelity
          noiseSuppression: false,
          autoGainControl:  false,
          sampleRate:       44100,
        },
      });
      streamRef.current = stream;

      const ctx      = new AudioContext({ sampleRate: 44100 });
      audioCtxRef.current = ctx;
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length);
        const db  = rms === 0 ? 0 : 20 * Math.log10(rms / 255) + 80;
        setDbLevel(Math.max(0, db));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch (e) {
      console.error('Mic access error:', e);
      // Demo fallback — mock dB levels
      const mockTick = () => {
        setDbLevel(25 + Math.random() * 10);
        animFrameRef.current = requestAnimationFrame(mockTick);
      };
      mockTick();
      return false; // signals demo mode to callers
    }
  }, []);

  // ── Ambient check tracking ─────────────────────────────────────────────
  useEffect(() => {
    if (stage !== STAGES.CHECKING) return;
    const interval = setInterval(() => {
      setDbLevel((cur) => {
        if (Math.max(0, cur - calibration) < DB_THRESHOLD) {
          setAmbientOkSecs((s) => {
            if (s + 1 >= 5) { clearInterval(interval); setStage(STAGES.READY); }
            return s + 1;
          });
        } else {
          setAmbientOkSecs(0);
        }
        return cur;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, calibration]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleCheckAmbient = async () => {
    setStage(STAGES.CHECKING);
    setAmbientOkSecs(0);
    await startAudioAnalysis(selectedMic);
  };

  const handleMicChange = async (deviceId) => {
    setSelectedMic(deviceId);
    setShowMicDropdown(false);
    cleanup();
    setStage(STAGES.SETUP);
  };

  const handleSaveCalibration = () => {
    const val = parseFloat(calibDraft);
    if (isNaN(val) || val < 0 || val > 60) return;
    setCalibration(val);
    localStorage.setItem('vocascan_db_calibration', val.toString());
    setShowCalibration(false);
  };

  // Start recording a single task using raw PCM capture → WAV encoding
  const handleStartTaskRecording = async () => {
    setRecordingSecs(0);
    setIsPaused(false);
    pcmChunksRef.current = [];

    // Ensure stream + AudioContext are ready
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      const ok = await startAudioAnalysis(selectedMic);
      ctx = audioCtxRef.current;
      if (!ok || !ctx) {
        // Demo mode — no mic available
        setStage(STAGES.RECORDING);
        timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
        return;
      }
    }

    const stream = streamRef.current;
    const source = ctx.createMediaStreamSource(stream);

    // ScriptProcessorNode captures raw PCM buffers.
    // Deprecated but universally supported; AudioWorklet is the modern
    // replacement but has lower cross-browser support for now.
    // AWS FUTURE: Consider AudioWorklet for improved thread isolation.
    const bufferSize  = 4096;
    const scriptNode  = ctx.createScriptProcessor(bufferSize, 1, 1);
    scriptNodeRef.current = scriptNode;
    isCapturingRef.current = true;

    scriptNode.onaudioprocess = (e) => {
      if (!isCapturingRef.current) return;
      pcmChunksRef.current.push(e.inputBuffer.getChannelData(0).slice());
    };

    source.connect(scriptNode);
    scriptNode.connect(ctx.destination); // must connect to fire

    setStage(STAGES.RECORDING);
    timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
  };

  const handlePause = () => {
    if (isPaused) {
      isCapturingRef.current = true;
      timerRef.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
    } else {
      isCapturingRef.current = false;
      clearInterval(timerRef.current);
    }
    setIsPaused((p) => !p);
  };

  const handleStopRecording = () => {
    isCapturingRef.current = false;
    clearInterval(timerRef.current);
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }

    const chunks     = pcmChunksRef.current;
    const sampleRate = audioCtxRef.current?.sampleRate || 44100;

    if (chunks.length === 0) {
      // Demo mode
      setCurrentBlob(null);
      setCurrentUrl(null);
      setStage(STAGES.TASK_REVIEW);
      return;
    }

    // Encode captured PCM → WAV (guarantees .wav on all browsers/OSes)
    const wavBlob = encodeWAV(chunks, sampleRate);
    const url     = URL.createObjectURL(wavBlob);
    setCurrentBlob(wavBlob);
    setCurrentUrl(url);
    setStage(STAGES.TASK_REVIEW);
  };

  const handleAcceptTask = () => {
    setTaskRecordings((prev) => [...prev, {
      task: currentTask,
      blob: currentBlob,
      url:  currentUrl,
      secs: recordingSecs,
    }]);

    if (taskIndex + 1 < TASKS.length) {
      setTaskIndex((i) => i + 1);
      setCurrentBlob(null);
      setCurrentUrl(null);
      setRecordingSecs(0);
      setStage(STAGES.TASK_INTRO);
    } else {
      setStage(STAGES.ALL_DONE);
    }
  };

  const handleReRecord = () => {
    setCurrentBlob(null);
    setCurrentUrl(null);
    setRecordingSecs(0);
    setStage(STAGES.TASK_INTRO);
  };

  const handleSubmitAll = async () => {
    setStage(STAGES.SUBMITTING);
    try {
      const base   = generateSessionBase();
      // Build tracks array for the API: [{ taskSuffix, blob, fileName }]
      const tracks = taskRecordings.map(({ task, blob }) => ({
        taskSuffix: task.suffix,
        blob,
        fileName: `${base}_${task.suffix}.wav`,
      }));

      // Upload all 4 WAVs to R2 and create session in MongoDB
      // actions.submitSession returns the session object directly
      const session = await actions.submitSession(selectedPatient._id, tracks);

      setSessionResult(session);
      if (session?.analysis) {
        setAnalysisResult(session.analysis);
        // PDF is generated server-side during session creation and stored in R2.
        // The ⬇ Report button calls GET /api/sessions/:id/report for a fresh URL.
      }

      setStage(STAGES.DONE);
      setResultVisible(true);
    } catch (err) {
      actions.showToast(err.message || 'Upload failed — please try again', 'error');
      setStage(STAGES.ALL_DONE); // return to summary so they can retry
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────

  const generateSessionBase = () => {
    const dt = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    return `${selectedPatient?.patientID || 'PAT'}_${dt}`;
  };

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const selectedMicLabel  = mics.find((m) => m.deviceId === selectedMic)?.label || 'Microphone';
  const sessionNumber     = (selectedSessions?.length ?? 0) + 1;

  // ── Guard ─────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="page-wrapper">
      <div className="content-container recording-layout">

        <button className="back-nav" onClick={() => { cleanup(); navigate('/patient'); }}>
          ← Back to patient
        </button>

        {/* Header */}
        <div className="recording-header animate-in">
          <div>
            <h1>Voice Recording</h1>
            <p className="recording-sub">
              Patient: <strong>{selectedPatient.name}</strong> · {selectedPatient.patientID}
            </p>
          </div>
          <div className="recording-num chip chip-cyan">
            Session #{sessionNumber}
          </div>
        </div>

        {/* Protocol bar */}
        <div className="protocol-bar animate-in stagger-1">
          <span className="protocol-icon">📋</span>
          <span>
            Condenser mic · 15 cm · 45° · Quiet room &lt;{DB_THRESHOLD} dB ·
            4 tasks recorded individually: Sustained Vowel, Pitch Glide, MPT, Reading Passage
          </span>
        </div>

        {/* Task progress stepper */}
        {![STAGES.SETUP, STAGES.CHECKING].includes(stage) && (
          <div className="task-stepper animate-in">
            {TASKS.map((t, i) => {
              const done    = i < taskIndex || [STAGES.ALL_DONE, STAGES.SUBMITTING, STAGES.DONE].includes(stage);
              const current = i === taskIndex && ![STAGES.ALL_DONE, STAGES.SUBMITTING, STAGES.DONE].includes(stage);
              return (
                <div key={t.id} className={`step ${done ? 'done' : current ? 'current' : 'upcoming'}`}>
                  <div className="step-dot">{done ? '✓' : t.icon}</div>
                  <span className="step-label">{t.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="recording-card animate-in stagger-2">

          {/* ── SETUP ── */}
          {stage === STAGES.SETUP && (
            <div className="stage-block">
              <h2 className="stage-title">Microphone setup</h2>
              <p className="stage-desc">
                An external condenser microphone has been auto-selected based on device name.
                Use <em>Change mic</em> only if the wrong device was picked.
              </p>

              {/* Auto-selected mic display */}
              <div className="mic-selected-display">
                <span className="mic-selected-icon">🎙</span>
                <div className="mic-selected-info">
                  <span className="mic-selected-label">Selected microphone</span>
                  <span className="mic-selected-name">{selectedMicLabel}</span>
                </div>
                <button className="btn-ghost small" onClick={() => setShowMicDropdown((p) => !p)}>
                  {showMicDropdown ? 'Cancel' : 'Change mic'}
                </button>
              </div>

              {showMicDropdown && (
                <div className="mic-dropdown-panel">
                  <p className="mic-dropdown-label">Select a different microphone:</p>
                  {mics.map((m) => (
                    <button
                      key={m.deviceId}
                      className={`mic-option ${m.deviceId === selectedMic ? 'active' : ''}`}
                      onClick={() => handleMicChange(m.deviceId)}
                    >
                      <span>{m.deviceId === selectedMic ? '◉' : '◎'}</span>
                      {m.label || `Microphone (${m.deviceId.slice(0, 8)}…)`}
                    </button>
                  ))}
                </div>
              )}

              {/* Calibration */}
              <div className="calibration-row">
                <div className="calibration-info">
                  <span className="calibration-title">dB Calibration offset</span>
                  <span className="calibration-value">
                    {calibration === 0 ? 'None set' : `−${calibration} dB`}
                  </span>
                </div>
                <button
                  className="btn-ghost small"
                  onClick={() => { setShowCalibration((p) => !p); setCalibDraft(calibration.toString()); }}
                >
                  {showCalibration ? 'Cancel' : 'Calibrate'}
                </button>
              </div>

              {showCalibration && (
                <div className="calibration-panel">
                  <p className="calibration-desc">
                    The Web Audio API measures relative amplitude, not true SPL. If your mic reads
                    <strong> 60 dB</strong> in a genuinely quiet room, use a reference SPL meter
                    (or a phone app like <em>Decibel X</em>), find the real reading, then set the
                    offset to <strong>(app reading − actual SPL)</strong>.
                    <br /><br />
                    Example: app shows 60 dB, actual room is 32 dB SPL → set offset to <strong>28</strong>.
                    The meter will then subtract 28 from all readings.
                  </p>
                  <div className="calibration-input-row">
                    <label>Offset (dB to subtract)</label>
                    <input
                      className="field-input calibration-input"
                      type="number"
                      min="0"
                      max="60"
                      step="0.5"
                      value={calibDraft}
                      onChange={(e) => setCalibDraft(e.target.value)}
                      placeholder="e.g. 28"
                    />
                    <button className="btn-primary small" onClick={handleSaveCalibration}>Apply</button>
                  </div>
                </div>
              )}

              <button className="btn-primary" onClick={handleCheckAmbient}>
                Check ambient noise →
              </button>
            </div>
          )}

          {/* ── CHECKING AMBIENT ── */}
          {stage === STAGES.CHECKING && (
            <div className="stage-block">
              <h2 className="stage-title">Checking ambient noise</h2>
              <p className="stage-desc">
                Stay quiet. The room must stay below {DB_THRESHOLD} dB for 5 consecutive seconds.
              </p>
              <DbMeter level={dbLevel} threshold={DB_THRESHOLD} calibration={calibration} />
              <div className="ambient-progress">
                <div className="ambient-bar-wrap">
                  <div className="ambient-bar" style={{ width: `${(ambientOkSecs / 5) * 100}%` }} />
                </div>
                <span className="ambient-label">{ambientOkSecs} / 5 seconds stable</span>
              </div>
              {adjustedDb >= DB_THRESHOLD && (
                <p className="too-loud-hint">
                  ⚠ Reading is {adjustedDb.toFixed(1)} dB. If the room is genuinely quiet, increase
                  the calibration offset in microphone setup.
                </p>
              )}
              <button className="btn-ghost" onClick={() => { cleanup(); setStage(STAGES.SETUP); }}>
                ← Microphone setup
              </button>
            </div>
          )}

          {/* ── READY ── */}
          {stage === STAGES.READY && (
            <div className="stage-block">
              <div className="alert-block alert-success">
                <span>✓</span>
                <div>
                  <strong>Room is quiet ({adjustedDb.toFixed(1)} dB)</strong>
                  <p>Each of the 4 tasks will be recorded separately. You'll review each one before moving on.</p>
                </div>
              </div>
              <DbMeter level={dbLevel} threshold={DB_THRESHOLD} calibration={calibration} />
              <div className="task-overview">
                {TASKS.map((t) => (
                  <div key={t.id} className="task-overview-row">
                    <span className="task-num">{t.icon}</span>
                    <div>
                      <strong>{t.label}</strong>
                      <code className="task-suffix-chip"> _{t.suffix}.wav</code>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={() => setStage(STAGES.TASK_INTRO)}>
                Begin recording tasks →
              </button>
            </div>
          )}

          {/* ── TASK INTRO ── */}
          {stage === STAGES.TASK_INTRO && (
            <div className="stage-block">
              <div className="task-intro-header">
                <span className="task-intro-icon">{currentTask.icon}</span>
                <div>
                  <h2 className="stage-title">{currentTask.label}</h2>
                  <code className="chip chip-cyan">_{currentTask.suffix}.wav</code>
                </div>
              </div>
              <div className="task-intro-desc">
                {currentTask.desc.split('\n').map((line, i) =>
                  line.startsWith('"') ? (
                    <blockquote key={i} className="reading-passage">{line}</blockquote>
                  ) : line.trim() ? (
                    <p key={i}>{line}</p>
                  ) : null
                )}
              </div>
              <div className="alert-block alert-info">
                <span>💡</span>
                <div><p>{currentTask.hint}</p></div>
              </div>
              <button className="btn-record" onClick={handleStartTaskRecording}>
                <span className="rec-dot" /> Start — {currentTask.label}
              </button>
            </div>
          )}

          {/* ── RECORDING ── */}
          {stage === STAGES.RECORDING && (
            <div className="stage-block recording-active">
              <div className="task-recording-label">
                <span>{currentTask.icon}</span>
                <span>{currentTask.label}</span>
              </div>
              <div className="rec-indicator">
                {!isPaused && <span className="pulse-ring" />}
                <span className={`rec-live ${isPaused ? 'paused' : ''}`}>
                  {isPaused ? 'PAUSED' : 'REC'}
                </span>
              </div>
              <div className="rec-timer">{formatTime(recordingSecs)}</div>
              <WaveformBars active={!isPaused} />
              <DbMeter level={dbLevel} threshold={DB_THRESHOLD} calibration={calibration} />
              {/* Keep instructions visible during recording — especially important for reading passage */}
              <div className="recording-hint-box">
                {currentTask.desc.split('\n').map((line, i) =>
                  line.startsWith('"') ? (
                    <blockquote key={i} className="reading-passage-sm">{line}</blockquote>
                  ) : line.trim() ? (
                    <p key={i} className="hint-line">{line}</p>
                  ) : null
                )}
              </div>
              <div className="rec-controls">
                <button className="btn-ghost" onClick={handlePause}>
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button className="btn-stop" onClick={handleStopRecording}>
                  ⬛ Stop & review
                </button>
              </div>
            </div>
          )}

          {/* ── TASK REVIEW ── */}
          {stage === STAGES.TASK_REVIEW && (
            <div className="stage-block">
              <h2 className="stage-title">Review — {currentTask.label}</h2>
              <p className="stage-desc">Duration: <strong>{formatTime(recordingSecs)}</strong> · Listen before confirming.</p>
              <div className="playback-block">
                {currentUrl ? (
                  <audio controls src={currentUrl} className="audio-player" />
                ) : (
                  <div className="no-audio-preview">⚠ Preview not available in demo mode</div>
                )}
              </div>
              <div className="recording-name-preview">
                <span className="name-label">Will be saved as:</span>
                <code className="name-code">{generateSessionBase()}_{currentTask.suffix}.wav</code>
              </div>
              <div className="review-actions">
                <button className="btn-ghost" onClick={handleReRecord}>↺ Re-record</button>
                <button className="btn-primary" onClick={handleAcceptTask}>
                  {taskIndex + 1 < TASKS.length
                    ? `Confirm → Next: ${TASKS[taskIndex + 1].label}`
                    : 'Confirm → Review all & submit'}
                </button>
              </div>
            </div>
          )}

          {/* ── ALL DONE — final summary ── */}
          {stage === STAGES.ALL_DONE && (
            <div className="stage-block">
              <h2 className="stage-title">All 4 tasks complete</h2>
              <p className="stage-desc">Review the full session. Submit to download all files.</p>
              <div className="summary-list">
                {taskRecordings.map(({ task, secs, url }) => (
                  <div key={task.id} className="summary-row">
                    <div className="summary-left">
                      <span className="summary-icon">{task.icon}</span>
                      <div>
                        <span className="summary-name">{task.label}</span>
                        <code className="summary-file"> _{task.suffix}.wav</code>
                      </div>
                    </div>
                    <div className="summary-right">
                      <span className="summary-dur">{formatTime(secs)}</span>
                      {url && <audio controls src={url} className="summary-audio" />}
                    </div>
                  </div>
                ))}
              </div>
              <div className="done-note">
                <p>Will download as 4 separate WAV files:&nbsp;
                  <code>_aa.wav</code>, <code>_glide.wav</code>, <code>_mpt.wav</code>, <code>_text.wav</code>
                </p>
              </div>
              <button className="btn-primary" onClick={handleSubmitAll}>
                Submit all recordings →
              </button>
            </div>
          )}

          {/* ── SUBMITTING ── */}
          {stage === STAGES.SUBMITTING && (
            <div className="stage-block submitting-block">
              <div className="submit-spinner" />
              <p className="submit-text">Saving recordings and generating report…</p>
              {/* AWS FUTURE: Upload 4 WAVs to S3 session folder → trigger EC2 ML pipeline via Kafka/SQS */}
              <p className="submit-sub">
                In production: all 4 files upload to an S3 session folder and trigger the ML pipeline via Kafka.
              </p>
            </div>
          )}

          {/* ── DONE ── */}
          {stage === STAGES.DONE && resultVisible && (
            <div className="stage-block done-block animate-in">
              <div className="done-icon">✓</div>
              <h2>Session submitted!</h2>

              {analysisResult ? (
                <div className="analysis-results">
                  {/* Composite score */}
                  <div className="composite-score-block">
                    <span className="composite-label">Composite Score</span>
                    <span
                      className="composite-value"
                      style={{ color: analysisResult.composite >= 65 ? 'var(--accent-green)' : analysisResult.composite >= 40 ? '#F59E0B' : 'var(--accent-rose)' }}
                    >
                      {analysisResult.composite}
                    </span>
                    <span className="composite-sub">/ 100</span>
                  </div>

                  {/* Subset scores */}
                  <div className="subset-scores-row">
                    {[
                      { label: 'Stability',  value: analysisResult.stability },
                      { label: 'Clarity',    value: analysisResult.clarity },
                      { label: 'Efficiency', value: analysisResult.efficiency },
                    ].map(({ label, value }) => (
                      <div key={label} className="subset-score-card">
                        <span className="subset-score-label">{label}</span>
                        <span
                          className="subset-score-value"
                          style={{ color: value >= 65 ? 'var(--accent-green)' : value >= 40 ? '#F59E0B' : 'var(--accent-rose)' }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Raw metrics table */}
                  <div className="metrics-table-wrap">
                    <p className="metrics-table-title">Raw values &amp; scores</p>
                    <table className="metrics-table">
                      <thead>
                        <tr><th>Metric</th><th>Raw value</th><th>Score</th></tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Jitter (%)',       raw: analysisResult.raw.jitter,      score: analysisResult.scores.jitter },
                          { label: 'Shimmer (%)',      raw: analysisResult.raw.shimmer,     score: analysisResult.scores.shimmer },
                          { label: 'F0 SD (Hz)',       raw: analysisResult.raw.f0_sd,       score: analysisResult.scores.f0_sd },
                          { label: 'HNR (dB)',         raw: analysisResult.raw.hnr,         score: analysisResult.scores.hnr },
                          { label: 'CPPS (dB)',        raw: analysisResult.raw.cpps,        score: analysisResult.scores.cpps },
                          { label: 'MPT (s)',          raw: analysisResult.raw.mpt,         score: analysisResult.scores.mpt },
                          { label: 'Pitch Range (Hz)', raw: analysisResult.raw.pitch_range, score: analysisResult.scores.glide },
                        ].map(({ label, raw, score }) => (
                          <tr key={label}>
                            <td>{label}</td>
                            <td className="metric-raw">{raw ?? '—'}</td>
                            <td className="metric-score" style={{ color: score >= 65 ? 'var(--accent-green)' : score >= 40 ? '#F59E0B' : 'var(--accent-rose)' }}>
                              {score ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="info-metrics-row">
                      {[
                        { label: 'F0 mean',   value: analysisResult.raw.f0_mean,      unit: 'Hz' },
                        { label: 'F0 min',    value: analysisResult.raw.f0_min,       unit: 'Hz' },
                        { label: 'F0 max',    value: analysisResult.raw.f0_max,       unit: 'Hz' },
                        { label: 'Glide min', value: analysisResult.raw.glide_min_f0, unit: 'Hz' },
                        { label: 'Glide max', value: analysisResult.raw.glide_max_f0, unit: 'Hz' },
                      ].map(({ label, value, unit }) => (
                        <div key={label} className="info-metric-chip">
                          <span className="info-metric-label">{label}</span>
                          <span className="info-metric-value">{value ?? '—'} {unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="done-note">
                  <p>Recordings saved. Analysis could not be completed — check that the Python analyser is configured correctly.</p>
                </div>
              )}

              <div className="done-actions">
                {analysisResult && sessionResult && (
                  <button
                    className="btn-ghost"
                    disabled={pdfLoading}
                    onClick={async () => {
                      setPdfLoading(true);
                      try {
                        const { reportUrl } = await sessionsAPI.getReport(sessionResult._id);
                        window.open(reportUrl, '_blank');
                      } catch (err) {
                        actions.showToast('Could not open report: ' + err.message, 'error');
                      } finally {
                        setPdfLoading(false);
                      }
                    }}
                  >
                    {pdfLoading ? '⏳ Opening…' : '⬇ Open PDF Report'}
                  </button>
                )}
                <button className="btn-primary" onClick={() => { cleanup(); navigate('/patient'); }}>
                  ← Back to patient
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}