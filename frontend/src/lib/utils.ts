import { clsx,type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn=(...inputs:ClassValue[])=>twMerge(clsx(inputs));
export const label=(value:unknown)=>String(value??'—').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,v=>v.toUpperCase());
export const dateText=(value:unknown,short=false)=>value?new Date(String(value)).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:short?undefined:'numeric',month:'short',day:'numeric'}):'—';
export const dateTime=(value:unknown)=>value?new Date(String(value)).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
export const money=(v:unknown)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(v||0));
export const iso=(value:string)=>new Date(value).toISOString();
export const localInput=(value?:string|Date)=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,23);};
