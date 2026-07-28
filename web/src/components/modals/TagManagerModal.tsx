import { renameTag, mergeTag, deleteTag as deleteTagApi } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';

interface TagManagerModalProps {
  tags: string[];
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

export function TagManagerModal({ tags, onClose, onRefresh, onShowToast }: TagManagerModalProps) {
  async function renameOne(oldName: string) {
    const next = window.prompt('重命名标签', oldName);
    if (!next || next === oldName) return;
    try {
      const data = await renameTag({ from: oldName, to: next });
      await onRefresh();
      onShowToast(`已更新 ${data.changed || 0} 条收藏`, 'ok');
    } catch (err: any) {
      onShowToast('重命名失败：' + (err.message || ''), 'error');
    }
  }

  async function mergeOne(oldName: string) {
    const next = window.prompt('合并到哪个标签？', oldName);
    if (!next || next === oldName) return;
    try {
      const data = await mergeTag({ from: oldName, to: next });
      await onRefresh();
      onShowToast(`已合并 ${data.changed || 0} 条收藏`, 'ok');
    } catch (err: any) {
      onShowToast('合并失败：' + (err.message || ''), 'error');
    }
  }

  async function deleteOne(name: string) {
    if (!window.confirm(`确定从所有收藏中移除 #${name} 吗？`)) return;
    try {
      const data = await deleteTagApi({ name });
      await onRefresh();
      onShowToast(`已移除 ${data.changed || 0} 条收藏中的标签`, 'ok');
    } catch (err: any) {
      onShowToast('删除标签失败：' + (err.message || ''), 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(13,45,69,0.45)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: '0 24px 64px var(--hairline)' }}>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>标签管理</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--stone)' }}>可重命名、合并或从所有收藏移除标签。</p>
        </div>
        <div className="max-h-80 overflow-y-auto flex flex-col gap-2">
          {tags.length ? tags.map((name) => (
            <div key={name} className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)' }}>
              <span className="text-sm font-semibold flex-1" style={{ color: 'var(--brand-tag)' }}>#{name}</span>
              <button type="button" onClick={() => renameOne(name)} className="text-xs underline" style={{ color: 'var(--brand-tag)' }}>重命名</button>
              <button type="button" onClick={() => mergeOne(name)} className="text-xs underline" style={{ color: 'var(--brand-tag)' }}>合并</button>
              <button type="button" onClick={() => deleteOne(name)} className="text-xs underline" style={{ color: 'var(--brand-error)' }}>删除</button>
            </div>
          )) : <EmptyState title="暂无标签" description="收藏内容添加标签后会出现在这里。" />}
        </div>
        <button type="button" onClick={onClose} className="self-end text-sm px-3 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--brand-tag)', border: '1px solid var(--hairline)' }}>完成</button>
      </div>
    </div>
  );
}
