import { createContext,useContext,type ReactNode } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api,type Actor } from './lib/api';
const Context=createContext<{user:Actor|null;loading:boolean;can:(permission:string)=>boolean;logout:()=>Promise<void>}>({user:null,loading:true,can:()=>false,logout:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}) {
  const qc=useQueryClient(),me=useQuery({queryKey:['me'],queryFn:async()=>(await api.get<{data:Actor}>('/auth/me')).data.data,retry:false,staleTime:60000});
  return <Context.Provider value={{user:me.data||null,loading:me.isPending,can:p=>me.data?.permissions.includes(p)||false,logout:async()=>{await api.post('/auth/logout');qc.clear();window.location.assign('/login');}}}>{children}</Context.Provider>;
}
export const useAuth=()=>useContext(Context);
