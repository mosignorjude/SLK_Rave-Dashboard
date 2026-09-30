function searchText(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (value instanceof Date) return [value.toISOString()];
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? [date.toISOString()] : [];
  }
  if (Array.isArray(value)) return value.flatMap(searchText);
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...searchText(item)]);
  }
  return [];
}

export function searchActivityLogs(logs, query) {
  const terms = String(query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return logs;
  return logs.filter(log => {
    const searchable = searchText(log).join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
