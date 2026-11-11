import React, { useState, useEffect } from 'react';
import { Lease, Tenant, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Modal } from '../../components/ui/Modal';
import { handlePrint } from '../../lib/print';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Input';
import {
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Upload,
  Camera,
  AlertCircle,
  FileCheck,
  Printer,
  ShieldCheck,
  Check,
  X,
} from '../../components/icons';

export interface ChecklistItem {
  id: string;
  type: 'move_in' | 'move_out';
  title: string;
  category: string;
  status: 'passed' | 'needs_repair' | 'failed' | 'pending';
  notes?: string;
  photoData?: string | null;
  photoTimestamp?: string | null;
  completedAt?: string | null;
}

interface LeaseChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  lease: Lease | null;
  tenant?: Tenant;
  unit?: Unit;
}

const DEFAULT_ITEMS = [
  { title: 'Walls & ceilings free of damage, scuffs and nails', category: 'General Structure' },
  { title: 'Hardwood floors and carpets clean and vacuumed', category: 'Flooring' },
  { title: 'Windows, blinds and locks opening and latching smoothly', category: 'Windows & Doors' },
  { title: 'Kitchen refrigerator and freezer clean and cooling properly', category: 'Kitchen Appliances' },
  { title: 'Stove burners, oven racks and range hood exhaust tested', category: 'Kitchen Appliances' },
  { title: 'Plumbing fixtures, sink drains and toilet flushing correctly', category: 'Bathrooms' },
  { title: 'Smoke alarms and carbon monoxide detectors tested and functional', category: 'Life Safety' },
  { title: 'All door keys, mailbox keys and building access fobs handed over', category: 'Key Handover' },
];

export const LeaseChecklistModal: React.FC<LeaseChecklistModalProps> = ({
  isOpen,
  onClose,
  lease,
  tenant,
  unit,
}) => {
  const pack = usePack();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'move_in' | 'move_out'>('move_in');
  const [items, setItems] = useState<ChecklistItem[]>([]);

  // New item form
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('General');

  // Load from localStorage for this lease
  useEffect(() => {
    if (!lease) return;
    const storageKey = `rentflow_lease_checklists_${lease.id}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setItems(JSON.parse(raw));
        return;
      }
    } catch {}

    // Initialize with standard defaults
    const initial: ChecklistItem[] = [];
    ['move_in', 'move_out'].forEach((t) => {
      DEFAULT_ITEMS.forEach((def, idx) => {
        initial.push({
          id: `${t}-${idx}`,
          type: t as any,
          title: def.title,
          category: def.category,
          status: 'pending',
          notes: '',
        });
      });
    });
    setItems(initial);
  }, [lease]);

  const saveChecklist = (updated: ChecklistItem[]) => {
    if (!lease) return;
    setItems(updated);
    localStorage.setItem(`rentflow_lease_checklists_${lease.id}`, JSON.stringify(updated));
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const newItem: ChecklistItem = {
      id: generateUUID(),
      type: activeTab,
      title: newItemTitle.trim(),
      category: newItemCategory,
      status: 'pending',
    };

    const updated = [...items, newItem];
    saveChecklist(updated);
    setNewItemTitle('');
    showToast({ type: 'success', message: 'Inspection item added' });
  };

  const handleStatusChange = (id: string, status: ChecklistItem['status']) => {
    const updated = items.map((it) =>
      it.id === id
        ? {
            ...it,
            status,
            completedAt: status !== 'pending' ? new Date().toISOString() : null,
          }
        : it
    );
    saveChecklist(updated);
  };

  const handleNotesChange = (id: string, notes: string) => {
    const updated = items.map((it) => (it.id === id ? { ...it, notes } : it));
    saveChecklist(updated);
  };

  const handlePhotoUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const timestampStr = new Date().toLocaleString(pack.locale || 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    reader.onload = () => {
      const updated = items.map((it) =>
        it.id === id
          ? {
              ...it,
              photoData: reader.result as string,
              photoTimestamp: timestampStr,
            }
          : it
      );
      saveChecklist(updated);
      showToast({ type: 'success', message: 'Timestamped inspection photo attached' });
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((it) => it.id !== id);
    saveChecklist(updated);
  };

  if (!lease) return null;

  const currentTabItems = items.filter((it) => it.type === activeTab);
  const passedCount = currentTabItems.filter((it) => it.status === 'passed').length;
  const issuesCount = currentTabItems.filter((it) => it.status === 'needs_repair' || it.status === 'failed').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tenancy Move-In / Move-Out Inspection Checklist"
      description={`Unit condition verification & timestamped evidence for ${tenant?.name || 'Tenant'} (${unit?.name || 'Unit'})`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Inspection Type Tabs */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('move_in')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'move_in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Move-In Inspection (Arrival)
            </button>
            <button
              onClick={() => setActiveTab('move_out')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'move_out'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Move-Out Inspection (Departure)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="success">{passedCount} Passed</Badge>
            {issuesCount > 0 && <Badge variant="danger">{issuesCount} Issue(s)</Badge>}
          </div>
        </div>

        {/* Add Custom Item */}
        <form onSubmit={handleAddItem} className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center gap-2">
          <Input
            type="text"
            placeholder="e.g. Balcony railing secure & painted..."
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            className="text-xs h-8 flex-1"
            required
          />
          <Select
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value)}
            className="text-xs h-8 w-36"
          >
            <option value="General">General</option>
            <option value="Flooring">Flooring</option>
            <option value="Appliances">Appliances</option>
            <option value="Bathrooms">Bathrooms</option>
            <option value="Life Safety">Life Safety</option>
            <option value="Keys">Keys</option>
          </Select>
          <Button type="submit" size="sm" variant="primary" className="h-8 gap-1 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </Button>
        </form>

        {/* Inspection Items List */}
        <div className="print-area bg-white text-black space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {currentTabItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
              No checklist items recorded yet.
            </div>
          ) : (
            currentTabItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
                      {item.category}
                    </span>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">
                      {item.title}
                    </h4>
                  </div>

                  {/* Status Selection Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'passed')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'passed'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-emerald-600'
                      }`}
                    >
                      Passed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'needs_repair')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'needs_repair'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-amber-600'
                      }`}
                    >
                      Needs Repair
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'failed')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        item.status === 'failed'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-rose-600'
                      }`}
                    >
                      Failed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 rounded text-[var(--text-subtle)] hover:text-rose-600 ml-1 transition-colors cursor-pointer"
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Notes Input */}
                <input
                  type="text"
                  placeholder="Inspector notes or observed defect details..."
                  value={item.notes || ''}
                  onChange={(e) => handleNotesChange(item.id, e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />

                {/* Timestamped Photo Attachment */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-[var(--accent)] hover:underline">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{item.photoData ? 'Replace Photo' : 'Attach Timestamped Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(item.id, e)}
                        className="hidden"
                      />
                    </label>

                    {item.photoTimestamp && (
                      <span className="text-[11px] font-mono text-[var(--text-subtle)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{item.photoTimestamp}</span>
                      </span>
                    )}
                  </div>

                  {item.completedAt && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Verified</span>
                    </span>
                  )}
                </div>

                {/* Photo Preview with Verified Timestamp Stamp */}
                {item.photoData && (
                  <div className="relative rounded-xl overflow-hidden border border-[var(--border-strong)] mt-2 inline-block max-w-[220px]">
                    <img src={item.photoData} alt={item.title} className="w-full h-28 object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-xs px-2 py-1 text-[10px] text-white font-mono flex items-center justify-between">
                      <span>Verified Timestamp</span>
                      <span>{item.photoTimestamp}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] no-print">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={() => handlePrint()} className="gap-2">
            <Printer className="w-3.5 h-3.5" />
            <span>Print Inspection Certificate</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
