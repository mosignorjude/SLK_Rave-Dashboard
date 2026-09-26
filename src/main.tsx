import React,{Component,type ReactNode} from 'react'; import {createRoot} from 'react-dom/client'; import App from './App'; import './index.css';

class RuntimeBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error:Error){console.error('[SLK Rave]',{operation:'render application',type:error.name||'Error'})}
  render(){return this.state.failed?<main role="alert" style={{minHeight:'100vh',display:'grid',placeContent:'center',gap:16,padding:24,color:'#f5f6fa',background:'#08090d',fontFamily:'system-ui,sans-serif',textAlign:'center'}}><h1>We could not display this page</h1><p>Reload the app. If the problem continues, contact the administrator.</p><button onClick={()=>window.location.reload()} style={{padding:'12px 18px',cursor:'pointer'}}>Reload app</button></main>:this.props.children}
}

const root=document.getElementById('root');
if(root)createRoot(root).render(<React.StrictMode><RuntimeBoundary><App/></RuntimeBoundary></React.StrictMode>);
