import React, { useState } from 'react';
import { db } from '../../db/client';
import { Expense, Property, Vendor } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Banknote, Plus, Calendar } from '../../components/icons';

export const ExpensesView: React.FC = () => {
  const pack = resolvePack();
  const [expenses, setExpenses] = useState<Expense[]>(() => db.getTable<Expense>('expenses'));
  const properties = db.getTable<Property>('properties');
  const vendors = db.getTable<Vendor>('vendors');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [category, setCategory] = useState('repairs_and_maintenance');
  const [amount, setAmount] = useState('450');
  const [notes, setNotes] = useState('');

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = Math.round(parseFloat(amount) * 100);

    db.insertItem<Expense>('expenses', {
      id: generateUUID(),
      org_id: 'org_demo_1',
      property_id: properties[0]?.id || null,
      category,
      amount_minor: amountMinor,
      currency_code: pack.currency.code,
      expense_date: new Date().toISOString().split('T')[0],
      notes,
    });

    setExpenses(db.getTable<Expense>('expenses'));
    setIsAddOpen(false);
  };

  const totalExpenseMinor = expenses.reduce((acc, e) => acc + e.amount_minor, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Operating Expenses & Ledger</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Property repairs, insurance, and vendor disbursements</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          <span>Log Expense</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Ledger</CardTitle>
          <Badge variant="danger">Total YTD: {formatMoney(totalExpenseMinor, pack)}</Badge>
        </CardHeader>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-subtle)] uppercase">
                <th className="py-2.5 px-3 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold">Property</th>
                <th className="py-2.5 px-3 font-semibold">Notes</th>
                <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {expenses.map((exp) => {
                const prop = properties.find((p) => p.id === exp.property_id);
                return (
                  <tr key={exp.id} className="hover:bg-[var(--surface)] transition-colors">
                    <td className="py-3 px-3 text-[var(--text-muted)]">{exp.expense_date}</td>
                    <td className="py-3 px-3 font-semibold text-[var(--text)] uppercase">{exp.category.replace('_', ' ')}</td>
                    <td className="py-3 px-3 text-[var(--text-muted)]">{prop?.name || 'General'}</td>
                    <td className="py-3 px-3 text-[var(--text-subtle)]">{exp.notes || '—'}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--status-danger-fg)]">
                      {formatMoney(exp.amount_minor, pack)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Log Property Expense">
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} required />
          <Input label={`Amount (${pack.currency.code})`} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Record Expense</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
