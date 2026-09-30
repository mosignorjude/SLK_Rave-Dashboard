import test from 'node:test';
import assert from 'node:assert/strict';
import { searchActivityLogs } from '../src/activitySearch.mjs';

const records = [
  {
    id: 'event-1', actor: 'Kira Michael', actorId: 'uid-kira', action: 'expense.updated',
    targetType: 'expenses', targetId: 'expense-abc', reason: 'Corrected venue deposit',
    changes: { before: { amount: 5000 }, after: { amount: 4500 } },
  },
  {
    id: 'event-2', actor: 'Jude Iwelumo', actorId: 'uid-jude', action: 'ticket.sale',
    targetType: 'ticketSales', targetId: 'sale-xyz', reason: '',
  },
];

test('searches loaded audit records case-insensitively across identity, action, reason, and details', () => {
  assert.deepEqual(searchActivityLogs(records, 'KIRA VENUE'), [records[0]]);
  assert.deepEqual(searchActivityLogs(records, 'expense-abc'), [records[0]]);
  assert.deepEqual(searchActivityLogs(records, 'amount 4500'), [records[0]]);
  assert.deepEqual(searchActivityLogs(records, 'ticket jude'), [records[1]]);
});

test('blank search returns the same loaded set and unmatched terms return no records', () => {
  assert.equal(searchActivityLogs(records, '   '), records);
  assert.deepEqual(searchActivityLogs(records, 'not present'), []);
});
