import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, BookOpen, Trash2, CheckSquare, Square, RefreshCw, Tags } from 'lucide-react';
import {
  getLibrary,
  getLibraryItem,
  deleteLibrary,
  fetchAndDownload,
  getObsidianPayload,
  reindexLibrary,
  bulkAddTags,
  bulkRemoveTags,
  bulkSetCategory,
  bulkDeleteLibrary,
  downloadBulkExport,
  type LibraryItem,
  type AppConfig,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { TagManagerModal } from '@/components/modals/TagManagerModal';
import { ObsidianExportModal } from '@/components/modals/ObsidianExportModal';
import { DownloadModal } from '@/components/modals/DownloadModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PromptModal } from '@/components/modals/PromptModal';

interface FavoritesPageProps {
  isLoggedIn: boolean;
  config: AppConfig;
  refreshKey: number;
  bumpRefreshKey: () => void;
  initialOpenId?: string | null;
  onConsumedInitialOpen?: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
  onOpenItem?: (item: LibraryItem) => void;
}

const inputBoxStyle: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
  
  boxShadow: 'inset 0 1px 0 var(--canvas)',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
  borderRadius: '0.625rem',
  padding: '0.5rem 2rem 0.5rem 0.75rem',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235b8fae' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.6rem center',
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
};

function normalizeCoverUrl(pic?: string): string {
  const raw = String(pic || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return 'https:' + raw;
  if (raw.startsWith('http://')) return 'https://' + raw.slice('http://'.length);
  return raw;
}

function titleInitial(title?: string): string {
  return String(title || '学').trim().slice(0, 1).toUpperCase() || '学';
}

function CoverFallback({ item }: { item: LibraryItem }) {
  return (
    <div
      className="w-full h-full flex flex-col justify-between p-3"
      style={{
        background:
          'var(--surface)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-base font-black"
          style={{ background: 'var(--canvas)', color: 'var(--ink)' }}
        >
          {titleInitial(item.title)}
        </div>
        <div className="text-[11px] font-semibold" style={{ color: 'var(--steel)' }}>
          {item.category || '视频封面'}
        </div>
      </div>
      <div className="text-sm font-bold line-clamp-2" style={{ color: 'var(--ink)', textShadow: '0 1px 0 var(--canvas)' }}>
        {item.title || '未命名内容'}
      </div>
    </div>
  );
}

export function FavoritesPage({
  isLoggedIn,
  config,
  refreshKey,
  bumpRefreshKey,
  initialOpenId,
  onConsumedInitialOpen,
  onShowToast,
  onOpenItem,
}: FavoritesPageProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('updated_desc');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<{ kind: 'bilibili' | 'xiaoyuzhou'; bvid?: string; urlOrId?: string; title?: string } | null>(null);
  const requestSeq = useRef(0);
  // Obsidian export state — see handleObsidian() for the flow.
  const [obsidianModal, setObsidianModal] = useState<{
    md: string;
    uri: string;
    filePath: string;
    copied: boolean;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const [promptState, setPromptState] = useState<{ title: string; label?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; onConfirm: (v: string) => void } | null>(null);

  const reload = useMemo(
    () => async (q: string, cat: string, t: string, nextPage = 1, nextSort = sort) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const data = await getLibrary({ q, category: cat, tag: t, page: nextPage, page_size: pageSize, sort: nextSort });
        if (seq !== requestSeq.current) return;
        setItems(data.items || []);
        setCategories(data.categories || []);
        setTags(data.tags || []);
        setTotal(data.total || 0);
        setPage(data.page || nextPage);
        setSelectedIds((ids) => ids.filter((id) => (data.items || []).some((item) => item.id === id)));
      } catch {
        if (seq !== requestSeq.current) return;
        setItems([]);
        setTotal(0);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [sort],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      setItems([]);
      setCategories([]);
      setTags([]);
      return;
    }
    reload(query.trim(), category, tag, page, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, refreshKey]);

  // If parent navigated us here with a specific item to focus on, fetch it.
  useEffect(() => {
    if (!initialOpenId) return;
    let cancelled = false;
    getLibraryItem(initialOpenId)
      .then((data) => {
        if (!cancelled && data?.item && onOpenItem) onOpenItem(data.item);
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
    await reload(query.trim(), category, tag, 1, sort);
  }

  async function handlePage(nextPage: number) {
    await reload(query.trim(), category, tag, nextPage, sort);
  }

  async function applyFilter(nextCategory = category, nextTag = tag, nextSort = sort) {
    setCategory(nextCategory);
    setTag(nextTag);
    setSort(nextSort);
    await reload(query.trim(), nextCategory, nextTag, 1, nextSort);
  }

  async function resetFilters() {
    setQuery('');
    setCategory('');
    setTag('');
    setSort('updated_desc');
    await reload('', '', '', 1, 'updated_desc');
  }

  async function handleOpen(id: string) {
    try {
      const data = await getLibraryItem(id);
      if (data?.item && onOpenItem) onOpenItem(data.item);
    } catch (err: any) {
      onShowToast('打开失败：' + (err.message || ''), 'error');
    }
  }

  function handleDelete(id: string) {
    setConfirmState({
      title: '删除收藏',
      message: '确定删除这条收藏吗？此操作不可撤销。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteLibrary(id);
          bumpRefreshKey();
          onShowToast('已删除', 'ok');
        } catch (err: any) {
          onShowToast('删除失败：' + (err.message || ''), 'error');
        }
      },
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  function selectCurrentPage() {
    setSelectedIds(items.map((item) => item.id));
  }

  async function refreshAfterBulk(msg: string) {
    setSelectedIds([]);
    await reload(query.trim(), category, tag, page, sort);
    bumpRefreshKey();
    onShowToast(msg, 'ok');
  }

  async function handleReindex() {
    try {
      const data = await reindexLibrary();
      onShowToast(`已重建 ${data.indexed || 0} 条索引`, 'ok');
    } catch (err: any) {
      onShowToast('重建索引失败：' + (err.message || ''), 'error');
    }
  }

  function parseTagInput(raw: string) {
    return raw.split(/[,，\s#]+/).map((s) => s.trim()).filter(Boolean);
  }

  function handleBulkAddTags() {
    setPromptState({
      title: '添加标签',
      label: '输入要添加的标签，多个用空格或逗号分隔',
      placeholder: '例如：AI 效率',
      confirmLabel: '添加',
      onConfirm: async (raw) => {
        try {
          const data = await bulkAddTags({ ids: selectedIds, tags: parseTagInput(raw) });
          await refreshAfterBulk(`已更新 ${data.changed || 0} 条收藏`);
        } catch (err: any) {
          onShowToast('批量添加标签失败：' + (err.message || ''), 'error');
        }
      },
    });
  }

  function handleBulkRemoveTags() {
    setPromptState({
      title: '移除标签',
      label: '输入要移除的标签，多个用空格或逗号分隔',
      placeholder: '例如：AI 效率',
      confirmLabel: '移除',
      onConfirm: async (raw) => {
        try {
          const data = await bulkRemoveTags({ ids: selectedIds, tags: parseTagInput(raw) });
          await refreshAfterBulk(`已更新 ${data.changed || 0} 条收藏`);
        } catch (err: any) {
          onShowToast('批量移除标签失败：' + (err.message || ''), 'error');
        }
      },
    });
  }

  function handleBulkCategory() {
    setPromptState({
      title: '修改分类',
      label: '输入新的分类名称',
      defaultValue: category || '待整理',
      confirmLabel: '修改',
      onConfirm: async (raw) => {
        try {
          const data = await bulkSetCategory({ ids: selectedIds, category: raw || '待整理' });
          await refreshAfterBulk(`已更新 ${data.changed || 0} 条收藏`);
        } catch (err: any) {
          onShowToast('批量修改分类失败：' + (err.message || ''), 'error');
        }
      },
    });
  }

  function handleBulkDelete() {
    setConfirmState({
      title: '批量删除',
      message: `确定删除选中的 ${selectedIds.length} 条收藏吗？此操作不可撤销。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        try {
          const data = await bulkDeleteLibrary({ ids: selectedIds });
          await refreshAfterBulk(`已删除 ${data.changed || 0} 条收藏`);
        } catch (err: any) {
          onShowToast('批量删除失败：' + (err.message || ''), 'error');
        }
      },
    });
  }

  async function handleBulkExport(kind: 'markdown' | 'json') {
    try {
      await downloadBulkExport(kind, selectedIds);
      onShowToast('已开始下载', 'ok');
    } catch (err: any) {
      onShowToast('批量导出失败：' + (err.message || ''), 'error');
    }
  }

  async function handleObsidian(id: string) {
    // We *never* try to stuff the markdown into the obsidian:// URI's
    // `content=` param. Windows shell silently truncates URIs around 2KB,
    // and any non-ASCII content (Chinese summaries) inflates 3× under URI
    // encoding, so even a "short" Chinese note can lose its body.
    //
    // Reliable flow instead:
    //   1. Copy markdown to clipboard.
    //   2. Open obsidian://new with vault + name only — creates an empty note.
    //   3. Show a persistent banner telling the user to Ctrl+V inside Obsidian.
    try {
      const data = await getObsidianPayload(id);
      if (!data.success) throw new Error(data.error || '加载笔记失败');
      const md = data.markdown || '';
      const vault = (config.obsidian_vault_name || data.vault_name || '').trim();
      const filePath = data.relative_path || data.name || '';

      let copied = false;
      try {
        await navigator.clipboard.writeText(md);
        copied = true;
      } catch {
        // navigator.clipboard can fail under non-https origins (e.g. raw IP
        // access without https). We surface that explicitly below.
      }

      const params: string[] = [];
      if (vault) params.push('vault=' + encodeURIComponent(vault));
      params.push('name=' + encodeURIComponent(filePath));
      params.push('content=' + encodeURIComponent(md));
      const uri = 'obsidian://new?' + params.join('&');

      setObsidianModal({ md, uri, filePath, copied });
      window.location.href = uri;
    } catch (err: any) {
      onShowToast('唤起 Obsidian 失败：' + (err.message || ''), 'error');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
          收藏库
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--stone)' }}>
          搜索、筛选、打开和导出你的学习资料。
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 max-w-5xl flex-wrap">
        <div
          className="flex-1 min-w-[260px] flex items-center gap-2 px-4 py-2.5 rounded-md"
          style={inputBoxStyle}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--stone)' }} />
          <input
            type="text"
            placeholder="搜索标题、UP主、总结、标签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        <select
          value={sort}
          onChange={(e) => applyFilter(category, tag, e.target.value)}
          style={selectStyle}
        >
          <option value="updated_desc">最近更新</option>
          <option value="updated_asc">最早更新</option>
          <option value="title_asc">标题 A-Z</option>
          <option value="duration_desc">时长最长</option>
        </select>

        <button
          type="button"
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200  "
          style={{
            background: 'var(--primary)',
            color: 'var(--on-primary)',
          }}
        >
          搜索
        </button>
      </div>

      <div className="max-w-5xl mt-3 flex flex-col gap-2">
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--stone)' }}>分类</span>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyFilter(category === c ? '' : c, tag, sort)}
                className="text-xs px-2.5 py-1 rounded-full transition-all "
                style={{
                  background: category === c ? 'var(--hairline)' : 'var(--surface)',
                  color: category === c ? 'var(--brand-tag)' : 'var(--steel)',
                  border: `1px solid ${category === c ? 'var(--primary)' : 'var(--hairline)'}`,
                  fontWeight: category === c ? 700 : 500,
                }}
              >
                {c}{category === c ? ' ×' : ''}
              </button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--stone)' }}>标签</span>
            {tags.slice(0, 18).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => applyFilter(category, tag === t ? '' : t, sort)}
                className="text-xs px-2.5 py-1 rounded-full transition-all "
                style={{
                  background: tag === t ? 'var(--hairline)' : 'var(--surface)',
                  color: tag === t ? 'var(--brand-tag)' : 'var(--steel)',
                  border: `1px solid ${tag === t ? 'var(--primary)' : 'var(--hairline)'}`,
                  fontWeight: tag === t ? 700 : 500,
                }}
              >
                #{t}{tag === t ? ' ×' : ''}
              </button>
            ))}
            {(query || category || tag || sort !== 'updated_desc') && (
              <button type="button" onClick={resetFilters} className="text-xs px-2.5 py-1 rounded-full" style={{ color: 'var(--brand-error)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                重置筛选
              </button>
            )}
          </div>
        )}
      </div>

      {isLoggedIn && (
        <div className="max-w-5xl mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={handleReindex} className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ background: 'var(--canvas)', color: 'var(--brand-tag)', border: '1px solid var(--hairline)' }}>
            <RefreshCw className="w-3 h-3" /> 重建索引
          </button>
          <button type="button" onClick={() => setTagManagerOpen(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ background: 'var(--canvas)', color: 'var(--brand-tag)', border: '1px solid var(--hairline)' }}>
            <Tags className="w-3 h-3" /> 标签管理
          </button>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md" style={{ background: 'rgba(55,114,207,0.15)', border: '1px solid var(--hairline)', color: 'var(--brand-tag)' }}>
              <span className="font-bold">已选择 {selectedIds.length} 条</span>
              <button type="button" onClick={selectCurrentPage} className="underline">全选本页</button>
              <button type="button" onClick={() => setSelectedIds([])} className="underline">清空</button>
              <button type="button" onClick={handleBulkAddTags}>加标签</button>
              <button type="button" onClick={handleBulkRemoveTags}>移除标签</button>
              <button type="button" onClick={handleBulkCategory}>改分类</button>
              <button type="button" onClick={() => handleBulkExport('markdown')}>导出 MD</button>
              <button type="button" onClick={() => handleBulkExport('json')}>导出 JSON</button>
              <button type="button" onClick={handleBulkDelete} style={{ color: 'var(--brand-error)' }}>删除</button>
            </div>
          )}
        </div>
      )}

      {/* Cards / empty */}
      <div className="max-w-5xl mt-4">
        {!isLoggedIn ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-lg"
            style={{
              border: '1.5px dashed var(--hairline)',
              background: 'var(--surface)',
              
            }}
          >
            <BookOpen className="w-10 h-10 mb-3" style={{ color: 'var(--muted)' }} />
            <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--stone)' }}>
              请先登录后查看你的收藏。
            </p>
          </div>
        ) : loading ? (
          <div
            className="flex items-center justify-center py-16 rounded-lg"
            style={cardStyle}
          >
            <div className="bs-spinner" />
          </div>
        ) : !items.length ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-lg"
            style={{
              border: '1.5px dashed var(--hairline)',
              background: 'var(--surface)',
              
            }}
          >
            <BookOpen className="w-10 h-10 mb-3" style={{ color: 'var(--muted)' }} />
            <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--stone)' }}>
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
                className="rounded-lg p-4 flex flex-col gap-3 relative"
                style={cardStyle}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                  className="absolute top-3 right-3 p-1 rounded-lg z-10"
                  style={{ background: selectedIds.includes(item.id) ? 'var(--hairline)' : 'var(--canvas)', color: 'var(--brand-tag)', border: '1px solid var(--hairline)' }}
                  title="选择"
                >
                  {selectedIds.includes(item.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
                <div className="w-full h-28 rounded-md overflow-hidden relative" style={{ background: 'var(--surface)' }}>
                  <CoverFallback item={item} />
                  {normalizeCoverUrl(item.pic) ? (
                    <img
                      src={normalizeCoverUrl(item.pic)}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>
                <h3
                  className="text-sm font-bold leading-snug line-clamp-2"
                  style={{ color: 'var(--ink)' }}
                >
                  {item.title}
                </h3>
                <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--stone)' }}>
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
                          background: 'rgba(55,114,207,0.15)',
                          color: 'var(--brand-tag)',
                          border: '1px solid var(--hairline)',
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                {(item.snippet || item.summary) && (
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--steel)', lineHeight: 1.55 }}>
                    {(item.snippet || item.summary).replace(/<\/?mark>/g, '').replace(/[#>*`_\-]/g, '').slice(0, 140)}...
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(item.id)}
                    className="text-xs px-2.5 py-1 rounded-full font-medium transition-all "
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--brand-tag)',
                      border: '1px solid var(--hairline)',
                    }}
                  >
                    打开
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchAndDownload('/api/export/' + item.id + '.pdf')}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all "
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--steel)',
                      border: '1px solid var(--hairline)',
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchAndDownload('/api/export/' + item.id + '.md')}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all "
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--steel)',
                      border: '1px solid var(--hairline)',
                    }}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => handleObsidian(item.id)}
                    className="text-xs px-2.5 py-1 rounded-full font-medium transition-all "
                    style={{
                      background: 'var(--primary)',
                      color: 'var(--on-primary)',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                    }}
                  >
                    Obsidian
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="text-xs px-2 py-1 rounded-lg transition-all  ml-auto"
                    style={{
                      background: 'rgba(239,68,68,0.06)',
                      color: 'var(--brand-error)',
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

      {isLoggedIn && total > pageSize && (
        <div className="max-w-5xl mt-4 flex items-center justify-center gap-3 text-xs" style={{ color: 'var(--steel)' }}>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => handlePage(page - 1)}
            className="px-3 py-1.5 rounded-full font-medium disabled:opacity-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            上一页
          </button>
          <span>
            第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页，共 {total} 条
          </span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / pageSize) || loading}
            onClick={() => handlePage(page + 1)}
            className="px-3 py-1.5 rounded-full font-medium disabled:opacity-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            下一页
          </button>
        </div>
      )}

      {/* Obsidian export modal — persistent banner so the user can re-copy
          if Obsidian was already open and didn't grab focus, and the URI
          can be re-clicked if the OS scheme handler missed the first time. */}
      {tagManagerOpen && (
        <TagManagerModal
          tags={tags}
          onClose={() => setTagManagerOpen(false)}
          onRefresh={() => reload(query.trim(), category, tag, page, sort)}
          onShowToast={onShowToast}
        />
      )}

      {obsidianModal && (
        <ObsidianExportModal
          state={obsidianModal}
          onClose={() => setObsidianModal(null)}
          onShowToast={onShowToast}
        />
      )}

      {downloadTarget && (
        <DownloadModal
          open={!!downloadTarget}
          onClose={() => setDownloadTarget(null)}
          kind={downloadTarget.kind}
          bvid={downloadTarget.bvid}
          urlOrId={downloadTarget.urlOrId}
          title={downloadTarget.title}
          onShowToast={onShowToast}
        />
      )}

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        onConfirm={() => confirmState?.onConfirm()}
        onClose={() => setConfirmState(null)}
      />

      <PromptModal
        open={!!promptState}
        title={promptState?.title || ''}
        label={promptState?.label}
        defaultValue={promptState?.defaultValue}
        placeholder={promptState?.placeholder}
        confirmLabel={promptState?.confirmLabel}
        onConfirm={(v) => promptState?.onConfirm(v)}
        onClose={() => setPromptState(null)}
      />
    </div>
  );
}

// TagManagerModal and ObsidianExportModal are now in
// web/src/components/modals/ — imported at the top of this file.
