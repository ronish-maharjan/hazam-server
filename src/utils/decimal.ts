import Decimal from 'decimal.js';

// Configure decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

export function toDecimal(value: string | number): Decimal {
  return new Decimal(value);
}

export function addMoney(a: string, b: string): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(2);
}

export function subtractMoney(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(2);
}

export function isGreaterThanOrEqual(a: string, b: string): boolean {
  return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
}

export function isLessThan(a: string, b: string): boolean {
  return new Decimal(a).lessThan(new Decimal(b));
}

export function isNegative(value: string): boolean {
  return new Decimal(value).isNegative();
}

export function formatMoney(value: string): string {
  return new Decimal(value).toFixed(2);
}
