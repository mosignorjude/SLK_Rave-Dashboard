import type {Firestore} from 'firebase/firestore';

export type TicketSaleAttempt={
  saleId:string;
  auditId:string;
  tierId:string;
  quantity:number;
  date:string;
  quotedUnitPrice:number;
};

export type TicketSaleResult='recorded'|'already-recorded';

export function recordTicketSale(
  db:Firestore,
  attempt:TicketSaleAttempt,
  actorName:string,
  actorId:string,
  errorForMessage?:(message:string)=>Error,
):Promise<TicketSaleResult>;

export function deleteTicketSale(
  db:Firestore,
  saleId:string,
  reason:string,
  actorName:string,
  actorId:string,
  errorForMessage?:(message:string)=>Error,
):Promise<{sale:Record<string,unknown>;tierRestored:boolean}>;
