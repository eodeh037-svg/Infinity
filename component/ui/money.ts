export function formatDollar(amount: number): string {
  if (amount < 0) return `-$${Math.abs(amount).toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatMoney(amount: number): string {
  return `₦${(amount ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

export function formatMoneyFixed(amount: number): string {
  return `₦${(amount ?? 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(2);
  if (abs >= 100) return value.toFixed(3);
  if (abs >= 1) return value.toFixed(4);
  return value.toFixed(5);
}