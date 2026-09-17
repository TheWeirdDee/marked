export function shortenHex(value: string, lead = 6, tail = 4): string {
  if (!value || value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead + 2)}…${value.slice(-tail)}`;
}

export function formatRawTokenAmount(raw: string, decimals = 18): string {
  const value = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const wholeStr = whole.toLocaleString("en-US");
  return wholeStr;
}
