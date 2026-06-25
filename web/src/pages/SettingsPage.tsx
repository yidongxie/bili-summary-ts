import { useEffect, useState } from 'react';
import { Save, Check, Eye, EyeOff, Zap, Loader2 } from 'lucide-react';
import {
  getConfig,
  saveConfig,
  testDeepSeekConfig,
  testWhisperConfig,
  type AppConfig,
} from '@/lib/api';

interface SettingsPageProps {
  isLoggedIn: boolean;
  onConfigSaved: (config: AppConfig) => void;
  onRequireLogin: () => void;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(14,165,233,0.14)',
  backdropFilter: 'blur(16px)',
  boxShadow:
    '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.70)',
  border: '1px solid rgba(14,165,233,0.18)',
  color: '#0d2d45',
  borderRadius: '0.625rem',
  padding: '0.5rem 0.75rem',
  fontSize: 13,
  width: '100%',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#5b8fae',
  marginBottom: 4,
  display: 'block',
};

function LogoIcon({ letter, gradient }: { letter: string; gradient: string }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: gradient, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
    >
      <span className="text-white font-bold text-sm">{letter}</span>
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-0.5 flex-1">
      <span className="font-semibold text-sm" style={{ color: '#0d2d45' }}>
        {title}
      </span>
      <span className="text-xs" style={{ color: '#7db8d4' }}>
        {desc}
      </span>
    </div>
  );
}

function KeyStatus({ configured }: { configured: boolean | undefined }) {
  if (configured) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: '#059669' }}
      >
        <Check className="w-3 h-3" /> 已配置
      </span>
    );
  }
  return (
    <span className="text-xs" style={{ color: '#9ca3af' }}>
      未配置
    </span>
  );
}

export function SettingsPage({
  isLoggedIn,
  onConfigSaved,
  onRequireLogin,
}: SettingsPageProps) {
  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat');
  const [deepseekApiUrl, setDeepseekApiUrl] = useState('https://api.deepseek.com/v1');
  const [whisperKey, setWhisperKey] = useState('');
  const [whisperApiUrl, setWhisperApiUrl] = useState('https://api.siliconflow.cn/v1');
  const [whisperModel, setWhisperModel] = useState('FunAudioLLM/SenseVoiceSmall');
  const [defaultCategory, setDefaultCategory] = useState('待整理');
  const [ytDlpCookies, setYtDlpCookies] = useState('');
  const [obsidianVault, setObsidianVault] = useState('');
  const [obsidianSubfolder, setObsidianSubfolder] = useState('BiliStudy');

  const [apiKeySet, setApiKeySet] = useState(false);
  const [whisperKeySet, setWhisperKeySet] = useState(false);
  const [ytDlpCookiesSet, setYtDlpCookiesSet] = useState(false);

  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'error' | 'info' } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [showWhisperKey, setShowWhisperKey] = useState(false);
  const [testingDeepseek, setTestingDeepseek] = useState(false);
  const [testingWhisper, setTestingWhisper] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConfig().then((cfg) => {
      if (cancelled) return;
      setDeepseekModel(cfg.deepseek_model || 'deepseek-chat');
      setDeepseekApiUrl(cfg.deepseek_base_url || 'https://api.deepseek.com/v1');
      setWhisperApiUrl(cfg.whisper_base_url || 'https://api.siliconflow.cn/v1');
      setWhisperModel(cfg.whisper_model || 'FunAudioLLM/SenseVoiceSmall');
      setDefaultCategory(cfg.default_category || '待整理');
      setObsidianVault(cfg.obsidian_vault_name || '');
      setObsidianSubfolder(cfg.obsidian_folder || 'BiliStudy');
      setApiKeySet(!!cfg.api_key_set);
      setWhisperKeySet(!!cfg.whisper_api_key_set);
      setYtDlpCookiesSet(!!cfg.yt_dlp_cookies_set);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTestDeepseek() {
    if (!isLoggedIn) {
      setStatus({ msg: '请先登录', type: 'error' });
      onRequireLogin();
      return;
    }
    setTestingDeepseek(true);
    setStatus(null);
    try {
      await testDeepSeekConfig({
        api_key: deepseekKey.trim(),
        base_url: deepseekApiUrl.trim(),
        model: deepseekModel.trim(),
      });
      setStatus({ msg: 'DeepSeek 连接成功', type: 'ok' });
    } catch (err: any) {
      setStatus({ msg: 'DeepSeek 测试失败：' + (err.message || ''), type: 'error' });
    } finally {
      setTestingDeepseek(false);
    }
  }

  async function handleTestWhisper() {
    if (!isLoggedIn) {
      setStatus({ msg: '请先登录', type: 'error' });
      onRequireLogin();
      return;
    }
    setTestingWhisper(true);
    setStatus(null);
    try {
      await testWhisperConfig({
        whisper_api_key: whisperKey.trim(),
        whisper_base_url: whisperApiUrl.trim(),
        whisper_model: whisperModel.trim(),
      });
      setStatus({ msg: 'Whisper 连接成功', type: 'ok' });
    } catch (err: any) {
      setStatus({ msg: 'Whisper 测试失败：' + (err.message || ''), type: 'error' });
    } finally {
      setTestingWhisper(false);
    }
  }


  async function handleClearYtDlpCookies() {
    if (!isLoggedIn) {
      setStatus({ msg: '请先登录', type: 'error' });
      onRequireLogin();
      return;
    }
    if (!window.confirm('确定清空已保存的 yt-dlp Cookies 吗？')) return;
    setSaving(true);
    setStatus(null);
    try {
      const data = await saveConfig({ clear_yt_dlp_cookies: '1' } as any);
      onConfigSaved(data.config);
      setYtDlpCookiesSet(false);
      setYtDlpCookies('');
      setStatus({ msg: 'yt-dlp Cookies 已清空', type: 'ok' });
    } catch (err: any) {
      setStatus({ msg: err.message || '清空失败', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!isLoggedIn) {
      setStatus({ msg: '请先登录', type: 'error' });
      onRequireLogin();
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload: Partial<AppConfig> = {
        deepseek_model: deepseekModel.trim(),
        deepseek_base_url: deepseekApiUrl.trim(),
        whisper_base_url: whisperApiUrl.trim() || 'https://api.siliconflow.cn/v1',
        whisper_model: whisperModel.trim() || 'FunAudioLLM/SenseVoiceSmall',
        default_category: defaultCategory.trim() || '待整理',
        obsidian_vault_name: obsidianVault.trim(),
        obsidian_folder: obsidianSubfolder.trim() || 'BiliStudy',
      };
      // Only forward keys when the user actually typed something — otherwise
      // we'd overwrite the encrypted-at-rest value with an empty string.
      if (deepseekKey.trim()) (payload as any).api_key = deepseekKey.trim();
      if (whisperKey.trim()) (payload as any).whisper_api_key = whisperKey.trim();
      if (ytDlpCookies.trim()) (payload as any).yt_dlp_cookies = ytDlpCookies.trim();

      const data = await saveConfig(payload);
      onConfigSaved(data.config);
      setApiKeySet(!!data.config.api_key_set);
      setWhisperKeySet(!!data.config.whisper_api_key_set);
      setYtDlpCookiesSet(!!data.config.yt_dlp_cookies_set);
      setDeepseekKey('');
      setWhisperKey('');
      setYtDlpCookies('');
      setStatus({ msg: '设置已保存', type: 'ok' });
    } catch (err: any) {
      setStatus({ msg: err.message || '保存失败', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-8 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#0d2d45' }}>
          设置
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#7db8d4' }}>
          配置 API Key、Whisper 和 Obsidian 集成。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        {/* DeepSeek */}
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <LogoIcon letter="DS" gradient="linear-gradient(135deg,#4f8ef7,#6366f1)" />
            <SectionTitle title="DeepSeek API" desc="用于生成视频总结，兼容 OpenAI 协议。" />
          </div>

          <div>
            <label style={labelStyle}>API Key</label>
            <div className="relative">
              <input
                style={{ ...inputStyle, paddingRight: 40 }}
                type={showDeepseekKey ? 'text' : 'password'}
                placeholder={apiKeySet ? '已保存，留空则不修改' : 'sk-...'}
                value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowDeepseekKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md"
                style={{ color: '#7db8d4' }}
              >
                {showDeepseekKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <KeyStatus configured={apiKeySet} />
              <button
                type="button"
                onClick={handleTestDeepseek}
                disabled={testingDeepseek}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105 disabled:opacity-60"
                style={{ background: 'rgba(14,165,233,0.10)', color: '#0369a1', border: '1px solid rgba(14,165,233,0.18)' }}
              >
                {testingDeepseek ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                {testingDeepseek ? '测试中…' : '测试连接'}
              </button>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'rgba(14,165,233,0.10)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>模型</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={deepseekModel}
                  onChange={(e) => setDeepseekModel(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>API 地址</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={deepseekApiUrl}
                  onChange={(e) => setDeepseekApiUrl(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Whisper */}
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <LogoIcon letter="W" gradient="linear-gradient(135deg,#0ea5e9,#38bdf8)" />
            <SectionTitle
              title="Whisper API"
              desc="把没有字幕的视频转写成文本，推荐硅基流动 / OpenAI。"
            />
          </div>

          <div>
            <label style={labelStyle}>API Key</label>
            <div className="relative">
              <input
                style={{ ...inputStyle, paddingRight: 40 }}
                type={showWhisperKey ? 'text' : 'password'}
                placeholder={whisperKeySet ? '已保存，留空则不修改' : 'sk-...'}
                value={whisperKey}
                onChange={(e) => setWhisperKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowWhisperKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md"
                style={{ color: '#7db8d4' }}
              >
                {showWhisperKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <KeyStatus configured={whisperKeySet} />
              <button
                type="button"
                onClick={handleTestWhisper}
                disabled={testingWhisper}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105 disabled:opacity-60"
                style={{ background: 'rgba(14,165,233,0.10)', color: '#0369a1', border: '1px solid rgba(14,165,233,0.18)' }}
              >
                {testingWhisper ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                {testingWhisper ? '测试中…' : '测试连接'}
              </button>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'rgba(14,165,233,0.10)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>API 地址</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={whisperApiUrl}
                  onChange={(e) => setWhisperApiUrl(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>模型</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* General */}
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <LogoIcon letter="G" gradient="linear-gradient(135deg,#34d399,#06b6d4)" />
            <SectionTitle title="通用偏好" desc="控制新总结被创建后使用的保存分类与平台 Cookies。" />
          </div>

          <div>
            <label style={labelStyle}>默认保存分类</label>
            <input
              style={inputStyle}
              type="text"
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
            />
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'rgba(14,165,233,0.10)' }}>
            <label style={labelStyle}>yt-dlp Cookies（抖音/小红书等平台）</label>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
              placeholder={ytDlpCookiesSet ? '已保存，留空则不修改；粘贴新内容后保存可更新' : '粘贴 Netscape cookies.txt 内容，例如从浏览器导出的 douyin.com cookies'}
              value={ytDlpCookies}
              onChange={(e) => setYtDlpCookies(e.target.value)}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
              <KeyStatus configured={ytDlpCookiesSet} />
              <span className="text-xs" style={{ color: '#7db8d4' }}>
                Cookies 会加密保存；留空保存不会修改现有 Cookies。
              </span>
              {ytDlpCookiesSet && (
                <button
                  type="button"
                  onClick={handleClearYtDlpCookies}
                  className="text-xs px-2 py-1 rounded-lg font-semibold"
                  style={{ color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
                >
                  清空 Cookies
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Obsidian */}
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <LogoIcon letter="O" gradient="linear-gradient(135deg,#a855f7,#7c3aed)" />
            <SectionTitle
              title="Obsidian Vault"
              desc="通过浏览器拉起本机 Obsidian 客户端接收笔记。"
            />
          </div>

          <div>
            <label style={labelStyle}>Vault 名称</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="例如 MyVault"
              value={obsidianVault}
              onChange={(e) => setObsidianVault(e.target.value)}
            />
            <p className="text-xs mt-1.5" style={{ color: '#7db8d4' }}>
              就是 Obsidian 侧栏顶部显示的 vault 名；留空则由 Obsidian 默认 vault 接收。
            </p>
          </div>

          <div>
            <label style={labelStyle}>Vault 中的子文件夹</label>
            <input
              style={inputStyle}
              type="text"
              value={obsidianSubfolder}
              onChange={(e) => setObsidianSubfolder(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3 max-w-4xl mt-6">
        {status && (
          <span
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              background:
                status.type === 'ok'
                  ? 'rgba(5,150,105,0.10)'
                  : status.type === 'error'
                    ? 'rgba(239,68,68,0.10)'
                    : 'rgba(14,165,233,0.10)',
              color:
                status.type === 'ok'
                  ? '#047857'
                  : status.type === 'error'
                    ? '#b91c1c'
                    : '#0369a1',
              border: `1px solid ${
                status.type === 'ok'
                  ? 'rgba(5,150,105,0.25)'
                  : status.type === 'error'
                    ? 'rgba(239,68,68,0.25)'
                    : 'rgba(14,165,233,0.25)'
              }`,
            }}
          >
            {status.msg}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            color: '#fff',
            boxShadow:
              '0 4px 16px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
