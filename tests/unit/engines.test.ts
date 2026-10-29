import { describe, it, expect } from 'vitest';
import { getCountryPack } from '../../src/countries/resolver';
import { formatMoney, toMinor, toMajor } from '../../src/lib/money';
import { accrueDepositInterest } from '../../src/lib/interest';
import { computeLateFee } from '../../src/lib/lateFee';

describe('Money Engine Unit Tests', () => {
  it('formats JPY with 0 decimal places', () => {
    const jpPack = getCountryPack('JP');
    expect(formatMoney(150000, jpPack)).toBe('¥ 150,000');
  });

  it('formats KWD with 3 decimal places', () => {
    const kwPack = getCountryPack('KW');
    expect(formatMoney(1250500, kwPack)).toBe('KWD 1,250.500');
  });

  it('formats INR with Indian grouping style', () => {
    const inPack = getCountryPack('IN');
    expect(formatMoney(15000000, inPack)).toBe('₹ 1,50,000.00');
  });
});

describe('Deposit Interest Engine Unit Tests', () => {
  it('accrues deposit interest for DE (Germany) with compound annual rate', () => {
    const dePack = getCountryPack('DE');
    const accrued = accrueDepositInterest({
      principalMinor: 300000, // €3,000.00
      pack: dePack,
      from: '2025-01-01',
      to: '2026-01-01',
      referenceRates: { ECB_MAIN: 3.5 },
    });
    expect(accrued).toBeGreaterThan(0);
  });

  it('returns 0 interest when country forbids interest (e.g., AE)', () => {
    const aePack = getCountryPack('AE');
    const accrued = accrueDepositInterest({
      principalMinor: 500000,
      pack: aePack,
      from: '2025-01-01',
      to: '2026-01-01',
    });
    expect(accrued).toBe(0);
  });
});

describe('Late Fee Engine Unit Tests', () => {
  it('calculates late fee with grace days check', () => {
    const usPack = getCountryPack('US');
    const res = computeLateFee(
      {
        due_date: '2026-10-01',
        subtotal_minor: 185000,
        total_minor: 185000,
        amount_paid_minor: 0,
      },
      {
        grace_days: 5,
        late_fee_type: 'percent',
        late_fee_value: 5,
        rent_minor: 185000,
      },
      usPack,
      '2026-10-03' // Within grace period
    );
    expect(res.feeMinor).toBe(0);
  });

  it('calculates late fee after grace period expires', () => {
    const usPack = getCountryPack('US');
    const res = computeLateFee(
      {
        due_date: '2026-10-01',
        subtotal_minor: 185000,
        total_minor: 185000,
        amount_paid_minor: 0,
      },
      {
        grace_days: 5,
        late_fee_type: 'percent',
        late_fee_value: 5,
        rent_minor: 185000,
      },
      usPack,
      '2026-10-15' // Overdue after grace days
    );
    expect(res.feeMinor).toBe(9250); // 5% of $1,850 = $92.50 = 9250 cents
  });

  it('flags Islamic charity mode for Pakistan (PK)', () => {
    const pkPack = getCountryPack('PK');
    const res = computeLateFee(
      {
        due_date: '2026-09-01',
        subtotal_minor: 10000000,
        total_minor: 10000000,
        amount_paid_minor: 0,
      },
      {
        grace_days: 5,
        late_fee_type: 'flat',
        late_fee_value: 1000,
        rent_minor: 10000000,
      },
      pkPack,
      '2026-10-01'
    );
    expect(res.isCharity).toBe(true);
  });
});
