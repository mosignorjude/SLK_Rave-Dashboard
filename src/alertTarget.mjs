const ROW_PREFIX = {
  Tickets: 'ticket-tier-row-',
  Budget: 'budget-allocation-row-',
};

export const ALERT_TARGET_MISSING_MESSAGE = "This alert's target is no longer available.";

/** Resolve an alert's current row, using the same missing-target callback in every destination. */
export function resolveAlertTargetElement(page, recordId, getElementById, onMissing) {
  const prefix = ROW_PREFIX[page];
  if (!prefix || typeof recordId !== 'string' || !recordId) return null;

  const row = getElementById(`${prefix}${recordId}`);
  if (!row) {
    onMissing?.();
    return null;
  }
  return row;
}
