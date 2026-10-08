const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export const formatPrice = (cents: number): string => money.format(cents / 100);

/** 83_400 ms -> "1:24". Rounds up so it never shows 0:00 while time remains. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}