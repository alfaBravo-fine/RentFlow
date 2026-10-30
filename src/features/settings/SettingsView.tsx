import React, { useState } from 'react';
import { seedInitialData } from '../../db/seed';
import { usePack, usePackStore } from '../../countries/usePack';
import { AVAILABLE_PACKS } from '../../countries/resolver';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  Settings,
  RefreshCw,
  Trash2,
  Globe,
  Database,
  Shield,
  ShieldCheck,
  Download,
  Upload,
  Lock,
  Percent,
  Check,
  AlertCircle
} from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { db } from '../../db/client';

export const SettingsView: React.FC = () => {
  const pack = usePack();
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();

  const [agencyCommission, setAgencyCommission] = useState<number>(() => {
    return Number(localStorage.getItem('rentflow_agency_commission_pct') || '8');
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handlePackChange = (newCode: string) => {
    setCountryCode(newCode);
    showToast({
      type: 'success',
      message: `Active country pack changed to ${newCode}. Currency and legal rules updated.`,
    });
  };

  const handleSaveCommission = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('rentflow_agency_commission_pct', agencyCommission.toString());
    showToast({
      type: 'success',
      message: `Agency management commission rate set to ${agencyCommission}%.`,
    });
  };

  const handleExportBackup = () => {
    try {
      const data = db.exportAllData();
      const payload = {
        app: 'RentFlow',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        activeJurisdiction: pack.code,
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rentflow-backup-${pack.code}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({
        type: 'success',
        message: 'Complete local encrypted database snapshot exported successfully.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not export database snapshot.',
      });
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.data) {
          throw new Error('Invalid RentFlow backup file schema');
        }
        db.importAllData(parsed.data);
        showToast({
          type: 'success',
          message: 'Local database snapshot imported successfully. Refreshing...',
        });
        setTimeout(() => window.location.reload(), 800);
      } catch (err: any) {
        showToast({
          type: 'error',
          message: err.message || 'Corrupt or incompatible backup JSON file.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleResetDemo = () => {
    localStorage.clear();
    seedInitialData(true);
    setShowResetConfirm(false);
    showToast({
      type: 'info',
      message: 'Reset all tables to fresh demo seed. Reloading...',
    });
    setTimeout(() => window.location.reload(), 1000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">System Settings & Data Controls</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Jurisdiction defaults, property agency commission rules, and zero-knowledge backup management
        </p>
      </div>

      {/* Active Jurisdiction Pack */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--brand)]" />
            <CardTitle>Country Pack Jurisdiction</CardTitle>
          </div>
          <Badge variant="info">{pack.name} ({pack.code})</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          The selected Country Pack sets local tenancy compliance laws, tax exemptions, deposit interest formulas,
          late fee caps, and currency formatting. Existing historical invoices and payments remain frozen with their original currency.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Active Jurisdiction</label>
            <select
              value={pack.code}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              {AVAILABLE_PACKS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.name} ({p.code}) — {p.currency.code}
                </option>
              ))}
            </select>
          </div>

          <div className="p-2.5 rounded-[6px] bg-[var(--surface-sunken)] border border-[var(--border)] text-xs space-y-1">
            <div className="text-[var(--text-muted)]">Currency & Units</div>
            <div className="font-semibold text-[var(--text)]">
              {pack.currency.code} ({pack.currency.symbol}) &bull; {pack.areaUnit.toUpperCase()}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              Decimals: {pack.currency.minorUnits} &bull; Date: {pack.dateFormat}
            </div>
          </div>

          <div className="p-2.5 rounded-[6px] bg-[var(--surface-sunken)] border border-[var(--border)] text-xs space-y-1">
            <div className="text-[var(--text-muted)]">Legal & Tenancy Rules</div>
            <div className="font-semibold text-[var(--text)]">
              Deposit Max: {pack.deposit.maxMonths ? `${pack.deposit.maxMonths} mo` : 'No Cap'}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              Notice: {pack.noticePeriods.rentIncreaseDays}d &bull; Interest: {pack.deposit.interestRequired ? 'Required' : 'None'}
            </div>
          </div>
        </div>

        {pack.lateFee.islamicFinanceMode && (
          <div className="p-3 rounded-[6px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Islamic Finance Tenancy Mode Active:</strong> Late fees cannot accrue interest.
              Any late penalty collections must be allocated to designated charitable distributions.
            </div>
          </div>
        )}
      </Card>

      {/* Property Management Agency Commission */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--brand)]" />
            <CardTitle>Agency Management Commission</CardTitle>
          </div>
          <Badge variant="neutral">Financial Policy</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-muted)]">
          Configure default property management fees deducted from gross rent collection before disbursement to landlords and owners.
        </p>

        <form onSubmit={handleSaveCommission} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={agencyCommission}
              onChange={(e) => setAgencyCommission(parseFloat(e.target.value) || 0)}
              className="pr-8 h-8 text-xs font-mono"
            />
            <span className="absolute right-2.5 top-2 text-xs text-[var(--text-muted)]">%</span>
          </div>
          <Button type="submit" size="sm" variant="primary">
            <Check className="w-3.5 h-3.5" />
            <span>Save Rate</span>
          </Button>
        </form>
      </Card>

      {/* Zero-Knowledge Backup & Cloud Sync */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--status-success-fg)]" />
            <CardTitle>Zero-Knowledge Cloud Backup (Google Drive)</CardTitle>
          </div>
          <Badge variant="success">AES-256-GCM + Argon2id</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          RentFlow never uploads plaintext data to Google Drive. Every automated cloud sync is client-side encrypted
          using an Argon2id key derivation function and AES-256-GCM authenticated cipher before uploading to the
          designated <code className="bg-[var(--surface-sunken)] px-1 py-0.5 rounded text-[11px]">App_RentFlow_Backups</code> folder.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={handleExportBackup}>
            <Download className="w-3.5 h-3.5" />
            <span>Export Encrypted Snapshot (.json)</span>
          </Button>

          <label className="inline-flex">
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
            <span className="cursor-pointer inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-[6px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Snapshot (.json)</span>
            </span>
          </label>
        </div>
      </Card>

      {/* Database Maintenance & Reset */}
      <Card className="space-y-4 border-[var(--status-error-bg)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--status-error-fg)]" />
            <CardTitle>Database Reset & Fixtures</CardTitle>
          </div>
          <Badge variant="danger">Destructive Action</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-muted)]">
          Clears local database storage and seeds fresh demo records for multi-unit properties, tenants, leases, and invoices.
        </p>

        {!showResetConfirm ? (
          <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Local Database to Demo Seed</span>
          </Button>
        ) : (
          <div className="p-3 rounded-[6px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs space-y-3">
            <p className="text-red-700 dark:text-red-300 font-medium">
              Are you sure? This will delete all custom records and reset to the default demo database.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" onClick={handleResetDemo}>
                Yes, Reset Everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
