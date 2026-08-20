import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Sparkles, Trash2, Plus, Search, BookOpen } from 'lucide-react';
import {
  getThemeItemsApi,
  synthesizeThemeApi,
  removeThemeItemApi,
  addThemeItemsApi,
  deleteThemeApi,
  getLibrary,
  type LibraryItem,
  type Theme,
} from '@/lib/api';
import { markdownToHtml } from '@/lib/format';
import { ConfirmModal } from '@/components/modals/ConfirmModal';

interface ThemeDetailModalProps {
  themeId: string;
  onClose: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
  onChanged: () => void;
}

export function ThemeDetailModal({ themeId, onClose, onShowToast, onChanged }: ThemeDetailModalProps) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synth, setSynth] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [allItems, setAllItems] = useState<LibraryItem[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function reload() {
    try {
      const d = await getThemeItemsApi(themeId);
      setTheme(d.theme);
      setItems(d.items || []);
      onChanged();
    } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getThemeItemsApi(themeId)
      .then((d) => {
        if (cancelled) return;
        setTheme(d.theme);
        setItems(d.items || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [themeId]);

  async function handleSynthesize() {
    setSynthesizing(true);
    setSynth('');
    try {
      const d = await synthesizeThemeApi(themeId);
      setSynth(d.markdown || '');
    } catch (e: any) {
      onShowToast('生成失败：' + (e?.message || ''), 'error');
    } finally {
      setSynthesizing(false);
    }
  }

  async function handleRemove(itemId: string) {
    try {
      await removeThemeItemApi(themeId, itemId);
      await reload();
    } catch (e: any) {
      onShowToast('移除失败：' + (e?.message || ''), 'error');
    }
  }

  async function openAdd() {
    setAddOpen(true);
    setAddLoading(true);
    try {
      const d = await getLibrary({ page_size: 100 });
      const existing = new Set(items.map((i) => i.id));
      setAllItems((d.items || []).filter((i) => !existing.has(i.id)));
    } catch { /* ignore */ } finally {
      setAddLoading(false);
    }
  }

  async function handleAdd(itemId: string) {
    try {
      await addThemeItemsApi(themeId, [itemId]);
      await reload();
      setAllItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e: any) {
      onShowToast('添加失败：' + (e?.message || ''), 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteThemeApi(themeId);
      onShowToast('主题已删除', 'ok');
      onChanged();
      onClose();
    } catch (e: any) {
      onShowToast('删除失败：' + (e?.message || ''), 'error');
    }
  }

  const filteredAdd = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => (i.title + ' ' + (i.author || '') + ' ' + (i.summary || '')).toLowerCase().includes(q));
  }, [allItems, addSearch]);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center px-4' style={{ background: 'rgba(10,10,10,0.42)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className='w-full max-w-2xl rounded-lg p-6 flex flex-col gap-4 max-h-[85vh]' onClick={(e) => e.stopPropagation()} style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: 'rgba(0,0,0,0.12) 0px 24px 48px -8px' }}>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='text-base font-bold' style={{ color: 'var(--ink)' }}>{theme?.name || '主题'}</h3>
            <p className='text-xs mt-0.5' style={{ color: 'var(--stone)' }}>{items.length} 个视频</p>
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            <button type='button' onClick={() => setConfirmDelete(true)} className='p-1.5 rounded-full' style={{ color: 'var(--brand-error)' }} title='删除主题'><Trash2 className='w-4 h-4' /></button>
            <button type='button' onClick={onClose} className='p-1.5 rounded-full' style={{ color: 'var(--steel)' }} aria-label='关闭'><X className='w-4 h-4' /></button>
          </div>
        </div>

        {loading ? (
          <div className='text-xs flex items-center gap-2' style={{ color: 'var(--steel)' }}><Loader2 className='w-3.5 h-3.5 animate-spin' /> 加载中…</div>
        ) : (
          <>
            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                onClick={handleSynthesize}
                disabled={synthesizing || !items.length}
                className='flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium'
                style={{ background: 'var(--primary)', color: 'var(--on-primary)', opacity: synthesizing || !items.length ? 0.6 : 1 }}
              >
                {synthesizing ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5' />}
                生成主题综合总结
              </button>
              <button type='button' onClick={openAdd} className='flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium' style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.10)', border: '1px solid rgba(55,114,207,0.22)' }}>
                <Plus className='w-3.5 h-3.5' /> 添加视频
              </button>
            </div>

            {synth && (
              <div className='summary rounded-lg p-4 text-sm overflow-y-auto max-h-64' style={{ background: 'var(--surface)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(synth) }} />
            )}

            <div className='overflow-y-auto divide-y rounded-md' style={{ border: '1px solid var(--hairline-soft)', borderColor: 'var(--hairline-soft)' }}>
              {items.length === 0 ? (
                <div className='px-4 py-8 text-center text-sm' style={{ color: 'var(--stone)' }}>这个主题还没有视频，点「添加视频」加入。</div>
              ) : items.map((it) => (
                <div key={it.id} className='flex items-center gap-3 px-3 py-2'>
                  <div className='min-w-0 flex-1'>
                    <div className='text-sm truncate' style={{ color: 'var(--ink)' }}>{it.title}</div>
                    <div className='text-xs truncate' style={{ color: 'var(--stone)' }}>{it.author} · {it.category || '待整理'}</div>
                  </div>
                  <button type='button' onClick={() => handleRemove(it.id)} className='p-1 rounded-full shrink-0' style={{ color: 'var(--muted)' }} title='移除'><X className='w-3.5 h-3.5' /></button>
                </div>
              ))}
            </div>

            {addOpen && (
              <div className='rounded-md border p-3 flex flex-col gap-2' style={{ borderColor: 'var(--hairline)' }}>
                <div className='flex items-center gap-2'>
                  <Search className='w-3.5 h-3.5' style={{ color: 'var(--stone)' }} />
                  <input type='text' value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder='搜索收藏库…' className='flex-1 bg-transparent outline-none text-sm' style={{ color: 'var(--ink)' }} />
                  <button type='button' onClick={() => setAddOpen(false)} className='text-xs' style={{ color: 'var(--steel)' }}>收起</button>
                </div>
                {addLoading ? (
                  <div className='text-xs flex items-center gap-2' style={{ color: 'var(--steel)' }}><Loader2 className='w-3.5 h-3.5 animate-spin' /> 加载中…</div>
                ) : filteredAdd.length === 0 ? (
                  <div className='text-xs px-2 py-3 text-center' style={{ color: 'var(--stone)' }}>没有可添加的视频</div>
                ) : (
                  <div className='max-h-48 overflow-y-auto divide-y' style={{ borderColor: 'var(--hairline-soft)' }}>
                    {filteredAdd.map((it) => (
                      <div key={it.id} className='flex items-center gap-3 px-2 py-1.5'>
                        <BookOpen className='w-3.5 h-3.5 shrink-0' style={{ color: 'var(--muted)' }} />
                        <div className='min-w-0 flex-1'>
                          <div className='text-xs truncate' style={{ color: 'var(--ink)' }}>{it.title}</div>
                        </div>
                        <button type='button' onClick={() => handleAdd(it.id)} className='text-xs px-2 py-0.5 rounded-full font-medium' style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.10)', border: '1px solid rgba(55,114,207,0.22)' }}>添加</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        title='删除主题'
        message={`确定删除主题「${theme?.name || ''}」吗？主题下的视频不会被删除，只是解除分组。`}
        confirmLabel='删除'
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
