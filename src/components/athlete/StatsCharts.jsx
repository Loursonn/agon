import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, ReferenceLine } from "recharts";
import { C } from "@/lib/theme";
import { getWeightChartData } from "@/lib/calculations";
const DarkTip=({active,payload,label})=>{if(!active||!payload?.length)return null;return(<div style={{background:C.s2,border:"1px solid "+C.brdL,borderRadius:4,padding:"8px 12px"}}><div style={{fontSize:10,color:C.tx3,marginBottom:4}}>{label}</div>{payload.map((p,i)=>p.value!=null&&<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{width:8,height:8,borderRadius:2,background:p.fill||p.stroke||C.ac}}/><span style={{fontSize:10,color:C.tx2}}>{p.name}:</span><span style={{fontSize:11,fontWeight:700,color:p.fill||p.stroke||C.ac}}>{p.value}</span></div>)}</div>);};
function MiniChart({data,color,h}){const H=h||52;const pts=data.filter(d=>d.val!=null);if(!pts.length)return null;const vals=pts.map(d=>d.val),mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;const W=280,mapped=data.map((d,i)=>({...d,x:(i/(data.length-1||1))*(W-20)+10,y:d.val!=null?H-12-((d.val-mn)/rng)*(H-24):null}));const act=mapped.filter(p=>p.y!=null),line=act.map((p,i)=>(i===0?"M":"L")+p.x+","+p.y).join(" ");const area=act.length>1?line+" L"+act[act.length-1].x+","+H+" L"+act[0].x+","+H+" Z":"";const gId="mc"+color.replace("#","")+(Math.random().toString(36).slice(2,5));return(<svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:H,display:"block"}}><defs><linearGradient id={gId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>{area&&<path d={area} fill={"url(#"+gId+")"}/>}{act.length>1&&<path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}{mapped.map((p,i)=>p.y!=null?(<g key={i}><circle cx={p.x} cy={p.y} r={3.5} fill={C.bg} stroke={color} strokeWidth="1.5"/><text x={p.x} y={p.y-8} textAnchor="middle" fill={color} fontSize="9" fontWeight="700" fontFamily="system-ui">{p.val}</text><text x={p.x} y={H-1} textAnchor="middle" fill={C.tx3} fontSize="8" fontFamily="system-ui">{p.week}</text></g>):(<text key={i} x={p.x} y={H-1} textAnchor="middle" fill={C.tx3} fontSize="8" fontFamily="system-ui">{p.week}</text>))}</svg>);}

function SleepTunnel({wellnessHistory,C}){
  const DAY=['D','L','M','Me','J','V','S'];
  const WIN_START=21*60;const WIN_SPAN=13*60;// 21h→10h next day
  const toOffset=({h,m})=>{const t=h*60+m;return t<WIN_START?t+24*60-WIN_START:t-WIN_START;};
  const entries=Object.entries(wellnessHistory).filter(([k,v])=>/^\d{8}$/.test(k)&&v?.coucher&&v?.reveil).sort((a,b)=>a[0]<b[0]?-1:1).slice(-10);
  if(!entries.length)return(<div style={{textAlign:'center',color:C.tx3,fontSize:11,padding:'16px 0'}}>Aucune donnée de sommeil</div>);
  const bars=entries.map(([key,v])=>{
    const y2=+key.slice(0,4),mo=+key.slice(4,6)-1,d=+key.slice(6,8);
    const dt=new Date(y2,mo,d);
    const s=toOffset(v.coucher);let e=toOffset(v.reveil);
    if(e<=s)e+=24*60;
    const durH=Math.round((e-s)/60*10)/10;
    const clamp=n=>Math.min(Math.max(n,0),WIN_SPAN);
    return{label:DAY[dt.getDay()]+'\n'+d,s:clamp(s),e:clamp(Math.min(e,WIN_SPAN)),durH,color:durH>=7.5?C.g:durH>=6.5?C.o:C.r};
  });
  const N=bars.length;const W=300;const H=85;
  const LH=12;// bottom label height
  const TW=20;// left time axis width
  const chartW=W-TW-4;const chartH=H-LH-4;
  const colW=chartW/N;
  const yOf=o=>4+(o/WIN_SPAN)*chartH;
  const tLabels=[{l:'22h',o:60},{l:'0h',o:180},{l:'3h',o:360},{l:'6h',o:540},{l:'9h',o:720}];
  return(<svg viewBox={'0 0 '+W+' '+H} style={{width:'100%',display:'block'}}>
    {/* Grid lines + time labels (Y axis) */}
    {tLabels.map(({l,o})=>{const y=yOf(o);return(<g key={l}><line x1={TW} y1={y} x2={W-2} y2={y} stroke={C.brdL} strokeWidth={0.5}/><text x={TW-2} y={y+3} textAnchor='end' fill={C.tx3} fontSize={6}>{l}</text></g>);})}
    {/* Day columns */}
    {bars.map((b,i)=>{
      const x=TW+i*colW;const bw=Math.max(colW-2,2);
      const y1=yOf(b.s);const y2=yOf(b.e);const bh=Math.max(y2-y1,2);
      return(<g key={i}>
        <rect x={x} y={y1} width={bw} height={bh} rx={2} fill={b.color} opacity={0.25}/>
        <rect x={x} y={y1} width={bw} height={bh} rx={2} fill='none' stroke={b.color} strokeWidth={1} opacity={0.8}/>
        {bh>14&&<text x={x+bw/2} y={y1+bh/2+3} textAnchor='middle' fill={b.color} fontSize={6} fontWeight='700'>{b.durH}h</text>}
        {/* Day label bottom */}
        {b.label.split('\n').map((ln,li)=><text key={li} x={x+bw/2} y={H-LH+10+li*7} textAnchor='middle' fill={C.tx3} fontSize={5.5}>{ln}</text>)}
      </g>);
    })}
  </svg>);
}

function WeightChart({log,milestones,target,nutritionStrategy}){
  const data=getWeightChartData(log,milestones,target);
  if(!data.length)return(<div style={{textAlign:"center",color:C.tx3,fontSize:12,padding:"20px 0"}}>Aucune donnee</div>);
  const vals=data.map(d=>d.kg);const dataMin=Math.min(...vals),dataMax=Math.max(...vals),dataRange=Math.max(dataMax-dataMin,1),pad=Math.max(0.5,dataRange*0.2),mid=(dataMin+dataMax)/2,inclT=target!=null&&Math.abs(target-mid)<dataRange*2+3;const mn=Math.min(dataMin,inclT?target:dataMin)-pad,mx=Math.max(dataMax,inclT?target:dataMax)+pad;
  // Tendance par régression linéaire
  const nPts=vals.length;let trend=null;
  if(nPts>=3){const mX=(nPts-1)/2,mY=vals.reduce((s,v)=>s+v,0)/nPts,num=vals.reduce((s,v,i)=>s+(i-mX)*(v-mY),0),den=vals.reduce((s,_,i)=>s+(i-mX)*(i-mX),0),slope=den?num/den:0;const rate=+(slope*7).toFixed(2);
    let tc;const strat=nutritionStrategy?.strategy;const wt=nutritionStrategy?.weekly_target_kg;
    if(strat==="seche"){const exp=wt??-0.25;const tol=Math.max(0.05,Math.abs(exp)*0.4);tc=rate<=exp+tol&&rate<-0.05?C.g:Math.abs(rate)<0.1?C.o:C.r;}
    else if(strat==="prise_de_masse"){const exp=wt??0.2;const tol=Math.max(0.05,Math.abs(exp)*0.4);tc=rate>=exp-tol&&rate>0.05?C.g:Math.abs(rate)<0.1?C.o:C.r;}
    else if(strat==="maintenance"){tc=Math.abs(rate)<0.1?C.g:Math.abs(rate)<0.25?C.o:C.r;}
    else{const isToward=target!=null?(target>mY?rate>0:rate<0):null;tc=Math.abs(rate)<0.05?C.tx3:isToward===null?C.ac:isToward?C.g:C.r;}
    trend={rate,tc,dir:Math.abs(rate)<0.05?"→":rate>0?"↑":"↓",label:Math.abs(rate)<0.05?"Stable":(rate>0?"+":"")+rate+" kg/sem"};}
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{[{c:C.ac,l:"Poids"},{c:"rgba(255,200,0,0.6)",l:"Objectif"},{c:C.g,l:"Palier"}].map(({c,l})=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:c}}/><span style={{fontSize:10,color:C.tx3}}>{l}</span></div>)}</div>
      {trend&&<div title="Tendance estimée (régression linéaire, ~quotidien)" style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:6,background:trend.tc+"15",border:"1px solid "+trend.tc+"30",cursor:"default"}}><span style={{fontSize:13,color:trend.tc,lineHeight:1}}>{trend.dir}</span><span style={{fontSize:10,fontWeight:700,color:trend.tc}}>{trend.label}</span></div>}
    </div>
    <ResponsiveContainer width="100%" height={180}><LineChart data={data} margin={{top:10,right:10,left:-20,bottom:0}}><XAxis dataKey="d" tick={{fill:C.tx3,fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/><YAxis domain={[mn,mx]} tick={{fill:C.tx3,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<DarkTip/>}/><ReferenceLine y={target} stroke="rgba(255,200,0,0.5)" strokeDasharray="4 2"/>{milestones?.map((m,i)=><ReferenceLine key={i} y={m.kg} stroke={C.g+"40"} strokeDasharray="3 3"/>)}<Line type="monotone" dataKey="kg" name="Poids" stroke={C.ac} strokeWidth={2.5} dot={{fill:C.bg,stroke:C.ac,r:3}} activeDot={{r:5}}/></LineChart></ResponsiveContainer>
  </div>);
}

function CombinedStatsChart({data}){
  return(<div>
    <div style={{display:"flex",gap:12,marginBottom:10,flexWrap:"wrap"}}>{[{c:"rgba(255,255,255,0.15)",l:"Programme"},{c:C.b,l:"Realise"},{c:C.g,l:"Forme /100"}].map(({c,l})=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:c}}/><span style={{fontSize:10,color:C.tx3}}>{l}</span></div>)}</div>
    <ResponsiveContainer width="100%" height={190}><ComposedChart data={data} margin={{top:10,right:36,left:-24,bottom:0}}><XAxis dataKey="s" tick={{fill:C.tx3,fontSize:10}} axisLine={false} tickLine={false}/><YAxis yAxisId="vol" orientation="left" tick={{fill:C.tx3,fontSize:9}} axisLine={false} tickLine={false}/><YAxis yAxisId="well" orientation="right" domain={[0,100]} tick={{fill:C.tx3,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<DarkTip/>}/><Bar yAxisId="vol" dataKey="volProg" name="Programme" fill="rgba(255,255,255,0.12)" radius={[4,4,0,0]}/><Bar yAxisId="vol" dataKey="volReal" name="Realise" fill={C.b} radius={[4,4,0,0]} fillOpacity={0.85}/><Line yAxisId="well" type="monotone" dataKey="wellness" name="Forme" stroke={C.g} strokeWidth={2.5} dot={{fill:C.bg,stroke:C.g,r:4}} connectNulls={false}/></ComposedChart></ResponsiveContainer>
    <div style={{marginTop:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Intensite RIR x series</div><ResponsiveContainer width="100%" height={100}><LineChart data={data} margin={{top:8,right:10,left:-24,bottom:0}}><XAxis dataKey="s" tick={{fill:C.tx3,fontSize:10}} axisLine={false} tickLine={false}/><Tooltip content={<DarkTip/>}/><Line type="monotone" dataKey="intensity" name="Intensite" stroke={C.o} strokeWidth={2.5} dot={{fill:C.bg,stroke:C.o,r:4}}/></LineChart></ResponsiveContainer></div>
  </div>);
}


export { DarkTip, MiniChart, SleepTunnel, WeightChart, CombinedStatsChart };
