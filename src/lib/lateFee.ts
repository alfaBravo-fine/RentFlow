import { CountryPack } from '../countries/types';
import { roundMinor } from './money';

export interface InvoiceLike {
  due_date: string | number | Date;
  subtotal_minor: number;
  total_minor: number;
  amount_paid_minor: number;
}

export interface LeaseLike {
  grace_days?: number | null;
  late_fee_type?: 'flat' | 'percent' | 'none' | null;
  late_fee_value?: number | null; // e.g., $25 or 5%
  rent_minor: number;
}

export interface LateFeeResult {
  feeMinor: number;
  isCharity: boolean;
  reason: string;
}

/**
 * Calculates late fee for an invoice based on lease parameters, country limits, and grace periods.
 * Rule 8.3 & Section 8.3
 */
export function computeLateFee(
  invoice: InvoiceLike,
  lease: LeaseLike,
  pack: CountryPack,
  today: Date | string | number = new Date()
): LateFeeResult {
  const lateRule = pack.lateFee;

  if (lateRule.allowed === 'no') {
    return { feeMinor: 0, isCharity: false, reason: 'Late fees prohibited by country regulations' };
  }

  const dueDate = new Date(invoice.due_date);
  const currentDate = new Date(today);

  if (isNaN(dueDate.getTime()) || isNaN(currentDate.getTime()) || currentDate <= dueDate) {
    return { feeMinor: 0, isCharity: false, reason: 'Invoice not yet overdue' };
  }

  // Grace days check
  const graceDays = lease.grace_days ?? lateRule.graceDaysDefault ?? 5;
  const gracePeriodEnd = new Date(dueDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + graceDays);

  if (currentDate <= gracePeriodEnd) {
    return { feeMinor: 0, isCharity: false, reason: `Within grace period (${graceDays} days)` };
  }

  // Calculate base fee
  const feeType = lease.late_fee_type || lateRule.type || 'none';
  const feeVal = lease.late_fee_value ?? 0;

  if (feeType === 'none' || feeVal <= 0) {
    return { feeMinor: 0, isCharity: false, reason: 'No late fee configured on lease' };
  }

  const unpaidMinor = Math.max(0, invoice.total_minor - invoice.amount_paid_minor);
  if (unpaidMinor <= 0) {
    return { feeMinor: 0, isCharity: false, reason: 'Invoice is fully paid' };
  }

  let rawFeeMinor = 0;
  if (feeType === 'flat') {
    // Value is in major currency, e.g. 50 = $50
    const factor = Math.pow(10, pack.currency.minorUnits);
    rawFeeMinor = feeVal * factor;
  } else if (feeType === 'percent') {
    // Value is percentage, e.g. 5 = 5% of unpaid rent
    rawFeeMinor = (unpaidMinor * feeVal) / 100;
  }

  // Apply Country Pack Cap (maxValue & maxBasis)
  let clampedFeeMinor = rawFeeMinor;
  if (lateRule.maxValue !== null && lateRule.maxValue !== undefined && lateRule.maxValue > 0) {
    const factor = Math.pow(10, pack.currency.minorUnits);
    if (lateRule.maxBasis === 'fixed_amount') {
      const capMinor = lateRule.maxValue * factor;
      clampedFeeMinor = Math.min(clampedFeeMinor, capMinor);
    } else if (lateRule.maxBasis === 'rent_percentage') {
      const capMinor = (lease.rent_minor * lateRule.maxValue) / 100;
      clampedFeeMinor = Math.min(clampedFeeMinor, capMinor);
    } else if (lateRule.maxBasis === 'annual_interest_cap') {
      // Annual interest cap formula
      const daysOverdue = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const annualInterestCap = (unpaidMinor * (lateRule.maxValue / 100) * daysOverdue) / 365;
      clampedFeeMinor = Math.min(clampedFeeMinor, annualInterestCap);
    }
  }

  const finalFeeMinor = roundMinor(Math.max(0, clampedFeeMinor), pack);
  const isCharity = !!lateRule.islamicFinanceMode;

  return {
    feeMinor: finalFeeMinor,
    isCharity,
    reason: isCharity
      ? 'Late fee accrued under Islamic finance rules (allocated to charity)'
      : `Late fee calculated (${feeType === 'flat' ? 'flat' : feeVal + '%'})`,
  };
}
