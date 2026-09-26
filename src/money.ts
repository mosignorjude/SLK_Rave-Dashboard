import {userFacingError} from './errorHandling.ts';
export function formatNaira(value:number){const safe=Number.isFinite(value)?Math.trunc(value):0;return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(safe);}
export function parseNaira(value:string){const normalized=String(value??'').trim().replace(/[\s,₦]/g,'');if(!/^\d+$/.test(normalized))throw userFacingError('Enter a valid whole Naira amount.');const n=Number(normalized);if(!Number.isSafeInteger(n))throw userFacingError('Amount is too large. Enter a smaller whole Naira amount.');return n;}
