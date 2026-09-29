import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/budget.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const budget = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { getExpenseBudgetWarnings, summarizeAllocationExpenses, summarizeExpenses } = budget;

const allocations = [{ id: 'venue', category: 'Venue', amount: 100 }];

test('counts paid expenses and deposits as paid, with pending and legacy unpaid as commitments', () => {
  const expenses = [
    { amount: 40, status: 'Paid', category: 'Venue' },
    { amount: 10, status: 'Deposit', category: 'Venue' },
    { amount: 30, status: 'Pending', category: 'Venue' },
    { amount: 20, status: 'Unpaid', category: 'Venue' },
  ];
  assert.deepEqual(summarizeExpenses(expenses), { paid: 50, committed: 50 });
  assert.deepEqual(summarizeAllocationExpenses(expenses, allocations[0]), { paid: 50, committed: 50 });
});

test('warns about event and category overruns without blocking the candidate', () => {
  const expenses = [{ id: 'paid', amount: 75, status: 'Paid', category: 'Venue', budgetAllocationId: 'venue' }];
  const candidate = { amount: 40, status: 'Pending', category: 'Venue', budgetAllocationId: 'venue' };
  const warnings = getExpenseBudgetWarnings(expenses, allocations, 100, candidate);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /event budget would be exceeded by ₦15/i);
  assert.match(warnings[1], /venue allocation would be exceeded by ₦15/i);
  assert.ok(warnings.every(warning => /advisory only and does not block saving/i.test(warning)));
});

test('editing an expense excludes its old value before calculating the warning', () => {
  const expenses = [{ id: 'edit-me', amount: 80, status: 'Paid', category: 'Venue', budgetAllocationId: 'venue' }];
  const warnings = getExpenseBudgetWarnings(expenses, allocations, 100, {
    id: 'edit-me', amount: 90, status: 'Paid', category: 'Venue', budgetAllocationId: 'venue',
  }, 'edit-me');
  assert.deepEqual(warnings, []);
});

test('warns when the selected expense category has no allocation', () => {
  const warnings = getExpenseBudgetWarnings([], allocations, 100, {
    amount: 25, status: 'Paid', category: 'Transport',
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no budget allocation matches/i);
});
