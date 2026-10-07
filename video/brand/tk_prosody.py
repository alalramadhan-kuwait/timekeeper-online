"""Prosody measurement for the TK voice: pitch (F0), range, phrase-final contour, timing, pauses, emphasis (energy).

  features(wav)          per-utterance summary (Praat F0 via parselmouth)
  compare(ref, other)    DTW-align two renditions of the same words, then F0 / energy correlation, range ratio,
                         duration ratio, pause agreement

Semitones are relative to the utterance's own median F0, so different absolute pitch does not count as a miss.
"""
import numpy as np
import parselmouth
import librosa

HOP = 0.01  # 10 ms frames everywhere


def load(path, sr=16000):
    y, _ = librosa.load(str(path), sr=sr, mono=True)
    return y, sr


def f0_track(y, sr, fmin=65, fmax=400):
    snd = parselmouth.Sound(y, sampling_frequency=sr)
    pitch = snd.to_pitch_ac(time_step=HOP, pitch_floor=fmin, pitch_ceiling=fmax)
    f0 = pitch.selected_array["frequency"]
    f0[f0 == 0] = np.nan
    return f0


def energy_db(y, sr):
    hop = int(HOP * sr)
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0]
    return 20 * np.log10(rms + 1e-6)


def pauses(e_db, min_len=0.15):
    """Silent stretches (energy 35 dB under the utterance's loud level) longer than min_len, excluding edges."""
    thr = np.percentile(e_db, 95) - 35
    quiet = e_db < thr
    out, start = [], None
    for i, q in enumerate(np.append(quiet, False)):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) * HOP >= min_len and start > 0 and i < len(quiet):
                out.append((start * HOP, i * HOP))
            start = None
    return out


def semitones(f0):
    med = np.nanmedian(f0)
    return 12 * np.log2(f0 / med)


def features(path, text=None):
    y, sr = load(path)
    f0 = f0_track(y, sr)
    st = semitones(f0)
    e = energy_db(y, sr)
    ps = pauses(e)
    dur = len(y) / sr
    speech = dur - sum(b - a for a, b in ps)
    voiced = ~np.isnan(st)
    # phrase-final contour: slope (st/s) over the last 0.5 s of voiced frames
    idx = np.where(voiced)[0]
    tail = idx[idx >= idx[-1] - 50] if len(idx) else idx
    slope = float(np.polyfit(tail * HOP, st[tail], 1)[0]) if len(tail) > 5 else float("nan")
    out = {
        "dur": round(dur, 2),
        "f0_median_hz": round(float(np.nanmedian(f0)), 1),
        "range_st": round(float(np.nanpercentile(st, 95) - np.nanpercentile(st, 5)), 2),
        "f0_sd_st": round(float(np.nanstd(st)), 2),
        "final_slope_st_s": round(slope, 2),
        "pauses": len(ps),
        "pause_s": round(sum(b - a for a, b in ps), 2),
        "voiced_frac": round(float(voiced.mean()), 2),
        "energy_sd_db": round(float(np.std(e[e > np.percentile(e, 95) - 35])), 2),
    }
    if text:
        chars = len([c for c in text if c.isalpha()])
        out["rate_chars_s"] = round(chars / max(speech, 0.1), 2)
    return out


def _mfcc(y, sr):
    return librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=int(HOP * sr), n_fft=int(4 * HOP * sr))


def compare(ref_path, other_path):
    """How well `other` follows `ref`'s melody and timing (same words)."""
    a, sr = load(ref_path)
    b, _ = load(other_path)
    _, wp = librosa.sequence.dtw(X=_mfcc(a, sr), Y=_mfcc(b, sr), subseq=False)
    wp = wp[::-1]
    fa, fb = semitones(f0_track(a, sr)), semitones(f0_track(b, sr))
    ea, eb = energy_db(a, sr), energy_db(b, sr)
    ia = np.clip(wp[:, 0], 0, min(len(fa), len(ea)) - 1)
    ib = np.clip(wp[:, 1], 0, min(len(fb), len(eb)) - 1)
    x, y = fa[ia], fb[ib]
    ok = ~np.isnan(x) & ~np.isnan(y)
    f0_corr = float(np.corrcoef(x[ok], y[ok])[0, 1]) if ok.sum() > 20 else float("nan")
    f0_rmse = float(np.sqrt(np.mean((x[ok] - y[ok]) ** 2))) if ok.sum() > 20 else float("nan")
    loud = (ea[ia] > np.percentile(ea, 95) - 35) & (eb[ib] > np.percentile(eb, 95) - 35)
    e_corr = float(np.corrcoef(ea[ia][loud], eb[ib][loud])[0, 1]) if loud.sum() > 20 else float("nan")
    # pause agreement: a ref pause counts as kept if the aligned other has a pause within 0.25 s
    pa, pb = pauses(ea), pauses(eb)
    map_ab = {}
    for i, j in zip(ia, ib):
        map_ab.setdefault(i, j)
    kept = 0
    for s, e in pa:
        mid = int((s + e) / 2 / HOP)
        jm = map_ab.get(mid, mid) * HOP
        kept += any(abs((ps + pe) / 2 - jm) < 0.25 for ps, pe in pb)
    ra, rb = features(ref_path), features(other_path)
    return {
        "f0_corr": round(f0_corr, 3), "f0_rmse_st": round(f0_rmse, 2), "energy_corr": round(e_corr, 3),
        "range_ratio": round(rb["range_st"] / max(ra["range_st"], 0.1), 2),
        "dur_ratio": round(rb["dur"] / max(ra["dur"], 0.1), 2),
        "pauses_ref": len(pa), "pauses_kept": kept, "pauses_other": len(pb),
        "final_slope_ref": ra["final_slope_st_s"], "final_slope_other": rb["final_slope_st_s"],
    }
