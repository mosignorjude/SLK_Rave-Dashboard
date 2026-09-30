import assert from 'node:assert/strict';
import test from 'node:test';
import { ALERT_TARGET_MISSING_MESSAGE, resolveAlertTargetElement } from '../src/alertTarget.mjs';

for (const [page, recordId, expectedDomId] of [
  ['Tickets', 'tier-123', 'ticket-tier-row-tier-123'],
  ['Budget', 'allocation-456', 'budget-allocation-row-allocation-456'],
]) {
  test(`${page} alert with a missing row clears the target and uses a generic fallback`, () => {
    let lookedUpId;
    let missingCallbackCount = 0;
    let target = { page, id: recordId };
    let message = '';

    const row = resolveAlertTargetElement(
      page,
      recordId,
      id => { lookedUpId = id; return null; },
      () => {
        target = null;
        message = ALERT_TARGET_MISSING_MESSAGE;
        missingCallbackCount += 1;
      },
    );

    assert.equal(lookedUpId, expectedDomId);
    assert.equal(row, null);
    assert.equal(target, null);
    assert.equal(missingCallbackCount, 1);
    assert.equal(message, "This alert's target is no longer available.");
    assert.equal(message.includes(recordId), false, 'fallback does not expose the record identifier');
  });

  test(`${page} alert with an existing row returns it without invoking the missing callback`, () => {
    const expectedRow = { id: expectedDomId };
    let missingCallbackCount = 0;

    const row = resolveAlertTargetElement(
      page,
      recordId,
      id => id === expectedDomId ? expectedRow : null,
      () => { missingCallbackCount += 1; },
    );

    assert.equal(row, expectedRow);
    assert.equal(missingCallbackCount, 0);
  });
}

test('an absent target identifier does not query the document or report a stale target', () => {
  let lookupCount = 0;
  let missingCallbackCount = 0;

  const row = resolveAlertTargetElement('Tickets', undefined, () => {
    lookupCount += 1;
    return null;
  }, () => { missingCallbackCount += 1; });

  assert.equal(row, null);
  assert.equal(lookupCount, 0);
  assert.equal(missingCallbackCount, 0);
});
