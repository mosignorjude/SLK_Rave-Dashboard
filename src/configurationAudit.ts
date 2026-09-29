import {doc,serverTimestamp,type Firestore,type WriteBatch} from 'firebase/firestore';

export function queueWorkspaceAudit(batch:WriteBatch,db:Firestore,actor:string,actorId:string,auditId:string=crypto.randomUUID()){
  batch.set(doc(db,'settings','workspace'),{auditLogId:auditId,updatedAt:serverTimestamp()},{merge:true});
  batch.set(doc(db,'activityLogs',auditId),{
    actor,actorId,action:'configuration.updated',label:'configuration.updated',
    targetType:'settings',targetId:'workspace',createdAt:serverTimestamp(),
  });
  return auditId;
}
