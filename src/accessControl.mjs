export const MASTER_ADMIN_EMAIL = 'carpentersfamily001@gmail.com';

export function canClaimMasterAdmin(profile, authEmail) {
  return String(authEmail ?? '').trim().toLowerCase() === MASTER_ADMIN_EMAIL
    && profile?.role === 'guest'
    && profile?.status === 'approved'
    && profile?.isMasterAdmin !== true;
}

export function canManageFinancialRecords(role) {
  return role === 'admin' || role === 'executive';
}

export function canRecordTicketSales(role) {
  return canManageFinancialRecords(role) || role === 'member';
}
