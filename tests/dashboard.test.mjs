import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/dashboard.ts', import.meta.url), 'utf8');
const budgetSource = await readFile(new URL('../src/budget.ts', import.meta.url), 'utf8');
const { outputText: budgetOutput } = ts.transpileModule(budgetSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const budgetUrl = `data:text/javascript;base64,${Buffer.from(budgetOutput).toString('base64')}`;
const { outputText } = ts.transpileModule(source.replace("from './budget'", `from '${budgetUrl}'`), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const dashboard = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { buildRecentActivity, paginateItems, summarizeDashboard } = dashboard;

test('summarizes paid totals, commitments, budget availability and utilization', () => {
  const summary = summarizeDashboard({
    revenues: [
      { amount: 25_000, status: 'Paid', category: 'Sponsorship' },
      { amount: 7_000, status: 'Pending', category: 'Sponsorship' },
    ],
    ticketSales: [{ total: 40_000, status: 'Paid', tierId: 'regular', quantity: 5 }],
    expenses: [
      { amount: 20_000, status: 'Paid', category: 'Venue', budgetAllocationId: 'venue' },
      { amount: 7_000, status: 'Deposit', category: 'Venue', budgetAllocationId: 'venue' },
      { amount: 10_000, status: 'Pending', category: 'Venue', budgetAllocationId: 'venue' },
      { amount: 5_000, status: 'Unpaid', category: 'Venue', budgetAllocationId: 'venue' },
    ],
    tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold: 5 }],
    allocations: [{ id: 'venue', category: 'Venue', amount: 80_000 }],
    totalBudget: 100_000,
  });

  assert.equal(summary.paidRevenue, 65_000);
  assert.equal(summary.paidExpense, 27_000);
  assert.equal(summary.totalExpense, 42_000);
  assert.equal(summary.pendingExpense, 10_000);
  assert.equal(summary.unpaidExpense, 5_000);
  assert.equal(summary.netProfitLoss, 38_000);
  assert.equal(summary.ticketsSold, 5);
  assert.equal(summary.totalBudget, 100_000);
  assert.equal(summary.remainingBudget, 73_000);
  assert.equal(summary.availableAfterCommitments, 58_000);
  assert.equal(summary.budgetUtilizationPercent, 27);
  assert.deepEqual(summary.revenueByCategory, [
    { category: 'Sponsorship', amount: 25_000 },
    { category: 'Ticket Sales', amount: 40_000 },
  ]);
  assert.deepEqual(summary.spendingByAllocation[0], {
    id: 'venue', category: 'Venue', amount: 80_000,
    paid: 27_000, committed: 15_000, remainingAfterCommitments: 38_000, cashRemaining: 53_000,
  });
});

test('handles empty and incomplete records without producing NaN values', () => {
  const summary = summarizeDashboard({
    revenues: [{ amount: 'invalid', status: 'Paid' }],
    ticketSales: [], expenses: [], tiers: [], allocations: [], totalBudget: 0,
  });
  assert.equal(summary.paidRevenue, 0);
  assert.equal(summary.totalExpense, 0);
  assert.equal(summary.budgetUtilizationPercent, 0);
  assert.deepEqual(summary.revenueByCategory, []);
});

test('builds a newest-first activity feed across revenue, expense, and ticket sales', () => {
  const activity = buildRecentActivity({
    revenues: [{ id: 'r1', date: '2026-01-01', createdAt: { seconds: 2 } }],
    expenses: [{ id: 'e1', date: '2026-01-03', createdAt: { seconds: 3 } }],
    ticketSales: [{ id: 't1', date: '2026-01-02', createdAt: { seconds: 1 } }],
  });
  assert.deepEqual(activity.map(row => `${row.kind}:${row.id}`), ['expense:e1', 'revenue:r1', 'ticket:t1']);
});

test('paginates activity and clamps a stale page after live updates', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(paginateItems(rows, 1, 2), {
    items: ['c', 'd'], page: 1, pageCount: 3, start: 2, end: 4, total: 5,
  });
  assert.deepEqual(paginateItems(['a'], 4, 2), {
    items: ['a'], page: 0, pageCount: 1, start: 0, end: 1, total: 1,
  });
});
