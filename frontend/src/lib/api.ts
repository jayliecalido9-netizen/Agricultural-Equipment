import axios from 'axios';
export const api=axios.create({baseURL:'/api/v1',withCredentials:true,timeout:30000,headers:{'X-AEAMS-Request':'1'}});
api.interceptors.response.use(response=>response,error=>{
  if(error.response?.status===401 && !['/auth/login','/auth/me'].includes(error.config?.url) && window.location.pathname!=='/login')window.location.assign('/login');
  return Promise.reject(error);
});
export const message=(error:unknown)=>axios.isAxiosError(error)?error.response?.data?.error?.message||'The server is unavailable. Check your connection and try again.':error instanceof Error?error.message:'Something went wrong.';
export interface Actor {id:string;email:string;display_name:string;roles:string[];permissions:string[]}
export interface DataRow {id:string;[key:string]:any}
export interface PageData {data:DataRow[];pagination:{total:number;page:number;limit:number;pages:number}}
export interface Lookups {categories:DataRow[];locations:DataRow[];farmers:DataRow[];personnel:DataRow[];roles:DataRow[];equipment:DataRow[]}
