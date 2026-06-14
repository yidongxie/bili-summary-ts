import { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, ExternalLink, Trash2, FileDown, FileText, BookMarked } from 'lucide-react';
import {
  getLibrary,
  getLibraryItem,
  deleteLibrary,
  fetchAndDownload,
  getObsidianPayload,
  type LibraryItem,
  type AppConfig,
} from '@/lib/api';
import { formatDate, markdownToHtml } from '@/lib/format';

interface FavoritesPageProps {
  isLoggedIn: boolean;
  config: AppConfig;
  refreshKey: number;
  bumpRefreshKey: () => void;
  initialOpenId?: string | null;
  onConsumedInitialOpen?: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

const inputBoxStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(14,165,233,0.18)',
  backdropFilter: 'blur(12px)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(14,165,233,0.18)',
  borderRadius: '0.625rem',
  padding: '0.5rem 2rem 0.5rem 0.75rem',
  fontSize: 13,
  color: '#0d2d45',
  outline: 'none',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235b8fae' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.6rem center',
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(14,165,233,0.14)',
  backdropFilter: 'blur(16px)',
  boxShadow:
    '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
};

export function FavoritesPage({
  isLoggedIn,
  config,
  refreshKey,
  bumpRefreshKey,
  initialOpenId,
  onConsumedInitialOpen,
  onShowToast,
}: FavoritesPageProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useMemo(
    () => async (q: string, cat: string, t: string) => {
      setLoading(true);
      try {
        const data = await getLibrary({ q, category: cat, tag: t });
        setItems(data.items || []);
        setCategories(data.categories || []);
        setTags(data.tags || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      setItems([]);
      setCategories([]);
      setTags([]);
      return;
    }
    reload(query.trim(), category, tag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, refreshKey]);

  // If parent navigated us here with a specific item to focus on, fetch it.
  useEffect(() => {
    if (!initialOpenId) return;
    let cancelled = false;
    getLibraryItem(initialOpenId)
      .then((data) => {
        if (!cancelled && data?.item) setOpenItem(data.item);
      })
      .catch(() => {})
      .finally(() => {
        onConsumedInitialOpen?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId]);

  async function handleSearch() {
    await reload(query.trim(), category, tag);
  }

  async function handleOpen(id: string) {
    try {
      const data = await getLibraryItem(id);
      if (data?.item) {
        setOpenItem(data.item);
        // Scroll the detail panel into view next tick.
        setTimeout(() => {
          document
            .getElementById('library-detail')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } catch (err: any) {
      onShowToast('打开失败：' + (err.message || ''), 'error');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('确定删除这条收藏吗？')) return;
    try {
      await deleteLibrary(id);
      if (openItem?.id === id) setOpenItem(null);
      bumpRefreshKey();
      onShowToast('已删除', 'ok');
    } catch (err: any) {
      onShowToast('删除失败：' + (err.message || ''), 'error');
    }
  }

  async function handleObsidian(id: string) {
    try {
      const data = await getObsidianPayload(id);
      if (!data.success) throw new Error(data.error || '加载笔记失败');
      const md = data.markdown || '';
      const vault = (config.obsidian_vault_name || data.vault_name || '').trim();
      const filePath = data.relative_path || data.name || '';
      const params: string[] = [];
      if (vault) params.push('vault=' + encodeURIComponent(vault));
      params.push('name=' + encodeURIComponent(filePath));
      params.push('content=' + encodeURIComponent(md));
      const uri = 'obsidian://new?' + params.join('&');

      // Fallback for very long notes — most browsers/OS shells choke past 7500.
      if (uri.length > 7500) {
        try {
          await navigator.clipboard.writeText(md);
        } catch {
          /* ignore */
        }
        const fallback =
          'obsidian://new?' +
          (vault ? 'vault=' + encodeURIComponent(vault) + '&' : '') +
          'name=' +
          encodeURIComponent(filePath);
        onShowToast('笔记较长，已复制到剪贴板。打开 Obsidian 后 Ctrl+V 粘贴。', 'info');
        setTimeout(() => {
          window.location.href = fallback;
        }, 200);
        return;
      }

      onShowToast('正在唤起 Obsidian…', 'ok');
      window.location.href = uri;
    } catch (err: any) {
      onShowToast('唤起 Obsidian 失败：' + (err.message || ''), 'error');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-8 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#0d2d45' }}>
          收藏库
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#7db8d4' }}>
          搜索、筛选、打开和导出你的学习资料。
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 max-w-5xl flex-wrap">
        <div
          className="flex-1 min-w-[260px] flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={inputBoxStyle}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: '#7db8d4' }} />
          <input
            type="text"
            placeholder="搜索标题、UP主、总结、标签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#0d2d45' }}
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={selectStyle}
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select value={tag} onChange={(e) => setTag(e.target.value)} style={selectStyle}>
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            color: '#fff',
            boxShadow:
              '0 4px 16px rgba(14,165,233,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          搜索
        </button>
      </div>

      {/* Cards / empty */}
      <div className="max-w-5xl mt-4">
        {!isLoggedIn ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-2xl"
            style={{
              border: '1.5px dashed rgba(14,165,233,0.25)',
              background: 'rgba(255,255,255,0.30)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <BookOpen className="w-10 h-10 mb-3" style={{ color: '#b0d8f0' }} />
            <p className="text-sm text-center leading-relaxed" style={{ color: '#7db8d4' }}>
              请先登录后查看你的收藏。
            </p>
          </div>
        ) : loading ? (
          <div
            className="flex items-center justify-center py-16 rounded-2xl"
            style={cardStyle}
          >
            <div className="bs-spinner" />
          </div>
        ) : !items.length ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-2xl"
            style={{
              border: '1.5px dashed rgba(14,165,233,0.25)',
              background: 'rgba(255,255,255,0.30)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <BookOpen className="w-10 h-10 mb-3" style={{ color: '#b0d8f0' }} />
            <p className="text-sm text-center leading-relaxed" style={{ color: '#7db8d4' }}>
              还没有收藏。先总结一个视频，然后
              <br />
              保存到收藏库。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={cardStyle}
              >
                <h3
                  className="text-sm font-bold leading-snug line-clamp-2"
                  style={{ color: '#0d2d45' }}
                >
                  {item.title}
                </h3>
                <div className="flex flex-wrap gap-2 text-xs" style={{ color: '#7db8d4' }}>
                  <span>{item.author}</span>
                  <span>·</span>
                  <span>{item.category || '待整理'}</span>
                  <span>·</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(14,165,233,0.10)',
                          color: '#0369a1',
                          border: '1px solid rgba(14,165,233,0.15)',
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(item.id)}
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105"
                    style={{
                      background: 'rgba(255,255,255,0.7)',
                      color: '#0369a1',
                      border: '1px solid rgba(14,165,233,0.20)',
                    }}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchAndDownload('/api/export/' + item.id + '.pdf')}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                    style={{
                      background: 'rgba(255,255,255,0.5)',
                      color: '#5b8fae',
                      border: '1px solid rgba(14,165,233,0.15)',
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchAndDownload('/api/export/' + item.id + '.md')}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                    style={{
                      background: 'rgba(255,255,255,0.5)',
                      color: '#5b8fae',
                      border: '1px solid rgba(14,165,233,0.15)',
                    }}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => handleObsidian(item.id)}
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                      color: '#fff',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                    }}
                  >
                    Obsidian
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="text-xs px-2 py-1 rounded-lg transition-all hover:scale-105 ml-auto"
                    style={{
                      background: 'rgba(239,68,68,0.06)',
                      color: '#b91c1c',
                      border: '1px solid rgba(239,68,68,0.20)',
                    }}
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Detail */}
      {openItem && (
        <div
          id="library-detail"
          className="max-w-5xl mt-6 rounded-2xl p-6 flex flex-col gap-4"
          style={cardStyle}
        >
          <div className="flex items-start gap-3 justify-between flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold" style={{ color: '#0d2d45' }}>
                {openItem.title}
              </h3>
              <div className="text-xs mt-1" style={{ color: '#7db8d4' }}>
                {openItem.author} · {openItem.category || '待整理'} ·{' '}
                {formatDate(openItem.created_at)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {openItem.link && (
                <a
                  href={openItem.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105"
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    color: '#0369a1',
                    border: '1px solid rgba(14,165,233,0.20)',
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  打开原视频
                </a>
              )}
              <button
                type="button"
                onClick={() => fetchAndDownload('/api/export/' + openItem.id + '.pdf')}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.5)',
                  color: '#5b8fae',
                  border: '1px solid rgba(14,165,233,0.15)',
                }}
              >
                <FileText className="w-3 h-3" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => fetchAndDownload('/api/export/' + openItem.id + '.md')}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.5)',
                  color: '#5b8fae',
                  border: '1px solid rgba(14,165,233,0.15)',
                }}
              >
                <FileDown className="w-3 h-3" />
                Markdown
              </button>
              <button
                type="button"
                onClick={() => handleObsidian(openItem.id)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}
              >
                <BookMarked className="w-3 h-3" />
                Obsidian
              </button>
            </div>
          </div>

          {openItem.tags && openItem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {openItem.tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(14,165,233,0.10)',
                    color: '#0369a1',
                    border: '1px solid rgba(14,165,233,0.15)',
                  }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {openItem.bvid && (
            <div
              className="relative w-full rounded-xl overflow-hidden"
              style={{ paddingBottom: '56.25%', background: '#05070d' }}
            >
              <iframe
                src={`https://player.bilibili.com/player.html?bvid=${openItem.bvid}&autoplay=0&high_quality=1`}
                frameBorder={0}
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          )}

          <div
            className="summary"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(openItem.summary) }}
          />

          {openItem.notes && (
            <div>
              <h4 className="text-sm font-bold mb-2" style={{ color: '#0d2d45' }}>
                我的笔记
              </h4>
              <div
                className="summary"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(openItem.notes) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
