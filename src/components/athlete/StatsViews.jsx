import { useState, useEffect, useRef, useMemo } from "react";
import { C } from "@/lib/theme";
import { e1rm, parseReps, normalizeExName } from "@/lib/exercises";
import { MTREE, getMC, mL, normPrimary, stC, ALL_BZ, INJ_STATUS } from "@/lib/muscles";
import { InjuryForm } from "@/components/athlete/WellnessFlow";
function PRsView({prs,exos,tw}){
  const[selEx,setSelEx]=useState(null);
  const allExNames=Object.keys(prs).sort((a,b)=>prs[b].est-prs[a].est);

  // Build weekly 1RM data for selected exercise
  const getWeeklyData=(name)=>{
    const byWeek={};
    Object.values(exos).flat().filter(e=>e.name===name).forEach(ex=>{
      Object.entries(ex.weeks||{}).forEach(([wk,w])=>{
        if(!w?.kg)return;const est=e1rm(w.kg,parseReps(w.repsRange)||1);
        if(!byWeek[wk]||est>byWeek[wk])byWeek[wk]=est;
      });
    });
    return Array.from({length:tw||6},(_,i)=>i+1).map(w=>({week:w,val:byWeek[w]||null}));
  };

  const selData=selEx?getWeeklyData(selEx):null;
  const selFilled=selData?.filter(d=>d.val!=null)||[];
  const selMin=selFilled.length?Math.min(...selFilled.map(d=>d.val)):0;
  const selMax=selFilled.length?Math.max(...selFilled.map(d=>d.val)):0;
  const selProg=selFilled.length>=2?selFilled[selFilled.length-1].val-selFilled[0].val:null;

  // Top 3 progressors
  const progressors=allExNames.map(name=>{
    const data=getWeeklyData(name);const filled=data.filter(d=>d.val!=null);
    const prog=filled.length>=2?filled[filled.length-1].val-filled[0].val:0;
    return{name,prog,current:filled.length?filled[filled.length-1].val:0};
  }).filter(p=>p.prog>0).sort((a,b)=>b.prog-a.prog).slice(0,3);

  return(<div style={{padding:"16px 16px 40px"}}>
    <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Personal Records</div>
    <div style={{fontSize:12,color:C.tx2,marginBottom:16}}>1RM estimes (Epley)</div>

    {/* Top progressions banner */}
    {progressors.length>0&&(<div style={{background:C.gS,borderRadius:6,padding:"12px 14px",border:"1px solid "+C.g+"30",marginBottom:16}}>
      <div style={{fontSize:10,fontWeight:600,color:C.g,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Meilleures progressions</div>
      <div style={{display:"flex",gap:8}}>{progressors.map((p,i)=><div key={p.name} onClick={()=>setSelEx(p.name)} style={{flex:1,background:C.s1,borderRadius:4,padding:"8px 6px",textAlign:"center",cursor:"pointer",border:"1px solid "+(selEx===p.name?C.g:C.brd)}}>
        <div style={{fontSize:9,color:C.tx3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name.length>12?p.name.slice(0,12)+"…":p.name}</div>
        <div style={{fontSize:16,fontWeight:800,color:C.g,lineHeight:1.2}}>+{p.prog}</div>
        <div style={{fontSize:8,color:C.tx3}}>kg</div>
      </div>)}</div>
    </div>)}

    {/* Selected exercise evolution */}
    {selEx&&selData&&(<div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.ac+"30",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div><div style={{fontSize:13,fontWeight:700}}>{selEx}</div><div style={{fontSize:10,color:C.tx3}}>Evolution 1RM estime</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {selProg!=null&&<span style={{fontSize:16,fontWeight:800,color:selProg>0?C.g:selProg<0?C.r:C.tx3}}>{selProg>0?"+":""}{selProg} kg</span>}
          <button onClick={()=>setSelEx(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>×</button>
        </div>
      </div>
      {/* Bar chart */}
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height:100,padding:"0 4px"}}>
        {selData.map(d=>{const h=d.val!=null&&selMax>selMin?Math.max(12,((d.val-selMin*0.9)/(selMax-selMin*0.9+0.01))*90):d.val!=null?50:6;
          return(<div key={d.week} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{fontSize:8,fontWeight:700,color:d.val!=null?C.ac:C.tx3}}>{d.val!=null?d.val:""}</div>
            <div style={{width:"100%",height:h,borderRadius:4,background:d.val!=null?C.ac+"60":C.s2,transition:"height 0.3s"}}/>
            <div style={{fontSize:8,color:C.tx3}}>S{d.week}</div>
          </div>);
        })}
      </div>
    </div>)}

    {/* PR list by tier */}
    {[{tier:1,c:C.o,bg:C.oS,label:"Fondamentaux",desc:"Compound lourd"},{tier:2,c:C.ac,bg:C.acS,label:"Composes secondaires",desc:"Force appliquee"},{tier:3,c:C.g,bg:C.gS,label:"Isolation",desc:"Hypertrophie ciblee"}].map(({tier,c,bg,label,desc})=>{
      const tp=Object.entries(prs).filter(([n])=>(EX_TIER[n]||3)===tier).sort((a,b)=>b[1].est-a[1].est);if(!tp.length)return null;
      return(<div key={tier} style={{marginBottom:22}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"10px 12px",borderRadius:4,background:bg,border:"1px solid "+c+"30"}}><div style={{width:30,height:30,borderRadius:4,background:c+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:c}}>T{tier}</div><div><div style={{fontSize:12,fontWeight:700,color:c}}>{label}</div><div style={{fontSize:10,color:C.tx2}}>{desc}</div></div></div>
        {tp.map(([name,pr],i)=>{
          const weekData=getWeeklyData(name);const filled=weekData.filter(d=>d.val!=null);const prog=filled.length>=2?filled[filled.length-1].val-filled[0].val:null;
          return(<div key={name} onClick={()=>setSelEx(selEx===name?null:name)} style={{background:selEx===name?c+"08":C.s1,borderRadius:tier===1?14:10,padding:tier===1?"13px 16px":"10px 14px",marginBottom:6,border:"1px solid "+(selEx===name?c+"50":i===0&&tier===1?c+"50":C.brd),cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:tier===1?36:28,height:tier===1?36:28,borderRadius:tier===1?10:7,background:i===0?bg:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:tier===1?13:11,fontWeight:700,color:i===0?c:C.tx3}}>{i+1}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:tier===1?14:13,fontWeight:600}}>{name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2}}>
                <span style={{fontSize:10,color:C.tx2}}>{pr.kg}kg x {pr.reps} - S{pr.week}</span>
                {prog!=null&&prog!==0&&<span style={{fontSize:10,fontWeight:700,color:prog>0?C.g:C.r,padding:"1px 5px",borderRadius:4,background:prog>0?C.gS:C.rS}}>{prog>0?"+":""}{prog}</span>}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:tier===1?24:18,fontWeight:800,color:i===0?c:C.tx,letterSpacing:"-0.5px",lineHeight:1}}>{pr.est}</div>
              <div style={{fontSize:9,color:C.tx3,marginTop:2}}>kg est.</div>
            </div>
          </div>);
        })}
      </div>);
    })}
  </div>);
}

function InjuryCard({inj,onEdit,onDelete,onUpdate}){const sc=stC(inj.status);const zoneNames=ALL_BZ.filter(z=>inj.zones.includes(z.id)).map(z=>z.label).join(", ")||"Zone non precisee";const intC=inj.intensity<=3?C.g:inj.intensity<=6?C.o:C.r;
    return(<div style={{background:C.s1,borderRadius:6,padding:"12px 14px",marginBottom:8,border:"1px solid "+sc+"30"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
        <div style={{flex:1}}><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:4}}><span style={{fontSize:12,fontWeight:700,color:C.tx}}>{zoneNames}</span>{inj.type&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:C.s2,color:C.tx3}}>{inj.type}</span>}</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,fontWeight:700,color:sc,padding:"2px 8px",borderRadius:6,background:sc+"20"}}>{inj.status}</span><span style={{fontSize:10,color:C.tx3}}>{inj.date?inj.date.slice(6)+"/"+inj.date.slice(4,6)+"/"+inj.date.slice(0,4):""}</span></div></div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}><div style={{textAlign:"center"}}><span style={{fontSize:18,fontWeight:800,color:intC}}>{inj.intensity}</span><span style={{fontSize:9,color:C.tx3}}>/10</span></div><button onClick={()=>onEdit(inj)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Edit</button><button onClick={()=>onDelete(inj.id)} style={{width:22,height:22,borderRadius:5,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>x</button></div>
      </div>
      {inj.notes&&<div style={{fontSize:11,color:C.tx3,fontStyle:"italic",lineHeight:1.5}}>{inj.notes}</div>}
      <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
        {INJ_STATUS.filter(s=>s!==inj.status).map(s=>{const sc2=stC(s);return(<button key={s} onClick={()=>onUpdate({...inj,status:s})} style={{fontSize:9,padding:"3px 8px",borderRadius:5,border:"1px solid "+sc2+"40",background:"transparent",color:sc2,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>);})}
      </div>
    </div>);
}

function InjuriesView({injuries,addInjury,updateInjury,deleteInjury}){
  const[showForm,setShowForm]=useState(false);const[editing,setEditing]=useState(null);
  const active=injuries.filter(i=>i.status!=="Guerie");const healed=injuries.filter(i=>i.status==="Guerie");
  const openEdit=inj=>{setEditing(inj);setShowForm(true);};
  return(<div>
    <button onClick={()=>{setEditing(null);setShowForm(true);}} style={{width:"100%",padding:"12px 0",borderRadius:6,border:"1.5px solid "+C.r+"50",background:C.rS,color:C.r,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:16}}>+ Nouvelle blessure / douleur</button>
    {showForm&&<div style={{marginBottom:16}}><InjuryForm onSave={inj=>{editing?updateInjury(inj):addInjury(inj);setShowForm(false);setEditing(null);}} onCancel={()=>{setShowForm(false);setEditing(null);}} existing={editing}/></div>}
    {active.length>0&&(<div><div style={{fontSize:11,fontWeight:600,color:C.r,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>{active.length} active(s)</div>{active.map(i=><InjuryCard key={i.id} inj={i} onEdit={openEdit} onDelete={deleteInjury} onUpdate={updateInjury}/>)}</div>)}
    {healed.length>0&&(<div style={{marginTop:12}}><div style={{fontSize:11,fontWeight:600,color:C.g,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>{healed.length} guerie(s)</div>{healed.map(i=><InjuryCard key={i.id} inj={i} onEdit={openEdit} onDelete={deleteInjury} onUpdate={updateInjury}/>)}</div>)}
    {injuries.length===0&&!showForm&&<div style={{textAlign:"center",color:C.tx3,fontSize:12,padding:"20px 0"}}>Aucune blessure enregistree</div>}
  </div>);
}

function MuscleVolumeCard({exos,exMeta,sets,sessions,weeksArr,tw,initialWeek}){
  const wks=weeksArr||Array.from({length:tw||6},(_,i)=>i+1);
  const[wk,setWk]=useState(initialWeek&&wks.includes(initialWeek)?initialWeek:wks[0]);
  const[showSubs,setShowSubs]=useState(false);
  const[panel,setPanel]=useState(null);
  const muscleData=useMemo(()=>{
    const m={};
    Object.entries(exos).forEach(([sid,exList])=>{
      const sess=sessions.find(s=>s.id===sid);
      (exList||[]).filter(ex=>{const et=ex.exType||(ex.isFlexibility?"mobilite":"muscu");return (et==="muscu"||et==="halterophilie")&&ex.weeks?.[wk]?.sets;}).forEach(ex=>{
        const meta=exMeta[ex.name]||exMeta[normalizeExName(ex.name)]||{};
        const prim=normPrimary(meta.primary||ex.target);
        const sec=meta.secondary||[];
        const pl=ex.weeks[wk]?.sets||0;
        const done=(sets[ex.id+"_"+wk]||[]).filter(r=>r.done).length;
        const add=(mid,factor)=>{
          if(!m[mid])m[mid]={pl:0,done:0,exs:[]};
          m[mid].pl+=pl*factor;m[mid].done+=done*factor;
          if(!m[mid].exs.find(e=>e.name===ex.name&&e.sid===sid))m[mid].exs.push({name:ex.name,sid,sessName:sess?.name||sess?.short||"",pl,done,factor,reps:ex.weeks[wk]?.repsRange,kg:ex.weeks[wk]?.kg});
        };
        prim.forEach(mid=>add(mid,1));sec.forEach(mid=>add(mid,0.5));
      });
    });
    Object.values(m).forEach(v=>{v.pl=Math.round(v.pl);v.done=Math.round(v.done);});
    return m;
  },[exos,exMeta,sets,sessions,wk]);
  const dispData=useMemo(()=>{
    if(showSubs)return muscleData;
    const agg={};
    Object.entries(muscleData).forEach(([mid,data])=>{
      const par=MTREE.find(g=>g.id===mid)||MTREE.find(g=>g.s?.some(s=>s.id===mid));
      const pid=par?.id||mid;
      if(!agg[pid])agg[pid]={pl:0,done:0,exs:[]};
      agg[pid].pl+=data.pl;agg[pid].done+=data.done;
      data.exs.forEach(e=>{if(!agg[pid].exs.find(x=>x.name===e.name&&x.sid===e.sid))agg[pid].exs.push(e);});
    });
    return agg;
  },[muscleData,showSubs]);
  const sorted=Object.entries(dispData).sort((a,b)=>b[1].pl-a[1].pl);
  const maxP=Math.max(...sorted.map(([,d])=>d.pl),1);
  const panelD=panel?dispData[panel]:null;
  const bNav={padding:"5px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
  if(!sorted.length)return(<div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.brd,marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Séries par muscle</div><div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"14px 0"}}>Aucun exercice configuré pour S{wk}</div></div>);
  return(<>
    {panel&&<div onClick={()=>setPanel(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:199}}/>}
    {panel&&panelD&&(<div style={{position:"fixed",top:0,right:0,bottom:0,width:340,background:C.bg,zIndex:200,borderLeft:"1px solid "+C.brdL,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.brd,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:C.bg,zIndex:1}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:getMC(panel)}}>{mL(panel)}</div>
          <div style={{fontSize:11,color:C.tx3,marginTop:2}}>S{wk} — <span style={{color:panelD.done>=panelD.pl&&panelD.pl>0?C.g:C.tx2,fontWeight:600}}>{panelD.done} réalisées</span> / {panelD.pl} prévues</div>
        </div>
        <button onClick={()=>setPanel(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:22,cursor:"pointer",fontFamily:"inherit",lineHeight:1,padding:"4px 8px"}}>×</button>
      </div>
      <div style={{padding:"14px 16px",flex:1}}>
        <div style={{height:5,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:16}}>
          <div style={{height:"100%",width:panelD.pl>0?Math.min(panelD.done/panelD.pl*100,100)+"%":"0%",background:panelD.done>=panelD.pl&&panelD.pl>0?C.g:getMC(panel),borderRadius:3,transition:"width 0.4s"}}/>
        </div>
        {panelD.exs.length===0&&<div style={{color:C.tx3,fontSize:11,textAlign:"center",padding:"20px 0"}}>Aucun exercice</div>}
        {panelD.exs.map((ex,i)=>{
          const mc=getMC(panel);const donePct=ex.pl>0?Math.min(ex.done/ex.pl*100,100):0;
          return(<div key={i} style={{marginBottom:12,padding:"12px 14px",borderRadius:6,background:C.s1,border:"1px solid "+(ex.factor<1?C.brdL:mc+"40")}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:2}}>{ex.name}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,color:C.tx3,background:C.s2,padding:"2px 7px",borderRadius:5}}>{ex.sessName}</span>
                  {ex.factor<1&&<span style={{fontSize:9,color:C.tx3,fontStyle:"italic",padding:"2px 7px",borderRadius:5,background:C.s2}}>secondaire ×0.5</span>}
                </div>
              </div>
              <div style={{textAlign:"right",marginLeft:8}}>
                <div style={{fontSize:16,fontWeight:800,color:donePct>=100?C.g:mc}}>{ex.done}<span style={{fontSize:10,color:C.tx3,fontWeight:400}}>/{ex.pl}</span></div>
                <div style={{fontSize:9,color:C.tx3}}>séries</div>
              </div>
            </div>
            {(ex.kg>0||ex.reps)&&<div style={{fontSize:10,color:C.tx3,marginBottom:6}}>{ex.kg>0?ex.kg+"kg":""}{ex.kg>0&&ex.reps?" × ":""}{ex.reps||""}</div>}
            <div style={{height:4,background:C.s2,borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:donePct+"%",background:donePct>=100?C.g:mc,borderRadius:2,transition:"width 0.4s"}}/>
            </div>
          </div>);
        })}
      </div>
    </div>)}
    <div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.brd,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Séries par muscle</div>
        <button onClick={()=>setShowSubs(!showSubs)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid "+(showSubs?C.ac:C.brdL),background:showSubs?C.acS:"transparent",color:showSubs?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Sous-groupes</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <button onClick={()=>setWk(w=>wks[Math.max(0,wks.indexOf(w)-1)])} disabled={wk===wks[0]} style={{...bNav,opacity:wk===wks[0]?0.3:1}}>←</button>
        <div style={{display:"flex",gap:4,flex:1,justifyContent:"center",flexWrap:"wrap"}}>
          {wks.map(w=><button key={w} onClick={()=>setWk(w)} style={{padding:"4px 10px",borderRadius:7,border:"none",background:wk===w?C.ac:C.s2,color:wk===w?"#fff":C.tx3,fontSize:10,fontWeight:wk===w?700:400,cursor:"pointer",fontFamily:"inherit"}}> S{w}</button>)}
        </div>
        <button onClick={()=>setWk(w=>wks[Math.min(wks.length-1,wks.indexOf(w)+1)])} disabled={wk===wks[wks.length-1]} style={{...bNav,opacity:wk===wks[wks.length-1]?0.3:1}}>→</button>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:C.ac+"35"}}/><span style={{fontSize:9,color:C.tx3}}>Prévu</span></div>
        <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:C.g}}/><span style={{fontSize:9,color:C.tx3}}>Réalisé</span></div>
        <div style={{fontSize:9,color:C.tx3,marginLeft:"auto"}}>Cliquer pour détail →</div>
      </div>
      {sorted.map(([mid,data])=>{
        const c=getMC(mid);const sel=panel===mid;
        const planPct=data.pl/maxP*100;const realPct=data.pl>0?Math.min(data.done/data.pl*100,100)*planPct/100:0;
        return(<div key={mid} onClick={()=>setPanel(sel?null:mid)} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer",borderRadius:4,padding:"5px 6px",background:sel?C.s2:"transparent",border:"1px solid "+(sel?c+"40":"transparent"),transition:"all 0.15s"}}>
          <span style={{fontSize:10,color:sel?c:C.tx2,width:76,flexShrink:0,textAlign:"right",fontWeight:sel?700:400}}>{mL(mid)}</span>
          <div style={{flex:1,height:16,background:C.s2,borderRadius:4,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",inset:0,width:planPct+"%",background:c+"25",borderRadius:4}}/>
            <div style={{position:"absolute",inset:0,width:realPct+"%",background:c,borderRadius:4,transition:"width 0.4s"}}/>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:data.done>0?c:C.tx3,width:46,textAlign:"right",fontFamily:"monospace"}}>{data.done}/{data.pl}s</span>
        </div>);
      })}
    </div>
  </>);
}
function WeeklyVolumeCard({exos,sets,sessions,weeksArr,tw,C}){
  const[sel,setSel]=useState(null);
  const wks=weeksArr||Array.from({length:tw||6},(_,i)=>i+1);
  const data=wks.map(wk=>{
    const planned=Object.values(exos).flat().filter(ex=>(["muscu","halterophilie"].includes(ex.exType||"muscu"))).reduce((s,ex)=>s+(ex.weeks[wk]?.sets||0),0);
    const done=Object.entries(sets).filter(([k])=>k.endsWith("_"+wk)).reduce((s,[,rows])=>s+rows.filter(r=>r.done).length,0);
    return{wk,planned,done};
  });
  const maxP=Math.max(...data.map(d=>d.planned),1);
  return(<div style={{background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,marginBottom:12}}>
    <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>Volume hebdomadaire (séries)</div>
    <div style={{display:"flex",gap:4,alignItems:"flex-end",height:70,marginBottom:4}}>
      {data.map(({wk,planned,done},i)=>{
        const prev=i>0?data[i-1].planned:null;
        const delta=prev!==null?planned-prev:null;
        const isSel=sel===wk;
        const barH=maxP>0?(planned/maxP*100):0;
        const doneH=planned>0?(done/planned*barH):0;
        return(<div key={wk} onClick={()=>setSel(isSel?null:wk)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}>
          {delta!==null&&<div style={{fontSize:7,fontWeight:700,color:delta>0?C.g:delta<0?C.r:C.tx3,marginBottom:1}}>{delta>0?"+":""}{delta}</div>}
          <div style={{width:"100%",flex:1,display:"flex",flexDirection:"column-reverse",position:"relative"}}>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:barH+"%",background:isSel?C.ac:C.ac+"55",borderRadius:"4px 4px 0 0",transition:"height 0.3s"}}/>
            {done>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:doneH+"%",background:isSel?C.g:C.g+"80",borderRadius:"4px 4px 0 0"}}/>}
          </div>
          <div style={{fontSize:9,fontWeight:isSel?800:400,color:isSel?C.ac:C.tx3,marginTop:2}}>S{wk}</div>
          <div style={{fontSize:9,fontWeight:600,color:C.tx2}}>{planned}</div>
        </div>);
      })}
    </div>
    {sel&&(()=>{
      const d=data.find(x=>x.wk===sel);
      const prev=data.find(x=>x.wk===sel-1);
      if(!d)return null;
      return(<div style={{marginTop:8,padding:"10px 12px",borderRadius:4,background:C.s2,border:"1px solid "+C.ac+"30"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.ac}}>Semaine {sel}</div>
          <div style={{display:"flex",gap:12}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:C.ac}}>{d.planned}</div><div style={{fontSize:8,color:C.tx3}}>prévues</div></div>
            {d.done>0&&<div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:C.g}}>{d.done}</div><div style={{fontSize:8,color:C.tx3}}>réalisées</div></div>}
            {prev&&<div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:d.planned-prev.planned>0?C.g:d.planned-prev.planned<0?C.r:C.tx3}}>{d.planned-prev.planned>0?"+":""}{d.planned-prev.planned}</div><div style={{fontSize:8,color:C.tx3}}>vs S{sel-1}</div></div>}
          </div>
        </div>
        {sessions.filter(s=>(exos[s.id]||[]).some(ex=>(["muscu","halterophilie"].includes(ex.exType||"muscu"))&&ex.weeks[sel]?.sets)).map(s=>{
          const sp=(exos[s.id]||[]).filter(ex=>(["muscu","halterophilie"].includes(ex.exType||"muscu"))).reduce((sum,ex)=>sum+(ex.weeks[sel]?.sets||0),0);
          if(!sp)return null;
          return(<div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{fontSize:10,color:C.tx2,width:80,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name||s.short}</div>
            <div style={{flex:1,height:6,background:C.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:(sp/d.planned*100)+"%",background:C.ac+"70",borderRadius:3}}/></div>
            <div style={{fontSize:10,fontWeight:700,color:C.tx,width:24,textAlign:"right"}}>{sp}</div>
          </div>);
        })}
      </div>);
    })()}
  </div>);
}

const CHAT_AI_URL=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-program`;

function AIChatBar({exos,sessions,chatHistory,setChatHistory,onApply,onOpenChange,C}){
  const[open,setOpen]=useState(false);
  useEffect(()=>{onOpenChange?.(open);},[open]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[pendingEdit,setPendingEdit]=useState(null);
  const[error,setError]=useState(null);
  const msgEndRef=useRef(null);
  useEffect(()=>{if(open&&msgEndRef.current)msgEndRef.current.scrollIntoView({behavior:"smooth"});},[chatHistory,open]);

  const send=async()=>{
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");setLoading(true);setError(null);
    const newHistory=[...chatHistory,{role:"user",content:msg}];
    setChatHistory(newHistory);
    try{
      const resp=await fetch(CHAT_AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({mode:"chat_edit",currentProgram:exos,sessions,message:msg,conversationHistory:chatHistory})});
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error||"Erreur serveur");
      if(!data.sessions)throw new Error("Reponse invalide");
      const reply=data.rationale||"Modifications appliquées. Confirmez pour appliquer.";
      setChatHistory([...newHistory,{role:"assistant",content:reply}]);
      setPendingEdit(data.sessions);
    }catch(e){setError(e.message);setChatHistory([...newHistory,{role:"assistant",content:"Erreur: "+e.message}]);}
    setLoading(false);
  };

  const confirm=()=>{if(pendingEdit){onApply(pendingEdit);setPendingEdit(null);}};
  const cancel=()=>setPendingEdit(null);

  return(<>
    {/* Floating toggle button */}
    {!open&&<button onClick={()=>setOpen(true)} style={{position:"fixed",bottom:24,right:24,zIndex:90,width:52,height:52,borderRadius:"50%",border:"none",background:C.coach,color:"#fff",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>AI</button>}

    {/* Chat panel */}
    {open&&(<div style={{position:"fixed",bottom:0,right:0,left:0,zIndex:90,background:C.s1,borderTop:"1px solid "+C.coach+"40",maxHeight:"60vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid "+C.brd,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:14,color:C.coach}}>AI</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>Editer avec l'IA</div>
          {loading&&<div style={{fontSize:10,color:C.tx3,animation:"pulse 1.5s infinite"}}>Analyse en cours...</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {chatHistory.length>0&&<button onClick={()=>{setChatHistory([]);setPendingEdit(null);}} style={{fontSize:10,color:C.tx3,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Effacer</button>}
          <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",color:C.tx3,fontSize:18,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>×</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {chatHistory.length===0&&<div style={{textAlign:"center",color:C.tx3,fontSize:12,padding:"20px 0"}}>Décris les modifications à apporter au programme.<br/><span style={{fontSize:11}}>Ex: "Ajoute 1 semaine au squat", "Remplace les dips par du triceps machine"</span></div>}
        {chatHistory.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"80%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",background:m.role==="user"?C.coach:C.s2,color:m.role==="user"?"#fff":C.tx,fontSize:12,lineHeight:1.5}}>{m.content}</div>
          </div>
        ))}
        {pendingEdit&&<div style={{background:C.gS,border:"1px solid "+C.g+"40",borderRadius:4,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{fontSize:12,color:C.g,fontWeight:600}}>Modifications pretes. Voulez-vous les appliquer ?</div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <button onClick={cancel} style={{padding:"5px 12px",borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
            <button onClick={confirm} style={{padding:"5px 12px",borderRadius:7,border:"none",background:C.g,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Appliquer</button>
          </div>
        </div>}
        <div ref={msgEndRef}/>
      </div>

      {/* Input */}
      <div style={{padding:"10px 16px",borderTop:"1px solid "+C.brd,display:"flex",gap:8,flexShrink:0}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ex: Ajoute une semaine de plus, augmente le volume pecs..." style={{flex:1,padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit",outline:"none"}} disabled={loading}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{padding:"9px 16px",borderRadius:4,border:"none",background:loading||!input.trim()?"#333":C.coach,color:loading||!input.trim()?C.tx3:"#fff",fontSize:12,fontWeight:700,cursor:loading||!input.trim()?"default":"pointer",fontFamily:"inherit",flexShrink:0}}>Envoyer</button>
      </div>
    </div>)}
  </>);
}

// ── CoachFourWeekCalendar ──────────────────────────────────────────────────────


export { PRsView, InjuriesView, MuscleVolumeCard, WeeklyVolumeCard, AIChatBar };
