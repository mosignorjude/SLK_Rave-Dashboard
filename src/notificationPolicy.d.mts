export type NotificationRole = 'admin' | 'executive' | 'member' | 'guest';
export type NotificationCategory = 'finance' | 'tickets' | 'users' | 'security' | 'administration' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type CurrentAlert = {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  description: string;
  destination: { page: 'Budget' | 'Tickets'; tierId?: string; allocationId?: string };
};
export function currentAlertSourcesForRole(role: NotificationRole | null | undefined): string[];
export function canViewNotificationCategory(role: NotificationRole | null | undefined, category: NotificationCategory): boolean;
export function isAlertSnapshotFresh(metadata: { fromCache?: boolean; hasPendingWrites?: boolean } | null | undefined): boolean;
export function filterDismissedAlerts<T extends { id: string }>(alerts: T[], dismissedIds: Iterable<string>): T[];
export function deriveCurrentAlerts(input: {
  role: NotificationRole | null | undefined;
  budgetTotal?: number;
  paidAndDepositSpend?: number;
  committedSpend?: number;
  allocations?: Array<{ id: string; category: string; amount: number; paidAndDepositSpend: number; committedSpend?: number }>;
  tiers?: Array<{ id: string; name: string; capacity: number; sold: number; active?: boolean }>;
}): CurrentAlert[];
