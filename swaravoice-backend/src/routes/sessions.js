const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { spawn }  = require('child_process');
const Session    = require('../models/Session');
const Patient    = require('../models/Patient');
const Hospital   = require('../models/Hospital');
const { auth, requireRole } = require('../middleware/auth');
const { uploadAudio, getAudioUrl, buildTrackKey, downloadAudio } = require('../config/r2');
const { generateID }        = require('../utils/helpers');
const { generatePdfBuffer } = require('../utils/pdfReport');

const router = express.Router();

// ── Multer config ─────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/wave') {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only audio/wav is accepted.`));
    }
  },
});


// ── HELPER: run Python analyser ───────────────────────────────────────────────
// Downloads the 4 WAV files from R2 to a temp directory, runs analyser.py,
// parses the JSON output, then cleans up the temp files.
//
// Returns the parsed analysis object, or null if analysis fails (we never
// want a failed analysis to block the session from being saved).

async function runAnalysis(tracks, gender) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swaravoice-'));
  console.log('[SwaraVoice] runAnalysis started. tmpDir:', tmpDir, '| gender:', gender);

  try {
    // Download all 4 tracks from R2 to temp files concurrently
    const filePaths = {};
    await Promise.all(
      tracks.map(async (track) => {
        const localPath = path.join(tmpDir, track.fileName);
        const buffer    = await downloadAudio(track.r2Key);
        fs.writeFileSync(localPath, buffer);
        filePaths[track.taskSuffix] = localPath;
        console.log(`[SwaraVoice] Downloaded ${track.taskSuffix}: ${localPath} (${buffer.length} bytes)`);
      })
    );

    // Resolve path to analyser.py
    const analyserPath = process.env.ANALYSER_PATH ||
      path.join(__dirname, '..', '..', 'voice_analysis', 'analyser.py');

    console.log('[SwaraVoice] analyserPath:', analyserPath);
    console.log('[SwaraVoice] analyserPath exists:', fs.existsSync(analyserPath));

    // Use 'python' on Windows, 'python3' on Mac/Linux
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const args = [
      analyserPath,
      filePaths['aa'],
      filePaths['glide'],
      filePaths['mpt'],
      filePaths['text'],
      gender,
    ];

    console.log('[SwaraVoice] Spawning:', pythonCmd, args.join(' '));

    const analysis = await new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, args);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        console.log('[SwaraVoice] Python exit code:', code);
        if (stderr) console.error('[SwaraVoice] Python stderr:\n', stderr.trim());
        if (stdout) console.log('[SwaraVoice] Python stdout (first 300 chars):', stdout.slice(0, 300));

        if (code !== 0) {
          reject(new Error(`analyser.py exited ${code}: ${stderr.trim()}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error(`analyser.py output was not valid JSON: ${stdout.slice(0, 300)}`));
          }
        }
      });

      proc.on('error', (err) => {
        console.error('[SwaraVoice] spawn error:', err);
        reject(new Error(`Failed to start Python: ${err.message}. Is '${pythonCmd}' in PATH?`));
      });
    });

    console.log('[SwaraVoice] Analysis complete. Composite:', analysis?.composite);
    return analysis;

  } catch (err) {
    console.error('[SwaraVoice] Analysis failed:', err.message);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}


// ── GET /api/sessions/patient/:patientId ──────────────────────────────────────
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    if (req.user.role === 'Doctor' && patient.doctorID.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'Admin' && patient.hospitalID.toString() !== req.user.hospitalID.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const sessions = await Session.find({ patientID: req.params.patientId })
      .sort({ createdAt: -1 });

    const sessionsWithUrls = await Promise.all(
      sessions.map(async (session) => {
        const obj = session.toObject();
        obj.tracks = await Promise.all(
          obj.tracks.map(async (track) => ({
            ...track,
            r2Url: track.r2Key ? await getAudioUrl(track.r2Key) : null,
          }))
        );
        return obj;
      })
    );

    res.json({ sessions: sessionsWithUrls });
  } catch (err) {
    console.error('Fetch sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── POST /api/sessions ────────────────────────────────────────────────────────
// Flow:
//   1. Validate patient + files
//   2. Upload 4 WAVs to R2
//   3. Save Session to MongoDB
//   4. Download WAVs from R2 to temp → run analyser.py → save result
//   5. Update hospital usage counters
//   6. Return session + analysis
router.post('/', auth, requireRole('Doctor', 'Admin'),
  upload.fields([
    { name: 'aa',    maxCount: 1 },
    { name: 'glide', maxCount: 1 },
    { name: 'mpt',   maxCount: 1 },
    { name: 'text',  maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { patientId } = req.body;
      if (!patientId) return res.status(400).json({ error: 'patientId is required' });

      const SUFFIXES = ['aa', 'glide', 'mpt', 'text'];
      const files    = req.files || {};
      const missing  = SUFFIXES.filter((s) => !files[s] || !files[s][0]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Missing tracks: ${missing.join(', ')}` });
      }

      const patient = await Patient.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      if (req.user.role === 'Doctor' && patient.doctorID.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Fetch the patient's gender for the analyser
      // Gender is stored on the patient document as 'Male' or 'Female'
      const gender = patient.gender || 'Male';

      const existingCount = await Session.countDocuments({ patientID: patient._id });
      const sessionNumber = existingCount + 1;
      const sessionID     = generateID('SES');

      const dt       = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
      const fileBase = `${patient.patientID}_${sessionNumber}_${dt}`;

      // Upload all 4 tracks to R2 concurrently
      const tracks = await Promise.all(
        SUFFIXES.map(async (suffix) => {
          const file     = files[suffix][0];
          const fileName = `${fileBase}_${suffix}.wav`;
          const r2Key    = buildTrackKey(
            patient.hospitalID.toString(),
            patient._id.toString(),
            sessionID,
            fileName
          );

          await uploadAudio(file.buffer, r2Key, 'audio/wav');

          return {
            taskSuffix:    suffix,
            fileName,
            r2Key,
            r2Url:         null,
            fileSizeBytes: file.size,
          };
        })
      );

      // Save session to MongoDB first (so it exists even if analysis fails)
      const session = await Session.create({
        sessionID,
        sessionNumber,
        patientID:  patient._id,
        doctorID:   req.user._id,
        hospitalID: patient.hospitalID,
        tracks,
      });

      // Run Python analysis — downloads from R2, runs analyser.py, parses output
      const analysis = await runAnalysis(tracks, gender);

      if (analysis) {
        session.analysis       = analysis;
        session.compositeScore = analysis.composite;

        // Generate PDF report and upload to R2 alongside the audio files.
        // Stored at {hospitalID}/{patientID}/{sessionID}/report.pdf
        try {
          const pdfBuffer = await generatePdfBuffer({
            patient,
            session:      { sessionNumber, createdAt: session.createdAt },
            analysis,
            doctor:       req.user,
            hospitalName: req.user?.hospitalID?.name || '',
          });

          const pdfKey = `${patient.hospitalID}/${patient._id}/${sessionID}/report.pdf`;
          await uploadAudio(pdfBuffer, pdfKey, 'application/pdf');
          session.reportPdfLink = pdfKey;  // store R2 key; fresh URL generated on demand
          console.log('[SwaraVoice] PDF uploaded to R2:', pdfKey);
        } catch (pdfErr) {
          // PDF failure never blocks session save
          console.error('[SwaraVoice] PDF generation failed:', pdfErr.message);
        }

        await session.save();
      }

      // Update hospital usage counters
      const totalBytes = tracks.reduce((acc, t) => acc + t.fileSizeBytes, 0);
      await Hospital.findByIdAndUpdate(patient.hospitalID, {
        $inc: {
          'usage.totalSessions': 1,
          'usage.storageBytes':  totalBytes,
        },
        $set: { 'usage.lastActivityAt': new Date() },
      });

      // Generate fresh presigned URLs for immediate playback
      const sessionObj = session.toObject();
      sessionObj.tracks = await Promise.all(
        sessionObj.tracks.map(async (track) => ({
          ...track,
          r2Url: await getAudioUrl(track.r2Key),
        }))
      );

      res.status(201).json({ session: sessionObj });
    } catch (err) {
      console.error('Create session error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);


// ── GET /api/sessions/:id/report ──────────────────────────────────────────────
// Returns a fresh presigned URL for the session's PDF report.
// Presigned URLs expire after 1 hour, so we always regenerate one here rather
// than storing the URL itself in MongoDB (we store only the R2 key).
//
// If no report exists yet but analysis data is present, generates the PDF
// on-demand, uploads to R2, and returns the fresh URL.
router.get('/:id/report', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).populate('patientID doctorID');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Scope check
    if (req.user.role === 'Doctor' && session.doctorID._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'Admin' && session.hospitalID.toString() !== req.user.hospitalID.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let pdfKey = session.reportPdfLink;  // we store the R2 key, not a URL

    if (!pdfKey) {
      // No report stored yet — generate it now if analysis exists
      if (!session.analysis) {
        return res.status(404).json({ error: 'No analysis available for this session yet.' });
      }

      const patient = session.patientID;  // populated above
      const doctor  = session.doctorID;

      const pdfBuffer = await generatePdfBuffer({
        patient,
        session: { sessionNumber: session.sessionNumber, createdAt: session.createdAt },
        analysis: session.analysis,
        doctor,
        hospitalName: doctor?.hospitalID?.name || '',
      });

      pdfKey = `${session.hospitalID}/${patient._id}/${session.sessionID}/report.pdf`;
      await uploadAudio(pdfBuffer, pdfKey, 'application/pdf');

      session.reportPdfLink = pdfKey;
      await session.save();
      console.log('[SwaraVoice] On-demand PDF generated and uploaded:', pdfKey);
    }

    // Generate a fresh presigned URL (1-hour expiry)
    const reportUrl = await getAudioUrl(pdfKey);
    res.json({ reportUrl });

  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;