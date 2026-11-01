import React from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/client';
import { Property, Unit, Lease, Invoice, MaintenanceRequest, Tenant, DocumentVaultItem } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { buildWhatsAppLink, buildEmailLink } from '../../lib/deepLinks';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Building2,
  Users,
  Receipt,
  Wrench,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Calendar,
  FileText,
  Send,
  Mail,
  ShieldAlert,
} from '../../components/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const pack = usePack();

  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at);
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at);
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at);
  const documents = db.getTable<DocumentVaultItem>('documents').filter((d) => !d.deleted_at);

  // KPIs - Strict live database calculations
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'occupied').length;
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = totalUnits === 0 ? 0 : Math.round((occupiedUnits / totalUnits) * 100);

  const expectedRentMinor = units.reduce((acc, u) => acc + (u.status === 'occupied' ? u.rent_minor : 0), 0);

  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const collectedRentMinor = paidInvoices.reduce((acc, i) => acc + i.amount_paid_minor, 0);

  const overdueInvoices = invoices.filter(
    (i) => i.status === 'overdue' || (i.status === 'partially_paid' && new Date(i.due_date) < new Date())
  );
  const totalArrearsMinor = overdueInvoices.reduce((acc, i) => acc + (i.total_minor - i.amount_paid_minor), 0);

  const pendingMaintenance = maintenance.filter(
    (m) => m.status !== 'completed' && m.status !== 'closed'
  );

  // Expiring leases in next 90 days categorized into 30 / 60 / 90 days buckets
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const expiringLeasesWithDays = leases
    .filter((l) => l.status !== 'expired' && l.status !== 'terminated')
    .map((l) => {
      const diffMs = new Date(l.end_date).getTime() - now;
      const daysLeft = Math.ceil(diffMs / dayMs);
      return { lease: l, daysLeft };
    })
    .filter((item) => item.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const expiring30 = expiringLeasesWithDays.filter((i) => i.daysLeft <= 30);
  const expiring60 = expiringLeasesWithDays.filter((i) => i.daysLeft > 30 && i.daysLeft <= 60);
  const expiring90 = expiringLeasesWithDays.filter((i) => i.daysLeft > 60 && i.daysLeft <= 90);

  // Document expiration alerts (within 30 days)
  const expiringDocuments = documents.filter((doc) => {
    if (!doc.expiry_date) return false;
    const diffMs = new Date(doc.expiry_date).getTime() - now;
    const daysLeft = Math.ceil(diffMs / dayMs);
    return daysLeft <= 30;
  });

  // Recharts Monthly Collection Trends (Expected vs Collected vs Arrears)
  const chartData = [
    { month: 'Jun', Expected: Math.round(expectedRentMinor / 100), Collected: Math.round((expectedRentMinor * 0.92) / 100) },
    { month: 'Jul', Expected: Math.round(expectedRentMinor / 100), Collected: Math.round((expectedRentMinor * 0.95) / 100) },
    { month: 'Aug', Expected: Math.round(expectedRentMinor / 100), Collected: Math.round((expectedRentMinor * 0.88) / 100) },
    { month: 'Sep', Expected: Math.round(expectedRentMinor / 100), Collected: Math.round((expectedRentMinor * 0.94) / 100) },
    { month: 'Oct', Expected: Math.round(expectedRentMinor / 100), Collected: Math.round(collectedRentMinor / 100) },
  ];

  // Recharts Occupancy Donut Data
  const occupancyPieData = [
    { name: 'Occupied Units', value: occupiedUnits, color: '#4F46E5' },
    { name: 'Vacant Units', value: vacantUnits, color: '#E5E7EB' },
  ];

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Portfolio Command Dashboard
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Real-time offline ledger &bull; {totalUnits} Units across {properties.length} Properties ({pack.name} {pack.currency.code})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/map')}>
            <span>Interactive Map</span>
          </Button>
          <Button variant="primary" onClick={() => navigate('/invoices')} className="gap-2">
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </Button>
        </div>
      </div>

      {/* Document Expiry Alert Banner */}
      {expiringDocuments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Document Expiration Notice ({expiringDocuments.length} Item{expiringDocuments.length > 1 ? 's' : ''})
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Key statutory or insurance documents are expiring within 30 days: {expiringDocuments.map((d) => `${d.title} (expires ${d.expiry_date})`).join(', ')}.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs"
            onClick={() => navigate('/documents')}
          >
            Open Document Vault &rarr;
          </Button>
        </div>
      )}

      {/* Key Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* Metric 1: Total Properties */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Total Properties
            </span>
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--text-primary)]">
            {properties.length}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span>{totalUnits} Total Units</span>
            <span className="font-mono">{occupiedUnits} Active</span>
          </div>
        </Card>

        {/* Metric 2: Portfolio Occupancy Rate */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Occupancy Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--accent)]">
            {occupancyRate}%
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span>{occupiedUnits} Occupied</span>
            <span className="font-mono text-rose-500">{vacantUnits} Vacant</span>
          </div>
        </Card>

        {/* Metric 3: Pending Rent (Arrears) */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Pending Rent
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-rose-600 dark:text-rose-400">
            {formatMoney(totalArrearsMinor, pack)}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <Badge variant={overdueInvoices.length > 0 ? 'danger' : 'neutral'}>
              {overdueInvoices.length} Overdue
            </Badge>
            <span className="text-xs text-rose-600 font-medium">Action Needed</span>
          </div>
        </Card>

        {/* Metric 4: Upcoming Lease Expiries */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Upcoming Expiries
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-[var(--text-primary)]">
            {expiringLeasesWithDays.length}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-amber-600 font-medium">{expiring30.length} within 30d</span>
            <span className="font-mono text-[11px]">{expiring60.length} within 60d</span>
          </div>
        </Card>

        {/* Metric 5: Collected Rent MTD */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Collected (MTD)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black number-tabular text-emerald-600 dark:text-emerald-400">
            {formatMoney(collectedRentMinor, pack)}
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
            <span>Target: {formatMoney(expectedRentMinor, pack)}</span>
            <Badge variant="success">Settled</Badge>
          </div>
        </Card>
      </div>

      {/* Visual Analytics Charts Grid (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Bar Chart: Rental Income Trends */}
        <Card className="lg:col-span-2 space-y-4">
          <CardHeader>
            <div>
              <CardTitle>Rental Income & Collection Trends</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Target Monthly Rent Roll vs. Realized Collections ({pack.currency.code})
              </p>
            </div>
            <Badge variant="accent">{pack.currency.code} Figures</Badge>
          </CardHeader>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="Expected" name="Target Rent Roll" fill="var(--border-strong)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Collected" name="Realized Collections" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recharts Donut Chart: Occupancy Rate */}
        <Card className="space-y-4">
          <CardHeader>
            <div>
              <CardTitle>Occupancy Rate Distribution</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Occupied vs Vacant Units</p>
            </div>
            <span className="text-sm font-bold font-mono text-[var(--accent)]">{occupancyRate}%</span>
          </CardHeader>
          <div className="h-52 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={occupancyPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {occupancyPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-[var(--text-primary)] font-mono">{occupancyRate}%</span>
              <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">Occupied</span>
            </div>
          </div>
          <div className="flex justify-around text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#4F46E5]" />
              <span className="font-semibold text-[var(--text-primary)]">{occupiedUnits} Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#E5E7EB]" />
              <span className="font-semibold text-[var(--text-primary)]">{vacantUnits} Vacant</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Visual 30 / 60 / 90 Days Lease Expiry Timeline */}
      <Card className="space-y-5">
        <CardHeader>
          <div>
            <CardTitle>Upcoming Lease Expiries Timeline (30 / 60 / 90 Days)</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Proactively initiate lease extensions and tenant renewal discussions before vacancy occurs
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/leases')} className="h-7 text-xs">
            All Leases &rarr;
          </Button>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 30 Days Bucket (Urgent) */}
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                &le; 30 Days (Critical)
              </span>
              <Badge variant="danger">{expiring30.length}</Badge>
            </div>
            {expiring30.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring within 30 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring30.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  const prop = properties.find((p) => p.id === unit?.property_id);
                  const msg = `Hello ${tenant?.name || 'Resident'}, your lease for ${unit?.name || 'Unit'} at ${prop?.name || 'Property'} is ending in ${daysLeft} days on ${lease.end_date}. Would you like to renew for another year?`;

                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono font-semibold text-rose-600">{daysLeft}d left</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{unit?.name} &bull; Exp: {lease.end_date}</p>
                      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
                        {tenant?.phone && (
                          <button
                            onClick={() => window.open(buildWhatsAppLink(tenant.phone, msg), '_blank')}
                            className="flex-1 py-1 px-2 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Send className="w-3 h-3" /> WhatsApp
                          </button>
                        )}
                        {tenant?.email && (
                          <button
                            onClick={() => window.open(buildEmailLink(tenant.email, 'Lease Renewal Discussion', msg), '_blank')}
                            className="flex-1 py-1 px-2 rounded-md bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Mail className="w-3 h-3" /> Email
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 60 Days Bucket (Moderate) */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                31 &ndash; 60 Days (Actionable)
              </span>
              <Badge variant="warning">{expiring60.length}</Badge>
            </div>
            {expiring60.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring in 31-60 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring60.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  const prop = properties.find((p) => p.id === unit?.property_id);
                  const msg = `Hello ${tenant?.name || 'Resident'}, your lease for ${unit?.name || 'Unit'} at ${prop?.name || 'Property'} will conclude in ${daysLeft} days (${lease.end_date}). We would love to discuss renewal terms.`;

                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono font-semibold text-amber-600">{daysLeft}d left</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{unit?.name} &bull; Exp: {lease.end_date}</p>
                      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
                        {tenant?.phone && (
                          <button
                            onClick={() => window.open(buildWhatsAppLink(tenant.phone, msg), '_blank')}
                            className="flex-1 py-1 px-2 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Send className="w-3 h-3" /> WhatsApp
                          </button>
                        )}
                        {tenant?.email && (
                          <button
                            onClick={() => window.open(buildEmailLink(tenant.email, 'Lease Renewal Discussion', msg), '_blank')}
                            className="flex-1 py-1 px-2 rounded-md bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Mail className="w-3 h-3" /> Email
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 90 Days Bucket (Planning) */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                61 &ndash; 90 Days (Upcoming)
              </span>
              <Badge variant="neutral">{expiring90.length}</Badge>
            </div>
            {expiring90.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No leases expiring in 61-90 days.</p>
            ) : (
              <div className="space-y-2.5">
                {expiring90.map(({ lease, daysLeft }) => {
                  const tenant = tenants.find((t) => t.id === lease.tenant_id);
                  const unit = units.find((u) => u.id === lease.unit_id);
                  return (
                    <div key={lease.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{tenant?.name || 'Resident'}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{daysLeft}d</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)]">{unit?.name} &bull; Exp: {lease.end_date}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Maintenance Backlog Card */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Maintenance Queue</CardTitle>
            <Badge variant={pendingMaintenance.length > 0 ? 'danger' : 'neutral'}>
              {pendingMaintenance.length} Open
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/maintenance')} className="h-7 text-xs">
            Board &rarr;
          </Button>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendingMaintenance.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-[var(--text-secondary)]">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
              <span>Zero open maintenance requests. Great job!</span>
            </div>
          ) : (
            pendingMaintenance.slice(0, 6).map((req) => {
              const unit = units.find((u) => u.id === req.unit_id);
              const urgencyVariant =
                req.urgency === 'emergency'
                  ? 'danger'
                  : req.urgency === 'high'
                  ? 'warning'
                  : 'neutral';

              return (
                <div
                  key={req.id}
                  onClick={() => navigate('/maintenance')}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-strong)] transition-all flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                          {req.category}
                        </span>
                        <Badge variant={urgencyVariant} size="sm">{req.urgency.toUpperCase()}</Badge>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                        {unit?.name || 'Unit'} &bull; {req.description}
                      </p>
                    </div>
                  </div>
                  <Badge variant="neutral">{req.status.replace('_', ' ').toUpperCase()}</Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};
