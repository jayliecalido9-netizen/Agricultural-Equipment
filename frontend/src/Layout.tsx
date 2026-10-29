import { useState } from 'react';
import { NavLink,Outlet,Link,useLocation,Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sprout,LayoutDashboard,Tractor,CalendarDays,ArrowLeftRight,ClipboardCheck,Wrench,ChartNoAxesCombined,Users,FileChartColumn,Bell,Settings,Plug,UserRoundCog,ShieldCheck,ChevronDown,ChevronRight,PanelLeftClose,Menu,LogOut,Search } from 'lucide-react';
import { api } from './lib/api';
import { SYSTEM_TITLE } from './lib/branding';
import { useAuth } from './auth';
import { Button } from './components/ui/button';
import { Loading } from './components/shared';

const sections=[{name:'MAIN',links:[['/','Dashboard',LayoutDashboard,'equipment.read']]},{name:'EQUIPMENT MANAGEMENT',links:[['/equipment','Equipment inventory',Tractor,'equipment.read'],['/availability','Availability',CalendarDays,'equipment.read'],['/utilization','Asset utilization',ChartNoAxesCombined,'report.read']]},{name:'TRANSACTIONS',links:[['/reservations','Reservations',CalendarDays,'reservation.request'],['/borrowings','Borrowing management',ArrowLeftRight,'borrowing.request'],['/returns','Equipment returns',ClipboardCheck,'return.record']]},{name:'OPERATIONS',links:[['/maintenance','Maintenance',Wrench,'maintenance.read'],['/maintenance-calendar','Maintenance calendar',CalendarDays,'maintenance.read']]},{name:'MANAGEMENT',links:[['/farmers','Farmer directory',Users,'farmer.read'],['/reports','Reports & analytics',FileChartColumn,'report.read'],['/notifications','Notifications',Bell,'equipment.read']]},{name:'ADMINISTRATION',links:[['/users','Users & roles',UserRoundCog,'user.manage'],['/integrations','ERP integrations',Plug,'integration.manage'],['/audit','Audit logs',ShieldCheck,'audit.read'],['/settings','Settings',Settings,'equipment.read']]}] as const;
export function Layout() {
  const {user,loading,can,logout}=useAuth(),[collapsed,setCollapsed]=useState(false),[mobile,setMobile]=useState(false),[profile,setProfile]=useState(false),location=useLocation();
  const notifications=useQuery({queryKey:['notification-bell'],queryFn:async()=>(await api.get('/notifications',{params:{limit:1}})).data,refetchInterval:30000,enabled:!!user});
  if (loading) return <Loading/>;if (!user) return <Navigate to="/login" replace/>;
  const current=sections.flatMap(s=>s.links.map(l=>({path:String(l[0]),title:String(l[1])}))).find(l=>l.path!=='/'&&location.pathname.startsWith(l.path))?.title||'Dashboard';
  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''}`}>
    {mobile&&<button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
    <aside className={`sidebar ${mobile?'sidebar-open':''}`}><Link className="brand" to="/"><span className="brand-mark"><Sprout size={25}/></span><span className="brand-copy"><strong>AEAMS</strong><small>MUNICIPAL AGRICULTURAL ASSETS</small></span></Link>
      <div className="workspace-badge"><span><Tractor size={19}/></span><div><strong>{SYSTEM_TITLE}</strong><small>AEAMS</small></div><ChevronDown size={14}/></div>
      <nav>{sections.map(section=><div className="nav-section" key={section.name}><p>{section.name}</p>{section.links.filter(link=>can(link[3])).map(([to,title,Icon])=><NavLink key={to} to={to} end={to==='/'} title={collapsed?title:undefined} onClick={()=>setMobile(false)} className={({isActive})=>isActive?'nav-link active':'nav-link'}><Icon size={18}/><span>{title}</span>{to==='/reservations'&&<i className="nav-dot"/>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="municipal-icon"><Sprout size={20}/></div><div><strong>Bongabong MAO</strong><small>Municipal Agriculture Office</small></div><button onClick={()=>setCollapsed(!collapsed)} className="icon-button collapse-control" aria-label="Toggle sidebar"><PanelLeftClose size={17}/></button></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{current}</strong></div><div className="topbar-actions"><Link to="/equipment" className="global-search"><Search size={16}/><span>Find equipment</span><kbd>⌕</kbd></Link><Link className="notification-button" to="/notifications" aria-label={`Notifications${notifications.data?.unread?`, ${notifications.data.unread} unread`:''}`}><Bell size={19}/>{notifications.data?.unread>0&&<span>{Math.min(99,notifications.data.unread)}</span>}</Link><div className="topbar-divider"/><div className="profile-wrap"><button className="profile-button" onClick={()=>setProfile(!profile)} aria-expanded={profile}><span className="avatar">{user.display_name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span><span><strong>{user.display_name.replace('Fictional ','')}</strong><small>{user.roles[0]?.replaceAll('_',' ').toLowerCase()}</small></span><ChevronDown size={14}/></button>{profile&&<div className="profile-menu"><p>{user.email}</p><Link to="/settings" onClick={()=>setProfile(false)}><Settings size={16}/>Account settings</Link><button onClick={()=>void logout()}><LogOut size={16}/>Sign out</button></div>}</div></div></header>
      <main className="main-content"><Outlet/></main><footer className="app-footer"><span>© {new Date().getFullYear()} AEAMS · Bongabong MAO</span><span><span className="live-dot"/> {SYSTEM_TITLE}</span></footer>
    </div>
  </div>;
}
