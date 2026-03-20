export function secondsUntilIso(iso: string | null): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  const now = Date.now();
  const delta = Math.floor((target - now) / 1000);
  return delta > 0 ? delta : 0;
}

export function unixToIso(unix: number | null): string | null {
  if (unix == null) return null;
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(".000Z", "+00:00");
}

export function nextMonthResetUtc(now = new Date()): { resetsAt: string; resetAfterSeconds: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const reset = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const resetAfterSeconds = Math.max(0, Math.floor((reset.getTime() - now.getTime()) / 1000));
  const resetsAt = reset.toISOString().replace(".000Z", "+00:00");
  return { resetsAt, resetAfterSeconds };
}
