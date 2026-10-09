# تدريب صوت تايم كيبر على الماك

الخطوات اللي تشغّل فيها تدريب الصوت (Ali Alyousifi) على جهازك بدل الكرت المستأجر. تحتاج ماك بمعالج **M1 أو أحدث**، وذاكرة **16 GB أو أكثر**.

البيانات (المقاطع والنصوص) تتجهز في السيرفر. ويوصلك منها ملف واحد اسمه `feats.pt`، فيه الصوت محوّل لأرقام، فحجمه صغير. والماك يسوي التدريب بس.

## 1. التجهيز (مرة وحدة)

افتح **Terminal** والصق:

```bash
# أدوات أساسية (إذا ما عندك Homebrew، ركّبه أول من https://brew.sh)
brew install python@3.11 ffmpeg git

# المستودع
git clone -b claude/success-story-video https://github.com/alalramadhan-kuwait/timekeeper-online.git ~/tk
cd ~/tk

# بيئة بايثون
python3.11 -m venv ~/tkvoice
~/tkvoice/bin/pip install --upgrade pip
~/tkvoice/bin/pip install torch torchaudio
~/tkvoice/bin/pip install chatterbox-tts faster-whisper
~/tkvoice/bin/pip install --no-deps --force-reinstall "git+https://github.com/resemble-ai/chatterbox.git"
```

## 2. البيانات

الملف `tk-voice-mac-data.zip` (31 MB، يوصلك مني) فيه `feats.pt` و`metadata.csv` (نص كويتي) و`ref.wav` وآخر نسخة مدربة `cpu4-step01000.pt` عشان الماك يكمل منها. فكّه داخل `~/tk`:

```bash
cd ~/tk && unzip ~/Downloads/tk-voice-mac-data.zip
```

بعدها يصير عندك `~/tk/voice-src/dataset-v3/` و`~/tk/voice-src/ref.wav`.

## 3. التدريب

```bash
cd ~/tk
PYTORCH_ENABLE_MPS_FALLBACK=1 ~/tkvoice/bin/python video/brand/tk_voice_train.py --device mps \
  train --data dataset-v3 --name mac1 --steps 2000 --batch 4 --lr 5e-5 --eval-every 250 \
  --resume voice-src/cpu4-step01000.pt
```

- خل الماك موصّل بالشاحن، ولا تسكّره. وإذا تبي تمنعه من النوم، استخدم `caffeinate -i` قبل الأمر.
- 2000 خطوة × 4 مقاطع = تقريباً 12 دورة على الساعتين.
- كل 250 خطوة يحفظ نسخة في `voice-src/ckpt/mac1/stepXXXXX.pt`، حجمها تقريباً 30 MB.
- السطر اللي فيه `test_speech_loss` هو المؤشر: كل ما نزل الرقم كان أحسن. وإذا بدا يرتفع، معناه الموديل بدا يحفظ البيانات بدل ما يتعلم، فالنسخ اللي قبلها أحسن.

## 4. ارجع النتيجة

ارفع مجلد `voice-src/ckpt/mac1/` على Google Drive، أو أرسل آخر 3 نسخ. أنا أطلّع منها عينات وأقارنها.

أو طلّع العينات بنفسك:

```bash
PYTORCH_ENABLE_MPS_FALLBACK=1 ~/tkvoice/bin/python video/brand/tk_voice_train.py --device mps \
  sample --ckpt voice-src/ckpt/mac1/step01000.pt
```

العينات تطلع في `voice-src/samples/`. ويحتاج `voice-src/ref.wav` يكون موجود، ويوصلك مع البيانات.
