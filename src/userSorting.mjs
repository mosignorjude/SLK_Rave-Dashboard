function registeredAtMillis(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** Newest registrations first; undated profiles stay last in stable UID order. */
export function sortUsersByRegistrationDate(users) {
  return [...users].sort((left, right) => {
    const leftTime = registeredAtMillis(left.createdAt);
    const rightTime = registeredAtMillis(right.createdAt);
    if (leftTime === null && rightTime !== null) return 1;
    if (rightTime === null && leftTime !== null) return -1;
    if (leftTime !== rightTime) return (rightTime ?? 0) - (leftTime ?? 0);
    return String(left.uid ?? '').localeCompare(String(right.uid ?? ''));
  });
}
