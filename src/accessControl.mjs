export function canManageFinancialRecords(role) {
  return role === 'admin' || role === 'executive';
}

export function canRecordTicketSales(role) {
  return canManageFinancialRecords(role) || role === 'member';
}
