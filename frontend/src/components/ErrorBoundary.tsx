import { Component,type ReactNode } from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <main style={{padding:'3rem',maxWidth:640,margin:'auto'}} role="alert"><h1>The workspace could not be displayed</h1><p style={{margin:'1rem 0'}}>Reload the page to try again. If the problem continues, contact your administrator.</p><button className="button button-primary" onClick={()=>window.location.reload()}>Reload workspace</button></main>;
    return this.props.children;
  }
}
