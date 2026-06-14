import { useEffect, useRef, useState } from 'react';
import { Search, ArrowRight, X as CloseIcon } from 'lucide-react';
import { getLibrary, type LibraryItem } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onPick: (item: LibraryItem) => void;
}

// ⌘K-style global search. Searches the user's library only — that's what the
// existing /api/library?q= endpoint supports. Future scopes (e.g. transcript
// search across all videos) can plug in by adding more sections here.
export function GlobalSearch({ open, onClose, onPick }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
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
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await getLibrary({ q });
        if (!cancelled) setItems(data.items || []);
      } catch {
        if (!cancelled) setItems([]);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(13,45,69,0.35)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(14,165,233,0.25)',
          boxShadow:
            '0 24px 64px rgba(14,165,233,0.20), inset 0 1px 0 rgba(255,255,255,0.95)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'rgba(14,165,233,0.12)' }}
        >
          <Search className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索收藏库（标题 / UP主 / 总结 / 标签）"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#0d2d45' }}
          />
          <span
            className="px-1.5 py-0.5 rounded-lg text-[10px] font-mono"
            style={{ background: 'rgba(14,165,233,0.10)', color: '#0ea5e9' }}
          >
            ESC
          </span>
          <button
            type="button"
            onClick={onClose}
            className="opacity-50 hover:opacity-100"
            title="关闭"
          >
            <CloseIcon className="w-4 h-4" style={{ color: '#0d2d45' }} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#7db8d4' }}>
              输入关键词，搜索你已收藏的视频
            </div>
          )}
          {query.trim() && !loading && !items.length && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#7db8d4' }}>
              没有匹配的收藏
            </div>
          )}
          {loading && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#7db8d4' }}>
              搜索中…
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onPick(item);
                onClose();
              }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-white/60"
              style={{ borderTop: '1px solid rgba(14,165,233,0.08)' }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: '#0ea5e9' }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: '#0d2d45' }}
                >
                  {item.title}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: '#7db8d4' }}
                >
                  {item.author} · {item.category || '待整理'} · {formatDate(item.created_at)}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-50" style={{ color: '#0ea5e9' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
