import React, { useState } from 'react';
import { uploadBackupToDrive } from '../../lib/google/drive';
import { syncEngine } from '../../lib/sync';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RefreshCw, Download, Upload, Shield, CheckCircle, Smartphone } from '../../components/icons';

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Google Drive Encrypted Sync & Local Backup</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Rule 10 Enforced &bull; AES-256-GCM zero-knowledge encrypted database snapshots
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleDriveSync} disabled={isSyncing}>
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now to Google Drive'}</span>
        </Button>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--accent)] text-xs font-mono text-[var(--accent)] flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Cloud Drive Status</CardTitle>
            <Badge variant="success">Zero-Knowledge Encrypted</Badge>
          </CardHeader>
          <div className="space-y-2 text-xs text-[var(--text-muted)]">
            <p><strong>App Folder:</strong> Google Drive appDataFolder (Personal model)</p>
            <p><strong>Encryption:</strong> AES-256-GCM + Argon2id derived key</p>
            <p><strong>Pending Local Writes:</strong> {pendingCount} queue items</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleDriveSync}>
            Push Sync Queue to Cloud
          </Button>
        </Card>

        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Offline Local Backup File</CardTitle>
            <Badge variant="neutral">Offline Export</Badge>
          </CardHeader>
          <p className="text-xs text-[var(--text-muted)]">
            Export an encrypted `.json.enc` backup payload to your local hard drive or flash drive for offline archiving.
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleExportLocalBackup}>
            <Download className="w-4 h-4" />
            <span>Download Encrypted Backup (.enc.json)</span>
          </Button>
        </Card>
      </div>
    </div>
  );
};
