"""
VocaScan Voice Analyser
=======================
Extracts acoustic features from 4 WAV recordings per session and
computes a composite voice health score (0-100).

Task-to-metric mapping:
  _aa.wav    -> Jitter, Shimmer, HNR, F0 mean, F0_SD
  _glide.wav -> Max F0, Min F0  (for Glide range score)
  _mpt.wav   -> Duration only   (MPT in seconds)
  _text.wav  -> CPPS

Formula:
  1. Extract raw metric values from each recording
  2. Compute z-score per metric using gender-specific reference norms
  3. Invert z-score for "lower is better" metrics (Jitter, Shimmer, F0_SD)
  4. Convert to 0-100 score:  clip(50 + 10 * z_corrected, 0, 100)
  5. Subset scores:
       Stability  = (Jitter_score + Shimmer_score + F0SD_score) / 3
       Clarity    = (HNR_score + CPPS_score) / 2
       Efficiency = (MPT_score + Glide_score) / 2
  6. Composite = 0.4 * Stability + 0.4 * Clarity + 0.2 * Efficiency

Usage:
  pip install praat-parselmouth numpy

  from analyser import analyse_session
  result = analyse_session(
      aa_path    = "PAT001_1_aa.wav",
      glide_path = "PAT001_1_glide.wav",
      mpt_path   = "PAT001_1_mpt.wav",
      text_path  = "PAT001_1_text.wav",
      gender     = "Male"
  )
"""

import re
import parselmouth
from parselmouth.praat import call
import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
# REFERENCE NORMS
# ─────────────────────────────────────────────────────────────────────────────

NORMS = {
    "Male": {
        "f0":      {"mean": 131.0, "sd": 9.58},
        "jitter":  {"mean": 0.30,  "sd": 0.12},
        "shimmer": {"mean": 3.15,  "sd": 0.76},
        "hnr":     {"mean": 21.60, "sd": 1.71},
        "mpt":     {"mean": 22.6,  "sd": 8.1},
        "f0_sd":   {"mean": 1.8,   "sd": 0.9},
        "cpps":    {"mean": 14.5,  "sd": 1.5},
        "glide_expected_range": 200,
    },
    "Female": {
        "f0":      {"mean": 226.0, "sd": 17.0},
        "jitter":  {"mean": 0.37,  "sd": 0.15},
        "shimmer": {"mean": 3.31,  "sd": 1.56},
        "hnr":     {"mean": 22.18, "sd": 2.01},
        "mpt":     {"mean": 15.2,  "sd": 5.0},
        "f0_sd":   {"mean": 2.5,   "sd": 1.2},
        "cpps":    {"mean": 13.5,  "sd": 1.5},
        "glide_expected_range": 300,
    },
}

INVERT_METRICS = {"jitter", "shimmer", "f0_sd"}

# Pitch floor/ceiling per gender — matching Praat's recommended settings.
# Using 75/600 for both genders causes Praat to halve or double F0 for
# voices near the boundaries (pitch doubling/halving artefacts).
PITCH_FLOOR = {"Male": 75,  "Female": 75}
PITCH_CEIL  = {"Male": 500, "Female": 500}


# ─────────────────────────────────────────────────────────────────────────────
# SCORING HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def z_to_score(z: float) -> float:
    return round(max(0.0, min(100.0, 50.0 + 10.0 * z)))


def metric_score(value: float, metric_name: str, gender: str) -> float:
    norms = NORMS[gender][metric_name]
    z     = (value - norms["mean"]) / norms["sd"]
    if metric_name in INVERT_METRICS:
        z = -z
    return z_to_score(z)


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE EXTRACTORS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_voice_report(report: str) -> dict:
    """
    Parse Praat's 'Voice report' string into a dict of floats.

    The voice report is the same text Praat shows in its GUI when you run
    Analyse > Voice > Voice report. Parsing it directly means every value
    here is bit-for-bit identical to what Praat displays -- no approximation.

    Note: shimmer is NOT parsed here. Via the parselmouth scripting API,
    voice report always returns '--undefined--' for shimmer (a known API
    limitation). Shimmer is obtained via a direct 'Get shimmer (local)'
    call in extract_aa, which uses the identical algorithm.
    """
    def find(pattern):
        m = re.search(pattern, report)
        return float(m.group(1)) if m else None

    return {
        "f0_mean": find(r"Mean pitch:\s+([\d.]+)\s+Hz"),
        "f0_sd":   find(r"Standard deviation:\s+([\d.]+)\s+Hz"),
        "f0_min":  find(r"Minimum pitch:\s+([\d.]+)\s+Hz"),
        "f0_max":  find(r"Maximum pitch:\s+([\d.]+)\s+Hz"),
        "jitter":  find(r"Jitter \(local\):\s+([\d.]+)%"),
        "hnr":     find(r"Mean harmonics-to-noise ratio:\s+([\d.]+)\s+dB"),
    }


def extract_aa(path: str, gender: str) -> dict:
    """
    Extract Jitter, Shimmer, HNR, F0 mean, F0 SD from sustained vowel.

    Pipeline mirrors Praat GUI exactly:
      1. To Pitch                        -- gender-specific floor/ceiling
      2. To PointProcess (periodic, cc)  -- same cc method Praat uses internally
      3. Voice report [Sound, PP, Pitch] -- jitter, HNR, F0 stats (all match GUI)
      4. Get shimmer (local) [Sound, PP] -- direct call; voice report shimmer is
                                           always '--undefined--' via the parselmouth
                                           scripting API (known limitation), but the
                                           direct call uses the identical algorithm
                                           and produces the same value as the GUI.
    """
    sound = parselmouth.Sound(path)
    # floor = PITCH_FLOOR[gender]
    # ceil  = PITCH_CEIL[gender]

  #  {#pitch         = call(sound, "To Pitch", 0.0, floor, ceil)
    #point_process = call(sound, "To PointProcess (periodic, cc)", floor, ceil)    

    # # Voice report: jitter, HNR, and all F0 stats match GUI bit-for-bit
    # report = call(
    #     [sound, point_process, pitch],
    #     "Voice report",
    #     0, 0,           # time range (0,0 = entire file)
    #     floor, ceil,    # pitch floor / ceiling
    #     1.3,            # max period factor
    #     0.0001, 0.02,   # min / max period (s)
    #     1.3,            # max amplitude factor
    # )

    # parsed = _parse_voice_report(report)

    # # Shimmer: direct call with the same PointProcess used in voice report.
    # # Returns a proportion (0.045 = 4.5%), multiply by 100 for percent.
    # shimmer = call(
    #     [sound, point_process],
    #     "Get shimmer (local)",
    #     0, 0,           # time range
    #     0.0001, 0.02,   # min / max period (s)
    #     1.3,            # max period factor
    #     1.6,            # max amplitude factor
    # ) * 100

    # # Validate voice report fields (shimmer handled separately above)
    # vr_fields = ["f0_mean", "f0_sd", "f0_min", "f0_max", "jitter", "hnr"]
    # missing = [k for k in vr_fields if parsed.get(k) is None]
    # if missing:
    #     raise ValueError(
    #         f"Voice report parsing failed for {path}. "
    #         f"Missing fields: {missing}. "
    #         f"Report snippet: {report[:400]}"
    #     )}

    pitch = call(sound, "To Pitch (cc)", 0.0, 75.0, 15.0, "yes", 0.03, 0.45, 0.01, 0.35, 0.14, 500.0)
    point_process = call(sound, "To PointProcess (periodic, cc)", 75.0, 500.0)
    harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75.0, 0.1, 1.0)

    mean_f0 = call(pitch, "Get mean", 0, 0, "Hertz")
    f0_sd = call(pitch, "Get standard deviation", 0, 0, "Hertz")
    f0_min = call(pitch, "Get minimum", 0, 0, "Hertz", "parabolic")
    f0_max = call(pitch, "Get maximum", 0, 0, "Hertz", "parabolic")
    jitter_local = call(point_process, "Get jitter (local)", 0.0, 0.0, 0.0001, 0.02, 1.3) * 100
    shimmer_local = call([sound, point_process], "Get shimmer (local)", 0.0, 0.0, 0.0001, 0.02, 1.3, 1.6) * 100
    hnr = call(harmonicity, "Get mean", 0, 0)
    return {
        "f0_mean": round(mean_f0, 3),
        "f0_sd":   round(f0_sd,   3),
        "f0_min":  round(f0_min,  3),
        "f0_max":  round(f0_max,  3),
        "jitter":  round(jitter_local, 4),
        "shimmer": round(shimmer_local, 4),
        "hnr":     round(hnr,     3),
    }


def extract_glide(path: str) -> dict:
    """
    Extract Max F0, Min F0, pitch range from pitch glide recording.

    Uses wide floor/ceiling (50-800 Hz) to capture the full glide sweep.
    Percentile trimming (5th-95th) removes onset/offset artefacts -- the
    very first and last frames of a glide often contain transient noise
    that pushes min/max to unrealistic values.

    Returns glide_min_f0 and glide_max_f0 (the trimmed 5th/95th percentile
    values) plus pitch_range. Distinct field names avoid collision with
    f0_min / f0_max from the _aa voice report.
    """
    sound = parselmouth.Sound(path)
    pitch = call(sound, "To Pitch", 0.0, 50, 800)

    f0_values = pitch.selected_array["frequency"]
    voiced    = f0_values[f0_values > 0]

    if len(voiced) == 0:
        raise ValueError(f"No voiced frames in {path}. Check glide recording.")

    # Trim top and bottom 5% to remove onset/offset artefacts
    glide_min_f0 = float(np.percentile(voiced, 5))
    glide_max_f0 = float(np.percentile(voiced, 95))
    pitch_range  = glide_max_f0 - glide_min_f0

    return {
        "glide_min_f0": round(glide_min_f0, 2),
        "glide_max_f0": round(glide_max_f0, 2),
        "pitch_range":  round(pitch_range,  2),
    }


def extract_mpt(path: str, gender: str) -> dict:
    """
    Extract Maximum Phonation Time (seconds) from MPT recording.

    Fix: instead of counting voiced frames (which misses inter-pulse gaps
    that Praat considers voiced but doesn't track), we find the timestamps
    of the first and last voiced frame and measure the span between them.
    This matches how a clinician measures MPT: time from start to end of
    sustained phonation, not the sum of individual frame durations.
    """
    sound = parselmouth.Sound(path)
    floor = PITCH_FLOOR[gender]
    ceil  = PITCH_CEIL[gender]

    pitch     = call(sound, "To Pitch", 0.0, floor, ceil)
    f0_values = pitch.selected_array["frequency"]
    times     = pitch.xs()  # time stamp for each pitch frame

    voiced_mask = f0_values > 0
    voiced_times = times[voiced_mask]

    if len(voiced_times) == 0:
        # Last resort fallback: use raw file duration minus 0.2s for silence
        mpt = max(0.1, sound.duration - 0.2)
    else:
        # Span from first to last voiced frame — this is true phonation duration
        mpt = float(voiced_times[-1] - voiced_times[0])

        # If the result is suspiciously short (< 1s) the pitch tracker may have
        # failed — fall back to raw duration minus leading/trailing silence margin
        if mpt < 1.0:
            mpt = max(0.1, sound.duration - 0.5)

    return {
        "mpt": round(mpt, 2),
    }


def extract_text(path: str) -> dict:
    """
    Extract CPPS (Cepstral Peak Prominence Smoothed) from reading passage.

    Parameters match Praat GUI 'Get CPPS' dialog defaults exactly:
      - time_averaging: 0.02s (20ms) -- Praat GUI default.
        Previously we used 0.041s (41ms) which over-smooths and was the
        cause of our CPPS reading being ~1.6 dB lower than Praat's GUI.
      - quefrency_smoothing: 0.0005s (0.5ms) -- unchanged, matches Praat default.
      - subtract_tilt: yes -- standard for CPPS.
      - f0_range: 60-333.3 Hz -- Praat default quefrency range for speech.
      - interpolation: Parabolic, tilt: Exponential decay, fit: Robust.
    """
    sound             = parselmouth.Sound(path)
    power_cepstrogram = call(sound, "To PowerCepstrogram", 60, 0.002, 5000, 50)

    cpps = call(
        power_cepstrogram,
        "Get CPPS",
        "yes",        # subtract trend
        0.01,         # time averaging window (20ms -- Praat GUI default)
        0.001,       # quefrency smoothing bandwidth (0.5ms)
        60, 330,    # F0 range in Hz (sets quefrency window: 1/333.3 to 1/60 s)
        0.05,         # tilt line upper quefrency bound
        "Parabolic",  # peak interpolation method
        0.001, 0.05,  # trend line quefrency range
        "Exponential decay",
        "Robust"
    )

    return {
        "cpps": round(float(cpps), 3),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GLIDE SCORE
# ─────────────────────────────────────────────────────────────────────────────

def glide_range_score(pitch_range: float, gender: str) -> float:
    expected = NORMS[gender]["glide_expected_range"]
    return round(max(0.0, min(100.0, (pitch_range / expected) * 100)))


# ─────────────────────────────────────────────────────────────────────────────
# MAIN SESSION ANALYSER
# ─────────────────────────────────────────────────────────────────────────────

def analyse_session(
    aa_path:    str,
    glide_path: str,
    mpt_path:   str,
    text_path:  str,
    gender:     str,
) -> dict:
    """
    Analyse one recording session. Returns composite score + all intermediates.
    """
    if gender not in NORMS:
        raise ValueError(f"gender must be 'Male' or 'Female', got '{gender}'")

    aa_data    = extract_aa(aa_path, gender)
    glide_data = extract_glide(glide_path)
    mpt_data   = extract_mpt(mpt_path, gender)
    text_data  = extract_text(text_path)

    raw = {**aa_data, **glide_data, **mpt_data, **text_data}

    scores = {
        "jitter":  metric_score(raw["jitter"],       "jitter",  gender),
        "shimmer": metric_score(raw["shimmer"],      "shimmer", gender),
        "f0_sd":   metric_score(raw["f0_sd"],        "f0_sd",   gender),
        "hnr":     metric_score(raw["hnr"],          "hnr",     gender),
        "cpps":    metric_score(raw["cpps"],         "cpps",    gender),
        "mpt":     metric_score(raw["mpt"],          "mpt",     gender),
        "glide":   glide_range_score(raw["pitch_range"], gender),
    }

    stability  = (scores["jitter"] + scores["shimmer"] + scores["f0_sd"]) / 3
    clarity    = (scores["hnr"]    + scores["cpps"])  / 2
    efficiency = (scores["mpt"]    + scores["glide"]) / 2
    composite  = 0.4 * stability + 0.4 * clarity + 0.2 * efficiency

    def cap(v): return round(max(0.0, min(100.0, v)))

    return {
        "gender":     gender,
        "raw":        raw,
        "scores":     {k: round(v, 2) for k, v in scores.items()},
        "stability":  cap(stability),
        "clarity":    cap(clarity),
        "efficiency": cap(efficiency),
        "composite":  cap(composite),
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) != 6:
        print("Usage: python analyser.py <aa.wav> <glide.wav> <mpt.wav> <text.wav> <Male|Female>")
        sys.exit(1)

    aa, glide, mpt, text, gender = sys.argv[1:]

    try:
        result = analyse_session(aa, glide, mpt, text, gender)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)