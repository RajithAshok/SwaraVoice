/**
 * SwaraVoice PDF Report Generator (Node / pdfkit)
 * ===============================================
 * Generates a clinical voice analysis report as a Buffer.
 * Called by sessions.js after analysis completes -- the buffer is uploaded
 * directly to R2, never written to disk.
 *
 * Install: npm install pdfkit
 *
 * @param {object} opts
 * @param {object} opts.patient       - Patient document from MongoDB
 * @param {object} opts.session       - Session document (sessionNumber, createdAt)
 * @param {object} opts.analysis      - Full analysis object from analyser.py
 * @param {object} opts.doctor        - User document for the recording doctor
 * @param {string} opts.hospitalName  - Hospital display name
 * @returns {Promise<Buffer>}
 */

const PDFDocument = require('pdfkit');

const C = {
  navy:      '#0C1828',
  cyan:      '#38BDF8',
  green:     '#10B981',
  amber:     '#F59E0B',
  rose:      '#F43F5E',
  muted:     '#4A6F8A',
  border:    '#D8E8F2',
  white:     '#FFFFFF',
  lightGray: '#F5F8FB',
  textMain:  '#0C1828',
  footerText:'#7FC0E8',
};

function scoreColor(score) {
  if (score == null) return C.muted;
  if (score >= 65)   return C.green;
  if (score >= 40)   return C.amber;
  return C.rose;
}

function scoreLabel(score) {
  if (score == null) return '—';
  if (score >= 65)   return 'Good';
  if (score >= 40)   return 'Moderate';
  return 'Poor';
}

function fmt(v, d = 2) {
  if (v == null) return '—';
  return Number(v).toFixed(d);
}

function calcAge(dateOfBirth) {
  if (!dateOfBirth) return '—';
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
     (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return `${age} yrs`;
}

function generatePdfBuffer({ patient, session, analysis, doctor, hospitalName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:   'A4',
      margin: 0,
      info: {
        Title:   `SwaraVoice Report — ${patient?.name || ''}`,
        Author:  'SwaraVoice',
        Subject: 'Clinical Voice Analysis Report',
      },
    });

    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const ML = 40;
    const MR = 40;
    const CW = PW - ML - MR;

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 70).fill(C.navy);

    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.cyan)
       .text('SwaraVoice', ML, 18, { continued: true })
       .font('Helvetica').fillColor(C.white)
       .text('  Voice Analysis Report');

    if (hospitalName) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white)
         .text(hospitalName, ML, 20, { width: CW, align: 'right' });
    }

    const reportDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
       .text(`Generated: ${reportDate}`, ML, 34, { width: CW, align: 'right' });

    doc.rect(0, 70, PW, 3).fill(C.cyan);

    let y = 86;

    // ── PATIENT / SESSION INFO ────────────────────────────────────────────────
    const col1x = ML;
    const col2x = ML + CW / 2 + 10;

    const sessionDate = session?.createdAt
      ? new Date(session.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

    const infoLeft  = [
      ['Patient Name',  patient?.name      || '—'],
      ['Patient ID',    patient?.patientID || '—'],
      ['Age',           calcAge(patient?.dateOfBirth)],
      ['Gender',        patient?.gender    || '—'],
    ];
    const infoRight = [
      ['Session No.',       `#${session?.sessionNumber || '—'}`],
      ['Session Date',      sessionDate],
      ['Recording Doctor',  doctor?.name || '—'],
      //['Diagnosis',         patient?.diagnosis || '—'],
    ];

    const drawInfoCol = (rows, x) => {
      rows.forEach(([label, value], i) => {
        const iy = y + i * 20;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(label, x, iy);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.textMain)
           .text(String(value), x, iy + 8, { width: CW / 2 - 14 });
      });
    };

    drawInfoCol(infoLeft,  col1x);
    drawInfoCol(infoRight, col2x);

    // Vertical divider
    doc.moveTo(ML + CW / 2, y - 4)
       .lineTo(ML + CW / 2, y + 82)
       .strokeColor(C.border).lineWidth(0.5).stroke();

    y += 94;

    // Separator
    doc.rect(ML, y, CW, 0.5).fill(C.border);
    y += 10;

    // ── COMPOSITE SCORE ───────────────────────────────────────────────────────
    const composite = analysis?.composite ?? null;
    const compColor = scoreColor(composite);

    // Circle
    doc.circle(ML + 22, y + 16, 18).fill(compColor);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.white)
       .text(composite != null ? String(composite) : '—', ML + 4, y + 9, {
         width: 36, align: 'center',
       });

    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.textMain)
       .text('Composite Voice Score', ML + 48, y + 4);
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
       .text(`Overall rating: ${scoreLabel(composite)}`, ML + 48, y + 20);

    // Subset cards
    const subsets = [
      { label: 'Stability',  value: analysis?.stability  },
      { label: 'Clarity',    value: analysis?.clarity    },
      { label: 'Efficiency', value: analysis?.efficiency },
    ];
    const boxW      = 78;
    const boxGap    = 8;
    const boxStartX = PW - MR - (boxW * 3 + boxGap * 2);

    subsets.forEach(({ label, value }, i) => {
      const bx  = boxStartX + i * (boxW + boxGap);
      const col = scoreColor(value);
      doc.rect(bx, y, boxW, 38).fill(C.lightGray);
      doc.rect(bx, y, boxW, 38).strokeColor(col).lineWidth(1).stroke();
      doc.font('Helvetica-Bold').fontSize(18).fillColor(col)
         .text(value != null ? String(value) : '—', bx, y + 6, { width: boxW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
         .text(label, bx, y + 26, { width: boxW, align: 'center' });
      // Mini bar
      const barX = bx + 6;
      const barY = y + 33;
      const barW = boxW - 12;
      doc.rect(barX, barY, barW, 2.5).fill(C.border);
      if (value) doc.rect(barX, barY, (value / 100) * barW, 2.5).fill(col);
    });

    y += 52;

    // ── METRIC TABLE ──────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.textMain)
       .text('Metric Scores', ML, y-3);
    y += 8;

    const metrics = [
      { name: 'Jitter',      task: 'Sustained vowel', raw: fmt(analysis?.raw?.jitter,  4)+' %',  score: analysis?.scores?.jitter,  note: 'Cycle-to-cycle pitch irregularity — lower is better' },
      { name: 'Shimmer',     task: 'Sustained vowel', raw: fmt(analysis?.raw?.shimmer, 4)+' %',  score: analysis?.scores?.shimmer, note: 'Amplitude variation between cycles — lower is better' },
      { name: 'F0 SD',       task: 'Sustained vowel', raw: fmt(analysis?.raw?.f0_sd,   3)+' Hz', score: analysis?.scores?.f0_sd,   note: 'Pitch stability during phonation — lower is better' },
      { name: 'HNR',         task: 'Sustained vowel', raw: fmt(analysis?.raw?.hnr,     3)+' dB', score: analysis?.scores?.hnr,     note: 'Harmonic-to-noise ratio — higher is better' },
      { name: 'CPPS',        task: 'Reading passage', raw: fmt(analysis?.raw?.cpps,    3)+' dB', score: analysis?.scores?.cpps,    note: 'Cepstral peak prominence — higher is better' },
      { name: 'MPT',         task: 'Max phonation',   raw: fmt(analysis?.raw?.mpt,     2)+' s',  score: analysis?.scores?.mpt,     note: 'Max sustained phonation duration — higher is better' },
      { name: 'Pitch Range', task: 'Pitch glide',     raw: fmt(analysis?.raw?.pitch_range,1)+' Hz', score: analysis?.scores?.glide, note: 'Vocal frequency range — higher is better' },
    ];

    // Column x positions
    const colX = [ML, ML+72, ML+158, ML+218, ML+272, ML+328];
    const rowH = 21;

    // Header row
    doc.rect(ML, y, CW, rowH).fill(C.navy);
    ['Metric', 'Task', 'Raw Value', 'Score', 'Rating', 'Notes'].forEach((h, i) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
         .text(h, colX[i] + 3, y + 7, { width: (colX[i+1] || ML+CW) - colX[i] - 6 });
    });
    y += rowH;

    metrics.forEach(({ name, task, raw, score, note }, idx) => {
      doc.rect(ML, y, CW, rowH).fill(idx % 2 === 0 ? C.white : C.lightGray);
      doc.rect(ML, y + rowH - 0.5, CW, 0.5).fill(C.border);

      const sColor = scoreColor(score);
      [
        { t: name,                         f: 'Helvetica-Bold', c: C.textMain },
        { t: task,                         f: 'Helvetica',      c: C.muted    },
        { t: raw,                          f: 'Helvetica',      c: C.textMain },
        { t: score != null ? String(score) : '—', f: 'Helvetica-Bold', c: sColor },
        { t: scoreLabel(score),            f: 'Helvetica',      c: sColor     },
        { t: note,                         f: 'Helvetica',      c: C.muted    },
      ].forEach(({ t, f, c }, i) => {
        doc.font(f).fontSize(7.5).fillColor(c)
           .text(t, colX[i] + 3, y + 7, {
             width:    (colX[i+1] || ML + CW) - colX[i] - 6,
             ellipsis: true,
           });
      });

      // Mini bar inside Score cell
      if (score != null) {
        const bx = colX[3] + 3;
        const bw = colX[4] - colX[3] - 6;
        doc.rect(bx, y + rowH - 4.5, bw, 2).fill(C.border);
        doc.rect(bx, y + rowH - 4.5, (score / 100) * bw, 2).fill(sColor);
      }

      y += rowH;
    });

    y += 14;

    // ── INFO-ONLY VALUES ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.textMain)
       .text('Reference Values (Info Only)', ML, y-3);
    y += 10;

    const chips = [
      { label: 'F0 Mean',   value: fmt(analysis?.raw?.f0_mean,      1) + ' Hz' },
      { label: 'F0 Min',    value: fmt(analysis?.raw?.f0_min,       1) + ' Hz' },
      { label: 'F0 Max',    value: fmt(analysis?.raw?.f0_max,       1) + ' Hz' },
      { label: 'Glide Min', value: fmt(analysis?.raw?.glide_min_f0, 1) + ' Hz' },
      { label: 'Glide Max', value: fmt(analysis?.raw?.glide_max_f0, 1) + ' Hz' },
    ];
    const chipW = (CW - (chips.length - 1) * 6) / chips.length;
    chips.forEach(({ label, value }, i) => {
      const bx = ML + i * (chipW + 6);
      doc.rect(bx, y, chipW, 28).fill(C.lightGray);
      doc.rect(bx, y, chipW, 28).strokeColor(C.border).lineWidth(0.4).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(C.muted)
         .text(label, bx, y + 5, { width: chipW, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.textMain)
         .text(value, bx, y + 15, { width: chipW, align: 'center' });
    });

    y += 38;

    // ── FORMULA NOTE ─────────────────────────────────────────────────────────
    doc.rect(ML, y, CW, 37).fill('#EBF4FC');
    doc.rect(ML, y, CW, 37).strokeColor(C.border).lineWidth(0.4).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.textMain)
       .text('Composite Score Formula', ML + 8, y + 7);
    doc.font('Helvetica').fontSize(7).fillColor(C.muted)
       .text(
         'Composite = 0.4 × Stability + 0.4 × Clarity + 0.2 × Efficiency   |   ' +
         'Stability = avg(Jitter, Shimmer, F0 SD)   |   Clarity = avg(HNR, CPPS)   |   ' +
         '\nEfficiency = avg(MPT, Pitch Range)',
         ML + 8, y + 18, { width: CW - 16 },
       );

    y += 50;

    // ── SCORE LEGEND ─────────────────────────────────────────────────────────
    [
      { color: C.green, label: '65 – 100   Good' },
      { color: C.amber, label: '40 – 64    Moderate' },
      { color: C.rose,  label: '0 – 39     Poor' },
    ].forEach(({ color, label }, i) => {
      const lx = ML + i * 130;
      doc.rect(lx, y, 10, 8).fill(color);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
         .text(label, lx + 14, y + 1);
    });

    // ── FOOTER ───────────────────────────────────────────────────────────────
    doc.rect(0, PH - 28, PW, 28).fill(C.navy);
    doc.font('Helvetica').fontSize(7).fillColor(C.footerText)
       .text(
         'SwaraVoice — Clinical Voice Monitoring Platform. This report is intended for clinical use only.',
         ML, PH - 17,
       )
       .text('Page 1 of 1', ML, PH - 17, { width: CW, align: 'right' });

    doc.end();
  });
}

module.exports = { generatePdfBuffer };