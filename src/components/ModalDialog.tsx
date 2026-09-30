import {useEffect,useRef,type ReactNode} from 'react';

const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function ModalDialog({onClose,labelledBy,className='',children}:{onClose:()=>void;labelledBy:string;className?:string;children:ReactNode}){
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;

  useEffect(()=>{
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const dialog=dialogRef.current;
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE)||[]).filter(element=>element.getAttribute('aria-hidden')!=='true');
    const first=focusable()[0];
    (first||dialog)?.focus();

    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();closeRef.current();return;}
      if(event.key!=='Tab'||!dialog)return;
      const items=focusable();
      if(!items.length){event.preventDefault();dialog.focus();return;}
      const firstItem=items[0],lastItem=items[items.length-1];
      if(event.shiftKey&&(document.activeElement===firstItem||!dialog.contains(document.activeElement))){event.preventDefault();lastItem.focus();}
      else if(!event.shiftKey&&(document.activeElement===lastItem||!dialog.contains(document.activeElement))){event.preventDefault();firstItem.focus();}
    }

    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.removeEventListener('keydown',onKeyDown);
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  },[]);

  return <div className="modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)closeRef.current()}}>
    <div ref={dialogRef} className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
      {children}
    </div>
  </div>;
}
