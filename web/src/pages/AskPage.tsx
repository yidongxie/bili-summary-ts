import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, MessageCircle, Trash2 } from 'lucide-react';
import { askStream, getAskHistory, clearAskHistory, type AskCitation } from '@/lib/api';
import { markdownToHtml, formatDuration } from '@/lib/format';

interface AskPageProps {
  onOpenCitation: (c: AskCitation) => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

type QA = { question: string; answer: string; citations: AskCitation[]; error?: string };

const SUGGESTIONS = [
  '我的收藏里有哪些关于学习方法的观点？',
  '总结一下我收藏里提到的关键概念',
  '有哪些可以立刻实践的建议？',
];

export function AskPage({ onOpenCitation, onShowToast }: AskPageProps) {
  const [input, setInput] = useState('');
  const [qa, setQa] = useState<QA[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAskHistory()
      .then((d) => {
        if (d.history?.length) {
          setQa(d.history.slice().reverse().map((h) => ({ question: h.question, answer: h.answer, citations: h.citations || [] })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [qa, loading]);

  function updateQa(idx: number, patch: Partial<QA>) {
    setQa((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function appendAnswer(idx: number, text: string) {
    setQa((prev) => prev.map((item, i) => (i === idx ? { ...item, answer: item.answer + text } : item)));
  }

  function buildHistory(): Array<{ role: string; content: string }> {
    const out: Array<{ role: string; content: string }> = [];
    for (const item of qa.slice(-6)) {
      out.push({ role: 'user', content: item.question });
      if (item.answer) out.push({ role: 'assistant', content: item.answer.slice(0, 2000) });
    }
    return out;
  }

  async function submit(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput('');
    setLoading(true);
    const history = buildHistory();
    const idx = qa.length;
    setQa((prev) => [...prev, { question, answer: '', citations: [] }]);
    try {
      await askStream(question, history, {
        onCitations: (c) => updateQa(idx, { citations: c }),
        onDelta: (t) => appendAnswer(idx, t),
        onError: (e) => updateQa(idx, { error: e }),
      });
    } catch (e: any) {
      updateQa(idx, { error: e?.message || '问答失败' });
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    try {
      await clearAskHistory();
      setQa([]);
      onShowToast('已清空问答历史', 'ok');
    } catch (e: any) {
      onShowToast('清空失败：' + (e?.message || ''), 'error');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto w-full flex flex-col flex-1">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>问知识库</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--stone)' }}>
              基于你收藏的视频，直接提问，AI 会综合回答并标注出处。
            </p>
          </div>
          {qa.length > 0 && (
            <button type="button" onClick={handleClear} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full" style={{ color: 'var(--brand-error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
              <Trash2 className="w-3.5 h-3.5" /> 清空
            </button>
          )}
        </div>

        <div className="flex-1 space-y-5">
          {qa.length === 0 && !loading && (
            <div className="py-10 text-center space-y-3">
              <div className="mx-auto size-16 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                <MessageCircle className="w-8 h-8" style={{ color: 'var(--brand-green)' }} />
              </div>
              <div className="text-sm" style={{ color: 'var(--steel)' }}>试试这样问：</div>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)} className="text-left text-sm px-4 py-3 rounded-lg transition-colors" style={{ color: 'var(--steel)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {qa.map((item, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg px-4 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)', borderBottomRightRadius: 6 }}>
                  {item.question}
                </div>
              </div>
              <div className="flex gap-2">
                <Sparkles className="mt-1 w-5 h-5 shrink-0" style={{ color: 'var(--brand-green)' }} />
                <div className="min-w-0 flex-1 space-y-3">
                  {item.error ? (
                    <div className="text-sm px-3 py-2 rounded-md" style={{ color: 'var(--brand-error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>{item.error}</div>
                  ) : item.answer ? (
                    <div className="summary rounded-lg p-4 text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(item.answer) }} />
                  ) : null}
                  {item.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.citations.map((c) => (
                        <button key={c.itemId + ':' + c.time} type="button" onClick={() => onOpenCitation(c)} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors" style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.08)', border: '1px solid rgba(55,114,207,0.15)' }}>
                          <span className="font-mono" style={{ color: 'var(--stone)' }}>[{c.index}]</span>
                          <span className="max-w-[180px] truncate">{c.title}</span>
                          {c.time > 0 && <span className="font-mono" style={{ color: 'var(--steel)' }}>{formatDuration(c.time)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <Sparkles className="mt-1 w-5 h-5 shrink-0 animate-pulse" style={{ color: 'var(--brand-green)' }} />
              <div className="text-sm flex items-center gap-2" style={{ color: 'var(--steel)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> 正在检索你的知识库…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-0 pt-4 mt-6">
          <div className="flex items-end gap-2 rounded-lg p-2" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="问你的知识库…（Enter 发送，Shift+Enter 换行）"
              rows={2}
              className="flex-1 bg-transparent outline-none text-sm resize-none"
              style={{ color: 'var(--ink)' }}
            />
            <button type="button" onClick={() => submit()} disabled={loading} className="size-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary)', color: 'var(--on-primary)', opacity: loading ? 0.6 : 1 }}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
