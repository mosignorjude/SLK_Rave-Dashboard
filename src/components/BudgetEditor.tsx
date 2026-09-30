import {useMemo,useState,type FormEvent} from 'react';
import {collection,doc,getDocsFromServer,limit,query,runTransaction,serverTimestamp,where} from 'firebase/firestore';
import {Plus,Trash2,X} from 'lucide-react';
import type {Allocation} from '../types';
import {db} from '../firebase';
import {formatNaira,parseNaira} from '../money';
import {notifyError,userFacingError} from '../errorHandling';
import {configurationAuditChanges} from '../configurationChanges.mjs';
import {getReferencedAllocationIds,type BudgetExpense} from '../budget';
import ModalDialog from './ModalDialog';

type Row={id:string;category:string;percent:string;amount:string};
const BUDGET_ID='event-2026';

export default function BudgetEditor({allocations,total,budgetName,budgetExists,initialAdd=false,actor,actorId,onClose,ping}:{allocations:Allocation[];total:number;budgetName:string;budgetExists:boolean;initialAdd?:boolean;actor:string;actorId:string;onClose:()=>void;ping:(message:string)=>void}){
  const [rows,setRows]=useState<Row[]>(()=>{
    const current=allocations.map(x=>({id:x.id,category:x.category,percent:String(Number.isFinite(x.percent)?x.percent:(total?Number((x.amount/total*100).toFixed(2)):0)),amount:String(x.amount)}));
    return initialAdd&&budgetExists?[...current,{id:crypto.randomUUID(),category:'',percent:'',amount:''}]:current;
  });
  const [budget,setBudget]=useState(String(total||''));
  const [name,setName]=useState(budgetName||'SLK Rave 2026');
  const [busy,setBusy]=useState(false);
  const allocated=useMemo(()=>rows.reduce((sum,row)=>sum+(Number(row.amount)||0),0),[rows]);
  const percentage=useMemo(()=>rows.reduce((sum,row)=>sum+(Number(row.percent)||0),0),[rows]);
  const totalAmount=Number(budget)||0;

  function changeTotal(value:string){
    setBudget(value);
    const nextTotal=Number(value);
    if(!Number.isSafeInteger(nextTotal)||nextTotal<=0)return;
    setRows(old=>old.map(row=>{
      const pct=Number(row.percent)||0;
      return {...row,amount:String(Math.round(nextTotal*pct/100))};
    }));
  }
  function changePercent(index:number,value:string){
    const pct=Number(value);
    setRows(old=>old.map((row,i)=>i!==index?row:{...row,percent:value,amount:Number.isFinite(pct)&&totalAmount>0?String(Math.round(totalAmount*pct/100)):''}));
  }
  function addRow(){setRows(old=>[...old,{id:crypto.randomUUID(),category:'',percent:'',amount:''}]);}
  function removeRow(index:number){setRows(old=>old.filter((_,i)=>i!==index));}

  async function save(e:FormEvent){
    e.preventDefault();
    if(!db){ping('This app is not connected. Refresh the page or contact the administrator.');return;}
    const firestore=db;
    setBusy(true);
    try{
      const cleanName=name.trim();
      const amount=parseNaira(budget);
      if(cleanName.length<2||cleanName.length>100)throw userFacingError('Enter a budget name between 2 and 100 characters.');
      if(!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000_000_000)throw userFacingError('Enter a whole Naira budget between ₦1 and ₦1 trillion.');
      const next=rows.map(row=>({id:row.id,category:row.category.trim(),percent:Number(row.percent),amount:parseNaira(row.amount)}));
      if(next.length>100)throw userFacingError('A budget can have up to 100 allocation categories.');
      const normalized=next.map(row=>row.category.toLocaleLowerCase());
      if(next.some(row=>row.category.length<2||row.category.length>100))throw userFacingError('Each allocation category must be between 2 and 100 characters.');
      if(new Set(normalized).size!==normalized.length)throw userFacingError('Each allocation category must have a unique name.');
      if(next.some(row=>!Number.isFinite(row.percent)||row.percent<0||row.percent>100||!Number.isSafeInteger(row.amount)||row.amount<0||row.amount>1_000_000_000_000))throw userFacingError('Check the allocation percentages and Naira amounts.');
      if(next.reduce((sum,row)=>sum+row.percent,0)>100.05||next.reduce((sum,row)=>sum+row.amount,0)>amount)throw userFacingError('Allocation percentages and amounts cannot exceed the total budget.');
      const keptAllocationIds=new Set(next.map(row=>row.id));
      const removedAllocationIds=budgetExists?allocations.filter(item=>!keptAllocationIds.has(item.id)).map(item=>item.id):[];
      for(let offset=0;offset<removedAllocationIds.length;offset+=30){
        const allocationIds=removedAllocationIds.slice(offset,offset+30);
        const linkedExpenses=await getDocsFromServer(query(collection(firestore,'expenses'),where('budgetAllocationId','in',allocationIds),limit(1)));
        const referencedIds=getReferencedAllocationIds(linkedExpenses.docs.map(snapshot=>snapshot.data() as BudgetExpense),allocationIds);
        if(referencedIds.length)throw userFacingError('An allocation cannot be removed while expenses are assigned to it. Reassign those expenses first, then try again.');
      }
      const enteredReason=window.prompt('Optional reason for this budget change (up to 500 characters):'),reason=String(enteredReason||'').trim();
      if(reason.length>500)throw userFacingError('Reason must be 500 characters or fewer.');
      const budgetRef=doc(firestore,'budgets',BUDGET_ID),auditId=crypto.randomUUID();
      const allocationRefs=allocations.map(item=>doc(firestore,'budgetAllocations',item.id));
      const nextAllocationRefs=next.map(item=>doc(firestore,'budgetAllocations',item.id));
      const allAllocationRefs=[...new Map([...allocationRefs,...nextAllocationRefs].map(ref=>[ref.id,ref])).values()];
      await runTransaction(firestore,async transaction=>{
        const budgetSnapshot=await transaction.get(budgetRef);
        const allocationSnapshots=await Promise.all(allAllocationRefs.map(ref=>transaction.get(ref)));
        if(budgetExists&&!budgetSnapshot.exists())throw userFacingError('The budget was removed. Refresh the page and create it again.');
        if(!budgetExists&&budgetSnapshot.exists())throw userFacingError('A budget was created in another session. Refresh the page to continue.');
        const snapshotsById=new Map(allocationSnapshots.map(snapshot=>[snapshot.id,snapshot]));
        const existing=new Set(allocationSnapshots.filter(item=>item.exists()).map(item=>item.id));
        const now=serverTimestamp();
        const kept=new Set(next.map(row=>row.id));
        const pick=(data:any,fields:string[])=>data?Object.fromEntries(fields.filter(field=>Object.hasOwn(data,field)).map(field=>[field,data[field]])):null;
        const budgetBefore=budgetSnapshot.exists()?budgetSnapshot.data():null;
        const changes=configurationAuditChanges([
          {path:`budgets/${BUDGET_ID}`,before:pick(budgetBefore,['name','totalAmount','year']),after:{name:cleanName,totalAmount:amount,year:2026}},
          ...next.map(row=>{
            const snapshot=snapshotsById.get(row.id),before=snapshot?.exists()?snapshot.data():null;
            const nextData={...(before||{}),budgetId:BUDGET_ID,category:row.category,percent:row.percent,amount:row.amount};
            return {path:`budgetAllocations/${row.id}`,before:pick(before,['budgetId','categoryId','category','percent','amount']),after:pick(nextData,['budgetId','categoryId','category','percent','amount'])};
          }),
          ...(budgetExists?allocationRefs.filter(ref=>!kept.has(ref.id)).map(ref=>{
            const snapshot=snapshotsById.get(ref.id);
            return {path:`budgetAllocations/${ref.id}`,before:pick(snapshot?.exists()?snapshot.data():null,['budgetId','categoryId','category','percent','amount']),after:null};
          }):[]),
        ]);
        if(!Object.keys(changes).length)return;
        transaction.set(budgetRef,{name:cleanName,totalAmount:amount,year:2026,updatedAt:now,...(!budgetExists?{createdAt:now}:{})},{merge:true});
        for(const row of next){
          transaction.set(doc(firestore,'budgetAllocations',row.id),{budgetId:BUDGET_ID,category:row.category,percent:row.percent,amount:row.amount,updatedAt:now,...(!existing.has(row.id)?{createdAt:now}:{})},{merge:true});
        }
        if(budgetExists)for(const old of allocationRefs){if(!kept.has(old.id))transaction.delete(old);}
        transaction.set(doc(firestore,'settings','workspace'),{auditLogId:auditId,updatedAt:now},{merge:true});
        transaction.set(doc(firestore,'activityLogs',auditId),{actor,actorId,action:'configuration.updated',label:'configuration.updated',targetType:'settings',targetId:'workspace',createdAt:now,changes,...(reason?{reason}:{})});
      });
      ping(budgetExists?'Budget and allocations updated.':'Budget created. You can now add allocations.');
      onClose();
    }catch(error:unknown){notifyError('save event budget',error,ping,'Could not save the budget. Check the values and try again.');}
    finally{setBusy(false);}
  }

  return <ModalDialog onClose={onClose} labelledBy="event-budget-dialog-title" className="budget-editor-modal">
    <div className="modal-head"><div><div className="eyebrow">ADMIN CONTROLS</div><h2 id="event-budget-dialog-title">{budgetExists?'Manage event budget':'Create event budget'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X/></button></div>
    <form className="budget-editor-form" onSubmit={save}><div className="modal-body">
      <label>Budget name<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label>
      <label>Total budget (₦)<input type="number" min="1" step="1" value={budget} onChange={e=>changeTotal(e.target.value)} required/></label>
      {budgetExists&&<>
        <div className="panel-head"><div><h3>Category allocations</h3><p>Amounts update automatically from the percentage.</p></div><button type="button" className="btn secondary" onClick={addRow}><Plus size={15}/> Add allocation</button></div>
        {rows.map((row,index)=><div className="form-two allocation-edit-row" key={row.id}>
          <label>Category<input value={row.category} onChange={e=>setRows(old=>old.map((item,i)=>i===index?{...item,category:e.target.value}:item))} maxLength={100} placeholder="e.g. Sound and lighting" required/></label>
          <label>Allocation (%)<input type="number" min="0" max="100" step="0.01" value={row.percent} onChange={e=>changePercent(index,e.target.value)} required/></label>
          <label>Amount (₦)<input type="text" value={formatNaira(Number(row.amount)||0)} readOnly aria-label={`${row.category||'Category'} amount in Naira`}/></label>
          <button type="button" className="icon-button danger" onClick={()=>removeRow(index)} aria-label={`Remove ${row.category||'allocation'}`}><Trash2 size={16}/></button>
        </div>)}
        {rows.length===0&&<div className="empty">No allocations yet. Add categories after creating the budget.</div>}
        <div className="callout"><span>Allocated: <b>{formatNaira(allocated)}</b> ({percentage.toFixed(2)}%) · Unallocated: <b>{formatNaira(Math.max(0,totalAmount-allocated))}</b></span></div>
      </>}
      {!budgetExists&&<div className="callout"><span>Create the event budget first. You can add allocation categories after it is saved.</span></div>}
    </div><div className="modal-foot"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button disabled={busy} className="btn primary">{busy?'Saving…':budgetExists?'Save changes':'Create budget'}</button></div></form>
  </ModalDialog>;
}
