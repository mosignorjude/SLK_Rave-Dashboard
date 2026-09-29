export type BudgetExpense = {
  id?: string;
  amount: number;
  status: string;
  category: string;
  budgetAllocationId?: string | null;
};

export function summarizeExpenses(expenses: BudgetExpense[]) {
  return expenses.reduce((totals, expense) => {
    if (expense.status === 'Paid' || expense.status === 'Deposit') totals.paid += expense.amount;
    else if (expense.status === 'Pending' || expense.status === 'Unpaid') totals.committed += expense.amount;
    return totals;
  }, { paid: 0, committed: 0 });
}

export function summarizeAllocationExpenses(expenses: BudgetExpense[], allocation: { id: string; category: string }) {
  const matching = expenses.filter(expense =>
    expense.budgetAllocationId === allocation.id ||
    (!expense.budgetAllocationId && expense.category === allocation.category),
  );
  return summarizeExpenses(matching);
}

export function getExpenseBudgetWarnings(
  expenses: BudgetExpense[],
  allocations: Array<{ id: string; category: string; amount: number }>,
  totalBudget: number,
  candidate: BudgetExpense,
  editingId?: string,
): string[] {
  const projected = expenses.filter(expense => !editingId || expense.id !== editingId);
  projected.push(candidate);

  const totals = summarizeExpenses(projected);
  const warnings: string[] = [];
  const projectedUse = totals.paid + totals.committed;
  if (projectedUse > totalBudget) {
    warnings.push(`Event budget would be exceeded by ₦${(projectedUse - totalBudget).toLocaleString('en-NG')}.`);
  }

  const allocation = allocations.find(item =>
    (candidate.budgetAllocationId && item.id === candidate.budgetAllocationId) || item.category === candidate.category,
  );
  if (!allocation) {
    warnings.push(`No budget allocation matches “${candidate.category}”.`);
  } else {
    const categoryTotals = summarizeAllocationExpenses(projected, allocation);
    const categoryUse = categoryTotals.paid + categoryTotals.committed;
    if (categoryUse > allocation.amount) {
      warnings.push(`${allocation.category} allocation would be exceeded by ₦${(categoryUse - allocation.amount).toLocaleString('en-NG')}.`);
    }
  }

  return warnings.map(warning => `${warning} This is advisory only and does not block saving.`);
}
