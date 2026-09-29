import {Download,RotateCcw} from 'lucide-react';
import {formatNaira} from '../money';

export default function Reports({report,startDate,endDate,setStartDate,setEndDate,onExport}:any){
  const metrics=report.metrics;
  const period=startDate||endDate?`${startDate||'Any date'} to ${endDate||'Any date'}`:'All dates';
  return <>
    <section className="panel report-filters" aria-label="Report date filters">
      <div className="report-filter-fields">
        <label>Start date<input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)} aria-label="Report start date"/></label>
        <label>End date<input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)} aria-label="Report end date"/></label>
        <button className="btn secondary" onClick={()=>{setStartDate('');setEndDate('')}} disabled={!startDate&&!endDate}><RotateCcw size={14}/> Clear dates</button>
      </div>
      <div className="report-period">Showing: <b>{period}</b></div>
      {report.error&&<div className="report-filter-error" role="alert">{report.error}</div>}
    </section>
    <div className="report-summary">
      <div className="panel"><span>PAID REVENUE</span><b>{formatNaira(metrics.paidRevenue)}</b></div>
      <div className="panel"><span>PAID EXPENSES</span><b>{formatNaira(metrics.paidExpense)}</b></div>
      <div className="panel"><span>NET PROFIT / LOSS</span><b className="cyan-text">{formatNaira(metrics.netProfitLoss)}</b></div>
      <div className="panel"><span>BUDGET UTILIZATION</span><b>{metrics.budgetUtilizationPercent.toFixed(1)}%</b></div>
    </div>
    <div className="report-summary report-commitment-summary">
      <div className="panel"><span>TOTAL EXPENSES</span><b>{formatNaira(metrics.totalExpense)}</b></div>
      <div className="panel"><span>PENDING EXPENSES</span><b>{formatNaira(metrics.pendingExpense)}</b></div>
      <div className="panel"><span>UNPAID EXPENSES</span><b>{formatNaira(metrics.unpaidExpense)}</b></div>
      <div className="panel"><span>TICKETS SOLD IN RANGE</span><b>{report.ticketSummary.reduce((total:any,row:any)=>total+row.quantity,0).toLocaleString()}</b></div>
    </div>
    <div className="panel report-panel">
      <div className="panel-head"><div><h3>Financial report</h3><p>{period} · generated {new Date().toLocaleDateString('en-GB')}</p></div><button className="btn primary" disabled={Boolean(report.error)} onClick={onExport}><Download size={15}/> Download filtered CSV</button></div>
      {!report.error&&<>
        <h4>Budget allocation summary</h4>
        <div className="table-scroll"><table><thead><tr><th>CATEGORY</th><th>ALLOCATION %</th><th>ALLOCATED</th><th>PAID SPEND IN RANGE</th><th>REMAINING AFTER PAID SPEND</th><th>UTILIZATION IN RANGE</th></tr></thead><tbody>
          {report.allocations.length?report.allocations.map((allocation:any)=>{const percent=Number.isFinite(allocation.percent)?allocation.percent:(metrics.totalBudget?allocation.amount/metrics.totalBudget*100:0);return <tr key={allocation.id}><td>{allocation.category}</td><td>{percent.toFixed(2)}%</td><td>{formatNaira(allocation.amount)}</td><td>{formatNaira(allocation.paid)}</td><td>{formatNaira(allocation.cashRemaining)}</td><td>{allocation.amount?`${(allocation.paid/allocation.amount*100).toFixed(1)}%`:'—'}</td></tr>}):<tr><td colSpan={6} className="empty">No budget allocations are available.</td></tr>}
        </tbody></table></div>
        <h4>Ticket sales in selected period</h4>
        <div className="table-scroll"><table><thead><tr><th>TIER</th><th>TICKETS SOLD IN RANGE</th><th>TICKET REVENUE IN RANGE</th></tr></thead><tbody>
          {report.ticketSummary.map((tier:any)=><tr key={tier.id}><td>{tier.name}</td><td>{tier.quantity.toLocaleString()}</td><td>{formatNaira(tier.revenue)}</td></tr>)}
          {!report.ticketSummary.length&&<tr><td colSpan={3} className="empty">No ticket tiers are configured.</td></tr>}
        </tbody></table></div>
        {!report.revenues.length&&!report.expenses.length&&!report.ticketSales.length&&<div className="dashboard-empty">No revenue, expenses, or ticket sales match this date range.</div>}
      </>}
    </div>
  </>;
}
