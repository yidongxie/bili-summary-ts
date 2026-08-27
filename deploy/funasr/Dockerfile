# FunASR self-hosted ASR server (CPU)

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg helps decode non-wav inputs (FunASR v1.3.30+ decodes mp3/m4a itself too).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 国内镜像：PyTorch CPU 轮子 + PyPI（海外服务器可换成官方源）
RUN pip install --no-cache-dir torch torchaudio \
        --index-url https://mirrors.aliyun.com/pytorch-wheels/cpu/ \
        --extra-index-url https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir "funasr>=1.3.30" fastapi uvicorn python-multipart modelscope \
        -i https://mirrors.aliyun.com/pypi/simple/

EXPOSE 8000

# 模型别名（见 README）：
#   paraformer   -> paraformer-zh + VAD + 标点（中文最稳 + 字级时间戳）
#   sensevoice   -> SenseVoiceSmall（最快，多语言 + 情感）
#   paraformer-en-> 英文转写
#   fun-asr-nano -> Fun-ASR-Nano-2512（31 语种/方言，建议 GPU）
ENV MODEL=paraformer

CMD ["sh", "-c", "funasr-server --model ${MODEL} --device cpu --host 0.0.0.0 --port 8000"]
