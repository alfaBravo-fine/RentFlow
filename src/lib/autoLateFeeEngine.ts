import { db } from '../db/client';
import { Invoice, Lease } from '../db/schema';
import { resolvePack } from '../countries/resolver';
import { computeLateFee } from './lateFee';

/**
 * Scans all active/unpaid invoices, assesses statutory late fees if past grace period,
 * and updates invoice totals and status automatically.
 */
export function runLateFeeEngine(): { assessedCount: number; totalFeeAddedMinor: number } {
  try {
    const invoices = db.getTable<Invoice>('invoices');
    const leases = db.getTable<Lease>('leases');
    const pack = resolvePack();
    const now = new Date();

    let assessedCount = 0;
    let totalFeeAddedMinor = 0;

    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'voided') continue;

      const lease = leases.find((l) => l.id === inv.lease_id);
      if (!lease) continue;

      const feeRes = computeLateFee(inv, lease, pack, now);
      if (feeRes.feeMinor > 0 && inv.late_fee_minor !== feeRes.feeMinor) {
        const feeDifference = feeRes.feeMinor - (inv.late_fee_minor || 0);
        const newTotal = inv.subtotal_minor + feeRes.feeMinor;

        db.updateItem<Invoice>('invoices', inv.id, {
          late_fee_minor: feeRes.feeMinor,
          total_minor: newTotal,
          status: 'overdue',
        });

        db.recordAudit(
          'AUTO_LATE_FEE_APPLIED',
          'invoices',
          inv.id,
          { old_late_fee: inv.late_fee_minor },
          { new_late_fee: feeRes.feeMinor, reason: feeRes.reason, isCharity: feeRes.isCharity }
        );

        assessedCount++;
        totalFeeAddedMinor += Math.max(0, feeDifference);
      } else if (new Date(inv.due_date) < now && inv.status !== 'overdue') {
        // Mark as overdue even if fee is zero (e.g. within grace or no late fee configured)
        const graceDays = lease.grace_days ?? pack.lateFee.graceDaysDefault ?? 5;
        const graceEnd = new Date(inv.due_date);
        graceEnd.setDate(graceEnd.getDate() + graceDays);

        if (now > graceEnd) {
          db.updateItem<Invoice>('invoices', inv.id, {
            status: 'overdue',
          });
        }
      }
    }

    return { assessedCount, totalFeeAddedMinor };
  } catch (err) {
    console.error('Error running automated late fee engine:', err);
    return { assessedCount: 0, totalFeeAddedMinor: 0 };
  }
}

/**
 * Initializes the background scheduled job that runs on app boot and every 24 hours.
 */
export function initAutomatedLateFeeSchedule(): () => void {
  // Run on start
  runLateFeeEngine();

  // Run every 24 hours (86,400,000 ms)
  const intervalId = setInterval(() => {
    runLateFeeEngine();
  }, 24 * 60 * 60 * 1000);

  return () => clearInterval(intervalId);
}
