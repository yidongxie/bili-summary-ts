import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { listUploaderVideos, downloadBiliVideo } from '@/lib/api';

interface UploaderModalProps {
  open: boolean;
  url: string;
  onClose: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

type UploaderVideo = { title: string; bvid: string; duration?: number };

export function UploaderModal({ open, url, onClose, onShowToast }: UploaderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [videos, setVideos] = useState<UploaderVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setName('');
    setVideos([]);
    setSelected(new Set());
    setDownloading(false);
    setProgress('');
    listUploaderVideos(url)
      .then((data) => {
        if (!data.success || !data.videos?.length) throw new Error(data.error || '未获取到视频');
        setName(data.uploader || '');
        setVideos(data.videos);
        setSelected(new Set(data.videos.map((v) => v.bvid)));
      })
      .catch((err: any) => setError(err.message || '获取失败'))
      .finally(() => setLoading(false));
  }, [open, url]);

  if (!open) return null;

  async function handleBatchDownload() {
    const targets = videos.filter((v) => selected.has(v.bvid));
    if (!targets.length) return;
    setDownloading(true);
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      const v = targets[i];
      setProgress('正在下载 ' + (i + 1) + '/' + targets.length + '：' + v.title);
      try {
        await downloadBiliVideo(v.bvid);
        ok++;
      } catch (err: any) {
        onShowToast('下载失败（' + v.title + '）：' + (err.message || ''), 'error');
      }
    }
    setDownloading(false);
    setProgress('');
    onShowToast('批量下载完成：成功 ' + ok + '/' + targets.length, ok === targets.length ? 'ok' : 'info');
    onClose();
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center px-4'
      style={{ background: 'rgba(13,45,69,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className='w-full max-w-lg rounded-lg p-6 flex flex-col gap-4'
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: '0 24px 64px var(--hairline), inset 0 1px 0 var(--canvas)' }}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='text-base font-bold' style={{ color: 'var(--ink)' }}>博主合集</h3>
            {!loading && !error && videos.length > 0 && (
              <p className='text-xs mt-1 truncate' style={{ color: 'var(--stone)' }}>
                {name ? `${name} 的视频` : '博主视频'}（共 {videos.length} 个）
              </p>
            )}
          </div>
          <button type='button' onClick={onClose} className='rounded-full p-1.5 shrink-0' style={{ color: 'var(--steel)' }} aria-label='关闭'>
            <X className='w-4 h-4' />
          </button>
        </div>

        {loading && (
          <div className='text-xs flex items-center gap-2' style={{ color: 'var(--steel)' }}>
            <Loader2 className='w-3.5 h-3.5 animate-spin' /> 正在获取博主视频列表…
          </div>
        )}

        {error && <div className='text-xs' style={{ color: 'var(--brand-error)' }}>{error}</div>}

        {!loading && !error && videos.length > 0 && (
          <>
            <div className='max-h-72 overflow-y-auto divide-y rounded-md' style={{ borderColor: 'var(--hairline-soft)', border: '1px solid var(--hairline-soft)' }}>
              {videos.map((v, idx) => (
                <label key={v.bvid} className='flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-black/5'>
                  <input
                    type='checkbox'
                    checked={selected.has(v.bvid)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(v.bvid); else next.delete(v.bvid);
                        return next;
                      });
                    }}
                    className='mt-0.5 shrink-0'
                  />
                  <span className='min-w-0 flex-1 text-xs leading-snug' style={{ color: 'var(--ink)' }}>
                    <span className='mr-1.5 opacity-50'>{idx + 1}.</span>{v.title}
                  </span>
                  {v.duration ? (
                    <span className='text-[11px] shrink-0 font-mono' style={{ color: 'var(--muted)' }}>
                      {Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>

            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-xs' style={{ color: 'var(--steel)' }}>已选 {selected.size} 个</span>
              <button type='button' onClick={() => setSelected(new Set(videos.map((v) => v.bvid)))} className='text-xs px-2 py-1 rounded-full font-medium' style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.10)', border: '1px solid rgba(55,114,207,0.22)' }}>全选</button>
              <button type='button' onClick={() => setSelected(new Set())} className='text-xs px-2 py-1 rounded-full font-medium' style={{ color: 'var(--steel)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>清空</button>
            </div>
          </>
        )}

        {downloading && (
          <div className='text-xs flex items-center gap-2' style={{ color: 'var(--steel)' }}>
            <Loader2 className='w-3.5 h-3.5 animate-spin' /> {progress || '下载中…'}
          </div>
        )}

        <button
          type='button'
          onClick={handleBatchDownload}
          disabled={downloading || loading || !!error || selected.size === 0}
          className='w-full flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition'
          style={{ background: 'var(--primary)', color: 'var(--on-primary)', opacity: downloading || loading || !!error || selected.size === 0 ? 0.6 : 1 }}
        >
          {downloading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Download className='w-4 h-4' />}
          {downloading ? '下载中…' : '下载所选（' + selected.size + '）'}
        </button>
      </div>
    </div>
  );
}
