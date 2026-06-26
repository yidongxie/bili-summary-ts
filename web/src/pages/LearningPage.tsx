import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Plus, Brain, HelpCircle } from 'lucide-react';
import {
  getPaths,
  createPathApi,
  addPathItem,
  completePathItem,
  getDueReviews,
  answerReview,
  generateQuiz,
  getLibrary,
  type LearningPath,
  type ReviewItem,
  type LibraryItem,
  type Quiz,
} from '@/lib/api';

interface LearningPageProps {
  isLoggedIn: boolean;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.58)',
  border: '1px solid rgba(14,165,233,0.14)',
  backdropFilter: 'blur(16px)',
  boxShadow: '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
};

export function LearningPage({ isLoggedIn, onShowToast }: LearningPageProps) {
  const [tab, setTab] = useState<'paths' | 'review' | 'quiz'>('paths');
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    if (!isLoggedIn) return;
    const [pathData, reviewData, libData] = await Promise.all([
      getPaths(),
      getDueReviews(),
      getLibrary({ page_size: 100 }),
    ]);
    setPaths(pathData.paths || []);
    setReviews(reviewData.items || []);
    setLibrary(libData.items || []);
    if (!selectedPath && pathData.paths?.[0]) setSelectedPath(pathData.paths[0].id);
    if (!selectedItem && libData.items?.[0]) setSelectedItem(libData.items[0].id);
  }

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  async function createPath() {
    const title = window.prompt('学习路径名称', '新的学习路径');
    if (!title) return;
    try {
      await createPathApi({ title });
      await reload();
      onShowToast('已创建学习路径', 'ok');
    } catch (err: any) {
      onShowToast('创建失败：' + (err.message || ''), 'error');
    }
  }

  async function addItem() {
    if (!selectedPath || !selectedItem) return;
    try {
      await addPathItem(selectedPath, selectedItem);
      await reload();
      onShowToast('已加入学习路径', 'ok');
    } catch (err: any) {
      onShowToast('添加失败：' + (err.message || ''), 'error');
    }
  }

  async function toggleComplete(pathId: string, itemId: string, done: boolean) {
    try {
      await completePathItem(pathId, itemId, !done);
      await reload();
    } catch (err: any) {
      onShowToast('更新进度失败：' + (err.message || ''), 'error');
    }
  }

  async function gradeReview(id: string, quality: number) {
    try {
      await answerReview(id, quality);
      await reload();
      onShowToast('已安排下一次复习', 'ok');
    } catch (err: any) {
      onShowToast('提交复习失败：' + (err.message || ''), 'error');
    }
  }

  async function makeQuiz() {
    if (!selectedItem) return;
    setLoading(true);
    try {
      const data = await generateQuiz(selectedItem);
      setQuiz(data.quiz);
      onShowToast('测验已生成', 'ok');
    } catch (err: any) {
      onShowToast('生成测验失败：' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!isLoggedIn) {
    return <div className="px-8 py-10" style={{ color: '#5b8fae' }}>请先登录后使用学习中心。</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#0d2d45' }}>学习中心</h2>
        <p className="text-sm mt-0.5" style={{ color: '#7db8d4' }}>把收藏内容组织成路径、复习卡和测验。</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['paths', '学习路径', BookOpen],
          ['review', `今日复习 ${reviews.length}`, Brain],
          ['quiz', '测验', HelpCircle],
        ].map(([key, label, Icon]: any) => (
          <button key={key} type="button" onClick={() => setTab(key)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: tab === key ? 'rgba(14,165,233,0.16)' : 'rgba(255,255,255,0.55)', color: tab === key ? '#0369a1' : '#5b8fae', border: '1px solid rgba(14,165,233,0.16)' }}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'paths' && (
        <div className="max-w-5xl flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={createPath} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', color: '#fff' }}><Plus className="w-4 h-4" /> 创建路径</button>
            <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={cardStyle}>{paths.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={cardStyle}>{library.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select>
            <button type="button" onClick={addItem} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.65)', color: '#0369a1', border: '1px solid rgba(14,165,233,0.16)' }}>加入路径</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {paths.map((path) => (
              <div key={path.id} className="rounded-2xl p-4" style={cardStyle}>
                <h3 className="font-bold" style={{ color: '#0d2d45' }}>{path.title}</h3>
                <div className="text-xs mt-1" style={{ color: '#7db8d4' }}>进度 {path.completed || 0}/{path.total || 0}</div>
                <div className="mt-3 flex flex-col gap-2">
                  {(path.items || []).map((item) => {
                    const done = !!item.completed_at;
                    return <button key={item.library_item_id} type="button" onClick={() => toggleComplete(path.id, item.library_item_id, done)} className="flex items-center gap-2 text-left rounded-xl px-3 py-2" style={{ background: done ? 'rgba(5,150,105,0.08)' : 'rgba(255,255,255,0.45)', color: '#0d2d45' }}><CheckCircle2 className="w-4 h-4" style={{ color: done ? '#059669' : '#9ca3af' }} /> <span className="text-sm line-clamp-1">{item.title}</span></button>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'review' && (
        <div className="max-w-3xl flex flex-col gap-3">
          {reviews.length ? reviews.map((item) => (
            <div key={item.id} className="rounded-2xl p-4" style={cardStyle}>
              <div className="text-xs mb-2" style={{ color: '#7db8d4' }}>{item.item_title || '复习卡'}</div>
              <h3 className="font-bold" style={{ color: '#0d2d45' }}>{item.front}</h3>
              <p className="text-sm mt-2" style={{ color: '#5b8fae' }}>{item.back}</p>
              <div className="flex flex-wrap gap-2 mt-3 text-xs">
                {[['忘记', 1], ['模糊', 3], ['记得', 4], ['熟练', 5]].map(([label, q]: any) => <button key={label} type="button" onClick={() => gradeReview(item.id, q)} className="px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.65)', color: '#0369a1', border: '1px solid rgba(14,165,233,0.16)' }}>{label}</button>)}
              </div>
            </div>
          )) : <div className="rounded-2xl p-8 text-center" style={{ ...cardStyle, color: '#5b8fae' }}>今天没有待复习内容。</div>}
        </div>
      )}

      {tab === 'quiz' && (
        <div className="max-w-3xl flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)} className="rounded-xl px-3 py-2 text-sm flex-1" style={cardStyle}>{library.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select>
            <button type="button" disabled={loading} onClick={makeQuiz} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', color: '#fff' }}>{loading ? '生成中…' : '生成测验'}</button>
          </div>
          {quiz && <div className="rounded-2xl p-4" style={cardStyle}>{(quiz.questions || []).map((q, idx) => <div key={idx} className="mb-4"><div className="font-bold" style={{ color: '#0d2d45' }}>{idx + 1}. {q.question}</div>{q.options?.length ? <ul className="text-sm mt-2" style={{ color: '#5b8fae' }}>{q.options.map((o) => <li key={o}>- {o}</li>)}</ul> : null}<details className="text-sm mt-2" style={{ color: '#0369a1' }}><summary>查看参考答案</summary><p style={{ color: '#5b8fae' }}>{q.answer} {q.explanation}</p></details></div>)}</div>}
        </div>
      )}
    </div>
  );
}
