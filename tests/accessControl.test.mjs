import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageFinancialRecords, canRecordTicketSales } from '../src/accessControl.mjs';

test('only Admins and Executives can create or edit revenue and expenses', () => {
  for (const role of ['admin', 'executive']) assert.equal(canManageFinancialRecords(role), true, role);
  for (const role of ['member', 'guest', null, undefined]) assert.equal(canManageFinancialRecords(role), false, String(role));
});

test('Members can record ticket sales while Guests remain read-only', () => {
  for (const role of ['admin', 'executive', 'member']) assert.equal(canRecordTicketSales(role), true, role);
  for (const role of ['guest', null, undefined]) assert.equal(canRecordTicketSales(role), false, String(role));
});
