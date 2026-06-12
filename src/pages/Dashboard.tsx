import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Card, Badge, Spinner } from '../components/ui';
import { formatKDCompact } from '../lib/format';
import { buildAlerts, Alert } from '../lib/alerts';
import { tierClass, tierLabel } from '../lib/expiry';
import { useAuth } from '../context/AuthContext';

interface Stats {
  salesToday: number;
  salesWeek: number;
  openWaiting: number;
  openPreOrders: number;
  openPOs: number;
  shipmentsPending: number;
  onConsignment: number;
  vipOccasionsMonth: number;
  empDocsExpiring: number;
  companyDocsExpiring: number;
  pendingLeave: number;
}

function caseTotal(c: any): number {
  if (c.sale_items?.length) return c.sale_items.reduce((s: number, i: any) => s + Number(i.amount_kd) * (Number(i.quantity) || 1), 0);
  return Number(c.amount_kd ?? 0);
}

export default function Dashboard() {
  const { role, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
    const in60 = format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd');
    const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

    async function load() {
      const [salesWeekQ, wl, po, pur, ship, con, vip, emp, docs, leave, alertList] = await Promise.all([
        supabase.from('cases').select('amount_kd, date_logged, sale_items(amount_kd, quantity)').eq('case_type', 'Sale').eq('deleted', false).gte('date_logged', weekStart),
        supabase.from('waiting_list').select('id', { count: 'exact', head: true }).in('status', ['Open', 'Contacted']),
        supabase.from('pre_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '("Delivered","Cancelled")'),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '("Received","Cancelled","Returned")'),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['Sent', 'Dispatched', 'Partially received']),
        supabase.from('consignments').select('id', { count: 'exact', head: true }).in('status', ['With consignee', 'Pending payment']),
        supabase.from('customers').select('birthday, occasions'),
        canHR ? supabase.from('employees').select('residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
        supabase.from('company_documents').select('expiry_date'),
        canHR ? supabase.from('leave_records').select('id', { count: 'exact', head: true }).eq('approval_status', 'Pending') : Promise.resolve({ count: 0 }),
        buildAlerts(role),
      ]);

      const weekCases = (salesWeekQ.data ?? []) as any[];
      const salesWeek = weekCases.reduce((s, c) => s + caseTotal(c), 0);
      const salesToday = weekCases.filter((c) => c.date_logged === today).reduce((s, c) => s + caseTotal(c), 0);

      const thisMonth = format(new Date(), 'MM');
      let vipOccasions = 0;
      for (const c of (vip.data ?? []) as any[]) {
        if (c.birthday && c.birthday.slice(5, 7) === thisMonth) vipOccasions++;
        for (const o of (Array.isArray(c.occasions) ? c.occasions : [])) {
          const m = String(o?.date ?? '').match(/(\d{2})-\d{2}$/);
          if (m && m[1] === thisMonth) vipOccasions++;
        }
      }

      const empDocs = ((emp as any).data ?? []).filter((e: any) =>
        (e.residency_expiry && e.residency_expiry <= in60) || (e.work_permit_expiry && e.work_permit_expiry <= in60)).length;
      const compDocs = ((docs.data ?? []) as any[]).filter((d) => d.expiry_date && d.expiry_date <= in60).length;

      setStats({
        salesToday, salesWeek,
        openWaiting: wl.count ?? 0,
        openPreOrders: po.count ?? 0,
        openPOs: pur.count ?? 0,
        shipmentsPending: ship.count ?? 0,
        onConsignment: con.count ?? 0,
        vipOccasionsMonth: vipOccasions,
        empDocsExpiring: empDocs,
        companyDocsExpiring: compDocs,
        pendingLeave: (leave as any).count ?? 0,
      });
      setAlerts(alertList);
      setLoading(false);
    }
    load();
  }, [role]);

  if (loading || !stats) return <Spinner />;

  const cards: { title: string; value: string | number; link: string; accent?: string }[] = [
    { title: 'Sales today', value: `${formatKDCompact(stats.salesToday)} KD`, link: '/sales', accent: 'text-emerald-600' },
    { title: 'Sales this week', value: `${formatKDCompact(stats.salesWeek)} KD`, link: '/sales', accent: 'text-emerald-600' },
    { title: 'Open waiting list', value: stats.openWaiting, link: '/waiting-list' },
    { title: 'Open pre-orders', value: stats.openPreOrders, link: '/pre-orders' },
    { title: 'Open purchase orders', value: stats.openPOs, link: '/purchase-orders' },
    { title: 'Shipments pending', value: stats.shipmentsPending, link: '/purchase-orders' },
    { title: 'Out on consignment', value: stats.onConsignment, link: '/consignments' },
    { title: 'VIP occasions this month', value: stats.vipOccasionsMonth, link: '/vip' },
    { title: 'Employee docs ≤ 60d', value: stats.empDocsExpiring, link: '/hr', accent: stats.empDocsExpiring ? 'text-red-600' : undefined },
    { title: 'Company docs ≤ 60d', value: stats.companyDocsExpiring, link: '/company-documents', accent: stats.companyDocsExpiring ? 'text-red-600' : undefined },
    { title: 'Pending leave requests', value: stats.pendingLeave, link: '/leave', accent: stats.pendingLeave ? 'text-amber-600' : undefined },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back{profile ? `, ${profile.full_name}` : ''} — live operations summary.</p>
        </div>
        <a
          href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600"
        >
          <ExternalLink size={15} /> Store Daily Report
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <Link key={c.title} to={c.link} className="hover:opacity-80">
            <Card title={c.title} value={c.value} accent={c.accent} />
          </Link>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-900">Alerts & Reminders</h2>
        <Badge className="bg-slate-900 text-white border-slate-900">{alerts.length}</Badge>
      </div>
      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">Nothing needs attention right now 🎉</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {alerts.map((a, i) => (
            <Link key={i} to={a.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <Badge className={tierClass[a.severity]}>{tierLabel[a.severity]}</Badge>
              <span className="text-sm text-slate-700 flex-1">{a.message}</span>
              <span className="text-xs text-slate-400">{a.module}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
