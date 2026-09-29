import type { Role } from './types';

export function canManageFinancialRecords(role: Role | null | undefined): boolean;
export function canRecordTicketSales(role: Role | null | undefined): boolean;
