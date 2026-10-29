import React, { useState } from 'react';
import { uploadBackupToDrive } from '../../lib/google/drive';
import { syncEngine } from '../../lib/sync';
import { db } from '../../db/client';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RefreshCw, Download, Upload, Shield, CheckCircle, Smartphone, FileSpreadsheet, Database } from '../../components/icons';

export const SyncView: React.FC = () => {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const pendingCount = syncEngine.getPendingCount();

  const handleDriveSync = async () => {
    setIsSyncing(true);
    setStatusMsg('Encrypting SQLite database with AES-256-GCM...');

    const res = await uploadBackupToDrive();
    setIsSyncing(false);
    setStatusMsg(res.message);
  };

  const handleExportLocalBackup = async () => {
    const encrypted = await syncEngine.exportEncryptedSnapshot();
    const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow_backup_${new Date().toISOString().slice(0, 10)}.enc.json`;
    a.click();
  };

  const handleExportAllDataCSV = () => {
    const tenants = db.getTable('tenants');
    const leases = db.getTable('leases');
    const invoices = db.getTable('invoices');
    const maintenance = db.getTable('maintenance_requests');

    let csv = `EXPORT DATE,${new Date().toISOString()}\n\n`;

    csv += `TENANTS DIRECTORY\nID,Name,Email,Phone,ID Type,ID Number\n`;
    tenants.forEach((t: any) => {
      csv += `"${t.id}","${t.name}","${t.email}","${t.phone}","${t.id_type}","${t.id_number}"\n`;
    });

    csv += `\nLEASES\nID,Unit ID,Tenant ID,Rent Minor,Deposit Minor,Status\n`;
    leases.forEach((l: any) => {
      csv += `"${l.id}","${l.unit_id}","${l.tenant_id}",${l.rent_minor},${l.deposit_minor},"${l.status}"\n`;
    });

    csv += `\nINVOICES & RENT ROLL\nID,Lease ID,Due Date,Total Minor,Paid Minor,Status\n`;
    invoices.forEach((i: any) => {
      csv += `"${i.id}","${i.lease_id}","${i.due_date}",${i.total_minor},${i.amount_paid_minor},"${i.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow_all_records_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Google Drive Encrypted Sync & Data Export Hub</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Rule 10 Enforced &bull; AES-256-GCM zero-knowledge cloud backups and 1-click CSV export
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportAllDataCSV}>
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export All Data (CSV)</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleDriveSync} disabled={isSyncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now to Google Drive'}</span>
          </Button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--accent)] text-xs font-mono text-[var(--accent)] flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Cloud Drive Redundancy</CardTitle>
            <Badge variant="success">Zero-Knowledge Encrypted</Badge>
          </CardHeader>
          <div className="space-y-2 text-xs text-[var(--text-muted)]">
            <p><strong>Folder:</strong> Google Drive `App_RentFlow_Backups`</p>
            <p><strong>Encryption:</strong> AES-256-GCM + Argon2id</p>
            <p><strong>Pending Local Writes:</strong> {pendingCount} queue items</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleDriveSync}>
            Push Local Queue to Cloud
          </Button>
        </Card>

        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Offline Encrypted Backup</CardTitle>
            <Badge variant="neutral">JSON Archive</Badge>
          </CardHeader>
          <p className="text-xs text-[var(--text-muted)]">
            Export an encrypted `.json.enc` backup payload to your local hard drive or flash drive for offline archiving.
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportLocalBackup}>
            <Download className="w-4 h-4" />
            <span>Download Encrypted Backup (.enc.json)</span>
          </Button>
        </Card>

        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Data Export Hub</CardTitle>
            <Badge variant="info">Full Records Export</Badge>
          </CardHeader>
          <p className="text-xs text-[var(--text-muted)]">
            Export all tenants, leases, deposits, maintenance logs, and invoices into unified structured CSV files.
          </p>
          <Button variant="primary" className="w-full gap-2" onClick={handleExportAllDataCSV}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export All Data Records (CSV)</span>
          </Button>
        </Card>
      </div>
    </div>
  );
};
