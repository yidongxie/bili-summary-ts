import { useEffect, useRef, useState } from 'react';
import { Search, X, Sparkles, Loader2 } from 'lucide-react';
import { askApi, type AskCitation } from '@/lib/api';
import { formatDuration } from '@/lib/format';

interface AskModalProps {
  open: boolean;
  onClose: () => void;
  onOpenCitation: (c: AskCitation) => void;
}

const SUGGESTIONS = ['这个视频讲了什么核心观点？', '有哪些值得实践的方法？', '提到了哪些关键概念？'];

export function AskModal({ open, onClose, onOpenCitation }: AskModalProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<AskCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setAnswer('');
      setCitations([]);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(q?: string) {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    setCitations([]);
    try {
      const data = await askApi(text);
      setAnswer(data.answer || '');
      setCitations(data.citations || []);
    } catch (e: any) {
      setError(e?.message || '问答失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-start justify-center pt-24 px-4'
      style={{ background: 'rgba(10,10,10,0.36)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className='w-full max-w-xl rounded-lg overflow-hidden flex flex-col max-h-[70vh]'
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: 'rgba(0,0,0,0.12) 0px 24px 48px -8px' }}
      >
        <div className='flex items-center gap-3 px-4 py-3 border-b shrink-0' style={{ borderColor: 'var(--hairline)' }}>
          <Sparkles className='w-4 h-4' style={{ color: 'var(--brand-green)' }} />
          <input
            ref={inputRef}
            type='text'
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder='问你的知识库…（基于你收藏的视频回答）'
            className='flex-1 bg-transparent outline-none text-sm'
            style={{ color: 'var(--ink)' }}
          />
          <button type='button' onClick={onClose} title='关闭'><X className='w-4 h-4' style={{ color: 'var(--steel)' }} /></button>
        </div>

        <div className='overflow-y-auto px-4 py-4 space-y-4'>
          {!loading && !error && !answer && (
            <div className='space-y-1.5'>
              <div className='text-xs mb-2' style={{ color: 'var(--stone)' }}>试试这样问：</div>
              {SUGGESTIONS.map((s) => (
                <button key={s} type='button' onClick={() => { setQuestion(s); submit(s); }} className='block w-full text-left text-sm px-3 py-2 rounded-md transition-colors' style={{ color: 'var(--steel)', background: 'var(--surface)', border: '1px solid var(--hairline-soft)' }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className='flex items-center gap-2 text-sm' style={{ color: 'var(--steel)' }}>
              <Loader2 className='w-4 h-4 animate-spin' /> 正在检索你的知识库…
            </div>
          )}

          {error && (
            <div className='text-sm px-3 py-2 rounded-md' style={{ color: 'var(--brand-error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
              {error}
            </div>
          )}

          {answer && (
            <>
              <div className='text-sm leading-relaxed whitespace-pre-wrap' style={{ color: 'var(--ink)' }}>{answer}</div>

              {citations.length > 0 && (
                <div className='pt-2 border-t space-y-1.5' style={{ borderColor: 'var(--hairline-soft)' }}>
                  <div className='text-xs font-semibold' style={{ color: 'var(--stone)' }}>来源</div>
                  {citations.map((c) => (
                    <button
                      key={c.itemId + ':' + c.time}
                      type='button'
                      onClick={() => { onOpenCitation(c); onClose(); }}
                      className='flex items-center gap-2 w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors'
                      style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.08)', border: '1px solid rgba(55,114,207,0.15)' }}
                    >
                      <span className='shrink-0 font-mono' style={{ color: 'var(--stone)' }}>[{c.index}]</span>
                      <span className='flex-1 truncate'>{c.title}</span>
                      {c.time > 0 && <span className='shrink-0 font-mono' style={{ color: 'var(--steel)' }}>{formatDuration(c.time)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
