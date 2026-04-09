"""
Swara Voice Analysis GUI
============================
A simple desktop GUI for selecting the 4 recording files, choosing gender,
and running the analysis. Built with tkinter (standard library — no extra install).

Run:  python gui.py
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import json
import threading
import os


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def short_path(path: str) -> str:
    """Show just the filename, not the full path."""
    return os.path.basename(path) if path else "No file selected"


def score_colour(score: float) -> str:
    """Traffic-light colour for a 0-100 score."""
    if score >= 65:  return "#10B981"   # green
    if score >= 40:  return "#F59E0B"   # amber
    return                  "#F43F5E"   # red


# ─────────────────────────────────────────────────────────────────────────────
# MAIN APP
# ─────────────────────────────────────────────────────────────────────────────

class SwaraGUI:
    def __init__(self, root: tk.Tk):
        self.root  = root
        self.root.title("Swara Voice Analyser")
        self.root.resizable(False, False)
        self.root.configure(bg="#0C1828")

        # File path variables
        self.paths = {
            "aa":    tk.StringVar(value=""),
            "glide": tk.StringVar(value=""),
            "mpt":   tk.StringVar(value=""),
            "text":  tk.StringVar(value=""),
        }
        self.gender_var = tk.StringVar(value="Male")

        self._build_ui()

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        # Fonts
        font_title   = ("Helvetica", 15, "bold")
        font_label   = ("Helvetica", 10)
        font_bold    = ("Helvetica", 10, "bold")
        font_small   = ("Helvetica",  9)
        font_mono    = ("Courier",    10)
        font_score   = ("Helvetica", 28, "bold")
        font_sub     = ("Helvetica", 11, "bold")

        BG     = "#0C1828"
        CARD   = "#101F34"
        BORDER = "#1E3A5F"
        CYAN   = "#38BDF8"
        MUTED  = "#4A6F8A"
        TEXT   = "#E8F4FD"
        TEXT2  = "#7FA8C9"

        pad = {"padx": 20, "pady": 6}

        # ── Header ─────────────────────────────────────────────────────────
        hdr = tk.Frame(self.root, bg=BG)
        hdr.pack(fill="x", padx=20, pady=(20, 4))
        tk.Label(hdr, text="Swara", font=font_title, fg=CYAN, bg=BG).pack(side="left")
        tk.Label(hdr, text=" Voice Analyser", font=font_title, fg=TEXT, bg=BG).pack(side="left")

        tk.Label(self.root, text="Select the 4 recordings and patient gender, then run analysis.",
                 font=font_small, fg=MUTED, bg=BG).pack(anchor="w", padx=20, pady=(0, 12))

        # ── File pickers ────────────────────────────────────────────────────
        tasks = [
            ("aa",    "①  Sustained Vowel",         "_aa.wav"),
            ("glide", "②  Pitch Glide",              "_glide.wav"),
            ("mpt",   "③  Maximum Phonation Time",   "_mpt.wav"),
            ("text",  "④  Reading Passage",          "_text.wav"),
        ]

        files_frame = tk.Frame(self.root, bg=CARD, bd=0, relief="flat",
                               highlightbackground=BORDER, highlightthickness=1)
        files_frame.pack(fill="x", padx=20, pady=4)

        self.file_labels = {}
        for key, label, suffix in tasks:
            row = tk.Frame(files_frame, bg=CARD)
            row.pack(fill="x", padx=14, pady=6)

            tk.Label(row, text=label, font=font_bold, fg=TEXT, bg=CARD,
                     width=26, anchor="w").pack(side="left")

            lbl = tk.Label(row, text="No file selected", font=font_small,
                           fg=MUTED, bg=CARD, width=32, anchor="w")
            lbl.pack(side="left", padx=8)
            self.file_labels[key] = lbl

            btn = tk.Button(row, text="Browse",
                            font=font_small, fg=TEXT, bg="#1E3A5F",
                            activebackground=CYAN, activeforeground="#0C1828",
                            relief="flat", padx=10, pady=3,
                            command=lambda k=key, s=suffix: self._browse(k, s))
            btn.pack(side="right")

        # ── Gender selector ─────────────────────────────────────────────────
        gender_frame = tk.Frame(self.root, bg=BG)
        gender_frame.pack(fill="x", padx=20, pady=(12, 4))

        tk.Label(gender_frame, text="Patient gender:", font=font_bold,
                 fg=TEXT, bg=BG).pack(side="left")

        for val in ("Male", "Female"):
            rb = tk.Radiobutton(
                gender_frame, text=val, variable=self.gender_var, value=val,
                font=font_label, fg=TEXT2, bg=BG,
                selectcolor=CARD, activebackground=BG, activeforeground=CYAN,
                indicatoron=True
            )
            rb.pack(side="left", padx=12)

        # ── Run button ──────────────────────────────────────────────────────
        self.run_btn = tk.Button(
            self.root, text="Run Analysis",
            font=("Helvetica", 11, "bold"),
            fg="#0C1828", bg=CYAN,
            activebackground="#7DD3FC", activeforeground="#0C1828",
            relief="flat", padx=20, pady=8,
            command=self._run
        )
        self.run_btn.pack(pady=(14, 6))

        self.status_lbl = tk.Label(self.root, text="", font=font_small,
                                   fg=MUTED, bg=BG)
        self.status_lbl.pack()

        # ── Results panel (hidden until analysis runs) ──────────────────────
        self.results_frame = tk.Frame(self.root, bg=CARD,
                                      highlightbackground=BORDER, highlightthickness=1)
        # Don't pack yet — shown after successful run

        # Composite score row
        score_row = tk.Frame(self.results_frame, bg=CARD)
        score_row.pack(fill="x", padx=20, pady=(16, 4))
        tk.Label(score_row, text="Composite Score", font=font_sub,
                 fg=TEXT2, bg=CARD).pack(side="left")
        self.composite_lbl = tk.Label(score_row, text="--", font=font_score,
                                       fg=CYAN, bg=CARD)
        self.composite_lbl.pack(side="right")

        # Subset scores row
        subset_row = tk.Frame(self.results_frame, bg=CARD)
        subset_row.pack(fill="x", padx=20, pady=4)
        self.subset_labels = {}
        for name in ("Stability", "Clarity", "Efficiency"):
            col = tk.Frame(subset_row, bg=CARD)
            col.pack(side="left", expand=True)
            tk.Label(col, text=name, font=font_small, fg=MUTED, bg=CARD).pack()
            lbl = tk.Label(col, text="--", font=("Helvetica", 14, "bold"),
                           fg=TEXT, bg=CARD)
            lbl.pack()
            self.subset_labels[name.lower()] = lbl

        # Separator
        tk.Frame(self.results_frame, bg=BORDER, height=1).pack(
            fill="x", padx=20, pady=8)

        # Raw values + per-metric scores table
        tk.Label(self.results_frame, text="Raw values & scores",
                 font=font_sub, fg=TEXT2, bg=CARD).pack(anchor="w", padx=20)

        table_frame = tk.Frame(self.results_frame, bg=CARD)
        table_frame.pack(fill="x", padx=20, pady=6)

        headers = ["Metric", "Raw value", "Score / 100"]
        for col, h in enumerate(headers):
            tk.Label(table_frame, text=h, font=("Helvetica", 9, "bold"),
                     fg=MUTED, bg=CARD, width=14, anchor="w").grid(
                row=0, column=col, padx=4, pady=2)

        self.table_rows = {}
        metric_labels = {
            "jitter":  "Jitter (%)",
            "shimmer": "Shimmer (%)",
            "f0_sd":   "F0 SD (Hz)",
            "hnr":     "HNR (dB)",
            "cpps":    "CPPS (dB)",
            "mpt":     "MPT (s)",
            "glide":   "Pitch Range (Hz)",
        }
        raw_keys = {
            "jitter":  "jitter",
            "shimmer": "shimmer",
            "f0_sd":   "f0_sd",
            "hnr":     "hnr",
            "cpps":    "cpps",
            "mpt":     "mpt",
            "glide":   "pitch_range",
        }
        for i, (key, label) in enumerate(metric_labels.items(), start=1):
            tk.Label(table_frame, text=label, font=font_small, fg=TEXT2,
                     bg=CARD, width=14, anchor="w").grid(row=i, column=0, padx=4, pady=1)
            raw_lbl = tk.Label(table_frame, text="--", font=font_mono, fg=TEXT,
                               bg=CARD, width=14, anchor="w")
            raw_lbl.grid(row=i, column=1, padx=4, pady=1)
            score_lbl = tk.Label(table_frame, text="--", font=font_mono, fg=TEXT,
                                 bg=CARD, width=14, anchor="w")
            score_lbl.grid(row=i, column=2, padx=4, pady=1)
            self.table_rows[key] = {"raw_lbl": raw_lbl, "score_lbl": score_lbl,
                                    "raw_key": raw_keys[key]}

        # Info-only rows (no score): F0 mean, F0 min, F0 max (from _aa),
        # glide min/max F0 (from _glide)
        info_rows = [
            ("f0_mean_lbl",    "F0 mean (Hz)",      "f0_mean"),
            ("f0_min_lbl",     "F0 min (Hz)",        "f0_min"),
            ("f0_max_lbl",     "F0 max (Hz)",        "f0_max"),
            ("glide_min_lbl",  "Glide min (Hz)",     "glide_min_f0"),
            ("glide_max_lbl",  "Glide max (Hz)",     "glide_max_f0"),
        ]
        self._info_lbls = {}
        base_row = len(metric_labels) + 1
        for offset, (attr, label, raw_key) in enumerate(info_rows):
            r = base_row + offset
            tk.Label(table_frame, text=label, font=font_small, fg=TEXT2,
                     bg=CARD, width=14, anchor="w").grid(row=r, column=0, padx=4, pady=1)
            val_lbl = tk.Label(table_frame, text="--", font=font_mono,
                               fg=TEXT, bg=CARD, width=14, anchor="w")
            val_lbl.grid(row=r, column=1, padx=4, pady=1)
            tk.Label(table_frame, text="(info only)", font=font_small, fg=MUTED,
                     bg=CARD, width=14, anchor="w").grid(row=r, column=2, padx=4, pady=1)
            self._info_lbls[raw_key] = val_lbl

        # Save JSON button
        save_row = tk.Frame(self.results_frame, bg=CARD)
        save_row.pack(fill="x", padx=20, pady=(8, 16))
        tk.Button(save_row, text="Save results as JSON",
                  font=font_small, fg=TEXT, bg="#1E3A5F",
                  activebackground=CYAN, activeforeground="#0C1828",
                  relief="flat", padx=10, pady=4,
                  command=self._save_json).pack(side="right")

        self._last_result = None

    # ── Browse handler ────────────────────────────────────────────────────────

    def _browse(self, key: str, suffix: str):
        path = filedialog.askopenfilename(
            title=f"Select {suffix} file",
            filetypes=[("WAV files", "*.wav"), ("All files", "*.*")]
        )
        if path:
            self.paths[key].set(path)
            self.file_labels[key].config(text=short_path(path), fg="#7DD3FC")

    # ── Run analysis (in background thread so UI stays responsive) ────────────

    def _run(self):
        paths  = {k: v.get() for k, v in self.paths.items()}
        gender = self.gender_var.get()

        missing = [k for k, v in paths.items() if not v]
        if missing:
            messagebox.showerror("Missing files",
                f"Please select files for: {', '.join(missing)}")
            return

        self.run_btn.config(state="disabled", text="Analysing...")
        self.status_lbl.config(text="Extracting features...", fg="#7FA8C9")
        self.root.update()

        def worker():
            try:
                from analyser import analyse_session
                result = analyse_session(
                    aa_path    = paths["aa"],
                    glide_path = paths["glide"],
                    mpt_path   = paths["mpt"],
                    text_path  = paths["text"],
                    gender     = gender,
                )
                self.root.after(0, lambda r=result: self._show_results(r))
            except Exception as e:
                msg = str(e)
                self.root.after(0, lambda m=msg: self._show_error(m))

        threading.Thread(target=worker, daemon=True).start()

    # ── Display results ───────────────────────────────────────────────────────

    def _show_results(self, result: dict):
        self._last_result = result

        c = result["composite"]
        self.composite_lbl.config(text=f"{c}", fg=score_colour(c))

        for name in ("stability", "clarity", "efficiency"):
            v = result[name]
            self.subset_labels[name].config(text=f"{v}", fg=score_colour(v))

        for key, row in self.table_rows.items():
            raw_val   = result["raw"].get(row["raw_key"], "--")
            score_val = result["scores"].get(key, "--")
            row["raw_lbl"].config(text=f"{raw_val}")
            row["score_lbl"].config(
                text=f"{score_val}",
                fg=score_colour(float(score_val)) if score_val != "--" else "#4A6F8A"
            )

        for raw_key, lbl in self._info_lbls.items():
            lbl.config(text=f"{result['raw'].get(raw_key, '--')}")

        self.results_frame.pack(fill="x", padx=20, pady=(8, 20))

        self.run_btn.config(state="normal", text="Run Analysis")
        self.status_lbl.config(text="Analysis complete.", fg="#10B981")

    def _show_error(self, msg: str):
        self.run_btn.config(state="normal", text="Run Analysis")
        self.status_lbl.config(text=f"Error: {msg}", fg="#F43F5E")
        messagebox.showerror("Analysis failed", msg)

    # ── Save JSON ─────────────────────────────────────────────────────────────

    def _save_json(self):
        if not self._last_result:
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json")],
            title="Save results"
        )
        if path:
            with open(path, "w") as f:
                json.dump(self._last_result, f, indent=2)
            messagebox.showinfo("Saved", f"Results saved to {path}")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    root = tk.Tk()
    app  = SwaraGUI(root)
    root.mainloop()