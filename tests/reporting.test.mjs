import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

function compileModule(source, replacements = {}) {
  let prepared = source;
  for (const [from, to] of Object.entries(replacements)) prepared = prepared.replaceAll(from, to);
  const { outputText } = ts.transpileModule(prepared, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const budgetUrl = compileModule(await read('../src/budget.ts'));
const dashboardUrl = compileModule(await read('../src/dashboard.ts'), { "from './budget'": `from '${budgetUrl}'` });
const csvUrl = compileModule(await read('../src/csv.ts'));
const reportingUrl = compileModule(await read('../src/reporting.ts'), {
  "from './dashboard'": `from '${dashboardUrl}'`,
  "from './csv'": `from '${csvUrl}'`,
});
const { buildReportCsv, buildReportView, filterByDate, isIsoDate, validateDateRange } = await import(reportingUrl);

const sample = {
  revenues: [
    { id: 'r1', title: 'Sponsor', category: 'Sponsorship', amount: 20_000, status: 'Paid', date: '2026-05-01', agent: 'A' },
    { id: 'r2', title: 'Later', category: 'Vendor', amount: 99_000, status: 'Paid', date: '2026-05-03', agent: 'B' },
  ],
  expenses: [
    { id: 'e1', title: 'Venue', category: 'Venue', amount: 5_000, status: 'Paid', date: '2026-05-02', agent: 'A', budgetAllocationId: 'venue' },
    { id: 'e2', title: 'Deposit', category: 'Venue', amount: 2_000, status: 'Pending', date: '2026-05-03', agent: 'A', budgetAllocationId: 'venue' },
  ],
  ticketSales: [
    { id: 's1', tierId: 'regular', tierName: 'Regular', quantity: 2, unitPrice: 8_000, total: 16_000, date: '2026-05-02', agent: 'A', status: 'Paid' },
    { id: 's2', tierId: 'regular', tierName: 'Regular', quantity: 4, unitPrice: 8_000, total: 32_000, date: '2026-05-04', agent: 'A', status: 'Paid' },
  ],
  tiers: [{ id: 'regular', name: 'Regular', price: 8_000, capacity: 100, sold: 6, active: true }],
  allocations: [{ id: 'venue', category: 'Venue', amount: 30_000, percent: 30 }],
  totalBudget: 100_000,
};

test('validates real ISO calendar dates and inclusive range order', () => {
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(validateDateRange({ startDate: '2026-05-03', endDate: '2026-05-02' }), 'Start date must be on or before end date.');
  assert.equal(validateDateRange({ startDate: '2026-05-01', endDate: '2026-05-03' }), null);
});

test('filters records inclusively and supports either optional bound', () => {
  const records = [{ date: '2026-05-01' }, { date: '2026-05-02' }, { date: '2026-05-03' }];
  assert.deepEqual(filterByDate(records, { startDate: '2026-05-02', endDate: '2026-05-03' }), records.slice(1));
  assert.deepEqual(filterByDate(records, { startDate: '', endDate: '2026-05-01' }), records.slice(0, 1));
  assert.deepEqual(filterByDate(records, { startDate: '', endDate: '' }), records);
});

test('report totals, allocations and ticket counts all use the selected dates', () => {
  const report = buildReportView({ ...sample, startDate: '2026-05-02', endDate: '2026-05-03' });
  assert.equal(report.error, null);
  assert.equal(report.metrics.paidRevenue, 115_000);
  assert.equal(report.metrics.paidExpense, 5_000);
  assert.equal(report.metrics.pendingExpense, 2_000);
  assert.equal(report.allocations[0].paid, 5_000);
  assert.equal(report.ticketSummary[0].quantity, 2);
  assert.equal(report.ticketSummary[0].revenue, 16_000);
  assert.equal(report.revenues.length, 1);
});

test('reversed dates disable the report instead of showing misleading totals', () => {
  const report = buildReportView({ ...sample, startDate: '2026-05-04', endDate: '2026-05-01' });
  assert.match(report.error, /start date must be on or before end date/i);
  assert.equal(report.ticketSummary.length, 0);
  assert.throws(() => buildReportCsv(report), /start date must be on or before end date/i);
});

test('CSV contains filter metadata and exports only matching rows with injection protection', () => {
  const report = buildReportView({
    ...sample,
    revenues: [{ ...sample.revenues[0], title: '=HYPERLINK("https://bad.example","open"),\nnext line' }],
    startDate: '2026-05-01', endDate: '2026-05-02',
  });
  const csv = buildReportCsv(report, new Date('2026-05-05T12:00:00.000Z'));
  assert.match(csv, /"Start date","2026-05-01"/);
  assert.match(csv, /"End date","2026-05-02"/);
  assert.match(csv, /"Generated at","2026-05-05T12:00:00\.000Z"/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /"Later"/);
  assert.doesNotMatch(csv, /2026-05-04/);
});
