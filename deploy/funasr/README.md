# FunASR 自建语音转写服务

把 ASR 从硅基流动（云端、慢、SenseVoice 无时间戳）换成 **本地 FunASR**：更快、中文更准、原生带时间戳、免费，且 OpenAI 兼容，BiliStudy 只改两个设置即可接入。

## 为什么自建

| 对比 | 硅基流动 SenseVoiceSmall | 自建 FunASR (Paraformer) |
|---|---|---|
| 中文准确率 | CER 7.8%（但托管接口无时间戳） | CER 10.2%（Paraformer） |
| 时间戳 | ❌ 托管接口只返回纯文本 | ✅ 字级/句级原生时间戳 |
| 速度 | ~170x（受网络 + 服务商排队） | ~120x，本地无网络往返 |
| 成本 | 按量付费 | 免费（自有 CPU 即可） |

## 启动

```bash
cd deploy/funasr
docker compose up -d --build
```

首次启动会自动下载模型（几百 MB，需联网），之后缓存到 `funasr-cache` 卷。验证：

```bash
curl http://localhost:8000/health                 # {"status":"ok"}
curl http://localhost:8000/v1/models              # {"data":[{"id":"paraformer"}]}

# 转写一个真实音频，确认返回带时间戳的 segments：
curl http://localhost:8000/v1/audio/transcriptions \
  -F file=@sample.mp3 \
  -F model=paraformer \
  -F response_format=verbose_json
```

## 模型选择（改 `docker-compose.yml` 里的 `MODEL` 后 `docker compose up -d` 即可）

| 别名 | 后端 | 场景 |
|---|---|---|
| `paraformer`（默认） | paraformer-zh + VAD + 标点 | 中文生产转写，字级/句级时间戳，最稳 |
| `sensevoice` | SenseVoiceSmall | 最快，多语言 + 情感，句级时间戳（经 VAD） |
| `paraformer-en` | paraformer-en + VAD | 英文转写 |
| `fun-asr-nano` | Fun-ASR-Nano-2512 | 31 语种/方言，LLM-ASR（建议 GPU） |

> CPU 跑 `paraformer`/`sensevoice` 即可（约 1-2GB 内存）。`fun-asr-nano` 建议 GPU。

## 接入 BiliStudy

设置页 → Whisper 卡片：

- **API 地址**：`http://<你的服务器IP>:8000/v1`
- **模型**：`paraformer`（或 `sensevoice`）
- **API Key**：留空即可（BiliStudy 对私有/本机端点会自动跳过 key 校验）

保存后正常总结视频即可。BiliStudy 发送的是 16k 单声道 mp3，FunASR 直接支持。

### 常见问题

- **`funasr-server` 提示未知参数 `--host`**：部分旧版本无此参数。去掉 Dockerfile 里的 `--host 0.0.0.0`，改用 `uvicorn` 的 `--host`，或升级 `funasr>=1.3.30`。
- **GPU 部署**：把 Dockerfile 换成 `nvidia/cuda:12.x-runtime` 基础镜像，装 CUDA 版 torch，CMD 里的 `--device cpu` 改成 `--device cuda`，并在 compose 里加 `deploy.resources.reservations.devices`（nvidia gpu）。
- **模型下载慢/失败**：ModelScope 默认源在国内较稳；若用 HuggingFace 源，可在容器内设 `MODELSCOPE_CACHE` 或镜像加速。
