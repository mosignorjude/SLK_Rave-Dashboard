const formulaLikeText = /^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@])/u;

export function serializeCsvCell(value: unknown): string {
  const text = String(value);
  const safeText = typeof value === 'string' && formulaLikeText.test(text)
    ? `'${text}`
    : text;

  return `"${safeText.replaceAll('"', '""')}"`;
}
