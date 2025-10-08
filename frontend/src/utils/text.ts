export function middleTruncate(text: string, maxLength: number = 36): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}
