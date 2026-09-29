import assert from 'node:assert/strict';
import test from 'node:test';
import { canClaimMasterAdmin, canManageFinancialRecords, canRecordTicketSales, MASTER_ADMIN_EMAIL } from '../src/accessControl.mjs';

test('only Admins and Executives can create or edit revenue and expenses', () => {
  for (const role of ['admin', 'executive']) assert.equal(canManageFinancialRecords(role), true, role);
  for (const role of ['member', 'guest', null, undefined]) assert.equal(canManageFinancialRecords(role), false, String(role));
});

test('Members can record ticket sales while Guests remain read-only', () => {
  for (const role of ['admin', 'executive', 'member']) assert.equal(canRecordTicketSales(role), true, role);
  for (const role of ['guest', null, undefined]) assert.equal(canRecordTicketSales(role), false, String(role));
});

test('only the approved Guest profile for the configured Master Admin email can see the claim action', () => {
  const recoveredGuest = { role: 'guest', status: 'approved' };
  assert.equal(canClaimMasterAdmin(recoveredGuest, MASTER_ADMIN_EMAIL.toUpperCase()), true);
  assert.equal(canClaimMasterAdmin(recoveredGuest, 'other@example.test'), false);
  assert.equal(canClaimMasterAdmin({ ...recoveredGuest, status: 'pending' }, MASTER_ADMIN_EMAIL), false);
  assert.equal(canClaimMasterAdmin({ ...recoveredGuest, role: 'member' }, MASTER_ADMIN_EMAIL), false);
  assert.equal(canClaimMasterAdmin({ ...recoveredGuest, role: 'admin', isMasterAdmin: true }, MASTER_ADMIN_EMAIL), false);
});
