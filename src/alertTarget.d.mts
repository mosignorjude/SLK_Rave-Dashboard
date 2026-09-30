export type AlertTargetPage = 'Tickets' | 'Budget';

export const ALERT_TARGET_MISSING_MESSAGE: string;

export function resolveAlertTargetElement<T>(
  page: AlertTargetPage,
  recordId: string | undefined,
  getElementById: (id: string) => T | null,
  onMissing?: () => void,
): T | null;
