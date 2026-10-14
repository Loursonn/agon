import { useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { RIR_OPTS, rL, rC } from "@/lib/exercises";

function RIRPicker({value,onChange}){
  const[open,setOpen]=useState(false);const ref=useRef(null);const c=rC(value);
  useEffect(()=>{if(!open)return;const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[open]);
  return(<div ref={ref} style={{position:'relative',width:44}}>
    <button onClick={()=>setOpen(v=>!v)} style={{width:44,height:28,borderRadius:7,border:'1.5px solid '+c+'60',background:c+'20',color:c,fontSize:12,fontWeight:800,cursor:'pointer',fontFamily:'monospace',lineHeight:1}}>
      {rL(value)}
    </button>
    {open&&(<div style={{position:'absolute',bottom:'calc(100% + 4px)',left:'50%',transform:'translateX(-50%)',zIndex:200,background:C.s1,border:'1px solid '+C.brdL,borderRadius:4,padding:5,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:3,minWidth:148}}>
      {RIR_OPTS.map(v=>{const vc=rC(v);const sel=value===v;return(<button key={v} onClick={()=>{onChange(v);setOpen(false);}} style={{padding:'6px 2px',borderRadius:6,border:'1.5px solid '+(sel?vc:C.brdL),background:sel?vc+'25':'transparent',color:sel?vc:C.tx2,fontSize:11,fontWeight:sel?800:500,cursor:'pointer',fontFamily:'monospace'}}>{rL(v)}</button>);})}
    </div>)}
  </div>);
}

export default RIRPicker;
