import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { listBiliPages, downloadBiliVideo, downloadXiaoyuzhou, type BiliPage } from '@/lib/api';

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'bilibili' | 'xiaoyuzhou';
  bvid?: string;
  urlOrId?: string;
  title?: string;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

const QUALITIES = [
  { qn: 116, label: '1080P 60帧' },
  { qn: 112, label: '1080P' },
  { qn: 64, label: '720P' },
  { qn: 32, label: '480P' },
];

export function DownloadModal({ open, onClose, kind, bvid, urlOrId, title, onShowToast }: DownloadModalProps) {
  const [pages, setPages] = useState<BiliPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedCid, setSelectedCid] = useState(0);
  const [qn, setQn] = useState(116);
  const [audioOnly, setAudioOnly] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDownloading(false);
    setProgress(null);
    setAudioOnly(false);
    setQn(116);
    if (kind === 'bilibili' && bvid) {
      setLoadingPages(true);
      setPages([]);
      setSelectedCid(0);
      listBiliPages(bvid)
        .then((d) => {
          if (d.success && d.pages?.length) {
            setPages(d.pages);
            setSelectedCid(d.pages[0].cid);
          }
        })
        .catch(() => setError('获取分P列表失败'))
        .finally(() => setLoadingPages(false));
    }
  }, [open, kind, bvid]);

  if (!open) return null;

  const isBili = kind === 'bilibili';

  async function handleDownload() {
    setError(null);
    setDownloading(true);
    setProgress(null);
    try {
      if (isBili && bvid) {
        await downloadBiliVideo(bvid, {
          cid: selectedCid || undefined,
          qn: audioOnly ? undefined : qn,
          audio: audioOnly,
          onProgress: setProgress,
        });
      } else if (!isBili && urlOrId) {
        await downloadXiaoyuzhou(urlOrId, { onProgress: setProgress });
      }
      onShowToast('下载完成', 'ok');
      onClose();
    } catch (err: any) {
      const msg = err.message || '下载失败';
      setError(msg);
      onShowToast('下载失败：' + msg, 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center px-4'
      style={{ background: 'rgba(13,45,69,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className='w-full max-w-md rounded-lg p-6 flex flex-col gap-4'
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: '0 24px 64px var(--hairline), inset 0 1px 0 var(--canvas)' }}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='text-base font-bold' style={{ color: 'var(--ink)' }}>{isBili ? '下载视频' : '下载音频'}</h3>
            {title && <p className='text-xs mt-1 truncate' style={{ color: 'var(--stone)' }}>{title}</p>}
          </div>
          <button type='button' onClick={onClose} className='rounded-full p-1.5 shrink-0' style={{ color: 'var(--steel)' }} aria-label='关闭'>
            <X className='w-4 h-4' />
          </button>
        </div>

        {isBili && (
          <>
            {loadingPages ? (
              <div className='text-xs flex items-center gap-2' style={{ color: 'var(--steel)' }}>
                <Loader2 className='w-3.5 h-3.5 animate-spin' /> 正在获取分P信息…
              </div>
            ) : pages.length > 1 ? (
              <div className='flex flex-col gap-2'>
                <span className='text-xs font-semibold' style={{ color: 'var(--steel)' }}>分P（共 {pages.length} 个）</span>
                <select
                  value={selectedCid}
                  onChange={(e) => setSelectedCid(Number(e.target.value))}
                  className='w-full rounded-md px-3 py-2 text-sm'
                  style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
                >
                  {pages.map((p) => (
                    <option key={p.cid} value={p.cid}>P{p.page}{p.part ? ' · ' + p.part : ''}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className='flex flex-col gap-2'>
              <span className='text-xs font-semibold' style={{ color: 'var(--steel)' }}>画质</span>
              <div className='grid grid-cols-2 gap-2'>
                {QUALITIES.map((q) => (
                  <button
                    key={q.qn}
                    type='button'
                    onClick={() => { setAudioOnly(false); setQn(q.qn); }}
                    disabled={downloading}
                    className='rounded-md px-3 py-2 text-sm font-medium transition'
                    style={!audioOnly && qn === q.qn ? { background: 'var(--primary)', color: 'var(--on-primary)' } : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type='button'
                  onClick={() => setAudioOnly(true)}
                  disabled={downloading}
                  className='rounded-md px-3 py-2 text-sm font-medium transition'
                  style={audioOnly ? { background: 'var(--primary)', color: 'var(--on-primary)' } : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
                >
                  仅音频
                </button>
              </div>
            </div>
          </>
        )}

        {error && <div className='text-xs' style={{ color: 'var(--brand-error)' }}>{error}</div>}

        {downloading && (
          <div className='flex flex-col gap-1.5'>
            <div className='h-1.5 w-full rounded-full overflow-hidden' style={{ background: 'var(--hairline-soft)' }}>
              <div
                className={'h-full rounded-full transition-all ' + (progress == null ? 'animate-pulse' : '')}
                style={{ width: progress == null ? '40%' : (progress + '%'), background: 'var(--primary)' }}
              />
            </div>
            <div className='text-xs text-right' style={{ color: 'var(--steel)' }}>
              {progress == null ? '下载中…' : (progress + '%')}
            </div>
          </div>
        )}

        <button
          type='button'
          onClick={handleDownload}
          disabled={downloading || (isBili && loadingPages)}
          className='w-full flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition'
          style={{ background: 'var(--primary)', color: 'var(--on-primary)', opacity: downloading || (isBili && loadingPages) ? 0.6 : 1 }}
        >
          {downloading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Download className='w-4 h-4' />}
          {downloading ? '下载中…' : isBili ? (audioOnly ? '下载音频' : '开始下载') : '下载音频'}
        </button>
      </div>
    </div>
  );
}

