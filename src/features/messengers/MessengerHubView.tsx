import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Invoice, Lease, Property, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import {
  MESSAGE_TEMPLATES,
  buildWhatsAppLink,
  buildSmsLink,
  buildEmailLink,
} from '../../lib/deepLinks';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  MessageSquare,
  Send,
  Mail,
  Phone,
  Copy,
  ExternalLink,
  CheckCircle,
  Smartphone,
  Check,
} from '../../components/icons';

export const MessengerHubView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const tenants = db.getTable<Tenant>('tenants');
  const leases = db.getTable<Lease>('leases');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');
  const invoices = db.getTable<Invoice>('invoices');

  const [activePlatform, setActivePlatform] = useState<'whatsapp' | 'telegram' | 'discord'>('whatsapp');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.id || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(MESSAGE_TEMPLATES[0].id);

  // Derive tenant details
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0];
  const tenantLease = leases.find((l) => l.tenant_id === selectedTenant?.id);
  const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;
  const tenantProp = tenantUnit ? properties.find((p) => p.id === tenantUnit.property_id) : null;
  const overdueInvoice = invoices.find(
    (i) => i.lease_id === tenantLease?.id && (i.status === 'overdue' || i.status === 'partially_paid')
  );

  const unpaidMinor = overdueInvoice
    ? overdueInvoice.total_minor - overdueInvoice.amount_paid_minor
    : tenantLease?.rent_minor || 0;

  // Initialize draft message from template
  const activeTemplate = MESSAGE_TEMPLATES.find((t) => t.id === selectedTemplateId) || MESSAGE_TEMPLATES[0];
  const initialText = activeTemplate.template({
    tenantName: selectedTenant?.name || 'Resident',
    propertyName: tenantProp?.name || 'Property',
    unitName: tenantUnit?.name || 'Unit',
    amountFormatted: formatMoney(unpaidMinor, pack),
    dueDate: overdueInvoice?.due_date || '1st of the month',
    invoiceId: overdueInvoice?.id || 'INV-CURRENT',
  });

  const [customMessage, setCustomMessage] = useState(initialText);

  // Update draft message when tenant or template changes
  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const tmpl = MESSAGE_TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setCustomMessage(
        tmpl.template({
          tenantName: selectedTenant?.name || 'Resident',
          propertyName: tenantProp?.name || 'Property',
          unitName: tenantUnit?.name || 'Unit',
          amountFormatted: formatMoney(unpaidMinor, pack),
          dueDate: overdueInvoice?.due_date || '1st of the month',
          invoiceId: overdueInvoice?.id || 'INV-CURRENT',
        })
      );
    }
  };

  const handleTenantChange = (tId: string) => {
    setSelectedTenantId(tId);
    const t = tenants.find((item) => item.id === tId);
    const l = leases.find((lease) => lease.tenant_id === tId);
    const u = l ? units.find((unit) => unit.id === l.unit_id) : null;
    const p = u ? properties.find((prop) => prop.id === u.property_id) : null;
    const inv = invoices.find(
      (i) => i.lease_id === l?.id && (i.status === 'overdue' || i.status === 'partially_paid')
    );
    const unpMinor = inv ? inv.total_minor - inv.amount_paid_minor : l?.rent_minor || 0;

    const tmpl = MESSAGE_TEMPLATES.find((item) => item.id === selectedTemplateId) || MESSAGE_TEMPLATES[0];
    setCustomMessage(
      tmpl.template({
        tenantName: t?.name || 'Resident',
        propertyName: p?.name || 'Property',
        unitName: u?.name || 'Unit',
        amountFormatted: formatMoney(unpMinor, pack),
        dueDate: inv?.due_date || '1st of the month',
        invoiceId: inv?.id || 'INV-CURRENT',
      })
    );
  };

  const handleSendWhatsApp = () => {
    if (!selectedTenant) return;
    const url = buildWhatsAppLink(selectedTenant.phone, customMessage);
    if (!navigator.onLine) {
      navigator.clipboard.writeText(url);
      showToast({
        type: 'info',
        message: 'Offline: WhatsApp link copied to clipboard. Open when online.',
      });
      return;
    }
    window.open(url, '_blank');
    showToast({ type: 'success', message: `WhatsApp dispatched for ${selectedTenant.name}` });
  };

  const handleSendSMS = () => {
    if (!selectedTenant) return;
    const url = buildSmsLink(selectedTenant.phone, customMessage);
    window.open(url, '_blank');
    showToast({ type: 'success', message: `SMS composer opened for ${selectedTenant.name}` });
  };

  const handleSendEmail = () => {
    if (!selectedTenant) return;
    const subject = activeTemplate.name;
    const url = buildEmailLink(selectedTenant.email, subject, customMessage);
    window.open(url, '_blank');
    showToast({ type: 'success', message: `Email client opened for ${selectedTenant.name}` });
  };

  const handleCopyLink = () => {
    if (!selectedTenant) return;
    const url = buildWhatsAppLink(selectedTenant.phone, customMessage);
    navigator.clipboard.writeText(url);
    showToast({ type: 'success', message: 'Message link copied to clipboard!' });
  };

  const platformCards = [
    {
      id: 'whatsapp' as const,
      name: 'WhatsApp',
      protocol: 'whatsapp://',
      webUrl: 'https://web.whatsapp.com',
      description: 'Open official WhatsApp client or launch WhatsApp Web in your browser.',
    },
    {
      id: 'telegram' as const,
      name: 'Telegram',
      protocol: 'tg://',
      webUrl: 'https://web.telegram.org/a/',
      description: 'Connect with tenants over Telegram Desktop or Telegram Web.',
    },
    {
      id: 'discord' as const,
      name: 'Discord',
      protocol: 'discord://',
      webUrl: 'https://discord.com/app',
      description: 'Manage landlord community groups, agency discussions, or tenant servers.',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Communications & Messengers Hub</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Deep-link dispatch engine &bull; Direct-to-app triggers for WhatsApp, Telegram, Discord, SMS & Email
          </p>
        </div>
        <Badge variant="info">Section 11.13 Deep-Link Engine</Badge>
      </div>

      {/* Quick Send Composer Box */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Tenant Direct Quick-Send Dispatcher</CardTitle>
          </div>
          <Badge variant="success">Auto-Drafting Active</Badge>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Select Tenant Recipient
            </label>
            <select
              value={selectedTenantId}
              onChange={(e) => handleTenantChange(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} &bull; {t.phone} ({t.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Message Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
            >
              {MESSAGE_TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
            Message Body (Personalized & Editable)
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={4}
            className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--text)] focus-ring font-sans"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={handleSendWhatsApp} className="gap-1.5">
              <Send className="w-3.5 h-3.5" />
              <span>Send WhatsApp</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSendSMS} className="gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Send SMS</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSendEmail} className="gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              <span>Send Email</span>
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs">
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Direct Link</span>
          </Button>
        </div>
      </Card>

      {/* Platform Launchers Header & Cards */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Desktop & Web Messenger Launchers
        </h2>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-[var(--border)] pb-2">
          {platformCards.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlatform(p.id)}
              className={`px-4 py-2 rounded-[6px] text-xs font-semibold transition-all cursor-pointer ${
                activePlatform === p.id
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Selected platform card */}
        {(() => {
          const card = platformCards.find((c) => c.id === activePlatform)!;
          return (
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-[8px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center font-bold text-lg">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text)]">{card.name} Gateway</h3>
                  <p className="text-xs text-[var(--text-muted)]">{card.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    window.open(card.protocol, '_blank');
                    showToast({ type: 'info', message: `Attempting to launch native ${card.name} desktop app...` });
                  }}
                  className="gap-2"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Open {card.name} Desktop App</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => window.open(card.webUrl, '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open {card.name} Web in Browser</span>
                </Button>
              </div>
            </Card>
          );
        })()}
      </div>
    </div>
  );
};
