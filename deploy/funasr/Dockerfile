# FunASR self-hosted ASR server (CPU)

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg helps decode non-wav inputs (FunASR v1.3.30+ decodes mp3/m4a/flac itself,
# but ffmpeg is a safe fallback and useful for probing).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch — far smaller than the default CUDA build.
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir "funasr>=1.3.30" fastapi uvicorn python-multipart modelscope

EXPOSE 8000

# Model alias (see README):
#   paraformer   -> paraformer-zh + VAD + punctuation (best Chinese + char/sentence timestamps)
#   sensevoice   -> SenseVoiceSmall (fastest, multilingual + emotion, sentence timestamps via VAD)
#   paraformer-en -> English transcription
#   fun-asr-nano -> Fun-ASR-Nano-2512 (31 langs / dialects; GPU recommended)
ENV MODEL=paraformer

CMD ["sh", "-c", "funasr-server --model ${MODEL} --device cpu --host 0.0.0.0 --port 8000"]
