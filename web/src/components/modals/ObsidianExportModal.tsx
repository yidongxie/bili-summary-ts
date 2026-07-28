export interface ObsidianModalState {
  md: string;
  uri: string;
  filePath: string;
  copied: boolean;
}

interface ObsidianExportModalProps {
  state: ObsidianModalState;
  onClose: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

export function ObsidianExportModal({ state, onClose, onShowToast }: ObsidianExportModalProps) {
  async function copyAgain() {
    try {
      await navigator.clipboard.writeText(state.md);
      onShowToast('已复制到剪贴板', 'ok');
    } catch {
      onShowToast(
        '剪贴板不可用，请手动复制下面的内容（远程访问下浏览器可能限制剪贴板，可以改用 https）',
        'error',
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(13,45,69,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--canvas)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 24px 64px var(--hairline), inset 0 1px 0 var(--canvas)',
        }}
      >
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
            发送到 Obsidian
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--stone)' }}>
            目标笔记：<code className="font-mono">{state.filePath}.md</code>
          </p>
        </div>

        {state.copied ? (
          <div
            className="rounded-md px-3 py-3 text-sm"
            style={{
              background: 'rgba(5,150,105,0.08)',
              border: '1px solid rgba(5,150,105,0.25)',
              color: 'var(--primary)',
            }}
          >
            <div className="font-semibold mb-1">✓ 已尝试把完整 Markdown 写入 Obsidian，并已复制到剪贴板</div>
            <div className="leading-relaxed">
              如果 Obsidian 只创建了标题或空笔记，请在 Obsidian 里按{' '}
              <kbd
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.10)' }}
              >
                Ctrl+V
              </kbd>{' '}
              粘贴剪贴板里的完整内容。
            </div>
          </div>
        ) : (
          <div
            className="rounded-md px-3 py-3 text-sm"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.30)',
              color: '#92400e',
            }}
          >
            <div className="font-semibold mb-1">⚠ 浏览器拦截了剪贴板</div>
            <div className="leading-relaxed">
              这通常发生在 http 远程访问。点下面「再次复制」按钮触发用户手势，或手动选中文本复制。
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyAgain}
            className="text-sm px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.7)',
              color: 'var(--brand-tag)',
              border: '1px solid var(--hairline)',
            }}
          >
            再次复制
          </button>
          <a
            href={state.uri}
            className="text-sm px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              boxShadow: '0 4px 12px rgba(124,58,237,0.30)',
            }}
          >
            重新唤起 Obsidian
          </a>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm px-3 py-1.5 rounded-md transition-all"
            style={{
              background: 'rgba(255,255,255,0.5)',
              color: 'var(--steel)',
              border: '1px solid var(--hairline)',
            }}
          >
            完成
          </button>
        </div>

        <details className="text-xs" style={{ color: 'var(--steel)' }}>
          <summary className="cursor-pointer select-none">手动复制（点开查看完整 Markdown）</summary>
          <textarea
            readOnly
            value={state.md}
            className="mt-2 w-full font-mono text-xs outline-none"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              borderRadius: '0.625rem',
              padding: '0.5rem 0.75rem',
              minHeight: 160,
              maxHeight: 320,
              resize: 'vertical',
            }}
          />
        </details>
      </div>
    </div>
  );
}
