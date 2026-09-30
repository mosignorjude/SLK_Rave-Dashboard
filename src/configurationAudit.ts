import {doc,serverTimestamp,type Firestore} from 'firebase/firestore';
import type {ConfigurationState} from './configurationChanges.mjs';

export function queueWorkspaceAudit(batch:{set:(...args:any[])=>unknown},db:Firestore,actor:string,actorId:string,auditId:string=crypto.randomUUID(),reason?:string,changes:Record<string,{before:ConfigurationState;after:ConfigurationState}>={}){
  batch.set(doc(db,'settings','workspace'),{auditLogId:auditId,updatedAt:serverTimestamp()},{merge:true});
  batch.set(doc(db,'activityLogs',auditId),{
    actor,actorId,action:'configuration.updated',label:'configuration.updated',
    targetType:'settings',targetId:'workspace',createdAt:serverTimestamp(),changes,...(reason?{reason}:{}),
  });
  return auditId;
}
