import {useEffect,useMemo,useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,BarChart3,ChevronLeft,ChevronRight,CircleDollarSign,Ticket,Wallet} from 'lucide-react';
import {Bar,Doughnut} from 'react-chartjs-2';
import {buildRecentActivity,paginateItems} from '../dashboard';
import {formatNaira} from '../money';

const palette=['#00F5FF','#FF2BD6','#B6FF00','#7C69FF','#FFB547','#63D6A8','#FF7C6B'];
const chartOptions={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a4a7b7',boxWidth:10,font:{size:9}}},tooltip:{backgroundColor:'#14161f',titleColor:'#fff',bodyColor:'#a4a7b7',borderColor:'#2c3040',borderWidth:1}},scales:{x:{grid:{display:false},ticks:{color:'#85899c',font:{size:9}}},y:{beginAtZero:true,grid:{color:'#20232e'},ticks:{color:'#85899c',font:{size:9},callback:(value:number)=>formatNaira(Number(value))}}}} as any;

function Metric({label,value,sub,icon,accent}:any){return <div className="kpi card"><div className="kpi-top"><span>{label}</span><div className={`kpi-icon ${accent}`}>{icon}</div></div><div className="kpi-value">{value}</div><div className="kpi-foot"><span>{sub}</span></div></div>}

function ChartPanel({title,subtitle,summary,columns,rows,children}:any){return <section className="panel dashboard-chart-panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div><p className="sr-only">{summary}</p>{children}{rows.length>0&&<details className="dashboard-chart-data"><summary>View chart data</summary><div className="table-scroll"><table><caption className="sr-only">{title}</caption><thead><tr>{columns.map((column:string)=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row:(string|number)[],index:number)=><tr key={index}>{row.map((value:string|number,column:number)=><td key={column}>{value}</td>)}</tr>)}</tbody></table></div></details>}</section>}

export default function OverviewDashboard({metrics,revenues,expenses,ticketSales,allocations}:any){
  const [activityPage,setActivityPage]=useState(0);
  const activity=useMemo(()=>buildRecentActivity({revenues,expenses,ticketSales}),[revenues,expenses,ticketSales]);
  const activityPageData=paginateItems(activity,activityPage,5);
  useEffect(()=>setActivityPage(current=>Math.min(current,Math.max(0,activityPageData.pageCount-1))),[activityPageData.pageCount]);

  const categoryData={labels:metrics.revenueByCategory.map((row:any)=>row.category),datasets:[{data:metrics.revenueByCategory.map((row:any)=>row.amount),backgroundColor:metrics.revenueByCategory.map((_:any,index:number)=>palette[index%palette.length]),borderWidth:0,hoverOffset:5}]};
  const allocationData={labels:metrics.spendingByAllocation.map((row:any)=>row.category),datasets:[{label:'Allocated',data:metrics.spendingByAllocation.map((row:any)=>row.amount),backgroundColor:'#292d39',borderRadius:4},{label:'Paid spend',data:metrics.spendingByAllocation.map((row:any)=>row.paid),backgroundColor:'#FF2BD6',borderRadius:4}]};
  const remainingData={labels:metrics.spendingByAllocation.map((row:any)=>row.category),datasets:[{label:'Available after commitments',data:metrics.spendingByAllocation.map((row:any)=>row.remainingAfterCommitments),backgroundColor:metrics.spendingByAllocation.map((_:any,index:number)=>palette[index%palette.length]),borderRadius:4}]};
  const tierData={labels:metrics.salesByTier.map((row:any)=>row.name),datasets:[{label:'Sold',data:metrics.salesByTier.map((row:any)=>row.sold),backgroundColor:'#00F5FF',borderRadius:4},{label:'Remaining',data:metrics.salesByTier.map((row:any)=>Math.max(0,row.capacity-row.sold)),backgroundColor:'#292d39',borderRadius:4}]};
  const financialData={labels:['Paid revenue','Paid expenses','Net'],datasets:[{label:'Amount',data:[metrics.paidRevenue,metrics.paidExpense,metrics.netProfitLoss],backgroundColor:['#00F5FF','#FF2BD6','#B6FF00'],borderRadius:4}]};
  const hasFinancialFlow=[metrics.paidRevenue,metrics.paidExpense,metrics.netProfitLoss].some((value:number)=>Number(value)!==0);
  const utilisation=metrics.budgetUtilizationPercent;

  return <>
    <div className="kpi-grid dashboard-kpis" aria-live="polite">
      <Metric label="TOTAL REVENUE" value={formatNaira(metrics.paidRevenue)} sub="Paid ticket and manual revenue" icon={<CircleDollarSign size={17}/>} accent="cyan"/>
      <Metric label="TOTAL EXPENSES" value={formatNaira(metrics.totalExpense)} sub="Paid, deposits and pending" icon={<ArrowDownRight size={17}/>} accent="pink"/>
      <Metric label="NET PROFIT / LOSS" value={formatNaira(metrics.netProfitLoss)} sub="Paid revenue less paid expenses" icon={<Activity size={17}/>} accent="lime"/>
      <Metric label="TICKETS SOLD" value={metrics.ticketsSold.toLocaleString()} sub={`${metrics.ticketCapacity.toLocaleString()} total capacity`} icon={<Ticket size={17}/>} accent="purple"/>
      <Metric label="TOTAL BUDGET" value={formatNaira(metrics.totalBudget)} sub={`${allocations.length} category allocations`} icon={<Wallet size={17}/>} accent="cyan"/>
      <Metric label="PAID EXPENSES" value={formatNaira(metrics.paidExpense)} sub="Cash already spent" icon={<ArrowDownRight size={17}/>} accent="pink"/>
      <Metric label="REMAINING BUDGET" value={formatNaira(metrics.remainingBudget)} sub="Budget less paid expenses" icon={<Wallet size={17}/>} accent="lime"/>
      <Metric label="AFTER COMMITMENTS" value={formatNaira(metrics.availableAfterCommitments)} sub="Less paid, pending and unpaid" icon={<BarChart3 size={17}/>} accent="purple"/>
      <Metric label="PENDING EXPENSES" value={formatNaira(metrics.pendingExpense)} sub="Awaiting payment or review" icon={<CircleDollarSign size={17}/>} accent="cyan"/>
      <Metric label="UNPAID EXPENSES" value={formatNaira(metrics.unpaidExpense)} sub="Recorded as unpaid" icon={<ArrowDownRight size={17}/>} accent="pink"/>
      <Metric label="BUDGET UTILIZATION" value={`${utilisation.toFixed(1)}%`} sub="Paid expenses ÷ total budget" icon={<BarChart3 size={17}/>} accent="lime"/>
    </div>

    <div className="dashboard-chart-grid">
      <ChartPanel title="Financial flow" subtitle="Paid revenue, paid expenses and net position" summary={`Bar chart showing paid revenue ${formatNaira(metrics.paidRevenue)}, paid expenses ${formatNaira(metrics.paidExpense)}, and net position ${formatNaira(metrics.netProfitLoss)}.`} columns={["Measure","Amount"]} rows={hasFinancialFlow?[["Paid revenue",formatNaira(metrics.paidRevenue)],["Paid expenses",formatNaira(metrics.paidExpense)],["Net position",formatNaira(metrics.netProfitLoss)]]:[]}>
        {hasFinancialFlow?<div className="dashboard-chart" role="img" aria-label={`Financial flow chart. ${formatNaira(metrics.paidRevenue)} paid revenue, ${formatNaira(metrics.paidExpense)} paid expenses, ${formatNaira(metrics.netProfitLoss)} net position.`}><Bar data={financialData} options={chartOptions}/></div>:<div className="dashboard-empty">No paid revenue or expenses recorded yet.</div>}
      </ChartPanel>
      <ChartPanel title="Revenue distribution" subtitle="Paid income by recorded category" summary={`Doughnut chart showing paid income by category: ${metrics.revenueByCategory.map((row:any)=>`${row.category}, ${formatNaira(row.amount)}`).join('; ')||'no paid revenue recorded'}.`} columns={["Category","Paid income"]} rows={metrics.revenueByCategory.map((row:any)=>[row.category,formatNaira(row.amount)])}>
        {categoryData.labels.length?<div className="dashboard-donut" role="img" aria-label={`Revenue distribution chart. ${metrics.revenueByCategory.map((row:any)=>`${row.category}: ${formatNaira(row.amount)}`).join('; ')}.`}><Doughnut data={categoryData} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#a4a7b7',boxWidth:10,font:{size:9}}}}}}/></div>:<div className="dashboard-empty">No paid revenue recorded yet.</div>}
      </ChartPanel>
      <ChartPanel title="Ticket sales by tier" subtitle="Tickets sold against remaining capacity" summary={`Bar chart showing tickets sold and remaining capacity by tier: ${metrics.salesByTier.map((row:any)=>`${row.name}, ${row.sold} sold, ${Math.max(0,row.capacity-row.sold)} remaining`).join('; ')||'no ticket tiers configured'}.`} columns={["Tier","Sold","Remaining"]} rows={metrics.salesByTier.map((row:any)=>[row.name,row.sold,Math.max(0,row.capacity-row.sold)])}>
        <div className="dashboard-chart" role="img" aria-label={`Ticket sales by tier. ${metrics.salesByTier.map((row:any)=>`${row.name}: ${row.sold} sold, ${Math.max(0,row.capacity-row.sold)} remaining`).join('; ')}.`}><Bar data={tierData} options={chartOptions}/></div>
      </ChartPanel>
      <ChartPanel title="Category allocation" subtitle="How the event budget is distributed" summary={`Doughnut chart showing event budget by allocation category: ${allocations.map((item:any)=>`${item.category}, ${formatNaira(item.amount)}`).join('; ')||'no budget allocations are set up'}.`} columns={["Category","Allocated"]} rows={allocations.map((item:any)=>[item.category,formatNaira(item.amount)])}>
        {allocations.length?<div className="dashboard-donut" role="img" aria-label={`Category allocation. ${allocations.map((item:any)=>`${item.category}: ${formatNaira(item.amount)}`).join('; ')}.`}><Doughnut data={{labels:allocations.map((item:any)=>item.category),datasets:[{data:allocations.map((item:any)=>item.amount),backgroundColor:allocations.map((_:any,index:number)=>palette[index%palette.length]),borderWidth:0}]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#a4a7b7',boxWidth:10,font:{size:9}}}}}}/></div>:<div className="dashboard-empty">No budget allocations are set up.</div>}
      </ChartPanel>
      <ChartPanel title="Actual spending vs allocation" subtitle="Paid expense totals compared with allocated amounts" summary={`Bar chart comparing allocated amounts and paid spending by category: ${metrics.spendingByAllocation.map((row:any)=>`${row.category}, ${formatNaira(row.amount)} allocated, ${formatNaira(row.paid)} spent`).join('; ')||'no budget allocations are set up'}.`} columns={["Category","Allocated","Paid spend"]} rows={metrics.spendingByAllocation.map((row:any)=>[row.category,formatNaira(row.amount),formatNaira(row.paid)])}>
        {metrics.spendingByAllocation.length?<div className="dashboard-chart" role="img" aria-label={`Actual spending compared with allocation. ${metrics.spendingByAllocation.map((row:any)=>`${row.category}: ${formatNaira(row.amount)} allocated, ${formatNaira(row.paid)} paid`).join('; ')}.`}><Bar data={allocationData} options={chartOptions}/></div>:<div className="dashboard-empty">No budget allocations are set up.</div>}
      </ChartPanel>
      <ChartPanel title="Remaining budget by category" subtitle="Allocation remaining after paid and committed expenses" summary={`Bar chart showing remaining funds after paid and committed expenses by category: ${metrics.spendingByAllocation.map((row:any)=>`${row.category}, ${formatNaira(row.remainingAfterCommitments)} remaining`).join('; ')||'no budget allocations are set up'}.`} columns={["Category","Remaining after commitments"]} rows={metrics.spendingByAllocation.map((row:any)=>[row.category,formatNaira(row.remainingAfterCommitments)])}>
        {metrics.spendingByAllocation.length?<div className="dashboard-chart" role="img" aria-label={`Remaining budget after commitments. ${metrics.spendingByAllocation.map((row:any)=>`${row.category}: ${formatNaira(row.remainingAfterCommitments)} remaining`).join('; ')}.`}><Bar data={remainingData} options={chartOptions}/></div>:<div className="dashboard-empty">No budget allocations are set up.</div>}
      </ChartPanel>
    </div>

    <section className="panel activity-panel dashboard-activity">
      <div className="panel-head"><div><h3>Recent activity</h3><p>Newest ticket sales, revenue and expenses · updates live</p></div><div className="activity-pagination"><span>{activityPageData.total?`${activityPageData.start+1}–${activityPageData.end} of ${activityPageData.total}`:'0 records'}</span><button className="icon-button" aria-label="Previous activity page" disabled={activityPageData.page===0} onClick={()=>setActivityPage(activityPageData.page-1)}><ChevronLeft size={16}/></button><button className="icon-button" aria-label="Next activity page" disabled={activityPageData.page+1>=activityPageData.pageCount} onClick={()=>setActivityPage(activityPageData.page+1)}><ChevronRight size={16}/></button></div></div>
      <div className="activity-list" aria-live="polite">{activityPageData.items.length?activityPageData.items.map((row:any)=><div className="activity-row" key={`${row.kind}:${row.id}`}><div className={`activity-icon ${row.kind==='ticket'?'revenue':row.kind}`}>
        {row.kind==='expense'?<ArrowDownRight size={15}/>:<ArrowUpRight size={15}/>}
      </div><div className="activity-desc"><b>{row.title||row.tierName||'Ticket sale'}</b><small>{row.agent||'Team member'} · {row.date||'Date unavailable'}{row.status&&row.status!=='Paid'?` · ${row.status}`:''}</small></div><div className={`activity-amount ${row.kind==='expense'?'expense':'revenue'}`}>{row.kind==='expense'?'−':'+'}{formatNaira(typeof row.total==='number'?row.total:row.amount)}</div></div>):<div className="dashboard-empty">No financial activity recorded yet.</div>}</div>
    </section>
  </>;
}
