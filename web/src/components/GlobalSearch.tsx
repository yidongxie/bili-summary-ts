import { useEffect, useRef, useState } from 'react';
import { Search, ArrowRight, X as CloseIcon } from 'lucide-react';
import { getLibrary, semanticSearch, type LibraryItem } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onPick: (item: LibraryItem) => void;
}

export function GlobalSearch({ open, onClose, onPick }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [semantic, setSemantic] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
      setSemantic([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setItems([]);
      setSemantic([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [kw, sem] = await Promise.all([
          getLibrary({ q }),
          semanticSearch(q),
        ]);
        if (cancelled) return;
        const kwItems = kw.items || [];
        const seen = new Set(kwItems.map((i) => i.id));
        setItems(kwItems);
        setSemantic((sem.items || []).filter((i) => !seen.has(i.id)));
      } catch {
        if (!cancelled) {
          setItems([]);
          setSemantic([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  if (!open) return null;

  function renderItem(item: LibraryItem, isSemantic = false) {
    return (
      <button key={item.id} type="button" onClick={() => { onPick(item); onClose(); }} className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors" style={{ borderTop: '1px solid var(--hairline-soft)' }}>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isSemantic ? 'var(--brand-tag)' : 'var(--brand-green)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{item.title}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--steel)' }}>{item.author} · {item.category || '待整理'} · {formatDate(item.created_at)}</div>
        </div>
        {isSemantic && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.10)' }}>语义</span>}
        <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--stone)' }} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" style={{ background: 'rgba(10,10,10,0.36)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="全局搜索" className="w-full max-w-xl rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: 'rgba(0,0,0,0.12) 0px 24px 48px -8px' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--hairline)' }}>
          <Search className="w-4 h-4" style={{ color: 'var(--steel)' }} />
          <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索收藏库（标题 / UP主 / 总结 / 标签）" className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--ink)' }} />
          <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-mono" style={{ background: 'var(--surface)', color: 'var(--stone)', border: '1px solid var(--hairline)' }}>ESC</span>
          <button type="button" onClick={onClose} aria-label="关闭搜索"><CloseIcon className="w-4 h-4" style={{ color: 'var(--steel)' }} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {!query.trim() && <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--steel)' }}>输入关键词，搜索你已收藏的视频</div>}
          {query.trim() && !loading && !items.length && !semantic.length && <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--steel)' }}>没有匹配的收藏</div>}
          {loading && <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--steel)' }}>搜索中…</div>}
          {items.map((item) => renderItem(item, false))}
          {semantic.map((item) => renderItem(item, true))}
        </div>
      </div>
    </div>
  );
}
