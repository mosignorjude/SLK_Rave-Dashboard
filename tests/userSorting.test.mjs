import assert from 'node:assert/strict';
import test from 'node:test';
import { sortUsersByRegistrationDate } from '../src/userSorting.mjs';

test('sorts user profiles newest registration first without mutating input', () => {
  const users = [
    { uid: 'older', createdAt: { seconds: 100 } },
    { uid: 'newest', createdAt: new Date(300000) },
    { uid: 'middle', createdAt: '1970-01-01T00:03:20.000Z' },
  ];
  const sorted = sortUsersByRegistrationDate(users);
  assert.deepEqual(sorted.map(user => user.uid), ['newest', 'middle', 'older']);
  assert.deepEqual(users.map(user => user.uid), ['older', 'newest', 'middle']);
});

test('keeps users without registration dates last and applies a stable UID tie-breaker', () => {
  const sorted = sortUsersByRegistrationDate([
    { uid: 'undated-z' },
    { uid: 'same-b', createdAt: { seconds: 100 } },
    { uid: 'undated-a', createdAt: 'invalid' },
    { uid: 'same-a', createdAt: { seconds: 100 } },
  ]);
  assert.deepEqual(sorted.map(user => user.uid), ['same-a', 'same-b', 'undated-a', 'undated-z']);
});
