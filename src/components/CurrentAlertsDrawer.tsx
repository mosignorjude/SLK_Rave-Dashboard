import {useEffect,useRef} from 'react';
import {AlertTriangle,Bell,Ticket,Trash2,Wallet,X} from 'lucide-react';
import type {CurrentAlert} from '../notificationPolicy.mjs';

type Props={
  alerts:CurrentAlert[];
  loading:boolean;
  error:boolean;
  stale:boolean;
  onClose:()=>void;
  onSelect:(alert:CurrentAlert)=>void;
  onDismiss:(alert:CurrentAlert)=>void;
  dismissingAlertId:string|null;
};

export default function CurrentAlertsDrawer({alerts,loading,error,stale,onClose,onSelect,onDismiss,dismissingAlertId}:Props){
  const closeButton=useRef<HTMLButtonElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const onCloseRef=useRef(onClose);
  useEffect(()=>{onCloseRef.current=onClose},[onClose]);

  useEffect(()=>{
    previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onCloseRef.current();
      if(event.key!=='Tab')return;
      const panel=closeButton.current?.closest('[role="dialog"]');
      const focusable=panel?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if(!focusable?.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);previousFocus.current?.focus()};
  },[]);

  return <div className="alerts-layer">
    <button type="button" className="alerts-backdrop" aria-label="Close current alerts" onClick={onClose}/>
    <aside className="alerts-drawer" role="dialog" aria-modal="true" aria-labelledby="alerts-title" aria-describedby="alerts-disclaimer">
      <header className="alerts-header">
        <div><span className="alerts-eyebrow"><Bell size={13}/> LIVE WORKSPACE</span><h2 id="alerts-title">Current alerts</h2><p>Based on the latest available dashboard data.</p></div>
        <button ref={closeButton} type="button" className="icon-button alerts-close" onClick={onClose} aria-label="Close current alerts"><X size={18}/></button>
      </header>
      <p className="alerts-disclaimer" id="alerts-disclaimer">These alerts are informational. They do not prove that a ticket sale, payment, approval, or other business action occurred. Check the current business record for its status.</p>
      <div className="alerts-content" aria-live="polite" aria-busy={loading}>
        {loading?<div className="alerts-state" role="status"><span className="alerts-spinner"/>Loading current alerts…</div>
          :error?<div className="alerts-state alerts-error" role="alert"><AlertTriangle size={18}/><span>Current alerts could not be loaded. Check your connection and permissions, then reopen the panel.</span></div>
          :<>
            {stale&&<div className="alerts-freshness stale" role="status"><AlertTriangle size={15}/><span>Some alert data is cached or has changes still syncing. Values and the active-alert list may be out of date.</span></div>}
            {!stale&&<div className="alerts-freshness synced" role="status">Alert data is up to date. New changes appear here while connected.</div>}
            {alerts.length===0?<div className="alerts-state alerts-empty"><span className="alerts-empty-icon"><Bell size={19}/></span><b>No active alerts</b><span>There are no current budget or ticket thresholds to show.</span></div>
              :<ul className="alerts-list">{alerts.map(alert=><li key={alert.id}>
                <div className="alert-row"><button type="button" className={`alert-item ${alert.severity}`} onClick={()=>onSelect(alert)}>
                    <span className={`alert-item-icon ${alert.category}`}>{alert.category==='tickets'?<Ticket size={16}/>:<Wallet size={16}/>}</span>
                    <span className="alert-item-copy"><span className="alert-item-meta">{alert.category==='tickets'?'TICKETS':'FINANCE'} · CURRENT</span><b>{alert.title}</b><span>{alert.description}</span></span>
                    {alert.severity==='critical'&&<span className="alert-critical-label">Attention</span>}
                  </button><button type="button" className="alert-dismiss" onClick={()=>onDismiss(alert)} disabled={dismissingAlertId===alert.id} aria-label={dismissingAlertId===alert.id?`Deleting alert: ${alert.title}`:`Delete alert: ${alert.title}`} title={dismissingAlertId===alert.id?'Deleting alert':'Delete alert'}><Trash2 size={15}/></button></div>
              </li>)}</ul>}
          </>}
      </div>
      <footer className="alerts-footer">Cached and unsynced data is labeled; this panel does not promise delivery while the app is closed.</footer>
    </aside>
  </div>
}
