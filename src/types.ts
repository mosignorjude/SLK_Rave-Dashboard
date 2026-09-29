export type Role='guest'|'member'|'executive'|'admin'; export type Status='pending'|'approved'|'rejected'|'suspended';
export interface Person {uid:string;fullName:string;username:string;email:string;role:Role|null;status:Status}
export interface Tier {id:string;name:string;price:number;capacity:number;sold:number;active:boolean}
export interface Revenue {id:string;title:string;category:string;amount:number;status:'Paid'|'Pending'|'Unpaid';date:string;method:string;agent:string}
export interface Expense {id:string;title:string;category:string;categoryId?:string|null;budgetAllocationId?:string|null;amount:number;previousAmount?:number;status:'Paid'|'Pending'|'Deposit'|'Unpaid';date:string;agent:string}
export interface Allocation {id:string;category:string;amount:number;percent:number;budgetId?:string}
