import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const sameExpense = (stored, attempt, actorName, actorId) =>
  stored.auditLogId === attempt.auditId
  && stored.createdBy === actorId
  && stored.agent === actorName
  && stored.title === attempt.title
  && stored.category === attempt.category
  && (stored.budgetAllocationId ?? null) === (attempt.budgetAllocationId ?? null)
  && stored.amount === attempt.amount
  && stored.status === attempt.status
  && stored.date === attempt.date
  && stored.method === 'Other';

/**
 * Record a new expense using a caller-stable expense/audit ID pair.
 * Retrying the same attempt recognizes its prior commit instead of duplicating it.
 */
export async function recordExpense(db, attempt, actorName, actorId, errorForMessage = message => new Error(message)) {
  const expenseRef = doc(db, 'expenses', attempt.expenseId);
  const auditRef = doc(db, 'activityLogs', attempt.auditId);
  const existing = await getDoc(expenseRef);
  if (existing.exists()) {
    if (!sameExpense(existing.data(), attempt, actorName, actorId)) {
      throw errorForMessage('This expense attempt ID is already linked to different expense details. Refresh and contact the administrator if the issue continues.');
    }
    return 'already-recorded';
  }

  const batch = writeBatch(db);
  batch.set(expenseRef, {
      title: attempt.title,
      category: attempt.category,
      budgetAllocationId: attempt.budgetAllocationId ?? null,
      amount: attempt.amount,
      status: attempt.status,
      date: attempt.date,
      method: 'Other',
      agent: actorName,
      createdBy: actorId,
      updatedBy: actorId,
      auditLogId: attempt.auditId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
  });
  batch.set(auditRef, {
      actor: actorName,
      actorId,
      action: 'expense.created',
      label: 'expense.created',
      targetType: 'expenses',
      targetId: attempt.expenseId,
      createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return 'recorded';
  } catch (error) {
    // If a concurrent submit or an ambiguous network response committed the batch,
    // recognize that exact write after the failed response rather than creating a new ID.
    const committed = await getDoc(expenseRef);
    if (committed.exists() && sameExpense(committed.data(), attempt, actorName, actorId)) {
      return 'already-recorded';
    }
    throw error;
  }
}
