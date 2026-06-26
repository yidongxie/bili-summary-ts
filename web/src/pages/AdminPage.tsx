import { useEffect, useState } from 'react';
import { Activity, Users, AlertTriangle, DollarSign } from 'lucide-react';
import { getAdminStats, getAdminTasks, getAdminUsage, getAdminUsers, type AdminStats } from '@/lib/api';

interface AdminPageProps {
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.58)',
  border: '1px solid rgba(14,165,233,0.14)',
  backdropFilter: 'blur(16px)',
  boxShadow: '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
};

export function AdminPage({ onShowToast }: AdminPageProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);

  async function reload() {
    try {
      const [s, u, t, g] = await Promise.all([getAdminStats(), getAdminUsers(), getAdminTasks(), getAdminUsage()]);
      setStats(s.stats);
      setUsers(u.users || []);
      setTasks(t.tasks || []);
      setUsage(g.usage || []);
    } catch (err: any) {
      onShowToast('加载管理后台失败：' + (err.message || ''), 'error');
    }
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#0d2d45' }}>管理后台</h2>
        <p className="text-sm mt-0.5" style={{ color: '#7db8d4' }}>用户、任务、失败和成本概览。</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-6xl">
        <Stat icon={Users} label="用户" value={stats?.users || 0} />
        <Stat icon={Activity} label="24h 任务" value={stats?.tasks_today || 0} />
        <Stat icon={AlertTriangle} label="失败任务" value={stats?.failed_tasks || 0} />
        <Stat icon={DollarSign} label="7日估算成本" value={`$${(stats?.estimated_cost_7d || 0).toFixed(4)}`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-6xl mt-4">
        <Panel title="最近任务">
          {tasks.slice(0, 20).map((t) => <Row key={t.id} left={`${t.status} · ${t.user_email || t.user_id}`} right={t.error || new Date(t.updated_at || 0).toLocaleString()} />)}
        </Panel>
        <Panel title="用户使用">
          {users.slice(0, 20).map((u) => <Row key={u.id} left={u.email || u.display_name || u.id} right={`收藏 ${u.library_count || 0} · 总结 ${u.summarize_count || 0}`} />)}
        </Panel>
        <Panel title="API 使用 / 成本">
          {usage.slice(0, 20).map((u, idx) => <Row key={idx} left={`${u.provider}/${u.model || '-'}`} right={`${u.calls || 0} 次 · $${Number(u.estimated_cost_usd || 0).toFixed(4)}`} />)}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return <div className="rounded-2xl p-4" style={cardStyle}><Icon className="w-5 h-5 mb-2" style={{ color: '#0ea5e9' }} /><div className="text-xs" style={{ color: '#7db8d4' }}>{label}</div><div className="text-2xl font-bold" style={{ color: '#0d2d45' }}>{value}</div></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl p-4" style={cardStyle}><h3 className="font-bold mb-3" style={{ color: '#0d2d45' }}>{title}</h3><div className="flex flex-col gap-2 text-sm">{children}</div></div>;
}

function Row({ left, right }: { left: any; right: any }) {
  return <div className="flex gap-3 justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.45)', color: '#5b8fae' }}><span className="truncate">{left}</span><span className="shrink-0 text-xs">{right}</span></div>;
}
