import {summarizeAllocationExpenses} from './budget';

type MoneyRecord={amount?:unknown;total?:unknown;status?:string;category?:string;tierId?:string;quantity?:unknown};
type DashboardTier={id:string;name:string;capacity?:number;sold?:number};
type DashboardAllocation={id:string;category:string;amount:number};

function amount(value:unknown):number {
  return typeof value==='number'&&Number.isFinite(value)?value:0;
}

function sum(values:unknown[]):number {
  return values.reduce<number>((total,value)=>total+amount(value),0);
}

export function summarizeDashboard(input:{
  revenues:MoneyRecord[];
  ticketSales:MoneyRecord[];
  expenses:MoneyRecord[];
  tiers:DashboardTier[];
  allocations:DashboardAllocation[];
  totalBudget:number;
}) {
  const paidRevenues=input.revenues.filter(record=>record.status==='Paid');
  const paidExpenses=input.expenses.filter(record=>record.status==='Paid'||record.status==='Deposit');
  const pendingExpenses=input.expenses.filter(record=>record.status==='Pending');
  const unpaidExpenses=input.expenses.filter(record=>record.status==='Unpaid');
  const paidTicketSales=input.ticketSales.filter(record=>!record.status||record.status==='Paid');
  const paidRevenue=sum(paidRevenues.map(record=>record.amount))+sum(paidTicketSales.map(record=>record.total));
  const paidExpense=sum(paidExpenses.map(record=>record.amount));
  const pendingExpense=sum(pendingExpenses.map(record=>record.amount));
  const unpaidExpense=sum(unpaidExpenses.map(record=>record.amount));
  const totalBudget=amount(input.totalBudget);
  const commitments=pendingExpense+unpaidExpense;

  const revenueByCategory=new Map<string,number>();
  for(const record of paidRevenues){
    const recordAmount=amount(record.amount);
    if(recordAmount<=0)continue;
    const category=typeof record.category==='string'&&record.category.trim()?record.category.trim():'Uncategorized';
    revenueByCategory.set(category,(revenueByCategory.get(category)||0)+recordAmount);
  }
  const ticketRevenue=sum(paidTicketSales.map(record=>record.total));
  if(ticketRevenue)revenueByCategory.set('Ticket Sales',(revenueByCategory.get('Ticket Sales')||0)+ticketRevenue);

  const salesByTier=input.tiers.map(tier=>{
    const sales=paidTicketSales.filter(sale=>sale.tierId===tier.id);
    const sold=sum(sales.map(sale=>sale.quantity));
    return {id:tier.id,name:tier.name,sold:typeof tier.sold==='number'?tier.sold:sold,
      capacity:amount(tier.capacity),revenue:sum(sales.map(sale=>sale.total))};
  });
  const normalizedExpenses=input.expenses.map(expense=>({...expense,amount:amount(expense.amount)})) as Array<{id?:string;amount:number;status:string;category:string;budgetAllocationId?:string|null}>;
  const spendingByAllocation=input.allocations.map(allocation=>{
    const breakdown=summarizeAllocationExpenses(normalizedExpenses,allocation);
    const remainingAfterCommitments=allocation.amount-breakdown.paid-breakdown.committed;
    return {...allocation,paid:breakdown.paid,committed:breakdown.committed,
      remainingAfterCommitments,cashRemaining:allocation.amount-breakdown.paid};
  });

  return {
    paidRevenue,
    paidExpense,
    totalExpense:paidExpense+pendingExpense+unpaidExpense,
    pendingExpense,
    unpaidExpense,
    commitments,
    netProfitLoss:paidRevenue-paidExpense,
    ticketsSold:sum(input.tiers.map(tier=>tier.sold)),
    ticketCapacity:sum(input.tiers.map(tier=>tier.capacity)),
    totalBudget,
    remainingBudget:totalBudget-paidExpense,
    availableAfterCommitments:totalBudget-paidExpense-commitments,
    budgetUtilizationPercent:totalBudget?paidExpense/totalBudget*100:0,
    revenueByCategory:[...revenueByCategory].map(([category,value])=>({category,amount:value})),
    salesByTier,
    spendingByAllocation,
  };
}

export function buildRecentActivity({revenues=[],expenses=[],ticketSales=[]}:{revenues?:Array<Record<string,any>>;expenses?:Array<Record<string,any>>;ticketSales?:Array<Record<string,any>>}) {
  const rows=[
    ...revenues.map(record=>({...record,kind:'revenue'})),
    ...expenses.map(record=>({...record,kind:'expense'})),
    ...ticketSales.map(record=>({...record,kind:'ticket'})),
  ];
  const timestamp=(record:Record<string,any>)=>{
    const created=record.createdAt;
    if(typeof created?.toMillis==='function')return created.toMillis();
    if(typeof created?.seconds==='number')return created.seconds*1000;
    const date=Date.parse(`${record.date||''}T00:00:00Z`);
    return Number.isFinite(date)?date:0;
  };
  return rows.sort((left,right)=>timestamp(right)-timestamp(left));
}

export function paginateItems<T>(items:T[],page:number,pageSize:number) {
  const safePage=Math.max(0,Math.floor(page));
  const safePageSize=Math.max(1,Math.floor(pageSize));
  const pageCount=Math.ceil(items.length/safePageSize);
  const currentPage=Math.min(safePage,Math.max(0,pageCount-1));
  const start=currentPage*safePageSize;
  return {items:items.slice(start,start+safePageSize),page:currentPage,pageCount,start,end:Math.min(start+safePageSize,items.length),total:items.length};
}
