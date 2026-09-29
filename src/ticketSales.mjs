import {doc,runTransaction,serverTimestamp} from 'firebase/firestore';

const MAX_MONEY=1_000_000_000_000;

/**
 * Record one ticket sale as an atomic inventory, ledger, and audit update.
 * A retry must pass the same saleId and auditId so a committed sale can be recognized.
 */
export async function recordTicketSale(db,attempt,actorName,actorId,errorForMessage=message=>new Error(message)){
  if(!Number.isInteger(attempt.quantity)||attempt.quantity<1||attempt.quantity>20){
    throw errorForMessage('Ticket quantity must be a whole number from 1 to 20.');
  }
  const saleRef=doc(db,'ticketSales',attempt.saleId);
  const tierRef=doc(db,'ticketTiers',attempt.tierId);
  const activityRef=doc(db,'activityLogs',attempt.auditId);
  return runTransaction(db,async tx=>{
    const [tierSnap,saleSnap]=await Promise.all([tx.get(tierRef),tx.get(saleRef)]);
    if(saleSnap.exists()){
      const sale=saleSnap.data();
      if(sale.auditLogId!==attempt.auditId||sale.tierId!==attempt.tierId||sale.quantity!==attempt.quantity||sale.date!==attempt.date||sale.unitPrice!==attempt.quotedUnitPrice||sale.agentId!==actorId||sale.createdBy!==actorId){
        throw errorForMessage('This sale attempt ID is already linked to different sale details. Refresh and contact the administrator if the issue continues.');
      }
      // Rules require every sale to be created atomically with this audit event.
      return 'already-recorded';
    }
    if(!tierSnap.exists())throw errorForMessage('That ticket tier is no longer available. Refresh and try again.');
    const tier=tierSnap.data(),sold=Number(tier.sold||0),capacity=Number(tier.capacity),price=Number(tier.price);
    if(!Number.isInteger(capacity)||capacity<0||!Number.isSafeInteger(price)||price<0||price>MAX_MONEY||!Number.isInteger(sold)||sold<0||sold>capacity||typeof tier.active!=='boolean')throw errorForMessage('Ticket data is invalid. Contact the administrator.');
    if(sold+attempt.quantity>capacity||tier.active===false)throw errorForMessage('There are not enough tickets remaining in this tier.');
    if(!Number.isSafeInteger(attempt.quotedUnitPrice)||attempt.quotedUnitPrice<0||price!==attempt.quotedUnitPrice){
      throw errorForMessage('The ticket price changed while this form was open. Close and reopen the sale form to review the new price.');
    }
    const total=price*attempt.quantity;
    if(!Number.isSafeInteger(total)||total>MAX_MONEY)throw errorForMessage('The ticket total is outside the supported range.');
    tx.update(tierRef,{sold:sold+attempt.quantity,lastSaleId:attempt.saleId,auditLogId:attempt.auditId,updatedAt:serverTimestamp()});
    tx.set(saleRef,{tierId:attempt.tierId,tierName:tier.name,quantity:attempt.quantity,unitPrice:price,total,status:'Paid',date:attempt.date,agent:actorName,agentId:actorId,createdBy:actorId,auditLogId:attempt.auditId,createdAt:serverTimestamp()});
    tx.set(activityRef,{actor:actorName,actorId,action:'ticket.sale',label:'ticket.sale',targetType:'ticketSales',targetId:attempt.saleId,createdAt:serverTimestamp()});
    return 'recorded';
  });
}
