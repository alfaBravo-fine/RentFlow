import React from 'react';
import { db } from '../../db/client';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { BarChart3, Download, FileText, Printer } from '../../components/icons';

export const ReportsView: React.FC = () => {
  const pack = resolvePack();
  const invoices = db.getTable('invoices');
  const expenses = db.getTable('expenses');
  const units = db.getTable('units');

  const totalRentCollected = invoices.filter((i: any) => i.status === 'paid').reduce((acc: number, i: any) => acc + i.amount_paid_minor, 0);
  const totalExpenses = expenses.reduce((acc: number, e: any) => acc + e.amount_minor, 0);
  const netOperatingIncome = totalRentCollected - totalExpenses;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Financial Reports & Statements</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Audit-ready income, expense, rent roll, and owner payout statements</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5" />
          <span>Print Audit Report</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Total Rent Income YTD</span>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--status-success-fg)]">
            {formatMoney(totalRentCollected, pack)}
          </div>
        </Card>

        <Card>
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Total Operating Expenses</span>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--status-danger-fg)]">
            {formatMoney(totalExpenses, pack)}
          </div>
        </Card>

        <Card>
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Net Operating Income (NOI)</span>
          <div className="mt-2 text-2xl font-bold number-tabular text-[var(--accent)]">
            {formatMoney(netOperatingIncome, pack)}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Printable Statements</CardTitle>
          <Badge variant="info">Tabular Formatting</Badge>
        </CardHeader>

        <div className="space-y-3 mt-4">
          <div className="p-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Comprehensive Rent Roll Report</h3>
              <p className="text-xs text-[var(--text-subtle)]">Occupancy listing, tenant details, monthly rent rates, and arrears aging.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>Export PDF</Button>
          </div>

          <div className="p-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Owner Payout Statement</h3>
              <p className="text-xs text-[var(--text-subtle)]">Gross collected rents, management commission deductions, and net disbursements.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>Export PDF</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
