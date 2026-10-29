import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Invoice, Lease } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { MessageSquare, RefreshCw, Send, Mail, Phone, ExternalLink, Sparkles } from '../../components/icons';

export const MessengerHubView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'telegram' | 'discord'>('whatsapp');
  const [iframeKey, setIframeKey] = useState(0);
  const pack = resolvePack();

  const tenants = db.getTable<Tenant>('tenants');
  const leases = db.getTable<Lease>('leases');
  const invoices = db.getTable<Invoice>('invoices');

  const overdueInvoices = invoices.filter((i) => i.status === 'overdue' || (i.status === 'partially_paid' && new Date(i.due_date) < new Date()));

  const platforms = [
    { id: 'whatsapp', label: 'WhatsApp Web', url: 'https://web.whatsapp.com' },
    { id: 'telegram', label: 'Telegram Web', url: 'https://web.telegram.org' },
    { id: 'discord', label: 'Discord App', url: 'https://discord.com/app' },
  ];

  const currentPlatform = platforms.find((p) => p.id === activeTab)!;

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenWhatsAppReminder = (tenant: Tenant, inv: Invoice) => {
    const unpaidMinor = inv.total_minor - inv.amount_paid_minor;
    const formattedAmount = formatMoney(unpaidMinor, pack);
    const text = encodeURIComponent(
      `Hello ${tenant.name}, this is a friendly rent payment reminder for Invoice #${inv.id} due on ${inv.due_date}. Outstanding amount: ${formattedAmount}. Please reply when paid.`
    );
    const cleanPhone = tenant.phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
  };

  const handleSendEmailReminder = (tenant: Tenant, inv: Invoice) => {
    const unpaidMinor = inv.total_minor - inv.amount_paid_minor;
    const formattedAmount = formatMoney(unpaidMinor, pack);
    const subject = encodeURIComponent(`Rent Payment Reminder - Invoice #${inv.id}`);
    const body = encodeURIComponent(
      `Dear ${tenant.name},\n\nThis is a friendly notice regarding your rental invoice #${inv.id} due on ${inv.due_date}.\nOutstanding balance: ${formattedAmount}.\n\nThank you,\nProperty Management Office`
    );
    window.open(`mailto:${tenant.email}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Multi-Messenger Hub & Communications</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Embedded WhatsApp Web, Telegram, and Discord chat apps + 1-click rent reminder triggers
          </p>
        </div>
        <Badge variant="info">Embedded Web Messenger Shell</Badge>
      </div>

      {/* Main Grid: Overdue Reminders Panel + Embedded Web Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Overdue Tenants Reminder Shortcuts */}
        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Rent Reminders Dispatch</CardTitle>
            <Badge variant="warning">{overdueInvoices.length} Overdue</Badge>
          </CardHeader>

          <p className="text-xs text-[var(--text-muted)]">
            Click to dispatch automated payment reminder messages over WhatsApp Web or Email:
          </p>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {overdueInvoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-subtle)]">
                No overdue rent balance at this time.
              </div>
            ) : (
              overdueInvoices.map((inv) => {
                const lease = leases.find((l) => l.id === inv.lease_id);
                const tenant = tenants.find((t) => t.id === lease?.tenant_id);
                if (!tenant) return null;

                const unpaid = inv.total_minor - inv.amount_paid_minor;

                return (
                  <div key={inv.id} className="p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[var(--text)]">{tenant.name}</span>
                      <span className="font-mono font-bold text-xs text-[var(--status-danger-fg)]">
                        {formatMoney(unpaid, pack)}
                      </span>
                    </div>

                    <p className="text-[10px] text-[var(--text-subtle)]">Due: {inv.due_date} &bull; Invoice #{inv.id}</p>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1 h-7 text-[10px] gap-1"
                        onClick={() => handleOpenWhatsAppReminder(tenant, inv)}
                      >
                        <Send className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[10px] gap-1"
                        onClick={() => handleSendEmailReminder(tenant, inv)}
                      >
                        <Mail className="w-3 h-3" />
                        <span>Email</span>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right 2 Columns: Messenger Shell Container */}
        <div className="lg:col-span-2 space-y-3">
          {/* Messenger Clean Navigation Tabs Header (Address Bar Completely Hidden) */}
          <div className="flex items-center justify-between p-2 rounded-[8px] bg-[var(--surface-raised)] border border-[var(--border-strong)]">
            <div className="flex items-center gap-2">
              {platforms.map((p) => {
                const isActive = activeTab === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveTab(p.id as any);
                      setIframeKey((k) => k + 1);
                    }}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <Button size="sm" variant="outline" onClick={handleRefresh} title="Reload webview">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </Button>
          </div>

          {/* Messenger Frame Container */}
          <Card className="p-0 overflow-hidden border-[var(--border-strong)] relative h-[560px]">
            <iframe
              key={iframeKey}
              src={currentPlatform.url}
              className="w-full h-full border-0 bg-white"
              title={currentPlatform.label}
              allow="camera; microphone; clipboard-read; clipboard-write;"
            />
          </Card>
        </div>
      </div>
    </div>
  );
};
