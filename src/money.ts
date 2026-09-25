export function formatNaira(value:number){return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Math.trunc(value));}
export function parseNaira(value:string){const normalized=value.replace(/[^\d-]/g,'');const n=Number(normalized);if(!Number.isSafeInteger(n)||n<0)throw new Error('Enter a valid whole Naira amount.');return n;}
