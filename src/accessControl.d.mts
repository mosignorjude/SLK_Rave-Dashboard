import type { Role } from './types';

export const MASTER_ADMIN_EMAIL: string;
export function canClaimMasterAdmin(
  profile: { role?: Role | null; status?: string | null; isMasterAdmin?: boolean } | null | undefined,
  authEmail: string | null | undefined,
): boolean;
export function canManageFinancialRecords(role: Role | null | undefined): boolean;
export function canRecordTicketSales(role: Role | null | undefined): boolean;
