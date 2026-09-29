import {summarizeDashboard} from './dashboard';
import {serializeCsvCell} from './csv';
import type {Allocation,Expense,Revenue,Tier} from './types';

type Sale=Record<string,any>&{id:string;tierId:string;quantity:number;unitPrice:number;total:number;date:string;agent?:string};
type DateRange={startDate:string;endDate:string};

export function isIsoDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

export function validateDateRange({startDate,endDate}:DateRange):string|null {
  if(startDate&&!isIsoDate(startDate))return 'Enter a valid start date.';
  if(endDate&&!isIsoDate(endDate))return 'Enter a valid end date.';
  if(startDate&&endDate&&startDate>endDate)return 'Start date must be on or before end date.';
  return null;
}

export function filterByDate<T extends {date?:unknown}>(rows:T[],{startDate,endDate}:DateRange):T[] {
  if(!startDate&&!endDate)return [...rows];
  return rows.filter(row=>typeof row.date==='string'&&isIsoDate(row.date)
    &&(!startDate||row.date>=startDate)&&(!endDate||row.date<=endDate));
}

export function buildReportView(input:{
  revenues:Revenue[];
  expenses:Expense[];
  ticketSales:Sale[];
  tiers:Tier[];
  allocations:Allocation[];
  totalBudget:number;
  startDate:string;
  endDate:string;
}) {
  const dateRange={startDate:input.startDate,endDate:input.endDate};
  const error=validateDateRange(dateRange);
  const revenues=error?[]:filterByDate(input.revenues,dateRange);
  const expenses=error?[]:filterByDate(input.expenses,dateRange);
  const ticketSales=error?[]:filterByDate(input.ticketSales,dateRange);
  const tiers=error?[]:input.tiers;
  const allocations=error?[]:input.allocations;
  const metrics=summarizeDashboard({revenues,expenses,ticketSales,tiers,allocations,totalBudget:input.totalBudget});
  const ticketSummary=tiers.map(tier=>{
    const sales=ticketSales.filter(sale=>sale.tierId===tier.id);
    return {id:tier.id,name:tier.name,quantity:sales.reduce((total,sale)=>total+safeNumber(sale.quantity),0),
      revenue:sales.reduce((total,sale)=>total+safeNumber(sale.total),0)};
  });
  const reportAllocations=metrics.spendingByAllocation.map(allocation=>({...allocation,percent:input.allocations.find(item=>item.id===allocation.id)?.percent}));
  return {error,startDate:input.startDate,endDate:input.endDate,revenues,expenses,ticketSales,metrics,ticketSummary,allocations:reportAllocations};
}

function safeNumber(value:unknown):number {
  return typeof value==='number'&&Number.isFinite(value)?value:0;
}

export function buildReportCsv(report:ReturnType<typeof buildReportView>,generatedAt=new Date()):string {
  if(report.error)throw new Error(report.error);
  const rows:unknown[][]=[
    ['Report','SLK RAVE Finance Center Report'],
    ['Start date',report.startDate||'All dates'],
    ['End date',report.endDate||'All dates'],
    ['Generated at',generatedAt.toISOString()],
    [],
    ['Type','Title','Category','Amount (NGN)','Status','Date','Agent','Quantity','Unit Price (NGN)','Revenue (NGN)','Remaining Capacity','Allocation %','Spent (NGN)','Remaining (NGN)','Utilization %'],
    ...report.revenues.map(record=>['Revenue',record.title,record.category,record.amount,record.status,record.date,record.agent,'','','','','','','','']),
    ...report.expenses.map(record=>['Expense',record.title,record.category,record.amount,record.status,record.date,record.agent,'','','','','','','','']),
    ...report.ticketSales.map(sale=>['Ticket sale',sale.tierName,'Ticket Sales',sale.total,'Paid',sale.date,sale.agent,sale.quantity,sale.unitPrice,sale.total,'','','','','']),
    ...report.allocations.map(allocation=>{const percent=Number.isFinite(allocation.percent)?allocation.percent:(report.metrics.totalBudget?allocation.amount/report.metrics.totalBudget*100:0);return ['Budget',allocation.category,allocation.category,allocation.amount,'','','','','','','',percent,allocation.paid,allocation.cashRemaining,allocation.amount?allocation.paid/allocation.amount*100:0];}),
    [],
    ['Ticket tier summary for selected period'],
    ['Ticket tier','Quantity sold in period','Revenue in period (NGN)'],
    ...report.ticketSummary.map(tier=>[tier.name,tier.quantity,tier.revenue]),
  ];
  return rows.map(row=>row.map(serializeCsvCell).join(',')).join('\r\n');
}
