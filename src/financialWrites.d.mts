import type { Firestore } from 'firebase/firestore';

export type ExpenseAttempt = {
  expenseId: string;
  auditId: string;
  title: string;
  category: string;
  budgetAllocationId: string | null;
  amount: number;
  status: 'Paid' | 'Pending' | 'Deposit';
  date: string;
};

export type ExpenseWriteResult = 'recorded' | 'already-recorded';

export function recordExpense(
  db: Firestore,
  attempt: ExpenseAttempt,
  actorName: string,
  actorId: string,
  errorForMessage?: (message: string) => Error,
): Promise<ExpenseWriteResult>;
