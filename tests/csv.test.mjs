import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/csv.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const csvModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { serializeCsvCell } = csvModule;

test('prefixes spreadsheet formula markers in text cells', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)']) {
    assert.equal(serializeCsvCell(value), `"'${value}"`);
  }
});

test('prefixes formula markers after whitespace and leading control characters', () => {
  for (const value of ['  =1+1', '\uFEFF=1+1', '\t=1+1', '\r=1+1', '\n=1+1']) {
    assert.equal(serializeCsvCell(value), `"'${value}"`);
  }
});

test('keeps numeric cells numeric, including negative values', () => {
  assert.equal(serializeCsvCell(-125), '"-125"');
  assert.equal(serializeCsvCell(5000), '"5000"');
});

test('preserves normal text and CSV quote escaping', () => {
  assert.equal(serializeCsvCell('Venue, stage "A"'), '"Venue, stage ""A"""');
  assert.equal(serializeCsvCell('Stage one\nStage two'), '"Stage one\nStage two"');
  assert.equal(serializeCsvCell('Ordinary text'), '"Ordinary text"');
});
