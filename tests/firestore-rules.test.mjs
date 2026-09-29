import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { recordTicketSale } from '../src/ticketSales.mjs';
import { recordExpense } from '../src/financialWrites.mjs';

const projectId = 'demo-slk-rave-rules';
const profiles = {
  admin: { uid: 'admin', fullName: 'Event Admin', email: 'admin@example.test', role: 'admin', status: 'approved' },
  executive: { uid: 'executive', fullName: 'Executive Agent', email: 'executive@example.test', role: 'executive', status: 'approved' },
  member: { uid: 'member', fullName: 'Member Agent', email: 'member@example.test', role: 'member', status: 'approved' },
  guest: { uid: 'guest', fullName: 'Guest User', email: 'guest@example.test', role: 'guest', status: 'approved' },
  pending: { uid: 'pending', fullName: 'Pending User', email: 'pending@example.test', role: null, status: 'pending' },
  rejected: { uid: 'rejected', fullName: 'Rejected User', email: 'rejected@example.test', role: 'member', status: 'rejected' },
  suspended: { uid: 'suspended', fullName: 'Suspended Admin', email: 'suspended@example.test', role: 'admin', status: 'suspended' },
  master: { uid: 'master', fullName: 'Master Admin', email: 'master@example.test', role: 'admin', status: 'approved', isMasterAdmin: true },
};

let testEnv;

function client(uid, profile = profiles[uid]) {
  return testEnv.authenticatedContext(uid, {
    email: profile.email,
    email_verified: true,
  }).firestore();
}

function anonymous() {
  return testEnv.unauthenticatedContext().firestore();
}

function validExpense(uid = 'executive') {
  return {
    title: 'Stage lighting deposit',
    category: 'Venue & Production',
    amount: 15000,
    status: 'Paid',
    date: '2026-09-27',
    method: 'Bank transfer',
    agent: profiles[uid].fullName,
    createdBy: uid,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
}

function auditEntry(uid, action, targetType, targetId) {
  const reasonRequired = ['expense.deleted','revenue.deleted','user.approve','user.role','user.suspend','user.reactivate'].includes(action)
    || action === 'expense.updated' || action === 'revenue.updated';
  return {
    actor: profiles[uid].fullName, actorId: uid, action, label: action,
    targetType, targetId, createdAt: serverTimestamp(),
    ...(reasonRequired ? { reason: 'Approved test reason' } : {}),
  };
}

async function writeAudited(uid, collectionName, id, data, action, operation = 'set', auditId = `audit-${id}`, auditDetails = {}) {
  const db = client(uid);
  const batch = writeBatch(db);
  const target = doc(db, collectionName, id);
  const payload = { ...data, auditLogId: auditId };
  if (operation === 'update') batch.update(target, payload);
  else if (operation === 'delete') batch.delete(target);
  else batch.set(target, payload);
  batch.set(doc(db, 'activityLogs', auditId), { ...auditEntry(uid, action, collectionName, id), ...auditDetails });
  await batch.commit();
}

async function writeConfiguration(uid, writes) {
  const db = client(uid);
  const auditId = `configuration-${Math.random().toString(36).slice(2)}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'settings', 'workspace'), { auditLogId: auditId, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'activityLogs', auditId), auditEntry(uid, 'configuration.updated', 'settings', 'workspace'));
  writes(batch, db);
  await batch.commit();
}

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 18080, rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, profile] of Object.entries(profiles)) {
      await setDoc(doc(db, 'users', uid), profile);
      await setDoc(doc(db, 'usersPublic', uid), profile);
    }
    await setDoc(doc(db, 'ticketTiers', 'regular'), {
      name: 'Regular', price: 8000, capacity: 2, sold: 0, active: true,
    });
    await setDoc(doc(db, 'ticketSales', 'existing-sale'), {
      tierId: 'regular', tierName: 'Regular', quantity: 1, unitPrice: 8000, total: 8000, status: 'Paid',
      date: '2026-09-27', agent: profiles.member.fullName, agentId: 'member', createdBy: 'member', createdAt: Timestamp.now(), auditLogId: 'old-sale-audit',
    });
    await setDoc(doc(db, 'budgetAllocations', 'expense-venue'), { category: 'Venue & Production' });
    await setDoc(doc(db, 'budgetAllocations', 'expense-marketing'), { category: 'Marketing & Promo' });
    await setDoc(doc(db, 'revenues', 'sample'), {
      title: 'Sponsor payment', category: 'Sponsorships', amount: 50000,
      status: 'Paid', date: '2026-09-27', method: 'Bank transfer',
      agent: profiles.executive.fullName, createdBy: 'executive',
      updatedBy: 'executive', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'expenses', 'existing'), {
      ...validExpense('executive'), updatedAt: Timestamp.now(), createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'activityLogs', 'seed-existing'), {
      actor: profiles.executive.fullName, actorId: 'executive',
      action: 'expense.created', label: 'Recorded expense', targetType: 'expenses', createdAt: Timestamp.now(),
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('Guests, Members, Executives, and Admins share finance reads and full ticket-sale lists', async () => {
  for (const uid of ['admin', 'executive', 'member', 'guest']) {
    await assertSucceeds(getDoc(doc(client(uid), 'expenses', 'existing')));
    const sales = await assertSucceeds(getDocs(collection(client(uid), 'ticketSales')));
    assert.equal(sales.size, 1);
  }
  for (const uid of ['pending', 'rejected', 'suspended']) {
    await assertFails(getDoc(doc(client(uid), 'expenses', 'existing')));
    await assertFails(getDocs(collection(client(uid), 'ticketSales')));
  }
});

test('Members can read finance data but cannot write outside ticket sales', async () => {
  const db = client('member');
  await assertSucceeds(getDoc(doc(db, 'revenues', 'sample')));
  await assertSucceeds(getDoc(doc(db, 'budgetAllocations', 'expense-venue')));
  await assertFails(setDoc(doc(db, 'revenues', 'member-revenue'), { createdBy: 'member' }));
  await assertFails(setDoc(doc(db, 'expenses', 'member-expense'), { createdBy: 'member' }));
  await assertFails(updateDoc(doc(db, 'expenses', 'existing'), { title: 'Changed by member' }));
  await assertFails(updateDoc(doc(db, 'ticketTiers', 'regular'), { price: 1 }));
  await assertFails(setDoc(doc(db, 'budgets', 'event-2026'), { totalAmount: 1 }));
});

test('Guests can read authorized finance collections but cannot write financial or ticket data', async () => {
  const db = client('guest');
  for (const [collectionName, id] of [
    ['ticketTiers', 'regular'], ['ticketSales', 'existing-sale'], ['revenues', 'sample'], ['expenses', 'existing'],
  ]) {
    await assertSucceeds(getDoc(doc(db, collectionName, id)));
  }
  for (const collectionName of ['revenueCategories', 'expenseCategories', 'budgetAllocations', 'budgets']) {
    await assertSucceeds(getDocs(collection(db, collectionName)));
  }
  await assertFails(getDoc(doc(db, 'usersPublic', 'member')));
  await assertFails(getDoc(doc(db, 'activityLogs', 'seed-existing')));
  await assertFails(getDoc(doc(db, 'settings', 'workspace')));

  await assertFails(setDoc(doc(db, 'revenues', 'guest-revenue'), { createdBy: 'guest' }));
  await assertFails(setDoc(doc(db, 'expenses', 'guest-expense'), { createdBy: 'guest' }));
  await assertFails(updateDoc(doc(db, 'expenses', 'existing'), { title: 'Guest edit' }));
  await assertFails(deleteDoc(doc(db, 'expenses', 'existing')));
  await assertFails(updateDoc(doc(db, 'revenues', 'sample'), { title: 'Guest edit' }));
  await assertFails(deleteDoc(doc(db, 'revenues', 'sample')));
  await assertFails(updateDoc(doc(db, 'ticketSales', 'existing-sale'), { quantity: 2 }));
  await assertFails(deleteDoc(doc(db, 'ticketSales', 'existing-sale')));
  await assertFails(updateDoc(doc(db, 'ticketTiers', 'regular'), { capacity: 3 }));
  await assertFails(deleteDoc(doc(db, 'ticketTiers', 'regular')));
  await assertFails(setDoc(doc(db, 'budgets', 'event-2026'), { name: 'Guest budget' }));
  await assertFails(updateDoc(doc(db, 'budgetAllocations', 'expense-venue'), { amount: 1 }));
  await assertFails(deleteDoc(doc(db, 'budgetAllocations', 'expense-venue')));
  await assertFails(recordTicketSale(db, {
    saleId: 'guest-sale', auditId: 'guest-sale-audit', tierId: 'regular', quantity: 1,
    date: '2026-09-27', quotedUnitPrice: 8000,
  }, profiles.guest.fullName, 'guest'));
});

test('Admins can assign Guest roles; users cannot change their own or another role', async () => {
  const adminDb = client('admin');
  const roleChange = writeBatch(adminDb);
  roleChange.update(doc(adminDb, 'users', 'member'), { role: 'guest', auditLogId: 'guest-role-change', updatedAt: serverTimestamp() });
  roleChange.update(doc(adminDb, 'usersPublic', 'member'), { role: 'guest', auditLogId: 'guest-role-change', updatedAt: serverTimestamp() });
  roleChange.set(doc(adminDb, 'activityLogs', 'guest-role-change'), auditEntry('admin', 'user.role', 'users', 'member'));
  await assertSucceeds(roleChange.commit());

  const approval = writeBatch(adminDb);
  approval.update(doc(adminDb, 'users', 'pending'), { role: 'guest', status: 'approved', auditLogId: 'guest-role-approve', updatedAt: serverTimestamp() });
  approval.update(doc(adminDb, 'usersPublic', 'pending'), { role: 'guest', status: 'approved', auditLogId: 'guest-role-approve', updatedAt: serverTimestamp() });
  approval.set(doc(adminDb, 'activityLogs', 'guest-role-approve'), auditEntry('admin', 'user.approve', 'users', 'pending'));
  await assertSucceeds(approval.commit());

  for (const [uid, targetUid] of [['guest', 'guest'], ['member', 'executive']]) {
    const db = client(uid);
    const batch = writeBatch(db);
    const auditId = `unauthorized-role-${uid}`;
    batch.update(doc(db, 'users', targetUid), { role: 'admin', auditLogId: auditId, updatedAt: serverTimestamp() });
    batch.update(doc(db, 'usersPublic', targetUid), { role: 'admin', auditLogId: auditId, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'activityLogs', auditId), auditEntry(uid, 'user.role', 'users', targetUid));
    await assertFails(batch.commit());
  }
});

test('unauthenticated visitors cannot read or write Firestore', async () => {
  const visitor = anonymous();
  for (const [collectionName, id] of [['ticketTiers', 'regular'], ['ticketSales', 'existing-sale'], ['revenues', 'sample'], ['expenses', 'existing'], ['budgets', 'event-2026'], ['users', 'member'], ['usersPublic', 'member'], ['settings', 'workspace'], ['activityLogs', 'seed-existing']]) {
    await assertFails(getDoc(doc(visitor, collectionName, id)));
  }
  await assertFails(getDocs(collection(visitor, 'ticketSales')));
  await assertFails(setDoc(doc(visitor, 'ticketSales', 'anonymous-sale'), { tierId: 'regular' }));
  await assertFails(setDoc(doc(visitor, 'expenses', 'anonymous-expense'), { amount: 1 }));
});

test('role and account-status reads protect private profiles while finance roles retain authorized reads', async () => {
  for (const role of ['admin', 'executive', 'member', 'guest']) {
    await assertSucceeds(getDoc(doc(client(role), 'ticketTiers', 'regular')));
    await assertSucceeds(getDoc(doc(client(role), 'expenses', 'existing')));
  }
  for (const uid of ['pending', 'rejected', 'suspended']) {
    await assertFails(getDoc(doc(client(uid), 'ticketTiers', 'regular')));
    await assertFails(getDoc(doc(client(uid), 'expenses', 'existing')));
  }
  await assertSucceeds(getDoc(doc(client('admin'), 'usersPublic', 'member')));
  for (const uid of ['executive', 'member', 'pending']) {
    await assertFails(getDoc(doc(client(uid), 'usersPublic', 'member')));
  }
});

test('a user cannot grant themselves admin access', async () => {
  await assertFails(updateDoc(doc(client('member'), 'users', 'member'), { role: 'admin' }));
});

test('a member can sell a ticket only with the matching atomic tier increment', async () => {
  const db = client('member');
  const tierRef = doc(db, 'ticketTiers', 'regular');
  const saleRef = doc(collection(db, 'ticketSales'));
  const auditRef = doc(collection(db, 'activityLogs'));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const tier = await transaction.get(tierRef);
    transaction.update(tierRef, {
      sold: tier.data().sold + 1,
      lastSaleId: saleRef.id,
      auditLogId: auditRef.id,
      updatedAt: serverTimestamp(),
    });
    transaction.set(saleRef, {
      tierId: 'regular', tierName: 'Regular', quantity: 1,
      unitPrice: 8000, total: 8000, status: 'Paid', date: '2026-09-27',
      agent: profiles.member.fullName, agentId: 'member', createdBy: 'member',
      auditLogId: auditRef.id,
      createdAt: serverTimestamp(),
    });
    transaction.set(auditRef, {
      actor: profiles.member.fullName, actorId: 'member', action: 'ticket.sale', label: 'ticket.sale',
      targetType: 'ticketSales', targetId: saleRef.id, createdAt: serverTimestamp(),
    });
  }));
});

test('ticket sale retries reuse the original sale and audit IDs without incrementing inventory twice', async () => {
  const attempt = { saleId: 'retry-sale', auditId: 'retry-audit', tierId: 'regular', quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000 };
  const db = client('member');
  assert.equal(await recordTicketSale(db, attempt, profiles.member.fullName, 'member'), 'recorded');
  assert.equal(await recordTicketSale(db, attempt, profiles.member.fullName, 'member'), 'already-recorded');

  const adminDb = client('admin');
  const [tier, sale, audit] = await Promise.all([
    getDoc(doc(adminDb, 'ticketTiers', 'regular')),
    getDoc(doc(adminDb, 'ticketSales', attempt.saleId)),
    getDoc(doc(adminDb, 'activityLogs', attempt.auditId)),
  ]);
  assert.equal(tier.data().sold, 1);
  assert.equal(sale.data().auditLogId, attempt.auditId);
  assert.equal(audit.data().targetId, attempt.saleId);
  await assertSucceeds(getDoc(doc(db, 'ticketSales', attempt.saleId)));
  await assertSucceeds(getDoc(doc(db, 'ticketSales', 'not-yet-created')));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ticketSales', 'another-agents-sale'), { agentId: 'executive' });
  });
  await assertSucceeds(getDoc(doc(db, 'ticketSales', 'another-agents-sale')));
  await assertFails(getDoc(doc(db, 'activityLogs', attempt.auditId)));
});

test('concurrent ticket sales cannot oversell the final ticket', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ticketTiers', 'regular'), {
      name: 'Regular', price: 8000, capacity: 1, sold: 0, active: true,
    });
  });
  const attempts = [
    { uid: 'member', name: profiles.member.fullName, saleId: 'last-ticket-a', auditId: 'last-ticket-audit-a' },
    { uid: 'executive', name: profiles.executive.fullName, saleId: 'last-ticket-b', auditId: 'last-ticket-audit-b' },
  ];
  const results = await Promise.allSettled(attempts.map(({ uid, name, saleId, auditId }) => recordTicketSale(
    client(uid), { saleId, auditId, tierId: 'regular', quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000 }, name, uid,
  )));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);

  const adminDb = client('admin');
  const tier = await getDoc(doc(adminDb, 'ticketTiers', 'regular'));
  assert.equal(tier.data().sold, 1);
  const sales = await Promise.all(attempts.map(({ saleId }) => getDoc(doc(adminDb, 'ticketSales', saleId))));
  assert.equal(sales.filter(sale => sale.exists()).length, 1);
  const winnerIndex = sales.findIndex(sale => sale.exists());
  const winner = attempts[winnerIndex];
  await assertSucceeds(getDoc(doc(adminDb, 'activityLogs', winner.auditId)));
});

test('ticket transactions use the current tier price and rules reject stale prices', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ticketTiers', 'regular'), {
      name: 'Regular', price: 9000, capacity: 2, sold: 0, active: true,
    });
  });
  const db = client('member');
  const staleQuote = { saleId: 'stale-quote-sale', auditId: 'stale-quote-audit', tierId: 'regular', quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000 };
  await assert.rejects(recordTicketSale(db, staleQuote, profiles.member.fullName, 'member'), /price changed while this form was open/);
  const unchangedTier = await getDoc(doc(client('admin'), 'ticketTiers', 'regular'));
  assert.equal(unchangedTier.data().sold, 0);
  assert.equal((await getDoc(doc(client('admin'), 'ticketSales', staleQuote.saleId))).exists(), false);

  const attempt = { saleId: 'current-price-sale', auditId: 'current-price-audit', tierId: 'regular', quantity: 1, date: '2026-09-27', quotedUnitPrice: 9000 };
  assert.equal(await recordTicketSale(db, attempt, profiles.member.fullName, 'member'), 'recorded');
  const currentSale = await getDoc(doc(client('admin'), 'ticketSales', attempt.saleId));
  assert.equal(currentSale.data().unitPrice, 9000);
  assert.equal(currentSale.data().total, 9000);

  const stale = writeBatch(db);
  stale.update(doc(db, 'ticketTiers', 'regular'), {
    sold: 2, lastSaleId: 'stale-price-sale', auditLogId: 'stale-price-audit', updatedAt: serverTimestamp(),
  });
  stale.set(doc(db, 'ticketSales', 'stale-price-sale'), {
    tierId: 'regular', tierName: 'Regular', quantity: 1, unitPrice: 8000, total: 8000,
    status: 'Paid', date: '2026-09-27', agent: profiles.member.fullName, agentId: 'member',
    createdBy: 'member', createdAt: serverTimestamp(), auditLogId: 'stale-price-audit',
  });
  stale.set(doc(db, 'activityLogs', 'stale-price-audit'), auditEntry('member', 'ticket.sale', 'ticketSales', 'stale-price-sale'));
  await assertFails(stale.commit());
});

test('tier deactivation or capacity changes after a quote prevent the sale', async () => {
  const db = client('member');
  const changes = [
    { id: 'deactivated-after-quote', update: { active: false } },
    { id: 'sold-out-after-quote', update: { capacity: 0 } },
  ];
  for (const change of changes) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'ticketTiers', 'regular'), {
        name: 'Regular', price: 8000, capacity: 2, sold: 0, active: true,
      });
    });
    const attempt = {
      saleId: `${change.id}-sale`, auditId: `${change.id}-audit`, tierId: 'regular',
      quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000,
    };
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'ticketTiers', 'regular'), change.update);
    });
    await assert.rejects(recordTicketSale(db, attempt, profiles.member.fullName, 'member'), /not enough tickets/);
    const adminDb = client('admin');
    assert.equal((await getDoc(doc(adminDb, 'ticketTiers', 'regular'))).data().sold, 0);
    assert.equal((await getDoc(doc(adminDb, 'ticketSales', attempt.saleId))).exists(), false);
    assert.equal((await getDoc(doc(adminDb, 'activityLogs', attempt.auditId))).exists(), false);
  }
});

test('ticket boundaries reject invalid quantities, missing tiers, inactive tiers, and malformed tier data', async () => {
  const db = client('member');
  for (const quantity of [0, -1, 1.5, 21, Number.NaN]) {
    await assert.rejects(recordTicketSale(db, {
      saleId: `invalid-quantity-${String(quantity)}`, auditId: `invalid-quantity-audit-${String(quantity)}`,
      tierId: 'regular', quantity, date: '2026-09-27', quotedUnitPrice: 8000,
    }, profiles.member.fullName, 'member'), /Ticket quantity must be a whole number/);
  }
  await assert.rejects(recordTicketSale(db, {
    saleId: 'missing-tier-sale', auditId: 'missing-tier-audit', tierId: 'missing', quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000,
  }, profiles.member.fullName, 'member'), /ticket tier is no longer available/);

  const invalidTiers = [
    { name: 'inactive tier', data: { active: false } },
    { name: 'fractional capacity', data: { capacity: 1.5 } },
    { name: 'negative capacity', data: { capacity: -1 } },
    { name: 'unsafe price', data: { price: Number.MAX_SAFE_INTEGER + 1 } },
    { name: 'negative price', data: { price: -1 } },
    { name: 'negative sold count', data: { sold: -1 } },
    { name: 'fractional sold count', data: { sold: 0.5 } },
    { name: 'non-boolean active flag', data: { active: 'yes' } },
  ];
  for (const [index, scenario] of invalidTiers.entries()) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'ticketTiers', 'regular'), {
        name: 'Regular', price: 8000, capacity: 2, sold: 0, active: true, ...scenario.data,
      });
    });
    await assert.rejects(recordTicketSale(db, {
      saleId: `invalid-tier-sale-${index}`, auditId: `invalid-tier-audit-${index}`,
      tierId: 'regular', quantity: 1, date: '2026-09-27', quotedUnitPrice: 8000,
    }, profiles.member.fullName, 'member'), scenario.name === 'inactive tier' ? /not enough tickets/ : /Ticket data is invalid/);
  }
});

test('ticket totals above the financial limit are rejected by the utility and Rules', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ticketTiers', 'regular'), {
      name: 'Regular', price: 1000000000000, capacity: 3, sold: 0, active: true,
    });
  });
  const db = client('member');
  await assert.rejects(recordTicketSale(db, {
    saleId: 'overflow-sale', auditId: 'overflow-audit', tierId: 'regular', quantity: 2, date: '2026-09-27', quotedUnitPrice: 1000000000000,
  }, profiles.member.fullName, 'member'), /ticket total is outside the supported range/);

  const batch = writeBatch(db);
  batch.update(doc(db, 'ticketTiers', 'regular'), {
    sold: 2, lastSaleId: 'forged-overflow-sale', auditLogId: 'forged-overflow-audit', updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'ticketSales', 'forged-overflow-sale'), {
    tierId: 'regular', tierName: 'Regular', quantity: 2, unitPrice: 1000000000000, total: 2000000000000,
    status: 'Paid', date: '2026-09-27', agent: profiles.member.fullName, agentId: 'member',
    createdBy: 'member', createdAt: serverTimestamp(), auditLogId: 'forged-overflow-audit',
  });
  batch.set(doc(db, 'activityLogs', 'forged-overflow-audit'), auditEntry('member', 'ticket.sale', 'ticketSales', 'forged-overflow-sale'));
  await assertFails(batch.commit());
});

test('direct inventory increments without a matching sale are denied', async () => {
  await assertFails(updateDoc(doc(client('member'), 'ticketTiers', 'regular'), {
    sold: 1, lastSaleId: 'forged-sale', updatedAt: serverTimestamp(),
  }));
});

test('admins can create budgets; executives cannot', async () => {
  const budget = {
    name: 'SLK Rave 2027', totalAmount: 1000000, year: 2027,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(client('admin'), 'budgets', 'event-2026'), budget));
  await writeConfiguration('admin', (batch, db) => batch.set(doc(db, 'budgets', 'event-2026'), budget));
  await assertFails(setDoc(doc(client('executive'), 'budgets', 'event-2026'), budget));
});

test('category and ticket-tier configuration writes require a same-batch workspace audit', async () => {
  const db = client('admin');
  await assertFails(setDoc(doc(db, 'expenseCategories', 'unlogged'), { name: 'Unlogged' }));
  await assertFails(updateDoc(doc(db, 'ticketTiers', 'regular'), { price: 9000, capacity: 2, updatedAt: serverTimestamp() }));
  await writeConfiguration('admin', (batch, configDb) => {
    batch.set(doc(configDb, 'expenseCategories', 'audited'), { name: 'Audited category' });
  });
  await writeConfiguration('admin', (batch, configDb) => {
    batch.update(doc(configDb, 'ticketTiers', 'regular'), { price: 9000, capacity: 2, updatedAt: serverTimestamp() });
  });
  await writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'budgetAllocations', 'audited-delete'), {
    budgetId: 'event-2026', category: 'Audit test', percent: 1, amount: 1000,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(doc(db, 'budgetAllocations', 'audited-delete')));
  await writeConfiguration('admin', (batch, configDb) => batch.delete(doc(configDb, 'budgetAllocations', 'audited-delete')));
});

test('configuration writes reject stale workspace markers and mismatched audit events', async () => {
  const db = client('admin');
  await writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'expenseCategories', 'initial-config'), { name: 'Initial' }));

  await assertFails(setDoc(doc(db, 'expenseCategories', 'stale-marker'), { name: 'Stale marker' }));

  const batch = writeBatch(db);
  batch.set(doc(db, 'settings', 'workspace'), { auditLogId: 'wrong-config-event', updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'activityLogs', 'wrong-config-event'), auditEntry('admin', 'expense.created', 'expenses', 'unrelated'));
  batch.set(doc(db, 'expenseCategories', 'mismatched-event'), { name: 'Mismatched event' });
  await assertFails(batch.commit());
});

test('concurrent configuration batches retain both writes and audit events', async () => {
  const db = client('admin');
  await Promise.all([
    writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'expenseCategories', 'concurrent-a'), { name: 'Concurrent A' })),
    writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'expenseCategories', 'concurrent-b'), { name: 'Concurrent B' })),
  ]);
  await assertSucceeds(getDoc(doc(db, 'expenseCategories', 'concurrent-a')));
  await assertSucceeds(getDoc(doc(db, 'expenseCategories', 'concurrent-b')));
});

test('the rules allow individually valid allocations whose combined totals exceed the budget', async () => {
  const db = client('admin');
  await writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'budgets', 'event-2026'), {
    name: 'SLK Rave 2026', totalAmount: 1000000, year: 2026,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  const allocation = (category) => ({
    budgetId: 'event-2026', category, percent: 70, amount: 700000,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'budgetAllocations', 'venue'), allocation('Venue')));
  await writeConfiguration('admin', (batch, configDb) => batch.set(doc(configDb, 'budgetAllocations', 'marketing'), allocation('Marketing')));
});

test('finance roles can create expenses only with a matching audit event', async () => {
  await assertFails(setDoc(doc(client('executive'), 'expenses', 'missing-audit'), validExpense()));
  await writeAudited('executive', 'expenses', 'valid-expense', validExpense(), 'expense.created');
});

test('expense creation allows Paid, Pending, and Deposit without an approval gate', async () => {
  for (const status of ['Paid', 'Pending', 'Deposit']) {
    await writeAudited('executive', 'expenses', `expense-${status.toLowerCase()}`, {
      ...validExpense(), status,
    }, 'expense.created');
  }
  await assertFails(writeAudited('executive', 'expenses', 'new-unpaid-expense', {
    ...validExpense(), status: 'Unpaid',
  }, 'expense.created'));
  await assertFails(writeAudited('executive', 'expenses', 'approval-expense', {
    ...validExpense(), approvalStatus: 'pending',
  }, 'expense.created'));
});

test('expense submission retries and concurrent duplicate submits reuse one ledger and audit record', async () => {
  const db = client('executive');
  const attempt = {
    expenseId: 'expense-idempotent-attempt', auditId: 'audit-idempotent-attempt',
    title: 'Stage lighting deposit', category: 'Venue & Production',
    budgetAllocationId: 'expense-venue', amount: 15000, status: 'Deposit', date: '2026-09-27',
  };

  const results = await Promise.all([
    recordExpense(db, attempt, profiles.executive.fullName, 'executive'),
    recordExpense(db, attempt, profiles.executive.fullName, 'executive'),
  ]);
  assert.deepEqual([...results].sort(), ['already-recorded', 'recorded']);
  assert.equal(await recordExpense(db, attempt, profiles.executive.fullName, 'executive'), 'already-recorded');
  assert.equal((await getDoc(doc(db, 'expenses', attempt.expenseId))).exists(), true);
  assert.equal((await getDoc(doc(client('admin'), 'activityLogs', attempt.auditId))).exists(), true);

  await assert.rejects(recordExpense(db, { ...attempt, amount: 16000 }, profiles.executive.fullName, 'executive'), /already linked to different expense details/);
});

test('the rules allow a finance user to record an expense larger than the total event budget', async () => {
  const adminDb = client('admin');
  const budget = {
    name: 'SLK Rave 2026', totalAmount: 1000000, year: 2026,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(adminDb, 'budgets', 'event-2026'), budget));
  await writeConfiguration('admin', (batch, db) => batch.set(doc(db, 'budgets', 'event-2026'), budget));
  await writeAudited('executive', 'expenses', 'over-budget', {
    ...validExpense(), amount: 1000001,
  }, 'expense.created');
});

test('finance roles can create an app-shaped expense with its validated allocation field', async () => {
  await writeAudited('executive', 'expenses', 'app-expense', {
    ...validExpense(), budgetAllocationId: 'expense-venue',
  }, 'expense.created');
  await assertFails(setDoc(doc(client('executive'), 'expenses', 'wrong-allocation'), {
    ...validExpense(), category: 'Marketing & Promo', budgetAllocationId: 'expense-venue',
  }));
});

test('finance roles can edit expenses without changing creator or payment method fields', async () => {
  await writeAudited('executive', 'expenses', 'existing', {
    title: 'Updated promo deposit', category: 'Marketing & Promo',
    budgetAllocationId: 'expense-marketing', amount: 16000, previousAmount: 15000, status: 'Paid', date: '2026-09-27',
    updatedBy: 'executive', updatedAt: serverTimestamp(),
  }, 'expense.updated', 'update', undefined, { previousAmount: 15000, newAmount: 16000 });
});

test('expense amount corrections require matching old and new amounts in the append-only audit event', async () => {
  const db = client('executive');
  const corrected = writeBatch(db);
  corrected.update(doc(db, 'expenses', 'existing'), {
    amount: 20000, previousAmount: 15000, updatedBy: 'executive',
    updatedAt: serverTimestamp(), auditLogId: 'expense-amount-corrected',
  });
  corrected.set(doc(db, 'activityLogs', 'expense-amount-corrected'), {
    ...auditEntry('executive', 'expense.updated', 'expenses', 'existing'),
    previousAmount: 15000, newAmount: 20000,
  });
  await assertSucceeds(corrected.commit());

  const invalid = writeBatch(db);
  invalid.update(doc(db, 'expenses', 'existing'), {
    amount: 21000, previousAmount: 19000, updatedBy: 'executive',
    updatedAt: serverTimestamp(), auditLogId: 'expense-amount-invalid',
  });
  invalid.set(doc(db, 'activityLogs', 'expense-amount-invalid'), {
    ...auditEntry('executive', 'expense.updated', 'expenses', 'existing'),
    previousAmount: 19000, newAmount: 21000,
  });
  await assertFails(invalid.commit());
});

test('legacy revenue records require matching audit events for edits and deletes', async () => {
  const db = client('executive');
  await assertFails(updateDoc(doc(db, 'revenues', 'sample'), { title: 'Unlogged change' }));
  await assertFails(deleteDoc(doc(db, 'revenues', 'sample')));
  await writeAudited('executive', 'revenues', 'sample', {
    title: 'Updated sponsor payment', amount: 55000, status: 'Paid', date: '2026-09-27',
    updatedBy: 'executive', updatedAt: serverTimestamp(),
  }, 'revenue.updated', 'update');
  await assertFails(writeAudited('executive', 'revenues', 'sample', {}, 'revenue.deleted', 'delete', 'sample'));
  await writeAudited('admin', 'revenues', 'sample', {}, 'revenue.deleted', 'delete', 'sample');
});

test('sensitive finance edits and deletions require a bounded reason in the atomic audit event', async () => {
  const db = client('admin');
  async function statusChange(collectionName, id, includeReason) {
    const batch = writeBatch(db);
    const auditId = 'status-' + collectionName + '-' + (includeReason ? 'with' : 'without') + '-reason';
    batch.update(doc(db, collectionName, id), {
      status: 'Pending', updatedBy: 'admin', updatedAt: serverTimestamp(), auditLogId: auditId,
    });
    const event = auditEntry('admin', (collectionName === 'expenses' ? 'expense' : 'revenue') + '.updated', collectionName, id);
    if (!includeReason) delete event.reason;
    batch.set(doc(db, 'activityLogs', auditId), event);
    return batch.commit();
  }
  await assertFails(statusChange('expenses', 'existing', false));
  await assertSucceeds(statusChange('expenses', 'existing', true));
  await assertFails(statusChange('revenues', 'sample', false));
  await assertSucceeds(statusChange('revenues', 'sample', true));

  async function deleteWithReason(collectionName, id, includeReason) {
    const batch = writeBatch(db);
    batch.delete(doc(db, collectionName, id));
    const type = collectionName === 'expenses' ? 'expense' : 'revenue';
    const event = auditEntry('admin', type + '.deleted', collectionName, id);
    if (!includeReason) delete event.reason;
    batch.set(doc(db, 'activityLogs', id), event);
    return batch.commit();
  }
  await assertFails(deleteWithReason('expenses', 'existing', false));
  await assertSucceeds(deleteWithReason('expenses', 'existing', true));
});

test('only Admins can run filtered queries against the complete audit collection', async () => {
  const adminQuery = query(collection(client('admin'), 'activityLogs'), where('action', '==', 'expense.created'), orderBy('createdAt', 'desc'));
  const events = await assertSucceeds(getDocs(adminQuery));
  assert.equal(events.size, 1);
  const combinedQuery = query(collection(client('admin'), 'activityLogs'), where('actorId', '==', 'executive'), where('targetType', '==', 'expenses'), orderBy('createdAt', 'desc'));
  const combinedEvents = await assertSucceeds(getDocs(combinedQuery));
  assert.equal(combinedEvents.size, 1);
  for (const uid of ['executive','member','guest']) {
    await assertFails(getDocs(query(collection(client(uid), 'activityLogs'), where('action', '==', 'expense.created'), orderBy('createdAt', 'desc'))));
    await assertFails(getDocs(query(collection(client(uid), 'activityLogs'), where('actorId', '==', 'executive'), where('targetType', '==', 'expenses'), orderBy('createdAt', 'desc'))));
  }
  await assertFails(getDocs(query(collection(anonymous(), 'activityLogs'), where('action', '==', 'expense.created'), orderBy('createdAt', 'desc'))));
  await assertFails(getDocs(query(collection(anonymous(), 'activityLogs'), where('actorId', '==', 'executive'), where('targetType', '==', 'expenses'), orderBy('createdAt', 'desc'))));
});

test('finance audit details use the allowlisted activity payload fields', async () => {
  await writeAudited('admin', 'revenues', 'sample', {}, 'revenue.deleted', 'delete', 'sample', {
    reason: 'Duplicate entry', snapshot: { title: 'Sponsor payment', category: 'Sponsorships', amount: 50000, status: 'Paid', date: '2026-09-27', method: 'Bank transfer' },
  });

  await assertFails(writeAudited('admin', 'revenues', 'sample', {}, 'revenue.deleted', 'delete', 'revenue-unsafe-snapshot', {
    reason: 'Duplicate entry', snapshot: { title: 'Sponsor payment' }, privatePayload: 'private@example.test',
  }));

  await writeAudited('executive', 'expenses', 'existing', {
    title: 'Updated lighting deposit', updatedBy: 'executive', updatedAt: serverTimestamp(),
  }, 'expense.updated', 'update', 'expense-safe-changes', {
    changes: { title: { before: { present: true, value: 'Stage lighting deposit' }, after: { present: true, value: 'Updated lighting deposit' } } },
  });

  await assertFails(writeAudited('executive', 'revenues', 'sample', {
    title: 'Updated sponsor payment', updatedBy: 'executive', updatedAt: serverTimestamp(),
  }, 'revenue.updated', 'update', 'revenue-unsafe-changes', {
    changes: { title: { before: { present: true, value: 'Sponsor payment' }, after: { present: true, value: 'Updated sponsor payment' } } }, privatePayload: 'private@example.test',
  }));
});

test('role grants and access changes reject missing or whitespace-only reasons', async () => {
  const db = client('admin');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', 'member'), { role: 'executive', auditLogId: 'role-no-reason', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', 'member'), { role: 'executive', auditLogId: 'role-no-reason', updatedAt: serverTimestamp() });
  const missing = auditEntry('admin', 'user.role', 'users', 'member');
  delete missing.reason;
  batch.set(doc(db, 'activityLogs', 'role-no-reason'), missing);
  await assertFails(batch.commit());

  const whitespace = writeBatch(db);
  whitespace.update(doc(db, 'users', 'member'), { role: 'executive', auditLogId: 'role-whitespace-reason', updatedAt: serverTimestamp() });
  whitespace.update(doc(db, 'usersPublic', 'member'), { role: 'executive', auditLogId: 'role-whitespace-reason', updatedAt: serverTimestamp() });
  whitespace.set(doc(db, 'activityLogs', 'role-whitespace-reason'), {
    ...auditEntry('admin', 'user.role', 'users', 'member'), reason: '   ',
  });
  await assertFails(whitespace.commit());

  const valid = writeBatch(db);
  valid.update(doc(db, 'users', 'member'), { role: 'executive', auditLogId: 'role-with-reason', updatedAt: serverTimestamp() });
  valid.update(doc(db, 'usersPublic', 'member'), { role: 'executive', auditLogId: 'role-with-reason', updatedAt: serverTimestamp() });
  valid.set(doc(db, 'activityLogs', 'role-with-reason'), auditEntry('admin', 'user.role', 'users', 'member'));
  await assertSucceeds(valid.commit());
});

test('members cannot edit expenses', async () => {
  await assertFails(updateDoc(doc(client('member'), 'expenses', 'existing'), {
    title: 'Changed by member', updatedBy: 'member', updatedAt: serverTimestamp(),
  }));
});

test('finance users cannot create expenses as another user', async () => {
  await assertFails(setDoc(doc(client('member'), 'expenses', 'forged-expense'), validExpense('member')));
});

test('activity logs are append-only and bound to the authenticated actor', async () => {
  const db = client('executive');
  await assertFails(setDoc(doc(db, 'activityLogs', 'forged'), {
    actor: 'Someone else', actorId: 'admin', action: 'expense.created',
    label: 'expense.created', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(db, 'activityLogs', 'seed-existing'), { label: 'Altered history' }));
  await assertFails(deleteDoc(doc(db, 'activityLogs', 'seed-existing')));
});

test('expense creation and its audit event must share one atomic batch', async () => {
  const db = client('executive');
  await assertFails(setDoc(doc(db, 'activityLogs', 'unlinked'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'expense.created',
    label: 'expense.created', targetType: 'expenses', targetId: 'missing', createdAt: serverTimestamp(),
  }));
  const batch = writeBatch(db);
  batch.set(doc(db, 'expenses', 'audited-create'), { ...validExpense(), auditLogId: 'expense-created' });
  batch.set(doc(db, 'activityLogs', 'expense-created'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'expense.created',
    label: 'expense.created', targetType: 'expenses', targetId: 'audited-create', createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test('revenue creation and its audit event must share one atomic batch', async () => {
  const db = client('executive');
  const batch = writeBatch(db);
  batch.set(doc(db, 'revenues', 'audited-revenue'), {
    title: 'Sponsor payment', category: 'Sponsorships', amount: 25000, status: 'Paid',
    date: '2026-09-27', method: 'Bank transfer', agent: profiles.executive.fullName,
    createdBy: 'executive', updatedBy: 'executive', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    auditLogId: 'revenue-created',
  });
  batch.set(doc(db, 'activityLogs', 'revenue-created'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'revenue.created',
    label: 'revenue.created', targetType: 'revenues', targetId: 'audited-revenue', createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test('sign-up audit entry is coupled to its approved Guest account creation', async () => {
  const uid = 'new-user';
  const name = 'New Account';
  const email = 'new@example.test';
  const db = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', 'newuser'), { uid, username: 'newuser', createdAt: serverTimestamp() });
  batch.set(doc(db, 'users', uid), {
    uid, fullName: name, username: 'newuser', usernameKey: 'newuser', email,
    role: 'guest', status: 'approved', auditLogId: 'signup', createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'usersPublic', uid), {
    uid, fullName: name, username: 'newuser', email, role: 'guest', status: 'approved', auditLogId: 'signup', createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'activityLogs', 'signup'), {
    actor: name, actorId: uid, action: 'user.signup', label: 'user.signup',
    targetType: 'users', targetId: uid, createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
  const unverifiedDb = testEnv.authenticatedContext(uid, { email, email_verified: false }).firestore();
  await assertFails(getDoc(doc(unverifiedDb, 'ticketTiers', 'regular')));
});

test('new signups cannot choose a privileged role or pending approval status', async () => {
  for (const role of ['admin', 'executive', 'member']) {
    const uid = `signup-${role}`;
    const email = `${uid}@example.test`;
    const name = `Signup ${role}`;
    const db = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', uid), { uid, username: uid, createdAt: serverTimestamp() });
    batch.set(doc(db, 'users', uid), {
      uid, fullName: name, username: uid, usernameKey: uid, email,
      role, status: 'approved', auditLogId: `audit-${uid}`, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'usersPublic', uid), {
      uid, fullName: name, username: uid, email, role, status: 'approved',
      auditLogId: `audit-${uid}`, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'activityLogs', `audit-${uid}`), {
      actor: name, actorId: uid, action: 'user.signup', label: 'user.signup',
      targetType: 'users', targetId: uid, createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  }
});

test('Master Admin activation audit entry shares the bootstrap batch', async () => {
  const uid = 'first-master';
  const email = 'carpentersfamily001@gmail.com';
  const name = 'First Master Admin';
  const db = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const seed = context.firestore();
    await setDoc(doc(seed, 'users', uid), {
      uid, fullName: name, username: 'firstmaster', usernameKey: 'firstmaster', email,
      role: 'guest', status: 'approved', createdAt: Timestamp.now(),
    });
    await setDoc(doc(seed, 'usersPublic', uid), {
      uid, fullName: name, username: 'firstmaster', email, role: 'guest', status: 'approved', createdAt: Timestamp.now(),
    });
  });
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), { status: 'approved', role: 'admin', isMasterAdmin: true, auditLogId: 'master-claimed', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', uid), { status: 'approved', role: 'admin', auditLogId: 'master-claimed', updatedAt: serverTimestamp() });
  batch.set(doc(db, 'settings', 'masterAdmin'), { uid, email, createdAt: serverTimestamp() });
  batch.set(doc(db, 'activityLogs', 'master-claimed'), {
    actor: name, actorId: uid, action: 'user.master_admin_claimed', label: 'user.master_admin_claimed',
    targetType: 'users', targetId: uid, createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test('browser users cannot replace the protected Master Admin or marker', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'settings', 'masterAdmin'), {
      uid: 'master', email: profiles.master.email, createdAt: Timestamp.now(),
    });
  });

  const adminDb = client('admin');
  const takeover = writeBatch(adminDb);
  takeover.update(doc(adminDb, 'users', 'master'), { role: 'member', auditLogId: 'master-takeover', updatedAt: serverTimestamp() });
  takeover.update(doc(adminDb, 'usersPublic', 'master'), { role: 'member', auditLogId: 'master-takeover', updatedAt: serverTimestamp() });
  takeover.set(doc(adminDb, 'activityLogs', 'master-takeover'), auditEntry('admin', 'user.role', 'users', 'master'));
  await assertFails(takeover.commit());
  await assertFails(updateDoc(doc(adminDb, 'settings', 'masterAdmin'), { uid: 'admin' }));
  await assertFails(deleteDoc(doc(adminDb, 'settings', 'masterAdmin')));
  await assertFails(updateDoc(doc(client('master'), 'users', 'master'), { role: 'member' }));
});

test('an existing Admin can appoint a separate backup Admin', async () => {
  const db = client('admin');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', 'member'), { role: 'admin', auditLogId: 'backup-admin', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', 'member'), { role: 'admin', auditLogId: 'backup-admin', updatedAt: serverTimestamp() });
  batch.set(doc(db, 'activityLogs', 'backup-admin'), auditEntry('admin', 'user.role', 'users', 'member'));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, 'users', 'member'))).data().role, 'admin');
});

test('only one concurrent Master Admin bootstrap can create the marker', async () => {
  const email = 'carpentersfamily001@gmail.com';
  async function claim(uid) {
    const name = `Master ${uid}`;
    const db = testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const seed = context.firestore();
      await setDoc(doc(seed, 'users', uid), {
        uid, fullName: name, username: uid, usernameKey: uid, email,
        role: 'guest', status: 'approved', createdAt: Timestamp.now(),
      });
      await setDoc(doc(seed, 'usersPublic', uid), {
        uid, fullName: name, username: uid, email, role: 'guest', status: 'approved', createdAt: Timestamp.now(),
      });
    });
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), { status: 'approved', role: 'admin', isMasterAdmin: true, auditLogId: `claim-${uid}`, updatedAt: serverTimestamp() });
    batch.update(doc(db, 'usersPublic', uid), { status: 'approved', role: 'admin', auditLogId: `claim-${uid}`, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'settings', 'masterAdmin'), { uid, email, createdAt: serverTimestamp() });
    batch.set(doc(db, 'activityLogs', `claim-${uid}`), {
      actor: name, actorId: uid, action: 'user.master_admin_claimed', label: 'user.master_admin_claimed',
      targetType: 'users', targetId: uid, createdAt: serverTimestamp(),
    });
    return batch.commit();
  }

  const results = await Promise.allSettled([claim('first-claim'), claim('second-claim')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});

test('expense update and delete audit events must match the same atomic operation', async () => {
  const db = client('executive');
  const updateBatch = writeBatch(db);
  updateBatch.update(doc(db, 'expenses', 'existing'), {
    title: 'Audited expense update', updatedBy: 'executive', updatedAt: serverTimestamp(), auditLogId: 'expense-updated',
  });
  updateBatch.set(doc(db, 'activityLogs', 'expense-updated'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'expense.updated',
    label: 'expense.updated', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(),
  });
  await assertSucceeds(updateBatch.commit());

  const deleteBatch = writeBatch(db);
  deleteBatch.delete(doc(db, 'expenses', 'existing'));
  deleteBatch.set(doc(db, 'activityLogs', 'existing'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'expense.deleted',
    label: 'expense.deleted', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(),
  });
  await assertFails(deleteBatch.commit());

  const adminDb = client('admin');
  const adminDeleteBatch = writeBatch(adminDb);
  adminDeleteBatch.delete(doc(adminDb, 'expenses', 'existing'));
  adminDeleteBatch.set(doc(adminDb, 'activityLogs', 'existing'), {
    actor: profiles.admin.fullName, actorId: 'admin', action: 'expense.deleted',
    label: 'expense.deleted', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(), reason: 'Duplicate entry',
  });
  await assertSucceeds(adminDeleteBatch.commit());
});

test('user role audit events require matching profile changes in the same batch', async () => {
  const db = client('admin');
  await assertFails(setDoc(doc(db, 'activityLogs', 'unlinked-user-change'), {
    actor: profiles.admin.fullName, actorId: 'admin', action: 'user.role',
    label: 'user.role', targetType: 'users', targetId: 'executive', createdAt: serverTimestamp(),
  }));

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', 'executive'), { role: 'member', auditLogId: 'user-role', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', 'executive'), { role: 'member', auditLogId: 'user-role', updatedAt: serverTimestamp() });
  batch.set(doc(db, 'activityLogs', 'user-role'), {
    actor: profiles.admin.fullName, actorId: 'admin', action: 'user.role',
    label: 'user.role', targetType: 'users', targetId: 'executive', createdAt: serverTimestamp(), reason: 'Approved test reason',
  });
  await assertSucceeds(batch.commit());
});

test('suspending a user blocks their next protected read immediately', async () => {
  const db = client('admin');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', 'executive'), { status: 'suspended', auditLogId: 'user-suspend', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', 'executive'), { status: 'suspended', auditLogId: 'user-suspend', updatedAt: serverTimestamp() });
  batch.set(doc(db, 'activityLogs', 'user-suspend'), auditEntry('admin', 'user.suspend', 'users', 'executive'));
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(doc(client('executive'), 'expenses', 'existing')));
});

test('user lifecycle audit actions only authorize their own status or role transition', async () => {
  const db = client('admin');
  async function attempt(uid, action, patch, auditId) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), { ...patch, auditLogId: auditId, updatedAt: serverTimestamp() });
    batch.update(doc(db, 'usersPublic', uid), { ...patch, auditLogId: auditId, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'activityLogs', auditId), auditEntry('admin', action, 'users', uid));
    return batch.commit();
  }

  await assertFails(attempt('executive', 'user.role', { role: 'member', status: 'suspended' }, 'role-and-suspend'));
  await assertFails(attempt('executive', 'user.suspend', { role: 'member', status: 'suspended' }, 'suspend-and-demote'));
  await assertFails(attempt('pending', 'user.role', { role: 'member' }, 'assign-pending-role'));
  await assertFails(attempt('pending', 'user.reject', { role: 'member', status: 'rejected' }, 'reject-and-assign-role'));

  await assertSucceeds(attempt('pending', 'user.reject', { status: 'rejected' }, 'reject-pending'));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'users', 'pending-approve'), { ...profiles.pending, uid: 'pending-approve' });
    await setDoc(doc(adminDb, 'usersPublic', 'pending-approve'), { ...profiles.pending, uid: 'pending-approve' });
  });
  await assertSucceeds(attempt('pending-approve', 'user.approve', { role: 'member', status: 'approved' }, 'approve-pending'));
  await assertSucceeds(attempt('suspended', 'user.reactivate', { status: 'approved' }, 'reactivate-suspended'));
});

test('Executive to Member role changes preserve finance reads and reject mismatched public profiles', async () => {
  const db = client('admin');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', 'executive'), { role: 'member', auditLogId: 'user-demote', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'usersPublic', 'executive'), { role: 'member', auditLogId: 'user-demote', updatedAt: serverTimestamp() });
  batch.set(doc(db, 'activityLogs', 'user-demote'), auditEntry('admin', 'user.role', 'users', 'executive'));
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(client('executive'), 'expenses', 'existing')));

  const adminDb = client('admin');
  const mismatch = writeBatch(adminDb);
  mismatch.update(doc(adminDb, 'users', 'member'), { role: 'executive', auditLogId: 'profile-mismatch', updatedAt: serverTimestamp() });
  mismatch.update(doc(adminDb, 'usersPublic', 'member'), { role: 'member', auditLogId: 'profile-mismatch', updatedAt: serverTimestamp() });
  mismatch.set(doc(adminDb, 'activityLogs', 'profile-mismatch'), auditEntry('admin', 'user.role', 'users', 'member'));
  await assertFails(mismatch.commit());
});

test('audit events reject mismatched actor names and caller supplied labels', async () => {
  const db = client('executive');
  await assertFails(setDoc(doc(db, 'activityLogs', 'wrong-name'), {
    actor: profiles.admin.fullName, actorId: 'executive', action: 'expense.created',
    label: 'expense.created', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'activityLogs', 'wrong-label'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'expense.created',
    label: 'Approved a new administrator', targetType: 'expenses', targetId: 'existing', createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'activityLogs', 'unknown-action'), {
    actor: profiles.executive.fullName, actorId: 'executive', action: 'user.deleted_everyone',
    label: 'user.deleted_everyone', targetType: 'users', targetId: 'admin', createdAt: serverTimestamp(),
  }));
});
