import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C, BT, BLOC_COLORS } from "@/lib/theme";
import { RIR_OPTS, rL, rC, parseReps, e1rm, roundHalf, generateRows, clusterReps, fmtMR, BLOC_METHODS, fuzzyExMatch, MDEF } from "@/lib/exercises";
import { getMC, mL, getSessionBlocs } from "@/lib/muscles";
import RIRPicker from "@/components/ui/RIRPicker";

function RestTimer({timerLeft,timerDur,timerActive,timerFinished,onSetDur,onStart,onStop}){
  const pct=Math.min((timerDur-timerLeft)/timerDur*100,100);
  const m=Math.floor(Math.abs(timerLeft)/60),s=Math.abs(timerLeft)%60;
  const col=timerFinished?C.g:timerActive&&timerLeft<=10?C.r:C.ac;
  return(<div style={{display:"flex",alignItems:"center",gap:10}}>
    <div style={{position:"relative",width:44,height:44}}><svg viewBox="0 0 44 44" style={{width:44,height:44,transform:"rotate(-90deg)"}}><circle cx="22" cy="22" r="18" fill="none" stroke={C.s2} strokeWidth="3"/><circle cx="22" cy="22" r="18" fill="none" stroke={col} strokeWidth="3" strokeDasharray={String(2*Math.PI*18)} strokeDashoffset={String(2*Math.PI*18*(1-pct/100))} strokeLinecap="round"/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:timerFinished?16:9,fontWeight:600,color:col,fontFamily:"monospace"}}>{timerFinished?"✓":m+":"+s.toString().padStart(2,"0")}</div></div>
    <div style={{display:"flex",gap:4}}>{[60,90,120,180].map(d=><button key={d} onClick={()=>onSetDur(d)} style={{padding:"4px 7px",borderRadius:6,border:"1px solid "+(timerDur===d?C.ac:C.brdL),background:timerDur===d?C.acS:"transparent",color:timerDur===d?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d/60+"m"}</button>)}</div>
    <button onClick={()=>{timerActive?onStop():onStart();}} style={{padding:"6px 14px",borderRadius:4,border:"none",background:timerActive?C.rS:timerFinished?C.gS:C.acS,color:timerActive?C.r:timerFinished?C.g:C.ac,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{timerActive?"Stop":"Go"}</button>
  </div>);
}

function SmartSetEditor({planned,storeKey,sessionSets,updateSets,athleteNotes,setAthleteNotes,method,methodParams,allMethods,exosMap,viewOnly=false,onTimerStart=null,postSession=false,isUnilateral=false}){
  const initRows=()=>generateRows(planned,method,methodParams);
  const rows=(()=>{const stored=sessionSets[storeKey];if(!stored||!stored.length)return initRows();const specialType={cluster:"cluster",myoreps:"activation",restpause:"round",amrap:"amrap",isometrique:"iso",dropset:"drop"}[method||""];if(specialType&&!stored.some(r=>r.type===specialType))return initRows();const hasSubSet=!!planned?.method_attachment?.config?.sub_sets;const storedIsSubSet=stored.some(r=>r.type==="sub_set");if(hasSubSet!==storedIsSubSet)return initRows();if(!specialType&&!hasSubSet&&stored.some(r=>r.type!=="set"))return initRows();const allEmpty=stored.every(r=>!r.kg&&!r.reps&&!r.kg_r&&!r.kg_l&&!r.reps_r&&!r.reps_l);if(allEmpty&&(planned?.repsRange||planned?.kg||planned?.setKgs?.length))return initRows();const noInteraction=stored.every(r=>!r.done&&!r.skipped);const missingKg=stored.every(r=>!r.kg&&!r.kg_r&&!r.kg_l);if(noInteraction&&missingKg&&(planned?.kg||planned?.setKgs?.length))return initRows();if(noInteraction&&(hasSubSet||planned?.setKgs?.length>0||planned?.setPctRms?.length>0))return initRows();return stored;})();
  const upd=(i,f,v)=>updateSets(storeKey,rows.map((r,j)=>j===i?{...r,[f]:v}:r));
  const updR=(i,patch)=>updateSets(storeKey,rows.map((r,j)=>j===i?{...r,...patch}:r));
  const showRIR=planned?.rir!=null||rows.some(r=>r.rir!=null);
  const done=rows.filter(r=>r.done||r.skipped).length;const note=athleteNotes?.[storeKey]||"";
  const iS={background:C.s1,color:C.tx,border:"1px solid "+C.brdL,fontFamily:"inherit",fontSize:13,fontWeight:700,textAlign:"center",borderRadius:6,padding:"4px 2px",width:"100%"};
  const rowLabel=r=>{if(r.type==="drop")return"Drop "+r.dropIdx;if(r.type==="activation")return"Activ.";if(r.type==="mini")return"Mini "+r.idx;if(r.type==="round")return"Rd "+r.idx;if(r.type==="amrap")return"AMRAP";if(r.type==="iso")return"Pos."+r.idx;if(r.type==="cluster")return"S"+r.setIdx+" C"+r.clusterIdx;return r.setIdx?"Set "+r.setIdx:"Set";};
  const rowC=r=>{if(r.type==="drop")return C.o;if(r.type==="activation")return C.g;if(r.type==="mini")return C.ac+"80";if(r.type==="round")return C.r;if(r.type==="amrap")return C.b;if(r.type==="iso")return C.tx2;if(r.type==="cluster")return"#F060C0";return C.tx3;};
  return(<div>
    {planned?.repsRange&&<div style={{padding:"6px 10px",borderRadius:7,background:C.acS,border:"1px solid "+C.ac+"30",marginBottom:10,fontSize:11,color:C.ac}}>Cible: {planned.repsRange} reps</div>}
    {isUnilateral&&<div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr",gap:4,marginBottom:4,padding:"3px 8px"}}><span/><div style={{fontSize:9,fontWeight:700,color:C.tx3,textAlign:"center"}}>DROIT</div><div style={{fontSize:9,fontWeight:700,color:C.tx3,textAlign:"center"}}>GAUCHE</div></div>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{flex:1,height:3,background:C.s2,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:(rows.length?(done/rows.length)*100:0)+"%",background:C.g,borderRadius:2,transition:"width 0.3s"}}/></div><span style={{fontSize:10,color:done===rows.length&&rows.length>0?C.g:C.tx3,fontWeight:600}}>{done}/{rows.length}</span></div>
    {rows.map((r,i)=>{
      // ── Sous-série (méthode bibliothèque scope='set') ──────────────────────
      if(r.type==="sub_set"){
        const isFirstInSet=r.subIdx===1;const isLastInSet=r.isLastInSet;
        const setRows=rows.filter(x=>x.setIdx===r.setIdx);
        const setDone=setRows.every(x=>x.done||x.skipped);
        const subBg=r.done?C.g+"10":r.skipped?C.tx3+"08":C.s2;
        const subBrd=r.done?C.g+"30":r.skipped?C.tx3+"20":C.brd;
        return(<div key={i}>
          {isFirstInSet&&(<div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 8px 4px"}}>
            <div style={{flex:1,height:1,background:setDone?C.g+"50":C.brd}}/>
            <span style={{fontSize:9,fontWeight:700,color:setDone?C.g:C.tx2,textTransform:"uppercase",letterSpacing:"0.5px"}}>Set {r.setIdx}{setDone?" ✓":""}</span>
            <div style={{flex:1,height:1,background:setDone?C.g+"50":C.brd}}/>
          </div>)}
          <div style={{display:"grid",gridTemplateColumns:"36px 1fr 8px 1fr 26px 26px",gap:4,alignItems:"center",marginBottom:4,padding:"5px 8px",borderRadius:7,background:subBg,border:"1px solid "+subBrd,opacity:r.skipped?0.5:1}}>
            <span style={{fontSize:9,fontWeight:700,color:C.ac,textAlign:"center"}}>SS{r.subIdx}</span>
            <input type="number" step="0.5" value={r.kg||""} onChange={viewOnly?undefined:e=>upd(i,"kg",+e.target.value)} readOnly={viewOnly} placeholder="0" style={iS}/>
            <span style={{fontSize:10,color:C.tx3,textAlign:"center"}}>×</span>
            <input type="number" value={r.isAmrap?"":r.reps||""} onChange={viewOnly?undefined:e=>upd(i,"reps",+e.target.value)} readOnly={viewOnly} placeholder={r.isAmrap?"max":"0"} style={iS}/>
            <button onClick={viewOnly?undefined:()=>updR(i,{skipped:!r.skipped,done:false})} style={{width:26,height:26,borderRadius:7,border:"1.5px solid "+(r.skipped?C.o:C.brdL),background:r.skipped?C.o+"30":"transparent",color:r.skipped?C.o:C.tx3,cursor:viewOnly?"default":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",visibility:r.done||viewOnly?"hidden":"visible"}}>—</button>
            <button onClick={viewOnly?undefined:()=>{const nd=!r.done;updR(i,{done:nd,skipped:false});if(nd&&isLastInSet&&onTimerStart)onTimerStart();}} style={{width:26,height:26,borderRadius:7,border:"1.5px solid "+(r.done?C.g:C.brdL),background:r.done?C.g:"transparent",color:r.done?"#fff":C.tx3,cursor:viewOnly?"default":"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</button>
          </div>
          {!isLastInSet&&r.pauseSec>0&&<div style={{textAlign:"center",fontSize:9,color:C.tx3,padding:"2px 0",marginBottom:2}}>{r.pauseSec}s</div>}
        </div>);
      }
      const isIso=r.type==="iso";const isAmrap=r.type==="amrap";const isDrop=r.type==="drop";const isMini=r.type==="mini";const isCluster=r.type==="cluster";
      const showPause=((r.type==="round"||r.type==="mini")&&i<rows.length-1&&rows[i+1]?.type===r.type)||(isCluster&&!r.isLast&&i<rows.length-1&&rows[i+1]?.type==="cluster");
      const delCol=postSession&&!viewOnly?" 24px":"";
      const isUni=isUnilateral&&!isIso&&!isAmrap&&!isDrop&&!isMini&&!isCluster;
      const rowBg=r.done?C.g+"10":r.skipped?C.tx3+"08":isDrop?C.o+"08":isMini?C.ac+"08":isCluster?"#F060C008":C.s2;
      const rowBrd=r.done?C.g+"30":r.skipped?C.tx3+"20":isDrop?C.o+"20":isMini?C.ac+"20":isCluster?"#F060C030":C.brd;
      if(isUni){
        return(<div key={i}><div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr "+((!isAmrap&&showRIR)?"44px ":"")+"28px 28px"+delCol,gap:4,alignItems:"center",marginBottom:4,padding:"6px 8px",borderRadius:4,background:rowBg,border:"1px solid "+rowBrd,opacity:r.skipped?0.5:1,transition:"all 0.2s"}}>
          <span style={{fontSize:9,color:rowC(r),fontWeight:600,textAlign:"center"}}>{rowLabel(r)}</span>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <input type="number" step="0.5" value={r.kg_r??r.kg??""} onChange={viewOnly?undefined:e=>upd(i,"kg_r",+e.target.value)} readOnly={viewOnly} placeholder="kg" style={iS}/>
            <input type="number" value={r.reps_r??r.reps??""} onChange={viewOnly?undefined:e=>upd(i,"reps_r",+e.target.value)} readOnly={viewOnly} placeholder="reps" style={iS}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <input type="number" step="0.5" value={r.kg_l??r.kg??""} onChange={viewOnly?undefined:e=>upd(i,"kg_l",+e.target.value)} readOnly={viewOnly} placeholder="kg" style={iS}/>
            <input type="number" value={r.reps_l??r.reps??""} onChange={viewOnly?undefined:e=>upd(i,"reps_l",+e.target.value)} readOnly={viewOnly} placeholder="reps" style={iS}/>
          </div>
          {!isAmrap&&showRIR&&<RIRPicker value={r.rir??0} onChange={viewOnly?()=>{}:v=>upd(i,"rir",v)}/>}
          <button onClick={viewOnly?undefined:()=>updR(i,{skipped:!r.skipped,done:false})} style={{width:28,height:28,borderRadius:7,border:"1.5px solid "+(r.skipped?C.o:C.brdL),background:r.skipped?C.o+"30":"transparent",color:r.skipped?C.o:C.tx3,cursor:viewOnly?"default":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",visibility:r.done||viewOnly?"hidden":"visible"}}>—</button>
          <button onClick={viewOnly?undefined:()=>{const nd=!r.done;updR(i,{done:nd,skipped:false});if(nd&&onTimerStart)onTimerStart();}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid "+(r.done?C.g:C.brdL),background:r.done?C.g:"transparent",color:r.done?"#fff":C.tx3,cursor:viewOnly?"default":"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",visibility:viewOnly?"hidden":"visible"}}>✓</button>
          {postSession&&!viewOnly&&<button onClick={()=>updateSets(storeKey,rows.filter((_,j)=>j!==i))} style={{width:22,height:22,borderRadius:6,border:"1px solid "+C.r+"50",background:C.rS,color:C.r,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>}
        </div>{showPause&&<div style={{textAlign:"center",fontSize:9,color:C.tx3,padding:"2px 0",marginBottom:2}}>{r.pauseSec}s repos</div>}</div>);
      }
      return(<div key={i}><div style={{display:"grid",gridTemplateColumns:isIso?"40px 1fr 28px 28px"+delCol:"40px 1fr 10px 1fr "+((!isAmrap&&!isMini&&!isDrop&&!isCluster&&showRIR)?"44px ":"")+"28px 28px"+delCol,gap:4,alignItems:"center",marginBottom:4,padding:"6px 8px",borderRadius:4,background:rowBg,border:"1px solid "+rowBrd,opacity:r.skipped?0.5:1,transition:"all 0.2s"}}>
        <span style={{fontSize:9,color:rowC(r),fontWeight:600,textAlign:"center"}}>{rowLabel(r)}</span>
        {!isIso&&<input type="number" step="0.5" value={r.kg||""} onChange={viewOnly?undefined:e=>upd(i,"kg",+e.target.value)} readOnly={viewOnly} placeholder="0" style={iS}/>}
        {isIso&&<div style={{fontSize:11,color:C.tx2,textAlign:"center"}}>{r.holdSec}s</div>}
        {!isIso&&<span style={{fontSize:10,color:C.tx3,textAlign:"center"}}>x</span>}
        {!isIso&&<input type="number" value={r.reps||""} onChange={viewOnly?undefined:e=>upd(i,"reps",+e.target.value)} readOnly={viewOnly} placeholder={isAmrap?"max":"0"} style={iS}/>}
        {!isIso&&!isAmrap&&!isMini&&!isDrop&&!isCluster&&showRIR&&<RIRPicker value={r.rir??0} onChange={viewOnly?()=>{}:v=>upd(i,"rir",v)}/>}
        <button onClick={viewOnly?undefined:()=>updR(i,{skipped:!r.skipped,done:false})} style={{width:28,height:28,borderRadius:7,border:"1.5px solid "+(r.skipped?C.o:C.brdL),background:r.skipped?C.o+"30":"transparent",color:r.skipped?C.o:C.tx3,cursor:viewOnly?"default":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",visibility:r.done||viewOnly?"hidden":"visible"}}>—</button>
        <button onClick={viewOnly?undefined:()=>{const nd=!r.done;updR(i,{done:nd,skipped:false});if(nd&&onTimerStart)onTimerStart();}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid "+(r.done?C.g:C.brdL),background:r.done?C.g:"transparent",color:r.done?"#fff":C.tx3,cursor:viewOnly?"default":"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",visibility:viewOnly?"hidden":"visible"}}>✓</button>
        {postSession&&!viewOnly&&<button onClick={()=>updateSets(storeKey,rows.filter((_,j)=>j!==i))} style={{width:22,height:22,borderRadius:6,border:"1px solid "+C.r+"50",background:C.rS,color:C.r,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>}
      </div>{showPause&&<div style={{textAlign:"center",fontSize:9,color:C.tx3,padding:"2px 0",marginBottom:2}}>{r.pauseSec}s repos</div>}</div>);
    })}
    {(!method||postSession)&&!viewOnly&&<button onClick={()=>updateSets(storeKey,[...rows,{type:"set",kg:rows[rows.length-1]?.kg||0,reps:rows[rows.length-1]?.reps||0,rir:2,done:false}])} style={{width:"100%",padding:"7px 0",borderRadius:4,border:"1px dashed "+C.brdL,background:"transparent",color:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>+ Série</button>}
    <div style={{marginTop:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Mon ressenti</div><textarea value={note} onChange={viewOnly?undefined:e=>setAthleteNotes&&setAthleteNotes(p=>({...p,[storeKey]:e.target.value}))} readOnly={viewOnly} placeholder="Notes perso, sensations..." rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:12,fontFamily:"inherit",resize:"none",boxSizing:"border-box",lineHeight:1.5}}/></div>
  </div>);
}

function SessionEndModal({duration,onSave,C}){
  const[note,setNote]=useState("");
  const[forme,setForme]=useState(7);
  const mins=Math.floor(duration/60);const secs=duration%60;
  const formeColor=forme>=8?C.g:forme>=5?C.o:C.r;
  return(<><div onClick={()=>onSave("",null)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:399}}/><div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:C.s1,borderRadius:"6px 6px 0 0",padding:24,zIndex:400,boxSizing:"border-box"}}>
    <div style={{fontSize:20,fontWeight:800,marginBottom:4,textAlign:"center"}}>Séance terminée !</div>
    <div style={{fontSize:13,color:C.tx2,textAlign:"center",marginBottom:18}}>Durée : {mins}min {secs}s</div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Ressenti, points forts, à améliorer..." style={{width:"100%",minHeight:80,background:C.s2,border:"1px solid "+C.brdL,borderRadius:6,color:C.tx,fontSize:13,fontFamily:"inherit",padding:"10px 12px",resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:16}}/>
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:600,color:C.tx2}}>Forme du jour</span><span style={{fontSize:20,fontWeight:900,color:formeColor,fontFamily:"monospace"}}>{forme}<span style={{fontSize:11,color:C.tx3}}>/10</span></span></div>
      <input type="range" min={0} max={10} value={forme} onChange={e=>setForme(+e.target.value)} style={{width:"100%",accentColor:formeColor,height:6,cursor:"pointer"}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.tx3,marginTop:4}}><span>Épuisé</span><span>Top shape</span></div>
    </div>
    <button onClick={()=>onSave(note,forme)} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:C.g,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>Valider la séance</button>
    <button onClick={()=>onSave("",null)} style={{width:"100%",padding:"10px 0",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Passer</button>
  </div></>);
}

function LogView({exos,sets,updSets,completedSessions,completeSession,uncompleteSession,goals,weeklyTarget={},currentWeek,allMethods,athleteNotes,setAthleteNotes,sessions,blockConfig,initialSess=null,timerLeft,timerDur,timerActive,timerFinished,onTimerSetDur,onTimerStart,onTimerStop,viewOnly=false,sessionLogs={},setSessionLogs,freeSessions=[],setFreeSessions,onAddExercise,weekSchedule={},onSessionCompleted}){
  const tw=blockConfig?.totalWeeks||6;const dw=blockConfig?.deloadWeek||0;
  const weeksArr=Array.from({length:tw},(_,i)=>i+1);
  const[step,setStep]=useState(initialSess?1:0);const[wk,setWk]=useState(currentWeek);
  const[selectedSess,setSelectedSess]=useState(initialSess||null);const[openEx,setOpenEx]=useState(null);
  const[showEndModal,setShowEndModal]=useState(false);const[endDuration,setEndDuration]=useState(0);
  const[showSkipWarning,setShowSkipWarning]=useState(false);
  const[selectedFree,setSelectedFree]=useState(null);const[showFreeEndModal,setShowFreeEndModal]=useState(false);const[freeEndDuration,setFreeEndDuration]=useState(0);
  const[sessStartedAt,setSessStartedAt]=useState(null);const[elapsedSecs,setElapsedSecs]=useState(0);
  const[freeStartedAt,setFreeStartedAt]=useState(null);const[freeElapsed,setFreeElapsed]=useState(0);
  useEffect(()=>{setWk(currentWeek);},[currentWeek]);
  const sid=selectedSess?.id||null;const exercises=sid?exos[sid]||[]:[];
  const currentSess=useMemo(()=>sid?(sessions.find(s=>s.id===sid)||selectedSess):selectedSess,[sid,sessions,selectedSess]);
  const exercisesSorted=useMemo(()=>{if(!exercises.length)return exercises;const sBlocs=getSessionBlocs(currentSess,exercises);const order=sBlocs.map(b=>b.id);return[...exercises].sort((a,b)=>{const ai=order.indexOf(a.bloc??'');const bi=order.indexOf(b.bloc??'');if(ai===bi)return 0;if(ai===-1)return 1;if(bi===-1)return-1;return ai-bi;});},[exercises,currentSess]);
  const sessIsDone=(completedSessions[wk]||[]).includes(sid);
  const allSetsDone=useMemo(()=>{if(!sid||!exercises.length)return false;return exercises.every(ex=>{const s=sets[ex.id+"_"+wk];return s?.length>0&&s.every(x=>x.done||x.skipped);});},[exercises,sets,wk,sid]);
  // Restore session start from localStorage
  useEffect(()=>{if(!sid||step!==1){setSessStartedAt(null);return;}try{const d=JSON.parse(localStorage.getItem('mpp:sess_start')||'null');if(d?.sid===sid&&d?.wk===wk){setSessStartedAt(d.startedAt);}else{setSessStartedAt(null);}}catch{}},[sid,wk,step]);
  // Restore free session start from localStorage
  useEffect(()=>{if(!selectedFree||step!==2){setFreeStartedAt(null);return;}try{const d=JSON.parse(localStorage.getItem('mpp:free_start')||'null');if(d?.id===selectedFree.id){setFreeStartedAt(d.startedAt);}else{setFreeStartedAt(null);}}catch{}},[selectedFree?.id,step]);
  // Live elapsed counters
  useEffect(()=>{if(!sessStartedAt)return;setElapsedSecs(Math.floor((Date.now()-sessStartedAt)/1000));const t=setInterval(()=>setElapsedSecs(Math.floor((Date.now()-sessStartedAt)/1000)),1000);return()=>clearInterval(t);},[sessStartedAt]);
  useEffect(()=>{if(!freeStartedAt)return;setFreeElapsed(Math.floor((Date.now()-freeStartedAt)/1000));const t=setInterval(()=>setFreeElapsed(Math.floor((Date.now()-freeStartedAt)/1000)),1000);return()=>clearInterval(t);},[freeStartedAt]);
  const fmtTime=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return(h>0?h+"h ":"")+m+"min "+String(sec).padStart(2,"0")+"s";};
  const startSess=()=>{const at=Date.now();localStorage.setItem('mpp:sess_start',JSON.stringify({sid,wk,startedAt:at}));setSessStartedAt(at);};
  const startFree=()=>{const at=Date.now();localStorage.setItem('mpp:free_start',JSON.stringify({id:selectedFree.id,startedAt:at}));setFreeStartedAt(at);};
  const endSess=()=>{const dur=sessStartedAt?Math.floor((Date.now()-sessStartedAt)/1000):0;setEndDuration(dur);setShowEndModal(true);};
  const endFree=()=>{const dur=freeStartedAt?Math.floor((Date.now()-freeStartedAt)/1000):0;setFreeEndDuration(dur);setShowFreeEndModal(true);};
  const onSessValidate=(note,forme)=>{completeSession(sid,wk,note||undefined);if(setSessionLogs)setSessionLogs(prev=>({...prev,[sid+"_"+wk]:{note,forme,duration:endDuration,date:new Date().toISOString()}}));localStorage.removeItem('mpp:sess_start');setSessStartedAt(null);setShowEndModal(false);if(onSessionCompleted)onSessionCompleted(sid,wk);};
  const onFreeValidate=(note,forme)=>{const updFn=(patch)=>{const updated={...selectedFree,...patch};setSelectedFree(updated);setFreeSessions(prev=>prev.map(f=>f.id===selectedFree.id?updated:f));};updFn({completed:true,duration:freeEndDuration,note,forme});localStorage.removeItem('mpp:free_start');setFreeStartedAt(null);setShowFreeEndModal(false);};
  const exosMap=useMemo(()=>exercises.reduce((a,e)=>({...a,[e.id]:e.name}),{}),[exercises]);
  const[addBankModal,setAddBankModal]=useState(false);
  const[bankExos,setBankExos]=useState([]);
  const[bankSearch,setBankSearch]=useState("");
  const[bankPick,setBankPick]=useState(null);
  const[bankForm,setBankForm]=useState({sets:3,repsRange:"10",kg:"",rir:2});
  const[videoEx,setVideoEx]=useState(null);
  useEffect(()=>{supabase.from('exercises').select('id,name,target,ex_type,youtube_id,image_url').order('name').then(({data})=>{if(data)setBankExos(data);});},[]);
  const bankFiltered=bankExos.filter(e=>!bankSearch||e.name.toLowerCase().includes(bankSearch.toLowerCase())).slice(0,30);
  const addFromBankConfirm=()=>{
    if(!bankPick||!sid)return;
    const id="athl_"+sid+"_"+Date.now();
    const ex={id,name:bankPick.name,target:bankPick.target||"Pecs",exType:bankPick.ex_type||"muscu",isFlexibility:false,bloc:null,tier:3,weeks:{[wk]:{sets:+bankForm.sets||3,repsRange:bankForm.repsRange||"10",...(bankForm.kg?{kg:+bankForm.kg}:{}),rir:bankForm.rir??2}}};
    if(onAddExercise)onAddExercise(sid,ex);
    const sk=id+"_"+wk;
    const rows=Array.from({length:+bankForm.sets||3},()=>({type:"set",kg:bankForm.kg?+bankForm.kg:0,reps:parseFloat(bankForm.repsRange)||10,rir:bankForm.rir??2,done:false}));
    updSets(sk,rows);
    setAddBankModal(false);setBankSearch("");setBankPick(null);setBankForm({sets:3,repsRange:"10",kg:"",rir:2});
  };

  const crumb=(<div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px 0",fontSize:11,color:C.tx3,flexWrap:"wrap"}}>
    <button onClick={()=>{setStep(0);setSelectedSess(null);}} style={{background:"none",border:"none",color:step>0?C.tx2:C.ac,cursor:"pointer",fontFamily:"inherit",fontSize:11,padding:0,fontWeight:step===0?700:400}}>Seances</button>
    {step>=1&&selectedSess&&<><span>&gt;</span><span style={{color:C.ac,fontWeight:700}}>{selectedSess.name}</span></>}
  </div>);

  if(step===0){
    const weekDone=(completedSessions[wk]||[]).length;const weekTotal=weeklyTarget[wk]||sessions.filter(s=>(exos[s.id]||[]).some(ex=>ex.weeks?.[wk]?.sets)).length||goals.sessionsPerWeek;const weekPct=Math.min(Math.round((weekDone/weekTotal)*100),100);
    const lsActiveSess=(()=>{try{const d=JSON.parse(localStorage.getItem('mpp:sess_start')||'null');if(d?.sid&&d?.wk){const s=sessions.find(x=>x.id===d.sid);return s?{...d,name:s.name,short:s.short}:null;}return null;}catch{return null;}})();
    const lsActiveFree=(()=>{try{const d=JSON.parse(localStorage.getItem('mpp:free_start')||'null');if(d?.id){const f=freeSessions.find(x=>x.id===d.id);return f&&!f.completed?{...d,name:f.name}:null;}return null;}catch{return null;}})();
    return(<div style={{padding:"0 0 40px"}}><div style={{padding:"16px 16px 0"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
      <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.5px"}}>Semaine {wk}</div>
      <div style={{fontSize:12,fontWeight:700,color:weekPct>=100?C.g:C.ac,padding:"4px 10px",borderRadius:4,background:weekPct>=100?C.gS:C.acS}}>{weekDone}/{weekTotal} seances</div>
    </div>
    <div style={{height:4,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:16}}><div style={{height:"100%",width:weekPct+"%",background:weekPct>=100?C.g:C.ac,borderRadius:3,transition:"width 0.4s"}}/></div>
    <div style={{display:"flex",gap:4,marginBottom:18,overflowX:"auto",scrollbarWidth:"none",paddingBottom:2}}>{weeksArr.map(w=>{const wd=(completedSessions[w]||[]).length,total=goals.sessionsPerWeek,complete=wd>=total,isCur=w===currentWeek,isDL=w===dw,sel=w===wk;return(<button key={w} onClick={()=>setWk(w)} style={{flexShrink:0,width:42,padding:"8px 0",borderRadius:4,border:sel?"2px solid "+(isDL?C.b:complete?C.g:C.ac):"1px solid "+(complete?C.g+"30":C.brd),background:sel?(isDL?C.bS:complete?C.gS:C.acS):(complete?C.g+"08":"transparent"),cursor:"pointer",fontFamily:"inherit",textAlign:"center",position:"relative",transition:"all 0.2s"}}>{isDL&&<span style={{position:"absolute",top:-5,right:-2,fontSize:6,background:C.b,color:"#fff",padding:"1px 3px",borderRadius:3,fontWeight:700}}>DL</span>}{isCur&&!sel&&<div style={{position:"absolute",top:-2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:C.ac}}/>}<div style={{fontSize:10,fontWeight:sel?800:600,color:sel?(isDL?C.b:complete?C.g:C.ac):(complete?C.g:C.tx3)}}>S{w}</div>{complete&&<div style={{fontSize:8,color:C.g,marginTop:1}}>✓</div>}</button>);})}</div>
    {dw>0&&wk===dw&&<div style={{padding:"10px 14px",borderRadius:4,background:C.bS,border:"1px solid "+C.b+"40",marginBottom:14,fontSize:12,color:C.b,fontWeight:600,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>~</span> Deload - Recuperation active</div>}
    {(()=>{const DAY_S=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];return(<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>{sessions.map(s=>{
      const done=(completedSessions[wk]||[]).includes(s.id);
      const sessExos=exos[s.id]||[];const hasExos=sessExos.length>0;
      const exosDone=sessExos.filter(ex=>{const sk=ex.id+"_"+wk;const rows=sets[sk]||[];return rows.length>0&&rows.every(r=>r.done||r.skipped);}).length;
      const muscles=[...new Set(sessExos.map(e=>e.target))];
      const dayLabel=s.day_of_week!=null?DAY_S[s.day_of_week]:null;
      const sLog=sessionLogs?.[s.id+"_"+wk];
      return(<button key={s.id} onClick={()=>{if(hasExos&&!viewOnly){setSelectedSess(s);setStep(1);setOpenEx(null);}}} style={{width:"100%",padding:0,borderRadius:6,border:"1.5px solid "+(done?C.g+"40":C.brd),background:C.s1,cursor:!hasExos||viewOnly?"default":"pointer",fontFamily:"inherit",textAlign:"left",display:"block",opacity:hasExos?1:0.35,overflow:"hidden",position:"relative",transition:"all 0.2s",boxSizing:"border-box"}}>
        {done&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:C.g,borderRadius:"6px 6px 0 0"}}/>}
        <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:6,background:done?C.gS:C.acS,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"1.5px solid "+(done?C.g+"40":C.ac+"30")}}>
            {done?<span style={{fontSize:20,color:C.g,fontWeight:700}}>✓</span>:<span style={{fontSize:13,fontWeight:800,color:C.ac,letterSpacing:"-0.3px"}}>{s.short}</span>}
          </div>
          <div style={{flex:1,overflow:"hidden",minWidth:0}}>
            <div style={{fontSize:14,fontWeight:800,color:done?C.g:C.tx,letterSpacing:"-0.3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
            <div style={{fontSize:10,color:C.tx3,marginTop:1,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
              {dayLabel&&<span style={{fontWeight:600,color:done?C.g+"90":C.tx3}}>{dayLabel}</span>}
              {dayLabel&&<span>·</span>}
              <span>{sessExos.length} exercice{sessExos.length>1?"s":""}</span>
              {done&&sLog?.duration&&<><span>·</span><span>{fmtTime(sLog.duration)}</span></>}
            </div>
            {hasExos&&muscles.length>0&&<div style={{display:"flex",gap:3,marginTop:5,flexWrap:"wrap"}}>{muscles.slice(0,5).map(m=>{const mc=getMC(m);return(<span key={m} style={{fontSize:8,padding:"1px 6px",borderRadius:4,background:mc+"18",color:mc,fontWeight:600}}>{mL(m)}</span>);})}</div>}
            {!done&&hasExos&&exosDone>0&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:6}}><div style={{flex:1,height:3,background:C.s2,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:Math.round((exosDone/sessExos.length)*100)+"%",background:C.ac,borderRadius:2}}/></div><span style={{fontSize:9,color:C.tx3,flexShrink:0}}>{exosDone}/{sessExos.length}</span></div>}
            {done&&sLog?.note&&<div style={{fontSize:9,color:C.tx3,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontStyle:"italic"}}>"{sLog.note}"</div>}
          </div>
          {done&&!viewOnly?<button onClick={e=>{e.stopPropagation();uncompleteSession(s.id,wk);}} style={{width:22,height:22,borderRadius:6,border:"1px solid "+C.r+"50",background:C.rS,color:C.r,fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>×</button>:(!done&&hasExos&&!viewOnly&&<span style={{fontSize:16,color:C.tx3,flexShrink:0}}>›</span>)}
        </div>
      </button>);})}</div>);})()}
    {(()=>{const next=sessions.find(s=>!(completedSessions[wk]||[]).includes(s.id)&&(exos[s.id]||[]).length>0);if(!next)return weekPct>=100?<div style={{padding:"14px",borderRadius:6,background:C.gS,border:"1px solid "+C.g+"40",color:C.g,fontSize:13,fontWeight:700,textAlign:"center"}}>Semaine {wk} complete !</div>:null;if(viewOnly)return null;return(<button onClick={()=>{setSelectedSess(next);setStep(1);}} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-0.3px"}}>Commencer {next.short} - {next.name} ›</button>);})()}
    {!viewOnly&&freeSessions.filter(f=>f.date===new Date().toISOString().slice(0,10)).map(f=>(<button key={f.id} onClick={()=>{setSelectedFree(f);setStep(2);}} style={{width:"100%",padding:"12px 14px",borderRadius:6,border:"1px solid "+(f.completed?C.g+"40":C.brdL),background:C.s1,cursor:"pointer",fontFamily:"inherit",textAlign:"left",marginTop:6,display:"flex",alignItems:"center",gap:10}}><div style={{width:38,height:38,borderRadius:4,background:f.completed?C.gS:C.acS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.ac}}>Libre</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:f.completed?C.g:C.tx}}>{f.name}</div><div style={{fontSize:10,color:C.tx3}}>{f.exercises.length} exo{f.completed?" · Terminée":""}</div></div>{f.completed&&<span style={{color:C.g,fontSize:14}}>✓</span>}</button>))}
    {(()=>{
      const extras=weekSchedule?.extras||{};
      // Calculer la plage de dates de la semaine sélectionnée
      const wkExtras=(()=>{
        if(blockConfig?.startDate){
          const s=new Date(blockConfig.startDate);
          s.setDate(s.getDate()+(wk-1)*7);
          const e=new Date(s);e.setDate(e.getDate()+6);
          const fmt=d=>d.toISOString().slice(0,10);
          const allEntries=[];
          for(const[dateKey,acts] of Object.entries(extras)){
            const d=dateKey.slice(0,4)+"-"+dateKey.slice(4,6)+"-"+dateKey.slice(6,8);
            if(d>=fmt(s)&&d<=fmt(e))acts.forEach(a=>allEntries.push({...a,date:d}));
          }
          return allEntries.sort((a,b)=>a.date<b.date?-1:1);
        }
        // Sans startDate : afficher les 7 derniers jours
        const cutoff=new Date();cutoff.setDate(cutoff.getDate()-6);
        const cutStr=cutoff.toISOString().slice(0,10);
        const allEntries=[];
        for(const[dateKey,acts] of Object.entries(extras)){
          const d=dateKey.slice(0,4)+"-"+dateKey.slice(4,6)+"-"+dateKey.slice(6,8);
          if(d>=cutStr)acts.forEach(a=>allEntries.push({...a,date:d}));
        }
        return allEntries.sort((a,b)=>a.date<b.date?-1:1);
      })();
      if(!wkExtras.length)return null;
      return(<>
        <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:16,marginBottom:6}}>Activités libres</div>
        {wkExtras.map((a,i)=>{
          const INT_COLORS=["#22c55e","#84cc16","#eab308","#f97316","#ef4444","#dc2626","#b91c1c","#991b1b","#7f1d1d","#450a0a"];
          const ic=a.intensity?INT_COLORS[a.intensity-1]:C.y;
          return(<div key={a.id||i} style={{width:"100%",padding:"10px 14px",borderRadius:6,border:"1px solid "+C.y+"40",background:C.y+"08",marginBottom:6,display:"flex",alignItems:"center",gap:10,boxSizing:"border-box"}}>
            <div style={{width:38,height:38,borderRadius:4,background:C.y+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.y,flexShrink:0}}>{a.emoji||"ACT"}</div>
            <div style={{flex:1,overflow:"hidden",minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:C.y,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.label}</div>
              <div style={{fontSize:10,color:C.tx3,marginTop:1,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                <span>{a.date}</span>
                {a.duration&&<><span>·</span><span>{a.duration} min</span></>}
                {a.intensity&&<><span>·</span><span style={{color:ic,fontWeight:600}}>RPE {a.intensity}/10</span></>}
              </div>
              {a.notes&&<div style={{fontSize:9,color:C.tx3,marginTop:2,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{a.notes}"</div>}
            </div>
          </div>);
        })}
      </>);
    })()}
    {!viewOnly&&<button onClick={()=>{const id="free_"+Date.now();const fs={id,name:"Séance libre",date:new Date().toISOString().slice(0,10),completed:false,duration:null,note:"",exercises:[]};setFreeSessions(prev=>[...prev,fs]);setSelectedFree(fs);setStep(2);}} style={{width:"100%",padding:"12px 0",borderRadius:6,border:"1px dashed "+C.brdL,background:"transparent",color:C.tx3,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>+ Séance libre</button>}
  </div>
  {lsActiveSess&&<div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:300,maxWidth:360,width:"calc(100% - 32px)"}}>
    <button onClick={()=>{const s=sessions.find(x=>x.id===lsActiveSess.sid);if(s){setSelectedSess(s);setWk(lsActiveSess.wk);setStep(1);}}} style={{width:"100%",padding:"12px 16px",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
      <span style={{fontSize:16}}>▶</span><span>Reprendre — {lsActiveSess.name}</span>
    </button>
  </div>}
  {lsActiveFree&&!lsActiveSess&&<div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:300,maxWidth:360,width:"calc(100% - 32px)"}}>
    <button onClick={()=>{const f=freeSessions.find(x=>x.id===lsActiveFree.id);if(f){setSelectedFree(f);setStep(2);}}} style={{width:"100%",padding:"12px 16px",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
      <span style={{fontSize:16}}>▶</span><span>Reprendre — {lsActiveFree.name}</span>
    </button>
  </div>}
  </div>);}

  if(step===1&&sid){let lb=null;return(<div style={{padding:"0 0 40px"}}>{crumb}<div style={{padding:"12px 16px 0"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"14px 16px",borderRadius:6,background:C.s1,border:"1px solid "+C.ac+"25"}}><div style={{flex:1}}><div style={{fontSize:17,fontWeight:800}}>{selectedSess.name}</div><div style={{fontSize:11,color:C.tx3,marginTop:2}}>{exercises.length} exo - S{wk}</div></div>{sessStartedAt&&!sessIsDone&&<div style={{padding:"4px 10px",borderRadius:4,background:C.acS,color:C.ac,fontSize:13,fontWeight:800,fontFamily:"monospace"}}>{fmtTime(elapsedSecs)}</div>}{sessIsDone&&<div style={{padding:"4px 10px",borderRadius:4,background:C.gS,color:C.g,fontSize:11,fontWeight:700}}>OK</div>}</div>
    {!sessIsDone&&!viewOnly&&!sessStartedAt&&<button onClick={startSess} style={{width:"100%",marginBottom:16,padding:"15px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>▶ Débuter la séance</button>}
    {wk===dw&&<div style={{padding:"8px 14px",borderRadius:4,background:C.bS,border:"1px solid "+C.b+"40",marginBottom:10,fontSize:11,color:C.b,fontWeight:600}}>Semaine deload</div>}
    <div style={{display:"flex",gap:3,marginBottom:14,flexWrap:"wrap"}}>{weeksArr.map(w=><button key={w} onClick={()=>setWk(w)} style={{flex:1,minWidth:36,padding:"9px 0",borderRadius:7,border:w===wk?"2px solid "+C.ac:"1px solid "+(w===dw?C.b+"60":C.brd),background:w===wk?C.acS:(w===dw?C.bS:"transparent"),color:w===wk?C.ac:(w===dw?C.b:C.tx3),fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",position:"relative"}}>{w===dw&&<span style={{position:"absolute",top:-6,right:-2,fontSize:7,background:C.b,color:"#fff",padding:"1px 4px",borderRadius:4,fontWeight:700}}>DL</span>}S{w}</button>)}</div>
    {sessStartedAt&&<div style={{marginBottom:14,background:C.s1,borderRadius:6,padding:"10px 12px",border:"1px solid "+C.brd}}><div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Timer repos</div><RestTimer timerLeft={timerLeft} timerDur={timerDur} timerActive={timerActive} timerFinished={timerFinished} onSetDur={onTimerSetDur} onStart={onTimerStart} onStop={onTimerStop}/></div>}
    <div style={{opacity:(!sessStartedAt&&!sessIsDone)?0.3:1,transition:"opacity 0.3s"}}>{(()=>{
      const rGroups=[];
      exercisesSorted.forEach(ex=>{rGroups.push({ss:false,ex});});
      // ── Helper : rendu d'une carte exercice ───────────────────────────────
      const exCard=(ex,inSS,isLastInSS)=>{
        const wd=ex.weeks[wk];const sessB=sessBlocs?.find(b=>b.id===ex.bloc)||null;const bt=BT[ex.bloc]||(sessB?{c:sessB.color,l:sessB.label}:{c:C.tx3,l:ex.bloc});
        const isOpen=openEx===ex.id;const sk=ex.id+"_"+wk;
        const rows=sets[sk]||[];const done=rows.filter(r=>r.done||r.skipped).length;
        const prevData=(()=>{for(let w=wk-1;w>=1;w--){const s=(sets[ex.id+"_"+w]||[]).filter(r=>r.done);if(s.length>0)return{sets:s,week:w};}return null;})();
        const total=rows.length||wd?.sets||0;const allDone=total>0&&done===total;
        const method=wd?.method;const mp=wd?.methodParams;const mInfo=allMethods[method];
        const methodAttachment=wd?.method_attachment; // méthode bibliothèque
        const eType=ex.exType||(ex.isFlexibility?"mobilite":"muscu");const isFlex=eType!=="muscu"&&eType!=="halterophilie";
        const effectivePlanned=wd; // contient setKgs/setPctRms peuplés depuis methodConfigToWeekFields
        const effectiveKg=wd?.kg;
        const kgFromActual=false;
        const bankEx=bankExos.find(b=>(ex.exercise_id&&b.id===ex.exercise_id)||fuzzyExMatch(b.name,ex.name));
        const hasVideo=!!(bankEx?.youtube_id||bankEx?.image_url);
        return(
          <div key={ex.id}>
            <div style={inSS?{background:"transparent",overflow:"hidden"}:{background:C.s1,borderRadius:6,marginBottom:6,border:"1px solid "+(allDone?C.g+"50":C.brd),overflow:"hidden"}}>
              <div onClick={()=>setOpenEx(isOpen?null:ex.id)} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer",gap:10}}>
                <div style={{width:3,height:32,borderRadius:2,background:allDone?C.g:bt.c,flexShrink:0}}/>
                <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontSize:14,fontWeight:600}}>{ex.name}</span>{allDone&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:5,background:C.gS,color:C.g}}>OK</span>}{isFlex&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.b+"20",color:C.b,fontWeight:600}}>Souplesse</span>}{mInfo&&!isFlex&&<span style={{padding:"3px 8px",borderRadius:6,border:"1px solid "+mInfo.c+"60",background:mInfo.c+"22",color:mInfo.c,fontSize:10,fontWeight:700}}>{mInfo.e} {mInfo.label}</span>}{methodAttachment&&!method&&!isFlex&&<span style={{padding:"3px 8px",borderRadius:6,border:"1px solid "+C.ac+"60",background:C.acS,color:C.ac,fontSize:10,fontWeight:700}}>{methodAttachment.method_name||"Méthode"}</span>}</div>{wd?(!isFlex?<div style={{fontSize:11,color:C.tx2,marginTop:3}}>{wd.pdc?"PDC":wd.pct_rm!=null?wd.pct_rm+"%RM":(effectiveKg??wd.kg)!=null?(effectiveKg??wd.kg)+"kg":methodAttachment?.method_name||""}{(wd.pdc||wd.kg!=null||wd.pct_rm!=null)?" - ":""}{(wd.sets||wd.repsRange)?fmtMR(method,mp,wd.sets||"?",wd.repsRange):""}{wd.tempo?" - "+wd.tempo:""}{(!method||method==="dropset"||method==="restpause")?" - ":""}{(!method||method==="dropset"||method==="restpause")?<span style={{color:rC(wd.rir??2)}}>RIR {rL(wd.rir??2)}</span>:""}{kgFromActual&&<span style={{fontSize:9,color:C.g,marginLeft:6,fontWeight:600}}>↑ S{wk-1}+{exKgStep}kg</span>}</div>:<div style={{fontSize:11,color:C.tx2,marginTop:3}}>{wd.sets}x{wd.repsRange||"?"}{wd.tempo?" tempo "+wd.tempo:""}</div>):<div style={{fontSize:11,color:C.tx3,marginTop:3,fontStyle:"italic"}}>Non programme S{wk}</div>}{wd?.coachNote&&<div style={{marginTop:6,padding:"6px 10px",borderRadius:6,background:C.coachS,border:"1px solid "+C.coach+"30",fontSize:11,color:C.coach,lineHeight:1.5}}>{wd.coachNote}</div>}{!isFlex&&method&&mp&&mInfo&&<div style={{fontSize:10,color:mInfo.c,marginTop:4}}>{method==="dropset"&&(mp.drops||2)+" drops -"+(mp.pct||20)+"%"}{method==="myoreps"&&(mp.activation||12)+" + "+(mp.minisets||4)+"x"+(mp.reps_mini||5)}{method==="restpause"&&(mp.rounds||3)+" rounds"}{method==="cluster"&&clusterReps(mp).join("+")+", "+(mp.pause||10)+"s"}{method==="amrap"&&(mp.type==="timed"?mp.duration+"s":"A l echec")}{method==="isometrique"&&(mp.positions||2)+"x"+(mp.hold_sec||30)+"s"}</div>}{methodAttachment&&!method&&!isFlex&&methodAttachment.prescription&&<div style={{fontSize:10,color:C.ac,marginTop:4,fontFamily:"monospace"}}>{methodAttachment.prescription}</div>}</div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                  {hasVideo&&<button onClick={e=>{e.stopPropagation();setVideoEx(bankEx);}} style={{background:'none',border:'none',color:C.tx3,fontSize:16,cursor:'pointer',padding:'0',lineHeight:1,pointerEvents:'all'}} title="Voir la vidéo">Vid</button>}
                  {rows.length>0&&<span style={{fontSize:12,fontWeight:700,color:allDone?C.g:C.tx2,fontFamily:"monospace"}}>{done}/{total}</span>}
                  <span style={{fontSize:11,color:C.tx3}}>{isOpen?"^":"v"}</span>
                </div>
              </div>
              {isOpen&&(<div style={{padding:"0 14px 14px",borderTop:"1px solid "+C.brd}}>{wd?(<>{!isFlex&&<div style={{display:"grid",gridTemplateColumns:wd.pdc?"1fr":"1fr 1fr",gap:6,paddingTop:12,marginBottom:14}}>{!wd.pdc&&<div style={{background:C.s2,borderRadius:4,padding:"8px 10px",textAlign:"center"}}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:2}}>1RM estime</div><div style={{fontSize:18,fontWeight:800,color:C.ac}}>{e1rm((effectivePlanned||wd)?.kg||0,parseReps(wd.repsRange)||1)} kg</div></div>}<div style={{background:C.s2,borderRadius:4,padding:"8px 10px",textAlign:"center"}}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:2}}>RIR cible</div><div style={{fontSize:18,fontWeight:800,color:rC(wd.rir??2)}}>RIR {rL(wd.rir??2)}</div></div></div>}{kgFromActual&&<div style={{marginBottom:10,padding:"6px 10px",borderRadius:4,background:C.g+"10",border:"1px solid "+C.g+"30",fontSize:10,color:C.g,display:"flex",alignItems:"center",gap:6}}><span>Basé sur S{wk-1} réel :</span><span style={{fontWeight:700}}>{prevMedianKg}kg → {effectiveKg}kg (+{exKgStep}kg)</span></div>}{prevData&&<div style={{marginBottom:12,padding:"10px 12px",borderRadius:4,background:C.s2,border:"1px solid "+C.brd}}><div style={{fontSize:9,fontWeight:700,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>↩ Dernière fois · Sem. {prevData.week}</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{prevData.sets.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><span style={{fontSize:10,color:C.tx3,minWidth:20}}>S{i+1}</span><span style={{fontWeight:700,color:C.tx}}>{s.kg!=null?s.kg+" kg":"—"}</span><span style={{color:C.tx3}}>×</span><span style={{fontWeight:700,color:C.tx}}>{s.reps!=null?s.reps:"—"}</span>{s.rir!=null&&<span style={{fontSize:10,color:C.tx3}}>· RIR {s.rir}</span>}</div>))}</div></div>}<SmartSetEditor planned={effectivePlanned||wd} storeKey={sk} sessionSets={sets} updateSets={updSets} athleteNotes={athleteNotes} setAthleteNotes={setAthleteNotes} method={isFlex?null:method} methodParams={isFlex?null:mp} allMethods={allMethods} exosMap={exosMap} viewOnly={viewOnly||(!sessStartedAt&&!sessIsDone)} onTimerStart={onTimerStart} postSession={sessIsDone&&!viewOnly} isUnilateral={!!(bankEx?.is_unilateral||ex.is_unilateral)}/></>):<div style={{padding:"14px 0",fontSize:12,color:C.tx3,textAlign:"center"}}>Pas de prescription S{wk}</div>}</div>)}
            </div>
          </div>
        );
      };
      // ── Rendu des groupes ─────────────────────────────────────────────────
      const sessBlocs=getSessionBlocs(currentSess,exercises);
      return rGroups.map((item)=>{
        const ex=item.ex;const dynBloc=sessBlocs.find(b=>b.id===ex.bloc)||null;
        const bt=BT[ex.bloc]||(dynBloc?{c:dynBloc.color,l:dynBloc.label}:{c:C.tx3,l:ex.bloc});
        const showH=ex.bloc!==lb;lb=ex.bloc;
        const blocMethodLabel=dynBloc?.method?(BLOC_METHODS.find(m=>m.v===dynBloc.method)||{l:dynBloc.method}).l:null;
        return(<div key={ex.id}>{showH&&<div style={{margin:"14px 0 0",borderRadius:"4px 4px 0 0",background:bt.c+"18",border:"1px solid "+bt.c+"35",borderBottom:"none"}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px"}}><div style={{width:4,height:16,borderRadius:2,background:bt.c,flexShrink:0}}/><span style={{fontSize:10,fontWeight:700,color:bt.c,textTransform:"uppercase",letterSpacing:"0.8px"}}>{bt.l}</span>{blocMethodLabel&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:bt.c+"30",color:bt.c,fontWeight:700,letterSpacing:"0.3px"}}>{blocMethodLabel}{dynBloc?.departureInterval?(" "+dynBloc.departureInterval+"s"):""}</span>}{dynBloc?.sets&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:bt.c+"20",color:bt.c,fontWeight:600}}>{dynBloc.sets} séries</span>}</div>{dynBloc?.instructions&&<div style={{padding:"0 12px 8px",fontSize:11,color:bt.c,lineHeight:1.5,fontStyle:"italic"}}>{dynBloc.instructions}</div>}</div>}{exCard(ex,false,false)}</div>);
      });
    })()}</div>
    {!sessIsDone&&!viewOnly&&sessStartedAt&&<button onClick={()=>{const incomplete=exercisesSorted.filter(ex=>{const rows=sets[ex.id+"_"+wk]||[];return rows.length===0||rows.some(r=>!r.done&&!r.skipped);});if(incomplete.length>0){setShowSkipWarning(true);}else{endSess();}}} style={{width:"100%",marginTop:16,padding:"15px 0",borderRadius:6,border:"none",background:C.g,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Terminer la séance</button>}
    {sessIsDone&&<div style={{marginTop:16}}><div style={{padding:"14px 0",borderRadius:6,background:C.gS,border:"1px solid "+C.g+"40",color:C.g,fontSize:14,fontWeight:700,textAlign:"center",marginBottom:8}}>Séance validée !</div>{sessionLogs?.[sid+"_"+wk]?.note&&<div style={{padding:"10px 12px",borderRadius:4,background:C.s2,fontSize:12,color:C.tx2,lineHeight:1.5,fontStyle:"italic",marginBottom:6}}>"{sessionLogs[sid+"_"+wk].note}"</div>}{sessionLogs?.[sid+"_"+wk]?.duration&&<div style={{fontSize:11,color:C.tx3,textAlign:"center",marginBottom:8}}>Durée : {fmtTime(sessionLogs[sid+"_"+wk].duration)}</div>}{!viewOnly&&<button onClick={()=>uncompleteSession(sid,wk)} style={{width:"100%",padding:"10px 0",borderRadius:4,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Annuler la validation</button>}</div>}
    {showSkipWarning&&(()=>{
      const incomplete=exercisesSorted.filter(ex=>{const rows=sets[ex.id+"_"+wk]||[];return rows.length===0||rows.some(r=>!r.done&&!r.skipped);});
      const autoSkipAndValidate=()=>{
        incomplete.forEach(ex=>{
          const sk=ex.id+"_"+wk;
          const wd=ex.weeks[wk];
          const existing=sets[sk]||[];
          const rows=existing.length>0?existing:generateRows(wd,wd?.method,wd?.methodParams);
          updSets(sk,rows.map(r=>(!r.done&&!r.skipped)?{...r,skipped:true}:r));
        });
        setShowSkipWarning(false);
        endSess();
      };
      return(<div style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setShowSkipWarning(false)}>
        <div style={{background:C.s1,borderRadius:6,padding:24,width:'100%',maxWidth:340,border:'1px solid '+C.brd}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:800,color:C.tx,marginBottom:6}}>Séries non renseignées</div>
          <div style={{fontSize:12,color:C.tx3,marginBottom:12,lineHeight:1.6}}>Les exercices suivants ont des séries non validées :</div>
          <div style={{marginBottom:16,display:'flex',flexDirection:'column',gap:4,maxHeight:200,overflowY:'auto'}}>
            {incomplete.map(ex=>{
              const rows=sets[ex.id+"_"+wk]||[];
              const untouchedCount=rows.length===0?(ex.weeks[wk]?.sets||0):rows.filter(r=>!r.done&&!r.skipped).length;
              return(<div key={ex.id} style={{fontSize:12,padding:'7px 10px',borderRadius:4,background:C.o+'12',border:'1px solid '+C.o+'30',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:C.tx,fontWeight:600}}>{ex.name}</span>
                <span style={{color:C.o,fontWeight:700,flexShrink:0,marginLeft:8}}>{untouchedCount} série{untouchedCount>1?'s':''} manquante{untouchedCount>1?'s':''}</span>
              </div>);
            })}
          </div>
          <div style={{fontSize:11,color:C.tx3,marginBottom:14,padding:'8px 10px',borderRadius:4,background:C.s2}}>En validant, les séries manquantes seront automatiquement marquées comme skippées (—).</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={()=>setShowSkipWarning(false)} style={{width:'100%',padding:'12px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx2,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Revenir finir la séance</button>
            <button onClick={autoSkipAndValidate} style={{width:'100%',padding:'12px 0',borderRadius:4,border:'none',background:C.g,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Valider et skipper les séries manquantes</button>
          </div>
        </div>
      </div>);
    })()}
    {showEndModal&&<SessionEndModal duration={endDuration} onSave={onSessValidate} C={C}/>}
    {videoEx&&(<div onClick={()=>setVideoEx(null)} style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.92)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:520}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{videoEx.name}</div>
          <button onClick={()=>setVideoEx(null)} style={{background:'none',border:'none',color:C.tx2,fontSize:24,cursor:'pointer',fontFamily:'inherit',lineHeight:1}}>×</button>
        </div>
        {videoEx.youtube_id?(
          <div style={{position:'relative',paddingBottom:'56.25%',height:0,overflow:'hidden',borderRadius:6,background:C.s1}}>
            <iframe src={'https://www.youtube.com/embed/'+videoEx.youtube_id+'?autoplay=1'} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}} allow="autoplay; encrypted-media" allowFullScreen/>
          </div>
        ):videoEx.image_url?(
          <img src={videoEx.image_url} style={{width:'100%',borderRadius:6,display:'block'}} alt={videoEx.name}/>
        ):null}
        <button onClick={()=>setVideoEx(null)} style={{width:'100%',marginTop:14,padding:'11px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx3,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Fermer</button>
      </div>
    </div>)}
    {!sessIsDone&&!viewOnly&&sessStartedAt&&<button onClick={()=>setAddBankModal(true)} style={{width:"100%",marginTop:8,padding:"11px 0",borderRadius:6,border:"1px dashed "+C.brdL,background:"transparent",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ Ajouter un exercice depuis la banque</button>}
    {addBankModal&&(<div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end"}} onClick={()=>setAddBankModal(false)}>
      <div style={{background:C.s1,borderRadius:"6px 6px 0 0",padding:20,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:12}}>Ajouter un exercice</div>
        {!bankPick?(<>
          <input value={bankSearch} onChange={e=>setBankSearch(e.target.value)} placeholder="Rechercher dans la banque..." autoFocus style={{width:"100%",padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8,outline:"none"}}/>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:220,overflowY:"auto"}}>
            {bankFiltered.map(e=>(<button key={e.id} onClick={()=>setBankPick(e)} style={{padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,textAlign:"left",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontWeight:600}}>{e.name}</span><span style={{fontSize:10,color:C.tx3}}>{e.target}</span></button>))}
            {bankSearch&&bankFiltered.length===0&&<div style={{fontSize:12,color:C.tx3,textAlign:"center",padding:"16px 0"}}>Aucun résultat — tape "Entrée" pour créer</div>}
            {bankSearch&&bankFiltered.length===0&&<button onClick={()=>setBankPick({id:"new",name:bankSearch,target:"Pecs",ex_type:"muscu"})} style={{padding:"9px 12px",borderRadius:4,border:"1px dashed "+C.ac+"60",background:C.acS,color:C.ac,fontSize:13,textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>+ Ajouter "{bankSearch}"</button>}
          </div>
        </>):(<>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 12px",borderRadius:4,background:C.ac+"18",border:"1px solid "+C.ac+"40"}}>
            <div style={{flex:1,fontSize:13,fontWeight:700,color:C.tx}}>{bankPick.name}</div>
            <button onClick={()=>setBankPick(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:18,cursor:"pointer",fontFamily:"inherit",padding:"0 4px"}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div><div style={{fontSize:10,color:C.tx3,marginBottom:4}}>Séries</div><input type="number" min={1} max={10} value={bankForm.sets} onChange={e=>setBankForm(p=>({...p,sets:+e.target.value||3}))} style={{width:"100%",padding:"9px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:15,fontWeight:700,textAlign:"center",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.tx3,marginBottom:4}}>Répétitions</div><input value={bankForm.repsRange} onChange={e=>setBankForm(p=>({...p,repsRange:e.target.value}))} placeholder="ex: 10 ou 8-12" style={{width:"100%",padding:"9px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.tx3,marginBottom:4}}>Charge (kg)</div><input type="number" min={0} step={0.5} value={bankForm.kg} onChange={e=>setBankForm(p=>({...p,kg:e.target.value}))} placeholder="0" style={{width:"100%",padding:"9px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.tx3,marginBottom:4}}>RIR cible</div><select value={bankForm.rir} onChange={e=>setBankForm(p=>({...p,rir:+e.target.value}))} style={{width:"100%",padding:"9px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}>{[0,1,2,3,4,5].map(v=><option key={v} value={v}>RIR {v}</option>)}</select></div>
          </div>
          <button onClick={addFromBankConfirm} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ajouter à la séance</button>
        </>)}
        <button onClick={()=>{setAddBankModal(false);setBankSearch("");setBankPick(null);}} style={{width:"100%",marginTop:10,padding:"10px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
      </div>
    </div>)}
  </div></div>);}
  if(step===2&&selectedFree){
    const sf=selectedFree;
    const updFree=(patch)=>{const updated={...sf,...patch};setSelectedFree(updated);setFreeSessions(prev=>prev.map(f=>f.id===sf.id?updated:f));};
    const addExo=()=>{const ex={id:"fex_"+Date.now(),name:"",sets:[{kg:0,reps:0,done:false}]};updFree({exercises:[...sf.exercises,ex]});};
    const updExo=(eid,patch)=>updFree({exercises:sf.exercises.map(e=>e.id===eid?{...e,...patch}:e)});
    const updSet=(eid,sidx,patch)=>updExo(eid,{sets:sf.exercises.find(e=>e.id===eid).sets.map((s,i)=>i===sidx?{...s,...patch}:s)});
    const removeExo=(eid)=>updFree({exercises:sf.exercises.filter(e=>e.id!==eid)});
    return(<div style={{padding:"0 0 40px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px 0",fontSize:11,color:C.tx3}}>
        <button onClick={()=>{setStep(0);setSelectedFree(null);}} style={{background:"none",border:"none",color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:11,padding:0}}>Séances</button>
        <span>&gt;</span><span style={{color:C.ac,fontWeight:700}}>{sf.name}</span>
      </div>
      <div style={{padding:"12px 16px 0"}}>
        <input value={sf.name} onChange={e=>updFree({name:e.target.value})} style={{width:"100%",fontSize:18,fontWeight:800,background:"transparent",border:"none",color:C.tx,fontFamily:"inherit",outline:"none",marginBottom:10,padding:0,boxSizing:"border-box"}}/>
        <textarea value={sf.quickNote||""} onChange={e=>updFree({quickNote:e.target.value})} placeholder="Commentaire rapide (optionnel)..." style={{width:"100%",minHeight:60,background:C.s1,border:"1px solid "+C.brdL,borderRadius:4,color:C.tx2,fontSize:12,fontFamily:"inherit",padding:"8px 10px",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:14}} readOnly={sf.completed}/>
        {sf.exercises.map((ex,ei)=>{const allDone=ex.sets.length>0&&ex.sets.every(s=>s.done);return(<div key={ex.id} style={{background:C.s1,borderRadius:6,marginBottom:8,border:"1px solid "+(allDone?C.g+"50":C.brd),overflow:"hidden"}}><div style={{display:"flex",alignItems:"center",padding:"10px 12px",gap:8}}><input value={ex.name} onChange={e=>updExo(ex.id,{name:e.target.value})} placeholder={"Exercice "+(ei+1)} style={{flex:1,background:"transparent",border:"none",color:C.tx,fontSize:14,fontWeight:600,fontFamily:"inherit",outline:"none"}}/><button onClick={()=>removeExo(ex.id)} style={{width:20,height:20,borderRadius:5,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>×</button></div><div style={{padding:"0 12px 12px"}}>{ex.sets.map((s,si)=>(<div key={si} style={{display:"grid",gridTemplateColumns:"40px 1fr 10px 1fr 28px",gap:4,alignItems:"center",marginBottom:4,padding:"5px 8px",borderRadius:4,background:s.done?C.g+"10":C.s2,border:"1px solid "+(s.done?C.g+"30":C.brd)}}><span style={{fontSize:9,color:C.tx3,textAlign:"center"}}>S{si+1}</span><input type="number" step="0.5" value={s.kg||""} onChange={e=>updSet(ex.id,si,{kg:+e.target.value})} placeholder="0" style={{background:C.s1,color:C.tx,border:"1px solid "+C.brdL,fontFamily:"inherit",fontSize:13,fontWeight:700,textAlign:"center",borderRadius:6,padding:"5px 2px",width:"100%"}}/><span style={{fontSize:10,color:C.tx3,textAlign:"center"}}>x</span><input type="number" value={s.reps||""} onChange={e=>updSet(ex.id,si,{reps:+e.target.value})} placeholder="0" style={{background:C.s1,color:C.tx,border:"1px solid "+C.brdL,fontFamily:"inherit",fontSize:13,fontWeight:700,textAlign:"center",borderRadius:6,padding:"5px 2px",width:"100%"}}/><button onClick={()=>updSet(ex.id,si,{done:!s.done})} style={{width:28,height:28,borderRadius:7,border:"1.5px solid "+(s.done?C.g:C.brdL),background:s.done?C.g:"transparent",color:s.done?"#fff":C.tx3,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</button></div>))}<button onClick={()=>{const last=ex.sets[ex.sets.length-1]||{kg:0,reps:0};updExo(ex.id,{sets:[...ex.sets,{kg:last.kg,reps:last.reps,done:false}]});}} style={{width:"100%",padding:"5px 0",borderRadius:7,border:"1px dashed "+C.brdL,background:"transparent",color:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit",marginTop:2}}>+ Série</button></div></div>);})}
        <button onClick={addExo} style={{width:"100%",padding:"10px 0",borderRadius:4,border:"1px dashed "+C.brdL,background:"transparent",color:C.tx2,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:14}}>+ Ajouter un exercice</button>
        {!sf.completed&&!freeStartedAt&&<button onClick={startFree} style={{width:"100%",padding:"15px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>▶ Débuter la séance</button>}
        {!sf.completed&&freeStartedAt&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={{flex:1,padding:"8px 12px",borderRadius:4,background:C.acS,border:"1px solid "+C.ac+"40",fontSize:14,fontWeight:800,color:C.ac,fontFamily:"monospace"}}>{fmtTime(freeElapsed)}</div><button onClick={endFree} style={{padding:"8px 18px",borderRadius:4,border:"none",background:C.g,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Terminer</button></div>}
        {sf.completed&&<div style={{padding:"14px 0",borderRadius:6,background:C.gS,border:"1px solid "+C.g+"40",color:C.g,fontSize:14,fontWeight:700,textAlign:"center",marginBottom:8}}>Séance validée !</div>}
        {sf.completed&&sf.note&&<div style={{padding:"10px 12px",borderRadius:4,background:C.s2,fontSize:12,color:C.tx2,lineHeight:1.5,fontStyle:"italic",marginBottom:6}}>"{sf.note}"</div>}
        {sf.completed&&sf.duration&&<div style={{fontSize:11,color:C.tx3,textAlign:"center"}}>Durée : {fmtTime(sf.duration)}</div>}
      </div>
      {showFreeEndModal&&<SessionEndModal duration={freeEndDuration} onSave={onFreeValidate} C={C}/>}
    </div>);
  }
  return null;
}

export default LogView;
