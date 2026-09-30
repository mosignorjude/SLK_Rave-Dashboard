import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewNotificationCategory, currentAlertSourcesForRole, deriveCurrentAlerts, filterDismissedAlerts, isAlertSnapshotFresh } from '../src/notificationPolicy.mjs';

test('filters alerts dismissed by the current user only', () => {
  const alerts = [{ id: 'budget-75' }, { id: 'tickets-low' }];
  assert.deepEqual(filterDismissedAlerts(alerts, new Set(['budget-75'])), [{ id: 'tickets-low' }]);
  assert.deepEqual(filterDismissedAlerts(alerts, ['tickets-low']), [{ id: 'budget-75' }]);
  assert.deepEqual(filterDismissedAlerts(alerts, []), alerts);
});

test('alert freshness requires server data with no pending local writes', () => {
  assert.equal(isAlertSnapshotFresh({ fromCache: false, hasPendingWrites: false }), true);
  assert.equal(isAlertSnapshotFresh({ fromCache: true, hasPendingWrites: false }), false);
  assert.equal(isAlertSnapshotFresh({ fromCache: false, hasPendingWrites: true }), false);
  assert.equal(isAlertSnapshotFresh({}), false);
  assert.equal(isAlertSnapshotFresh(null), false);
});

test('notification categories follow the current role policy', () => {
  for (const category of ['finance', 'tickets', 'users', 'security', 'administration', 'system']) {
    assert.equal(canViewNotificationCategory('admin', category), true, category);
  }
  for (const role of ['executive', 'member']) {
    assert.equal(canViewNotificationCategory(role, 'finance'), true, role);
    assert.equal(canViewNotificationCategory(role, 'tickets'), true, role);
    assert.equal(canViewNotificationCategory(role, 'users'), false, role);
    assert.equal(canViewNotificationCategory(role, 'security'), false, role);
  }
  assert.equal(canViewNotificationCategory('guest', 'tickets'), true);
  for (const category of ['finance', 'users', 'security', 'administration', 'system']) {
    assert.equal(canViewNotificationCategory('guest', category), false, category);
  }
  assert.equal(canViewNotificationCategory(null, 'tickets'), false);
});

test('active role changes replace alert sources and immediately recalculate visible alerts', () => {
  const currentData = {
    budgetTotal: 100_000,
    paidAndDepositSpend: 90_000,
    committedSpend: 10_000,
    tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold: 95 }],
  };

  let profileRole = 'member';
  const memberSources = currentAlertSourcesForRole(profileRole);
  const memberAlerts = deriveCurrentAlerts({ ...currentData, role: profileRole });
  assert.ok(memberAlerts.some(alert => alert.category === 'finance'));
  assert.ok(memberSources.includes('expenses'));
  const restrictedAlertIds = new Set(memberAlerts.filter(alert => alert.category === 'finance').map(alert => alert.id));

  profileRole = 'guest';
  const guestSources = currentAlertSourcesForRole(profileRole);
  const guestAlerts = deriveCurrentAlerts({ ...currentData, role: profileRole });
  assert.deepEqual(guestSources, ['tickets']);
  assert.ok(guestAlerts.length > 0);
  assert.ok(guestAlerts.every(alert => alert.category === 'tickets'));
  assert.ok(guestAlerts.every(alert => !restrictedAlertIds.has(alert.id)));

  profileRole = 'member';
  const restoredSources = currentAlertSourcesForRole(profileRole);
  const restoredAlerts = deriveCurrentAlerts({ ...currentData, role: profileRole });
  assert.deepEqual(restoredSources, memberSources);
  assert.ok(restoredAlerts.some(alert => alert.category === 'finance'));
  assert.deepEqual(currentAlertSourcesForRole(null), []);
});

test('budget warnings reflect existing paid and deposit utilization thresholds', () => {
  const at75 = deriveCurrentAlerts({ role: 'executive', budgetTotal: 100_000, paidAndDepositSpend: 75_000 });
  assert.equal(at75.length, 1);
  assert.equal(at75[0].id, 'budget-utilization-75');
  assert.equal(at75[0].severity, 'warning');

  const at90 = deriveCurrentAlerts({ role: 'admin', budgetTotal: 100_000, paidAndDepositSpend: 90_000 });
  assert.equal(at90[0].id, 'budget-utilization-90');
  const at100 = deriveCurrentAlerts({ role: 'member', budgetTotal: 100_000, paidAndDepositSpend: 100_000 });
  assert.equal(at100[0].title, 'Budget fully used');
  assert.equal(at100[0].severity, 'critical');
  const over = deriveCurrentAlerts({ role: 'admin', budgetTotal: 100_000, paidAndDepositSpend: 101_000 });
  assert.equal(over[0].title, 'Budget exceeded');
  assert.match(over[0].description, /₦101,000/);
});

test('budget thresholds change at the exact 75%, 90%, and 100% boundaries', () => {
  const cases = [
    [74_999, null],
    [75_000, 'budget-utilization-75'],
    [89_999, 'budget-utilization-75'],
    [90_000, 'budget-utilization-90'],
    [99_999, 'budget-utilization-90'],
    [100_000, 'budget-utilization-100'],
  ];

  for (const [spend, expectedId] of cases) {
    const alerts = deriveCurrentAlerts({
      role: 'admin', budgetTotal: 100_000, paidAndDepositSpend: spend,
    });
    assert.equal(alerts[0]?.id ?? null, expectedId, `spend ₦${spend}`);
    assert.equal(alerts.length, expectedId ? 1 : 0, `spend ₦${spend}`);
  }
});

test('allocation spend uses the same exact budget threshold boundaries', () => {
  const cases = [
    [74_999, null],
    [75_000, 'budget-allocation-75-venue'],
    [89_999, 'budget-allocation-75-venue'],
    [90_000, 'budget-allocation-90-venue'],
    [99_999, 'budget-allocation-90-venue'],
    [100_000, 'budget-allocation-100-venue'],
  ];

  for (const [spend, expectedId] of cases) {
    const alerts = deriveCurrentAlerts({
      role: 'admin',
      allocations: [{ id: 'venue', category: 'Venue', amount: 100_000, paidAndDepositSpend: spend }],
    });
    assert.equal(alerts[0]?.id ?? null, expectedId, `allocation spend ₦${spend}`);
    assert.equal(alerts.length, expectedId ? 1 : 0, `allocation spend ₦${spend}`);
  }
});

test('budget exposure alerts include commitments and avoid repeating the paid-spend threshold', () => {
  const at75 = deriveCurrentAlerts({
    role: 'admin', budgetTotal: 100_000, paidAndDepositSpend: 60_000, committedSpend: 15_000,
  });
  assert.deepEqual(at75.map(item => item.id), ['budget-exposure-75']);
  assert.match(at75[0].description, /paid\/deposit ₦60,000 \+ pending\/unpaid commitments ₦15,000 = ₦75,000/);
  assert.match(at75[0].description, /Commitments are not confirmed payments/);

  const at90 = deriveCurrentAlerts({
    role: 'executive', budgetTotal: 100_000, paidAndDepositSpend: 80_000, committedSpend: 10_000,
  });
  assert.deepEqual(at90.map(item => item.id), ['budget-utilization-75', 'budget-exposure-90']);

  const at100 = deriveCurrentAlerts({
    role: 'member', budgetTotal: 100_000, paidAndDepositSpend: 90_000, committedSpend: 10_000,
  });
  assert.deepEqual(at100.map(item => item.id), ['budget-utilization-90', 'budget-exposure-100']);
  assert.match(at100[1].title, /fully used/);

  const noDuplicate = deriveCurrentAlerts({
    role: 'admin', budgetTotal: 100_000, paidAndDepositSpend: 90_000, committedSpend: 0,
  });
  assert.deepEqual(noDuplicate.map(item => item.id), ['budget-utilization-90']);
});

test('allocation exposure alerts use per-category commitments and validate integer totals', () => {
  const alerts = deriveCurrentAlerts({
    role: 'admin',
    allocations: [
      { id: 'venue', category: 'Venue', amount: 100_000, paidAndDepositSpend: 60_000, committedSpend: 30_000 },
      { id: 'ops', category: 'Operations', amount: 100_000, paidAndDepositSpend: 75_000, committedSpend: 0 },
      { id: 'bad', category: 'Invalid', amount: 100_000, paidAndDepositSpend: 10, committedSpend: 20.5 },
    ],
  });
  assert.deepEqual(alerts.map(item => item.id), ['budget-allocation-exposure-90-venue', 'budget-allocation-75-ops']);
  assert.match(alerts[0].description, /paid\/deposit ₦60,000 \+ pending\/unpaid commitments ₦30,000 = ₦90,000/);
  assert.equal(alerts.some(item => item.id.includes('bad')), false);

  assert.deepEqual(deriveCurrentAlerts({
    role: 'admin', budgetTotal: 100, paidAndDepositSpend: 50, committedSpend: Number.MAX_SAFE_INTEGER,
  }), []);
});

test('allocation alerts reflect the existing category spend mapping and show one current level per allocation', () => {
  const alerts = deriveCurrentAlerts({
    role: 'executive',
    allocations: [
      { id: 'venue', category: 'Venue & Production', amount: 100_000, paidAndDepositSpend: 75_000 },
      { id: 'talent', category: 'Talent & Booking', amount: 100_000, paidAndDepositSpend: 90_000 },
      { id: 'ops', category: 'Operations & Safety', amount: 100_000, paidAndDepositSpend: 110_000 },
      { id: 'marketing', category: 'Marketing & Promo', amount: 100_000, paidAndDepositSpend: 74_999 },
    ],
  });
  assert.deepEqual(alerts.map(item => item.id), [
    'budget-allocation-75-venue',
    'budget-allocation-90-talent',
    'budget-allocation-100-ops',
  ]);
  assert.match(alerts[2].title, /exceeded/);
  assert.match(alerts[2].description, /₦110,000 of ₦100,000/);
  assert.equal(alerts[0].destination.allocationId, 'venue');
});

test('allocation alerts validate whole-Naira inputs and remain hidden from Guests', () => {
  const allocation = { id: 'venue', category: 'Venue', amount: 100, paidAndDepositSpend: 100 };
  assert.deepEqual(deriveCurrentAlerts({ role: 'guest', allocations: [allocation] }), []);
  assert.deepEqual(deriveCurrentAlerts({
    role: 'admin', allocations: [{ ...allocation, paidAndDepositSpend: 75.5 }],
  }), []);
  assert.deepEqual(deriveCurrentAlerts({
    role: 'admin', allocations: [{ ...allocation, amount: 0 }],
  }), []);
});

test('guests do not receive financial alerts', () => {
  const alerts = deriveCurrentAlerts({
    role: 'guest', budgetTotal: 10, paidAndDepositSpend: 10,
    committedSpend: 5,
    allocations: [{ id: 'venue', category: 'Venue', amount: 10, paidAndDepositSpend: 0, committedSpend: 10 }],
    tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold: 95 }],
  });
  assert.deepEqual(alerts.map(item => item.category), ['tickets', 'tickets']);
});

test('ticket warnings use current inventory and avoid low-stock/milestone duplicates', () => {
  const alerts = deriveCurrentAlerts({
    role: 'member',
    tiers: [
      { id: 'early', name: 'Early Bird', capacity: 100, sold: 25 },
      { id: 'regular', name: 'Regular', capacity: 100, sold: 90 },
      { id: 'vip', name: 'VIP', capacity: 10, sold: 10 },
    ],
  });
  assert.deepEqual(alerts.map(item => item.id), [
    'ticket-tier-progress-25-early',
    'ticket-tier-low-regular',
    'ticket-tier-sold-out-vip',
  ]);
  assert.equal(alerts[0].destination.tierId, 'early');
});

test('ticket tier milestones and low-inventory warning use their exact boundaries', () => {
  const cases = [
    [24, null],
    [25, 'ticket-tier-progress-25-regular'],
    [49, 'ticket-tier-progress-25-regular'],
    [50, 'ticket-tier-progress-50-regular'],
    [74, 'ticket-tier-progress-50-regular'],
    [75, 'ticket-tier-progress-75-regular'],
    [89, 'ticket-tier-progress-75-regular'],
    [90, 'ticket-tier-low-regular'],
    [99, 'ticket-tier-low-regular'],
    [100, 'ticket-tier-sold-out-regular'],
  ];

  for (const [sold, expectedId] of cases) {
    const alerts = deriveCurrentAlerts({
      role: 'member', tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold }],
    });
    const tierAlert = alerts.find(item => item.destination.tierId === 'regular');
    assert.equal(tierAlert?.id ?? null, expectedId, `sold ${sold} of 100`);
    assert.equal(alerts.filter(item => item.destination.tierId === 'regular').length, expectedId ? 1 : 0,
      `sold ${sold} of 100`);
  }
});

test('event capacity warning reflects the complete valid inventory', () => {
  const alerts = deriveCurrentAlerts({
    role: 'guest',
    tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold: 90 }],
  });
  assert.ok(alerts.some(item => item.id === 'event-capacity-approaching'));
});

test('event capacity alert changes from approaching to reached at the exact boundary', () => {
  const cases = [
    [89, null],
    [90, 'event-capacity-approaching'],
    [99, 'event-capacity-approaching'],
    [100, 'event-capacity-reached'],
  ];

  for (const [sold, expectedId] of cases) {
    const alerts = deriveCurrentAlerts({
      role: 'guest', tiers: [{ id: 'regular', name: 'Regular', capacity: 100, sold }],
    });
    assert.equal(alerts.find(item => item.id.startsWith('event-capacity-'))?.id ?? null,
      expectedId, `event inventory sold ${sold} of 100`);
  }
});

test('inactive tiers do not create tier alerts but remain in event capacity totals', () => {
  const alerts = deriveCurrentAlerts({
    role: 'guest',
    tiers: [
      { id: 'inactive', name: 'Inactive tier', capacity: 100, sold: 80, active: false },
      { id: 'regular', name: 'Regular', capacity: 100, sold: 100, active: true },
    ],
  });

  assert.equal(alerts.some(item => item.destination.tierId === 'inactive'), false);
  assert.equal(alerts.some(item => item.id === 'ticket-tier-sold-out-regular'), true);
  assert.equal(alerts.some(item => item.id === 'event-capacity-approaching'), true);
  assert.equal(alerts.some(item => item.id === 'event-capacity-reached'), false);
});

test('current alerts do not make claims about payment or transaction proof', () => {
  const alerts = deriveCurrentAlerts({
    role: 'admin',
    tiers: [{ id: 'regular', name: 'Regular', capacity: 10, sold: 10 }],
  });
  assert.equal(alerts.some(item => /payment|received|sale recorded/i.test(`${item.title} ${item.description}`)), false);
  assert.ok(alerts.every(item => item.destination.page === 'Tickets'));
});

test('invalid, fractional, or inconsistent source values do not produce misleading alerts', () => {
  assert.deepEqual(deriveCurrentAlerts({ role: 'admin', budgetTotal: 100, paidAndDepositSpend: 75.5 }), []);
  assert.deepEqual(deriveCurrentAlerts({ role: 'admin', budgetTotal: 0, paidAndDepositSpend: 75 }), []);
  assert.deepEqual(deriveCurrentAlerts({
    role: 'admin', tiers: [{ id: 'invalid', name: 'Invalid', capacity: 5, sold: 6 }],
  }), []);
});
