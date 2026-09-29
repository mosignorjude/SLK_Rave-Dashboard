import {useMemo,useState} from 'react';
import {collection,getDocs,limit,orderBy,query,startAfter} from 'firebase/firestore';
import {Activity} from 'lucide-react';
import {notifyError} from '../errorHandling';
import {formatNaira} from '../money';

const PAGE_SIZE=40;
const labels:Record<string,string>={
 'workspace.initialized':'Workspace initialized','ticket.sale':'Ticket sale recorded',
 'expense.created':'Expense recorded','expense.updated':'Expense updated','expense.deleted':'Expense deleted',
 'expense.approved':'Expense approved','expense.rejected':'Expense rejected',
 'revenue.created':'Revenue recorded','revenue.updated':'Revenue updated','revenue.deleted':'Revenue deleted',
 'user.signup':'Access requested','user.master_admin_claimed':'Master Admin activated',
 'user.approve':'User approved','user.reject':'User request rejected','user.role':'User role updated',
 'user.suspend':'User suspended','user.reactivate':'User reactivated',
};

export default function ActivityPage({logs,db,cursor,ping}:any){
 const [olderLogs,setOlderLogs]=useState<any[]>([]),[olderCursor,setOlderCursor]=useState<any>(null),[hasMore,setHasMore]=useState(true),[loading,setLoading]=useState(false);
 const allLogs=useMemo(()=>{
  const unique=new Map<string,any>();
  [...logs,...olderLogs].forEach((log:any,index:number)=>unique.set(log.id||`${log.action}-${log.targetId}-${index}`,log));
  return [...unique.values()].sort((a:any,b:any)=>{
   const aTime=a.createdAt?.toMillis?.()??a.createdAt?.seconds*1000??0;
   const bTime=b.createdAt?.toMillis?.()??b.createdAt?.seconds*1000??0;
   return bTime-aTime;
  });
 },[logs,olderLogs]);
 async function loadOlder(){
  const after=olderCursor??cursor;
  if(!db||!after||loading||!hasMore)return;
  setLoading(true);
  try{
   const page=await getDocs(query(collection(db,'activityLogs'),orderBy('createdAt','desc'),startAfter(after),limit(PAGE_SIZE)));
   const records=page.docs.map(d=>({id:d.id,...d.data()}));
   setOlderLogs(previous=>{
    const byId=new Map(previous.map((item:any)=>[item.id,item]));
    records.forEach(item=>byId.set(item.id,item));
    return [...byId.values()];
   });
   if(page.docs.length)setOlderCursor(page.docs[page.docs.length-1]);
   setHasMore(page.docs.length===PAGE_SIZE);
  }catch(error:unknown){notifyError('load older audit activity',error,ping,'Older audit events could not be loaded. Check your connection and permissions.');}
  finally{setLoading(false);}
 }
 const formatDate=(value:any)=>{
  if(!value)return 'Just now';
  const date=typeof value?.toDate==='function'?value.toDate():typeof value?.seconds==='number'?new Date(value.seconds*1000):new Date(value);
  return Number.isNaN(date.getTime())?'Just now':date.toLocaleString();
 };
 return <div className="panel table-panel"><div className="panel-head"><div><h3>Audit trail</h3><p>Append-only records of key system activity</p></div><span className="counter">{allLogs.length} EVENTS SHOWN</span></div>
  <div className="activity-list full">{allLogs.length?allLogs.map((log:any,index:number)=><div className="activity-row" key={log.id||index}><div className="activity-icon revenue"><Activity size={15}/></div><div className="activity-desc"><b>{labels[log.action]||'Activity recorded'}</b><small>{log.actor||'System'} · {formatDate(log.createdAt)}{log.targetType||log.targetId?` · ${[log.targetType,log.targetId].filter(Boolean).join(' / ')}`:''}</small>{typeof log.previousAmount==='number'&&typeof log.newAmount==='number'&&<small>Amount changed to {formatNaira(log.newAmount)} from <s>{formatNaira(log.previousAmount)}</s></small>}</div><span className="audit-tag">{log.action}</span></div>):<div className="empty">No audit events recorded yet.</div>}</div>
  {cursor&&<div className="table-actions"><button className="btn secondary" onClick={loadOlder} disabled={loading||!hasMore}>{loading?'Loading…':hasMore?'Load older events':'No older events'}</button></div>}
 </div>;
}
