import {useEffect,useMemo,useRef,useState} from 'react';
import {collection,getDocs,limit,onSnapshot,orderBy,query,startAfter,Timestamp,where} from 'firebase/firestore';
import {Activity,ChevronDown,Download} from 'lucide-react';
import {notifyError} from '../errorHandling';
import {formatNaira} from '../money';
import {serializeCsvCell} from '../csv';

const PAGE_SIZE=40;
const MAX_EXPORT_ROWS=5000,MAX_EXPORT_BYTES=8*1024*1024;
const categoryActions:Record<string,string[]>={
 finance:['expense.created','expense.updated','expense.deleted','revenue.created','revenue.updated','revenue.deleted'],
 tickets:['ticket.sale'],
 users:['user.signup','user.master_admin_claimed','user.approve','user.reject','user.role','user.suspend','user.reactivate'],
 administration:['configuration.updated','workspace.initialized'],
};
const labels:Record<string,string>={
 'workspace.initialized':'Workspace initialized','ticket.sale':'Ticket sale recorded',
 'expense.created':'Expense recorded','expense.updated':'Expense updated','expense.deleted':'Expense deleted',
 'expense.approved':'Expense approved','expense.rejected':'Expense rejected',
 'revenue.created':'Revenue recorded','revenue.updated':'Revenue updated','revenue.deleted':'Revenue deleted',
 'user.signup':'Access requested','user.master_admin_claimed':'Master Admin activated',
 'user.approve':'User approved','user.reject':'User request rejected','user.role':'User role updated',
 'user.suspend':'User suspended','user.reactivate':'User reactivated',
};
const auditFieldLabels:Record<string,string>={title:'Title',category:'Category',budgetAllocationId:'Budget allocation',amount:'Amount',status:'Status',date:'Date',method:'Payment method',agent:'Agent',createdBy:'Created by'};
function auditValue(field:string,side:any){if(!side||side.present!==true)return 'not set';const value=side.value;if(value===null||value===undefined)return 'none';return field==='amount'&&typeof value==='number'?formatNaira(value):String(value)}
function auditSnapshotValue(field:string,value:any){if(value===null||value===undefined)return 'none';return field==='amount'&&typeof value==='number'?formatNaira(value):String(value)}
function hasAuditDetails(log:any){return Boolean((log.changes&&Object.keys(log.changes).length)||(log.snapshot&&Object.keys(log.snapshot).length)||(typeof log.reason==='string'&&log.reason.trim())||(typeof log.previousAmount==='number'&&typeof log.newAmount==='number'))}
function nigeriaDayStart(value:string){return Timestamp.fromDate(new Date(`${value}T00:00:00.000+01:00`))}
function nigeriaDayAfter(value:string){const next=new Date(`${value}T00:00:00.000Z`);next.setUTCDate(next.getUTCDate()+1);return Timestamp.fromDate(new Date(`${next.toISOString().slice(0,10)}T00:00:00.000+01:00`))}
function auditCsvTimestamp(value:any){const date=typeof value?.toDate==='function'?value.toDate():typeof value?.seconds==='number'?new Date(value.seconds*1000):null;return date&&!Number.isNaN(date.getTime())?date.toLocaleString('en-NG',{timeZone:'Africa/Lagos',hour12:false}):''}
function auditCsvRow(log:any){return [log.id,log.actorId,log.actor,log.action,log.targetType,log.targetId,auditCsvTimestamp(log.createdAt),log.reason,log.changes?JSON.stringify(log.changes):'',log.snapshot?JSON.stringify(log.snapshot):'',log.previousAmount,log.newAmount].map(serializeCsvCell).join(',')}

export default function ActivityPage({logs,db,cursor,ping}:any){
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [olderLogs,setOlderLogs]=useState<any[]>([]),[olderCursor,setOlderCursor]=useState<any>(null),[olderKey,setOlderKey]=useState(JSON.stringify(['all','','','',''])),[hasMore,setHasMore]=useState(true),[loading,setLoading]=useState(false);
 const [category,setCategory]=useState('all'),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[actorDraft,setActorDraft]=useState(''),[actorId,setActorId]=useState(''),[targetType,setTargetType]=useState('');
 const [filteredLogs,setFilteredLogs]=useState<any[]>([]),[filteredCursor,setFilteredCursor]=useState<any>(null),[filteredKey,setFilteredKey]=useState(''),[filterError,setFilterError]=useState(''),[filterLoading,setFilterLoading]=useState(false);
 const [exporting,setExporting]=useState(false),[exportStatus,setExportStatus]=useState('');
 const pingRef=useRef(ping);useEffect(()=>{pingRef.current=ping},[ping]);
 useEffect(()=>{const timer=window.setTimeout(()=>setActorId(actorDraft.trim()),300);return()=>window.clearTimeout(timer)},[actorDraft]);
 const actorPending=actorDraft.trim()!==actorId,filtering=category!=='all'||Boolean(dateFrom)||Boolean(dateTo)||Boolean(actorId)||Boolean(targetType),invalidRange=Boolean(dateFrom&&dateTo&&dateFrom>dateTo);
 const filterKey=JSON.stringify([category,dateFrom,dateTo,actorId,targetType]),filterKeyRef=useRef(filterKey);
 const queryConstraints=useMemo(()=>{
  const result:any[]=[];
  if(categoryActions[category])result.push(where('action','in',categoryActions[category]));
  if(actorId)result.push(where('actorId','==',actorId));
  if(targetType)result.push(where('targetType','==',targetType));
  if(dateFrom)result.push(where('createdAt','>=',nigeriaDayStart(dateFrom)));
  if(dateTo)result.push(where('createdAt','<',nigeriaDayAfter(dateTo)));
  return result;
 },[actorId,category,dateFrom,dateTo,targetType]);
 const filteredQuery=useMemo(()=>db&&filtering&&!invalidRange?query(collection(db,'activityLogs'),...queryConstraints,orderBy('createdAt','desc'),limit(PAGE_SIZE)):null,[db,filtering,invalidRange,queryConstraints]);
 useEffect(()=>{filterKeyRef.current=filterKey;setOlderLogs([]);setOlderCursor(null);setOlderKey(filterKey);setHasMore(true);setLoading(false);},[filterKey]);
 useEffect(()=>{
  if(!filtering){setFilteredLogs([]);setFilteredCursor(null);setFilterError('');setFilterLoading(false);return}
  if(!db||invalidRange){setFilteredLogs([]);setFilteredCursor(null);setFilterError('');setFilterLoading(false);return}
  if(!filteredQuery)return;
  setFilterError('');setFilterLoading(true);
  return onSnapshot(filteredQuery,page=>{
   setFilteredLogs(page.docs.map(item=>({id:item.id,...item.data()})));
   setFilteredCursor(page.docs.at(-1)??null);
   setFilteredKey(filterKey);
   setHasMore(page.docs.length===PAGE_SIZE);
   setFilterLoading(false);
  },error=>{setFilterLoading(false);setFilterError('Filtered audit events could not be loaded. Check your connection and permissions.');notifyError('load filtered audit activity',error,pingRef.current,'Filtered audit events could not be loaded. Check your connection and permissions.');});
 },[db,filtering,filterKey,filteredQuery,invalidRange]);
 const currentLogs=filtering?(filteredKey===filterKey?filteredLogs:[]):logs,currentCursor=filtering?(filteredKey===filterKey?filteredCursor:null):cursor;
 const allLogs=useMemo(()=>{
  const unique=new Map<string,any>();
  [...currentLogs,...(olderKey===filterKey?olderLogs:[])].forEach((log:any,index:number)=>unique.set(log.id||`${log.action}-${log.targetId}-${index}`,log));
  return [...unique.values()].sort((a:any,b:any)=>{
   const aTime=a.createdAt?.toMillis?.()??a.createdAt?.seconds*1000??0;
   const bTime=b.createdAt?.toMillis?.()??b.createdAt?.seconds*1000??0;
   return bTime-aTime;
  });
 },[currentLogs,filterKey,olderKey,olderLogs]);
 async function loadOlder(){
  const after=olderCursor??currentCursor;
  if(!db||!after||loading||!hasMore||invalidRange)return;
  const requestedFilterKey=filterKey;
  setLoading(true);
  try{
   const page=await getDocs(query(collection(db,'activityLogs'),...queryConstraints,orderBy('createdAt','desc'),startAfter(after),limit(PAGE_SIZE)));
   if(filterKeyRef.current!==requestedFilterKey)return;
   const records=page.docs.map(d=>({id:d.id,...d.data()}));
   setOlderLogs(previous=>{
    const byId=new Map(previous.map((item:any)=>[item.id,item]));
    records.forEach(item=>byId.set(item.id,item));
    return [...byId.values()];
   });
   if(page.docs.length){setOlderCursor(page.docs[page.docs.length-1]);setOlderKey(requestedFilterKey)}
   setHasMore(page.docs.length===PAGE_SIZE);
  }catch(error:unknown){notifyError('load older audit activity',error,ping,'Older audit events could not be loaded. Check your connection and permissions.');}
  finally{setLoading(false);}
 }
 async function exportFiltered(){
  if(!db||exporting||invalidRange)return;
  const requestedFilterKey=filterKey,requestedConstraints=[...queryConstraints],eventLines:string[]=[];
  let after:any=null,totalBytes=0,truncated=false,finished=false;
  setExporting(true);setExportStatus('Preparing filtered audit export…');
  try{
   while(!finished&&eventLines.length<MAX_EXPORT_ROWS){
    const pageSize=Math.min(PAGE_SIZE,MAX_EXPORT_ROWS-eventLines.length),constraints:any[]=[...requestedConstraints,orderBy('createdAt','desc')];
    if(after)constraints.push(startAfter(after));
    constraints.push(limit(pageSize));
    const page=await getDocs(query(collection(db,'activityLogs'),...constraints));
    if(filterKeyRef.current!==requestedFilterKey)throw new Error('Filters changed while preparing the export. Start the export again.');
    for(const document of page.docs){
     const line=auditCsvRow({id:document.id,...document.data()}),lineBytes=new Blob([line,'\r\n']).size;
     if(totalBytes+lineBytes>MAX_EXPORT_BYTES){truncated=true;finished=true;break}
     eventLines.push(line);totalBytes+=lineBytes;
    }
    if(page.docs.length)after=page.docs.at(-1);
    if(page.docs.length<pageSize)finished=true;
   }
   if(eventLines.length===MAX_EXPORT_ROWS&&!truncated&&after){
    const probe=await getDocs(query(collection(db,'activityLogs'),...requestedConstraints,orderBy('createdAt','desc'),startAfter(after),limit(1)));
    if(filterKeyRef.current!==requestedFilterKey)throw new Error('Filters changed while preparing the export. Start the export again.');
    truncated=!probe.empty;
   }
   const generatedAt=new Date(),dateLabel=generatedAt.toLocaleDateString('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}),filterLabel=[`Category: ${category}`,`From: ${dateFrom||'any'}`,`To: ${dateTo||'any'}`,`Actor UID: ${actorId||'any'}`,`Resource type: ${targetType||'any'}`].join('; ');
   const metadata=[['Export','SLK Rave Finance Center Activity Log'],['Generated at (Africa/Lagos)',generatedAt.toLocaleString('en-NG',{timeZone:'Africa/Lagos',hour12:false})],['Timezone','Africa/Lagos'],['Filters',filterLabel],['Events exported',eventLines.length],['Export status',truncated?`Limited to the first ${eventLines.length} matching events; additional events were not exported.`:'Complete for matching events returned during this paginated read. Events added while export was running may not be included.'],[],['Event ID','Actor UID','Actor name','Action','Resource type','Resource ID','Timestamp (Africa/Lagos)','Reason','Changed fields (JSON)','Deleted snapshot (JSON)','Previous amount (NGN)','New amount (NGN)']];
   const csv=[...metadata.map(row=>row.map(serializeCsvCell).join(',')),...eventLines].join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=`SLK_Rave_Audit_${dateLabel}.csv`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setExportStatus(truncated?`Downloaded ${eventLines.length.toLocaleString()} events. Narrow the filters to export the remaining history.`:`Downloaded ${eventLines.length.toLocaleString()} matching events.`);
  }catch(error:unknown){setExportStatus('');notifyError('export audit activity',error,ping,'Could not export filtered audit activity. Check your connection, filters, and permissions.');}
  finally{setExporting(false);}
 }
 const formatDate=(value:any)=>{
  if(!value)return 'Time unavailable';
  const date=typeof value?.toDate==='function'?value.toDate():typeof value?.seconds==='number'?new Date(value.seconds*1000):new Date(value);
  return Number.isNaN(date.getTime())?'Time unavailable':date.toLocaleString('en-NG',{timeZone:'Africa/Lagos'});
 };
 return <div className="panel table-panel"><div className="panel-head"><div><h3>Audit trail</h3><p>Append-only records of key system activity</p></div><div className="activity-export"><span className="counter">{allLogs.length} EVENTS SHOWN</span><button className="btn secondary activity-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="activity-filter-panel" onClick={()=>setFiltersOpen(open=>!open)}><span>Filter</span><ChevronDown size={14} className={filtersOpen?'is-open':''} aria-hidden="true"/></button><button className="btn secondary" type="button" onClick={exportFiltered} disabled={exporting||invalidRange||actorPending}><Download size={14}/>{exporting?'Preparing CSV…':'Export filtered CSV'}</button></div></div>
  <div id="activity-filter-panel" className={`activity-filter-panel${filtersOpen?' is-open':''}`} aria-hidden={!filtersOpen} inert={!filtersOpen}><div className="activity-filter-panel-inner"><div className="activity-filters" aria-label="Audit trail filters"><label>Category<select value={category} onChange={event=>setCategory(event.target.value)}><option value="all">All activity</option><option value="finance">Finance</option><option value="tickets">Ticket sales</option><option value="users">User access</option><option value="administration">Administration</option></select></label><label>From (Nigeria time)<input type="date" value={dateFrom} max={dateTo||undefined} onChange={event=>setDateFrom(event.target.value)}/></label><label>To (Nigeria time)<input type="date" value={dateTo} min={dateFrom||undefined} onChange={event=>setDateTo(event.target.value)}/></label><label>Actor UID<input type="search" value={actorDraft} placeholder="Exact Firebase UID" onChange={event=>setActorDraft(event.target.value)} /></label><label>Resource type<select value={targetType} onChange={event=>setTargetType(event.target.value)}><option value="">All resource types</option><option value="expenses">Expenses</option><option value="revenues">Revenues</option><option value="ticketSales">Ticket sales</option><option value="users">Users</option><option value="settings">Settings</option></select></label>{filtering&&<button className="text-action" type="button" onClick={()=>{setCategory('all');setDateFrom('');setDateTo('');setActorDraft('');setActorId('');setTargetType('')}}>Clear filters</button>}</div></div></div>
  {invalidRange&&<div className="empty">Choose a valid date range. The start date must not be after the end date.</div>}
  {filterError&&<div className="empty" role="alert">{filterError}</div>}
  {exportStatus&&<div className="empty" role="status" aria-live="polite">{exportStatus}</div>}
  <div className="activity-list full">{allLogs.length?allLogs.map((log:any,index:number)=>{
   const changes=log.changes&&typeof log.changes==='object'?Object.entries(log.changes):[],snapshot=log.snapshot&&typeof log.snapshot==='object'?Object.entries(log.snapshot):[],showLegacyAmount=typeof log.previousAmount==='number'&&typeof log.newAmount==='number'&&!log.changes?.amount;
   return <div className="activity-row" key={log.id||index}>
    <div className="activity-icon revenue"><Activity size={15}/></div>
    <div className="activity-desc"><b>{labels[log.action]||'Activity recorded'}</b><small>{log.actor||'System'} · {formatDate(log.createdAt)}{log.targetType||log.targetId?` · ${[log.targetType,log.targetId].filter(Boolean).join(' / ')}`:''}</small>
     {hasAuditDetails(log)&&<details className="audit-details"><summary>Event details</summary><div className="audit-detail-list">
      {showLegacyAmount&&<small>Amount: {formatNaira(log.previousAmount)} → {formatNaira(log.newAmount)}</small>}
      {changes.map(([field,change]:[string,any])=>auditFieldLabels[field]&&<small key={field}>{auditFieldLabels[field]}: {auditValue(field,change?.before)} → {auditValue(field,change?.after)}</small>)}
      {snapshot.map(([field,value]:[string,any])=>auditFieldLabels[field]&&<small key={`snapshot-${field}`}>Deleted record · {auditFieldLabels[field]}: {auditSnapshotValue(field,value)}</small>)}
      {typeof log.reason==='string'&&log.reason.trim()&&<small>Reason: {log.reason}</small>}
     </div></details>}
    </div><span className="audit-tag">{log.action}</span>
   </div>;
  }):<div className="empty">{filterLoading?'Loading matching events…':filtering?'No audit events match these filters.':'No audit events recorded yet.'}</div>}</div>
  {currentCursor&&!invalidRange&&<div className="table-actions"><button className="btn secondary" onClick={loadOlder} disabled={loading||!hasMore}>{loading?'Loading…':hasMore?'Load older events':'No older events'}</button></div>}
 </div>;
}
