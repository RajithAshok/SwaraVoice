/**
 * SwaraVoice PDF Report Generator
 * ==============================
 * Generates a single-page clinical voice analysis report as a downloadable PDF.
 * Uses jsPDF + jspdf-autotable (both must be installed):
 *
 *   npm install jspdf jspdf-autotable
 *
 * Usage:
 *   import { generateReport } from './utils/generateReport';
 *   generateReport({ patient, session, analysis, doctor, hospitalName });
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Colour palette (matches SwaraVoice dark UI, adapted for white paper) ────────
const C = {
  navy:       [12,  24,  40],   // #0C1828 — headings
  blue:       [16,  31,  52],   // #101F34 — card bg on screen, used for table header
  cyan:       [56, 189, 248],   // #38BDF8 — accent
  cyanDark:   [14,  95, 135],   // darker cyan for print
  green:      [16, 185, 129],   // good score
  amber:      [245,159, 11],    // mid score
  rose:       [244, 63, 94],    // poor score
  muted:      [100,130,155],    // labels
  border:     [220,230,240],    // table borders
  white:      [255,255,255],
  lightGray:  [245,248,251],    // alternating row bg
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

function fmt(v, decimals = 2) {
  if (v == null || v === undefined) return '—';
  return Number(v).toFixed(decimals);
}

// Draw a horizontal score bar (x, y, width, height, score 0-100)
function drawScoreBar(doc, x, y, w, h, score) {
  // Background track
  doc.setFillColor(...C.border);
  doc.roundedRect(x, y, w, h, 1, 1, 'F');
  // Filled portion
  if (score != null && score > 0) {
    const filled = (score / 100) * w;
    const col = scoreColor(score);
    doc.setFillColor(...col);
    doc.roundedRect(x, y, filled, h, 1, 1, 'F');
  }
}

export function generateReport({ patient, session, analysis, doctor, hospitalName }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210;  // page width mm
  const PH = 297;  // page height mm
  const ML = 14;   // margin left
  const MR = 14;   // margin right
  const CW = PW - ML - MR;  // content width

  let y = 0;  // current Y cursor

  // ── HEADER BAND ────────────────────────────────────────────────────────────
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, PW, 28, 'F');

  // SwaraVoice wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.cyan);
  doc.text('SwaraVoice', ML, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.white);
  doc.text('Voice Analysis Report', ML, 18);

  // Hospital name — right aligned
  if (hospitalName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    doc.text(hospitalName, PW - MR, 12, { align: 'right' });
  }

  // Report date — right aligned
  const reportDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 210, 230);
  doc.text(`Generated: ${reportDate}`, PW - MR, 18, { align: 'right' });

  // Cyan accent line under header
  doc.setFillColor(...C.cyan);
  doc.rect(0, 28, PW, 0.8, 'F');

  y = 36;

  // ── PATIENT + SESSION INFO ─────────────────────────────────────────────────
  // Two-column info block
  const col1x = ML;
  const col2x = ML + CW / 2 + 4;
  const colW  = CW / 2 - 4;

  const sessionDate = session?.createdAt
    ? new Date(session.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—';

  const patientAge = (() => {
    if (!patient?.dateOfBirth) return '—';
    const dob   = new Date(patient.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    if (today.getMonth() < dob.getMonth() ||
       (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
    return `${age} yrs`;
  })();

  const infoLeft = [
    ['Patient Name',   patient?.name      || '—'],
    ['Patient ID',     patient?.patientID || '—'],
    ['Age',            patientAge],
    ['Gender',         patient?.gender    || '—'],
  ];
  const infoRight = [
    ['Session No.',    `#${session?.sessionNumber || '—'}`],
    ['Session Date',   sessionDate],
    ['Recording Doctor', doctor?.name || '—'],
    ['Diagnosis',      patient?.diagnosis || '—'],
  ];

  const drawInfoBlock = (rows, x) => {
    rows.forEach(([label, value], i) => {
      const iy = y + i * 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.muted);
      doc.text(label, x, iy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.navy);
      doc.text(value, x, iy + 4);
    });
  };

  drawInfoBlock(infoLeft,  col1x);
  drawInfoBlock(infoRight, col2x);

  // Vertical divider between columns
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(ML + CW / 2, y - 2, ML + CW / 2, y + 28);

  y += 34;

  // Thin separator
  doc.setFillColor(...C.border);
  doc.rect(ML, y, CW, 0.3, 'F');
  y += 6;

  // ── COMPOSITE SCORE ────────────────────────────────────────────────────────
  const composite = analysis?.composite ?? null;
  const compCol   = scoreColor(composite);

  // Score circle (drawn as filled circle with number)
  const circleX = ML + 18;
  const circleY = y + 10;
  const circleR = 10;
  doc.setFillColor(...compCol);
  doc.circle(circleX, circleY, circleR, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.white);
  const scoreStr = composite != null ? String(composite) : '—';
  doc.text(scoreStr, circleX, circleY + 1.5, { align: 'center' });

  // "Composite Score" label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Composite Voice \nScore', ML + 32, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text(`Overall rating: ${scoreLabel(composite)}`, ML + 32, y + 12 + 3);

  // Subset scores — three cards to the right
  const subsets = [
    { label: 'Stability',  value: analysis?.stability  },
    { label: 'Clarity',    value: analysis?.clarity    },
    { label: 'Efficiency', value: analysis?.efficiency },
  ];
  const cardW  = 34;
  const cardGap = 4;
  const cardsStartX = PW - MR - (cardW * 3 + cardGap * 2);
  subsets.forEach(({ label, value }, i) => {
    const cx = cardsStartX + i * (cardW + cardGap);
    const col = scoreColor(value);
    // Card background
    doc.setFillColor(...C.lightGray);
    doc.roundedRect(cx, y, cardW, 18, 2, 2, 'F');
    doc.setDrawColor(...col);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx, y, cardW, 18, 2, 2, 'S');
    // Score value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...col);
    doc.text(value != null ? String(value) : '—', cx + cardW / 2, y + 8, { align: 'center' });
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(label, cx + cardW / 2, y + 14, { align: 'center' });
    // Score bar
    drawScoreBar(doc, cx + 3, y + 15.5, cardW - 6, 1.5, value);
  });

  y += 26;

  // ── METRIC SCORES TABLE ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.navy);
  doc.text('Metric Scores', ML, y);
  y += 4;

  const metricRows = [
    ['Jitter',       'Sustained vowel',  fmt(analysis?.raw?.jitter,  4) + ' %',  analysis?.scores?.jitter,  'Lower is better — measures cycle-to-cycle pitch irregularity'],
    ['Shimmer',      'Sustained vowel',  fmt(analysis?.raw?.shimmer, 4) + ' %',  analysis?.scores?.shimmer, 'Lower is better — measures amplitude variation between cycles'],
    ['F0 SD',        'Sustained vowel',  fmt(analysis?.raw?.f0_sd,   3) + ' Hz', analysis?.scores?.f0_sd,   'Lower is better — pitch stability during sustained phonation'],
    ['HNR',          'Sustained vowel',  fmt(analysis?.raw?.hnr,     3) + ' dB', analysis?.scores?.hnr,     'Higher is better — ratio of periodic to noise signal'],
    ['CPPS',         'Reading passage',  fmt(analysis?.raw?.cpps,    3) + ' dB', analysis?.scores?.cpps,    'Higher is better — cepstral measure of vocal clarity'],
    ['MPT',          'Max phonation',    fmt(analysis?.raw?.mpt,     2) + ' s',  analysis?.scores?.mpt,     'Higher is better — maximum sustained phonation duration'],
    ['Pitch Range',  'Pitch glide',      fmt(analysis?.raw?.pitch_range, 1) + ' Hz', analysis?.scores?.glide, 'Higher is better — vocal frequency range during glide task'],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Metric', 'Task', 'Raw Value', 'Score /100', 'Rating', 'Notes']],
    body: metricRows.map(([metric, task, raw, score, note]) => [
      metric, task, raw,
      score != null ? score : '—',
      scoreLabel(score),
      note,
    ]),
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: C.navy,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.navy,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: C.lightGray },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      1: { cellWidth: 28, textColor: C.muted },
      2: { cellWidth: 22, halign: 'right', font: 'courier' },
      3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 'auto', textColor: C.muted, fontSize: 7 },
    },
    // Colour the Score and Rating cells based on value
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 3 || data.column.index === 4)) {
        const score = metricRows[data.row.index]?.[3];
        if (score != null) {
          data.cell.styles.textColor = scoreColor(score);
        }
      }
    },
    didDrawCell: (data) => {
      // Draw a mini score bar inside the Score cell
      if (data.section === 'body' && data.column.index === 3) {
        const score = metricRows[data.row.index]?.[3];
        if (score != null) {
          const bx = data.cell.x + 2;
          const by = data.cell.y + data.cell.height - 2.5;
          drawScoreBar(doc, bx, by, data.cell.width - 4, 1.2, score);
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── INFO-ONLY VALUES ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.navy);
  doc.text('Reference Values (Info Only)', ML, y);
  y += 4;

  const infoChips = [
    { label: 'F0 Mean',   value: fmt(analysis?.raw?.f0_mean,      1) + ' Hz' },
    { label: 'F0 Min',    value: fmt(analysis?.raw?.f0_min,       1) + ' Hz' },
    { label: 'F0 Max',    value: fmt(analysis?.raw?.f0_max,       1) + ' Hz' },
    { label: 'Glide Min', value: fmt(analysis?.raw?.glide_min_f0, 1) + ' Hz' },
    { label: 'Glide Max', value: fmt(analysis?.raw?.glide_max_f0, 1) + ' Hz' },
  ];

  const chipW   = (CW - (infoChips.length - 1) * 3) / infoChips.length;
  infoChips.forEach(({ label, value }, i) => {
    const cx = ML + i * (chipW + 3);
    doc.setFillColor(...C.lightGray);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, chipW, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(label, cx + chipW / 2, y + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.navy);
    doc.text(value, cx + chipW / 2, y + 9.5, { align: 'center' });
  });

  y += 18;

  // ── SCORING FORMULA NOTE ───────────────────────────────────────────────────
  doc.setFillColor(235, 244, 252);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.navy);
  doc.text('Composite Score Formula', ML + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(
    'Composite = 0.4 × Stability + 0.4 × Clarity + 0.2 × Efficiency   |   ' +
    'Stability = avg(Jitter, Shimmer, F0 SD)   |   ' +
    'Clarity = avg(HNR, CPPS)   |   ' +
    '\nEfficiency = avg(MPT, Pitch Range)',
    ML + 4, y + 10,
  );

  y += 20;

  // ── SCORE SCALE LEGEND ────────────────────────────────────────────────────
  const legend = [
    { color: C.green, label: '65 – 100  Good' },
    { color: C.amber, label: '40 – 64   Moderate' },
    { color: C.rose,  label: '0  – 39   Poor' },
  ];
  legend.forEach(({ color, label }, i) => {
    const lx = ML + i * 55;
    doc.setFillColor(...color);
    doc.roundedRect(lx, y, 6, 3.5, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(label, lx + 8, y + 3);
  });

  y += 10;

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.navy);
  doc.rect(0, PH - 12, PW, 12, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 160, 200);
  doc.text(
    'SwaraVoice — Clinical Voice Monitoring Platform. This report is intended for clinical use only.',
    ML, PH - 5,
  );
  doc.text('Page 1 of 1', PW - MR, PH - 5, { align: 'right' });

  // ── SAVE ───────────────────────────────────────────────────────────────────
  const fileName = `SwaraVoice_${patient?.patientID || 'Report'}_Session${session?.sessionNumber || ''}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}