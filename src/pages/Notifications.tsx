import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Truck, Gem, CalendarRange, FileText, ClipboardList, Wrench, Hourglass,
  Handshake, Users, Settings as SettingsIcon, CheckCheck, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { loadMyNotifications, markNotificationsRead, FeedNotif } from '../lib/notifications';

const iconFor = (ev: string) => {
  if (ev.startsWith('po_')) return Truck;
  if (ev.startsWith('lp_')) return Gem;
  if (ev.startsWith('leave')) return CalendarRange;
  if (ev.startsWith('req_') || ev === 'acct_new' || ev === 'acct_role' || ev === 'acct_del') return FileText;
  if (ev.startsWith('task')) return ClipboardList;
  if (ev.startsWith('repair')) return Wrench;
  if (ev.startsWith('preorder')) return Hourglass;
  if (ev.startsWith('consign')) return Handshake;
  if (ev.startsWith('emp_')) return Users;
  if (ev === 'settings_upd' || ev === 'geofence') return SettingsIcon;
  return Bell;
};

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' });
};

export default function NotificationsPage() {
  const { user, profile, role } = useAuth();
  const [items, setItems] = useState<FeedNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    if (!user) { setLoading(false); return; }
    setItems(await loadMyNotifications(user, profile, role));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, role]);

  const unread = items.filter((n) => !n.read).length;

  async function open(n: FeedNotif) {
    if (!n.read && user) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationsRead(user.id, [n.id]);
    }
    if (n.url) navigate(n.url.replace(/^#/, '')); // '#/purchase-orders?focus=..' -> '/purchase-orders?focus=..'
  }
  async function markAll() {
    if (!user) return;
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    markNotificationsRead(user.id, ids);
  }

  if (loading) return <Spinner />;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center relative">
          <Bell size={20} />
          {unread > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold flex items-center justify-center">{unread}</span>}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Notifications</h1>
          <p className="text-sm text-slate-500">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Bell size={36} className="mx-auto text-slate-300 mb-3" />
          <div className="font-medium text-slate-600">No notifications yet</div>
          <div className="text-sm text-slate-400 mt-1">Updates that concern you will appear here.</div>
        </div>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {items.map((n) => {
            const Icon = iconFor(n.event_type);
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} className={`w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors ${n.read ? '' : 'bg-blue-50/40'}`}>
                  <span className="mt-0.5 shrink-0">{!n.read ? <span className="block h-2.5 w-2.5 rounded-full bg-blue-500 mt-1.5" /> : <span className="block h-2.5 w-2.5" />}</span>
                  <span className={`mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${n.read ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-600'}`}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`text-sm ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                      <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                    </span>
                    <span className="block text-sm text-slate-500 mt-0.5">{n.body}</span>
                  </span>
                  {n.url && <ChevronRight size={16} className="text-slate-300 shrink-0 mt-2" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
