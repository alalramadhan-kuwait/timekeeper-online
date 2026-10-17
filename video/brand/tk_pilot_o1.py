"""Pilot O1 (PILOT-O1.md, approved 2026-10-17): LoRA fine-tune of OmniVoice on Ali's verified Kuwaiti clips.
  data    voice-src/pilotO1/: 24 clips at 24 kHz mono (untouched otherwise) + train/dev JSONL. Text = the user's
          transcripts by the OmniVoice writing rules: English words in English letters, numbers as Kuwaiti words, the
          user's own corrections from the fix page where there are any. 2 clips are dev (loss only).
Then (run from the shell, see PILOT-O1.md): tokenize with omnivoice.scripts.extract_audio_tokens, train with
omnivoice.cli.train (LoRA config written here), sample the frozen test set with the adapter.
Run: /root/omni/bin/python video/brand/tk_pilot_o1.py data"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
D = ROOT / "voice-src/pilotO1"
VD = ROOT / "video/brand/voice-data"
BACK_TO_ENGLISH = [("إل في إم إتش", "LVMH"), ("دوال تايم", "dual time"), ("جي إم تي", "GMT"), ("آي دبليو سي", "IWC"),
                   ("إن هاوس", "in house"), ("روز قولد", "rose gold"), ("فايف لينكس بريسلت", "five links bracelet")]
DEV = {"JtVZPG9Jxqk-u025", "TlGXbHWi-vU-u012"}


def data():
    from tk_pilot0 import texts
    fixed = json.loads((VD / "omni-fixed-texts.json").read_text())["texts"]
    (D / "wavs").mkdir(parents=True, exist_ok=True)
    rows = {"train": [], "dev": []}
    for k, t in texts().items():
        t = fixed.get(k, t)
        for a, b in BACK_TO_ENGLISH:
            t = t.replace(a, b)
        wav = D / "wavs" / f"{k}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "voice-src/pilot/clips" / f"{k}.wav"), "-ac", "1", "-ar", "24000",
                        "-c:a", "pcm_s16le", str(wav)], check=True)
        rows["dev" if k in DEV else "train"].append({"id": k, "audio_path": str(wav), "text": t, "language_id": "afb"})
    for split, r in rows.items():
        (D / f"{split}.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in r))
    (VD / "pilot-o1-texts.json").write_text(json.dumps({x["id"]: x["text"] for r in rows.values() for x in r}, ensure_ascii=False, indent=1))
    print({s: len(r) for s, r in rows.items()})




def train():
    """LoRA training with OmniVoice's own trainer. Checkpoints keep only the adapter (save_pretrained): the
    optimizer/RNG state (accelerator.save_state) is skipped because disk is tight and the run is never resumed."""
    import omnivoice.training.checkpoint as ck
    import omnivoice.training.trainer as tr
    orig = ck.save_checkpoint

    def adapter_only(accelerator, model, tokenizer, output_dir, step, keep_last_n=3):
        accelerator.save_state = lambda *a, **k: None
        return orig(accelerator, model, tokenizer, output_dir, step, keep_last_n=-1)
    ck.save_checkpoint = adapter_only
    tr.engine_save_checkpoint = adapter_only   # the trainer imported it under this name
    cfg = json.loads((D / "train_config_finetune_lora.json").read_text())
    cfg.update({"init_from_checkpoint": "/root/omnivoice-w", "llm_name_or_path": "/root/omnivoice-w", "steps": 300,
                "logging_steps": 10, "eval_steps": 150, "save_steps": 150, "keep_last_n_checkpoints": -1,
                "mixed_precision": "no", "allow_tf32": False, "num_workers": 1, "batch_tokens": 1024, "max_batch_size": 1,
                "max_sample_tokens": 1000})
    (D / "o1-train.json").write_text(json.dumps(cfg, indent=1))
    sys.argv = ["train", "--train_config", str(D / "o1-train.json"), "--data_config", str(D / "o1-data.json"), "--output_dir", str(D / "exp")]
    from omnivoice.cli.train import main
    main()


if __name__ == "__main__":
    {"data": data, "train": train}[sys.argv[1]]()
