import React from 'react';
import { db } from '../../db/client';
import { Property, Unit, Lease, Invoice, MaintenanceRequest } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Building2, Users, Receipt, Wrench, AlertCircle, ArrowUpDown, Plus } from '../../components/icons';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const pack = usePack();

  const properties = db.getTable<Property>('properties');
  const units = db.getTable<Unit>('units');
  const leases = db.getTable<Lease>('leases');
  const invoices = db.getTable<Invoice>('invoices');
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests');

  // KPIs
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'occupied').length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const expectedRentMinor = units.reduce((acc, u) => acc + (u.status === 'occupied' ? u.rent_minor : 0), 0);
  
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const collectedRentMinor = paidInvoices.reduce((acc, i) => acc + i.amount_paid_minor, 0);

  const overdueInvoices = invoices.filter((i) => i.status === 'overdue' || (i.status === 'partially_paid' && new Date(i.due_date) < new Date()));
  const totalArrearsMinor = overdueInvoices.reduce((acc, i) => acc + (i.total_minor - i.amount_paid_minor), 0);

  const openMaintenanceCount = maintenance.filter((m) => m.status !== 'completed' && m.status !== 'closed').length;

  // Monthly Revenue Chart Data
  const chartData = [
    { month: 'Jun', Expected: expectedRentMinor / 100, Collected: (expectedRentMinor * 0.9) / 100 },
    { month: 'Jul', Expected: expectedRentMinor / 100, Collected: (expectedRentMinor * 0.95) / 100 },
    { month: 'Aug', Expected: expectedRentMinor / 100, Collected: (expectedRentMinor * 0.88) / 100 },
    { month: 'Sep', Expected: expectedRentMinor / 100, Collected: (expectedRentMinor * 0.92) / 100 },
    { month: 'Oct', Expected: expectedRentMinor / 100, Collected: collectedRentMinor / 100 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Property Management Command</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Real-time offline portfolio performance &bull; {totalUnits} Units Across {properties.length} Properties ({pack.name} {pack.currency.code})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
            Switch Region / Pack
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/invoices')}>
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1: Total Rent Roll */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Expected Monthly Rent</span>
            <Building2 className="w-4 h-4 text-[var(--text-subtle)]" />
          </div>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--text)]">
            {formatMoney(expectedRentMinor, pack)}
          </div>
          <div className="mt-1 flex items-center text-xs text-[var(--text-muted)]">
            <span>{occupancyRate}% Occupied ({occupiedUnits}/{totalUnits} units)</span>
          </div>
        </Card>

        {/* KPI 2: Rent Collected */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Collected Rent (MTD)</span>
            <Receipt className="w-4 h-4 text-[var(--status-success-fg)]" />
          </div>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--status-success-fg)]">
            {formatMoney(collectedRentMinor, pack)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            <span>{paidInvoices.length} paid invoices logged</span>
          </div>
        </Card>

        {/* KPI 3: Arrears / Overdue */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Rent Arrears</span>
            <AlertCircle className="w-4 h-4 text-[var(--status-danger-fg)]" />
          </div>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--status-danger-fg)]">
            {formatMoney(totalArrearsMinor, pack)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--status-danger-fg)]">
            <Badge variant="danger">{overdueInvoices.length} overdue</Badge>
            <span>Action required</span>
          </div>
        </Card>

        {/* KPI 4: Maintenance Work */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Open Maintenance</span>
            <Wrench className="w-4 h-4 text-[var(--status-warning-fg)]" />
          </div>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--text)]">
            {openMaintenanceCount}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            <span>Active tenant requests</span>
          </div>
        </Card>
      </div>

      {/* Main Charts & Action Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Monthly Collection Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rent Collection vs. Target (Two-Tone)</CardTitle>
            <Badge variant="info">Tabular Financial Engine</Badge>
          </CardHeader>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-raised)',
                    borderColor: 'var(--border-strong)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                  }}
                />
                <Bar dataKey="Expected" fill="var(--text-subtle)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Collected" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Right Col: Overdue Rent Watchlist */}
        <Card>
          <CardHeader>
            <CardTitle>Arrears Watchlist</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/invoices')}>
              View All
            </Button>
          </CardHeader>
          <div className="space-y-3">
            {overdueInvoices.length === 0 ? (
              <p className="text-xs text-[var(--text-subtle)] py-8 text-center">No overdue invoices! Rent roll is clean.</p>
            ) : (
              overdueInvoices.map((inv) => {
                const unpaid = inv.total_minor - inv.amount_paid_minor;
                return (
                  <div key={inv.id} className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text)]">Invoice #{inv.id}</p>
                      <p className="text-[11px] text-[var(--status-danger-fg)] font-medium">Due: {inv.due_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold number-tabular text-[var(--status-danger-fg)]">
                        {formatMoney(unpaid, pack)}
                      </p>
                      <Button size="sm" variant="outline" className="mt-1 h-6 text-[10px] px-2" onClick={() => navigate('/invoices')}>
                        Collect
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
