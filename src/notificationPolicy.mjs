const FINANCE_ROLES = new Set(['admin', 'executive', 'member']);
const ROLES = new Set(['admin', 'executive', 'member', 'guest']);
const FINANCE_ALERT_SOURCES = ['tickets', 'expenses', 'budget', 'allocations'];

/** Sources subscribed for the authenticated profile's current role. */
export function currentAlertSourcesForRole(role) {
  if (!ROLES.has(role)) return [];
  if (role === 'guest') return ['tickets'];
  return FINANCE_ROLES.has(role) ? [...FINANCE_ALERT_SOURCES] : [];
}

/**
 * Notification content is a view of current Firestore state, never evidence
 * that a payment, sale, approval, or other business action occurred.
 */
export function canViewNotificationCategory(role, category) {
  if (!ROLES.has(role)) return false;
  if (role === 'admin') return true;
  if (role === 'guest') return category === 'tickets';
  return category !== 'users' && category !== 'security';
}

/** Only server-backed snapshots with no local writes are presented as current. */
export function isAlertSnapshotFresh(metadata) {
  return metadata?.fromCache === false && metadata?.hasPendingWrites === false;
}

export function filterDismissedAlerts(alerts, dismissedIds) {
  const ids = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds ?? []);
  return alerts.filter(item => !ids.has(item.id));
}

function wholeNonNegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function alert(id, category, severity, title, description, destination) {
  return { id, category, severity, title, description, destination };
}

function budgetThresholdLevel(value, limit) {
  const utilization = value / limit;
  return utilization >= 1 ? 100 : utilization >= 0.9 ? 90 : utilization >= 0.75 ? 75 : 0;
}

function addExposureAlert(result, { id, label, limit, paid, committed, paidLevel, destination = { page: 'Budget' } }) {
  const exposure = paid + committed;
  if (!Number.isSafeInteger(exposure)) return;
  const level = budgetThresholdLevel(exposure, limit);
  if (level <= paidLevel) return;
  const over = exposure > limit;
  result.push(alert(
    id(level),
    'finance',
    level === 100 ? 'critical' : 'warning',
    level === 100
      ? `${label} exposure ${over ? 'exceeded' : 'fully used'}`
      : `${label} exposure approaching limit`,
    `${level}% exposure threshold; paid/deposit ₦${paid.toLocaleString('en-NG')} + pending/unpaid commitments ₦${committed.toLocaleString('en-NG')} = ₦${exposure.toLocaleString('en-NG')} of ₦${limit.toLocaleString('en-NG')}. Commitments are not confirmed payments.`,
    destination,
  ));
}

/**
 * Derive a compact set of active warnings from the latest authorized state.
 * This does not create durable events or claim that a threshold crossing was
 * observed while the app was closed.
 */
export function deriveCurrentAlerts({ role, budgetTotal, paidAndDepositSpend, committedSpend = 0, allocations = [], tiers = [] }) {
  if (!ROLES.has(role)) return [];

  const result = [];
  if (role !== 'guest' && wholeNonNegative(budgetTotal) && budgetTotal > 0
      && wholeNonNegative(paidAndDepositSpend)) {
    const level = budgetThresholdLevel(paidAndDepositSpend, budgetTotal);
    if (level) {
      const over = paidAndDepositSpend > budgetTotal;
      result.push(alert(
        `budget-utilization-${level}`,
        'finance',
        level === 100 ? 'critical' : 'warning',
        level === 100 ? (over ? 'Budget exceeded' : 'Budget fully used') : 'Budget approaching limit',
        `${level}% threshold reached; current recorded spend is ₦${paidAndDepositSpend.toLocaleString('en-NG')}.`,
        { page: 'Budget' },
      ));
    }
    if (wholeNonNegative(committedSpend)) {
      addExposureAlert(result, {
        id: level => `budget-exposure-${level}`,
        label: 'Budget',
        limit: budgetTotal,
        paid: paidAndDepositSpend,
        committed: committedSpend,
        paidLevel: level,
      });
    }
  }

  if (role !== 'guest') {
    for (const allocation of allocations) {
      if (typeof allocation?.id !== 'string' || typeof allocation?.category !== 'string'
          || !wholeNonNegative(allocation.amount) || allocation.amount === 0
          || !wholeNonNegative(allocation.paidAndDepositSpend)) continue;
      const level = budgetThresholdLevel(allocation.paidAndDepositSpend, allocation.amount);
      if (level) {
        const over = allocation.paidAndDepositSpend > allocation.amount;
        result.push(alert(
          `budget-allocation-${level}-${allocation.id}`,
          'finance',
          level === 100 ? 'critical' : 'warning',
          level === 100
            ? `${allocation.category} allocation ${over ? 'exceeded' : 'fully used'}`
            : `${allocation.category} allocation approaching limit`,
          `${level}% threshold reached; current recorded spend is ₦${allocation.paidAndDepositSpend.toLocaleString('en-NG')} of ₦${allocation.amount.toLocaleString('en-NG')}.`,
          { page: 'Budget', allocationId: allocation.id },
        ));
      }
      if (wholeNonNegative(allocation.committedSpend)) {
        addExposureAlert(result, {
          id: exposureLevel => `budget-allocation-exposure-${exposureLevel}-${allocation.id}`,
          label: `${allocation.category} allocation`,
          limit: allocation.amount,
          paid: allocation.paidAndDepositSpend,
          committed: allocation.committedSpend,
          paidLevel: level,
          destination: { page: 'Budget', allocationId: allocation.id },
        });
      }
    }
  }

  const validTiers = tiers.filter(tier => typeof tier?.id === 'string'
    && typeof tier?.name === 'string'
    && wholeNonNegative(tier.capacity)
    && wholeNonNegative(tier.sold)
    && tier.capacity > 0
    && tier.sold <= tier.capacity);

  for (const tier of validTiers) {
    if (tier.active === false) continue;
    const remaining = tier.capacity - tier.sold;
    const ratio = tier.sold / tier.capacity;
    if (remaining === 0) {
      result.push(alert(
        `ticket-tier-sold-out-${tier.id}`,
        'tickets',
        'critical',
        `${tier.name} sold out`,
        `The current ticket inventory shows ${tier.sold} of ${tier.capacity} sold.`,
        { page: 'Tickets', tierId: tier.id },
      ));
    } else if (remaining / tier.capacity <= 0.1) {
      result.push(alert(
        `ticket-tier-low-${tier.id}`,
        'tickets',
        'warning',
        `${tier.name} inventory is low`,
        `${remaining} of ${tier.capacity} tickets remain in the current inventory.`,
        { page: 'Tickets', tierId: tier.id },
      ));
    } else {
      const milestone = [90, 75, 50, 25].find(value => ratio >= value / 100);
      if (milestone) {
        result.push(alert(
          `ticket-tier-progress-${milestone}-${tier.id}`,
          'tickets',
          'info',
          `${tier.name} is ${milestone}% sold`,
          `The current ticket inventory shows ${tier.sold} of ${tier.capacity} sold.`,
          { page: 'Tickets', tierId: tier.id },
        ));
      }
    }
  }

  const capacity = validTiers.reduce((sum, tier) => sum + tier.capacity, 0);
  const sold = validTiers.reduce((sum, tier) => sum + tier.sold, 0);
  if (validTiers.length === tiers.length && capacity > 0 && sold <= capacity) {
    const ratio = sold / capacity;
    if (ratio >= 1) {
      result.push(alert(
        'event-capacity-reached', 'tickets', 'critical', 'Event ticket capacity reached',
        `The current inventory shows ${sold} of ${capacity} tickets sold.`, { page: 'Tickets' },
      ));
    } else if (ratio >= 0.9) {
      result.push(alert(
        'event-capacity-approaching', 'tickets', 'warning', 'Event ticket capacity approaching',
        `The current inventory shows ${sold} of ${capacity} tickets sold.`, { page: 'Tickets' },
      ));
    }
  }

  return result.filter(item => canViewNotificationCategory(role, item.category));
}
