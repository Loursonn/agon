import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C, BT } from "@/lib/theme";
import { todayKey, hISO } from "@/lib/date";
import { parseReps, fmtMR, clusterReps, DEF_METHODS, BLOC_METHODS, EVENT_TYPES, normalizeExName, fuzzyExMatch } from "@/lib/exercises";
import { getMC, mL } from "@/lib/muscles";

function WeekCalendar({sessions,completedSessions,currentWeek,weekSchedule,setWeekSchedule,C,wellnessHistory={},weightLog={},sessionLogs={},nutritionLog={},exos={},energySessions=[],energyWeekPlan={},energyDayPlan={},testSessions=[],visibilitySettings={}}){
  const[selectDay,setSelectDay]=useState(null);
  const[weekOffset,setWeekOffset]=useState(0);
  const[detailType,setDetailType]=useState(null);
  const[activityModal,setActivityModal]=useState(null);// {dayIdx} | null
  const[activityForm,setActivityForm]=useState({label:'',emoji:'ACT',duration:30,intensity:3,notes:''});
  const[previewSess,setPreviewSess]=useState(null);// session to preview
  const[previewWell,setPreviewWell]=useState(null);// wellness to preview
  const[previewNutr,setPreviewNutr]=useState(null);// nutrition to preview
  const DAYS=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const DAYS_FULL=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const MONTHS=["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
  const ACTIVITIES=[{label:'Course',emoji:'CRS'},{label:'Five',emoji:'FVE'},{label:'Vélo',emoji:'VLO'},{label:'Natation',emoji:'NAT'},{label:'Tennis',emoji:'TEN'},{label:'Boxe',emoji:'BOX'},{label:'Yoga',emoji:'YGA'},{label:'Basket',emoji:'BKT'},{label:'Ski',emoji:'SKI'},{label:'Golf',emoji:'GLF'}];
  const EMOJI_OPTS=['CRS','VLO','NAT','FVE','TEN','BOX','YGA','BKT','SKI','GLF','MUS','GYM','ESC','SRF','SKA','EQU','ESC','TDP','ART','JGG','ATH','RND','AVI','WPO','CAN','GIT','LEC','ART','RLR','JEU','THE','RAN'];
  const today=new Date();
  const dow=today.getDay();
  const baseMonday=new Date(today);
  baseMonday.setDate(today.getDate()-(dow===0?6:dow-1));
  const monday=new Date(baseMonday);
  monday.setDate(baseMonday.getDate()+weekOffset*7);
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});
  const todStr=todayKey();
  const doneSet=new Set(completedSessions[currentWeek]||[]);
  const wk=weekSchedule||{};
  const extras=wk.extras||{};
  const wkEventsMap=(wk.events)||{};
  const dKey=d=>String(d.getFullYear())+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
  const isoKeyW=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const dayExtras=idx=>extras[dKey(weekDays[idx])]||[];
  const dayEvents=idx=>(wkEventsMap[isoKeyW(weekDays[idx])]||[]);
  const viewBlockWeek=Math.max(1,currentWeek+weekOffset);
  const sessionsForDay=dayIdx=>(sessions||[]).filter(s=>{
    const wd=s.weekDays;
    if(wd&&String(viewBlockWeek) in wd)return wd[String(viewBlockWeek)]===dayIdx;
    return Number(s.day_of_week)===dayIdx;
  });
  // Énergie : filtre par viewBlockWeek (semaine bloc correspondant à la semaine affichée)
  const energySessionsForDay=dayIdx=>{
    const wkSessKeys=energyWeekPlan[viewBlockWeek]||[];
    return(energySessions||[]).filter(s=>{
      const sid=s.id||s.session_key;
      const inWeek=wkSessKeys.includes(sid)||wkSessKeys.includes(s.session_key);
      const dayMap=energyDayPlan[viewBlockWeek]||{};
      const assignedDay=dayMap[sid]??dayMap[s.session_key]??null;
      return inWeek&&Number(assignedDay)===dayIdx;
    });
  };
  const savedActivities=wk.savedActivities||[];
  const allActivities=[...ACTIVITIES,...savedActivities.filter(s=>!ACTIVITIES.find(a=>a.label===s.label))];
  const INT_LABELS=['Récup','Très facile','Facile','Modéré','Modéré+','Soutenu','Dur','Très dur','Maximal','Limite'];
  const INT_COLORS=['#4ADE80','#6FCF97','#86EFAC',C.o,'#F59E0B','#F97316','#EF4444','#DC2626','#B91C1C','#7F1D1D'];
  const chargeScore=(dur,int)=>Math.round((dur||0)*(int||1)/10);
  const openActivityModal=(dayIdx,label,emoji)=>{setActivityForm({label,emoji:emoji||'ACT',duration:30,intensity:7,notes:''});setActivityModal({dayIdx});};
  const confirmActivity=()=>{
    if(!activityModal)return;
    const{dayIdx}=activityModal;
    const{label,emoji,duration,intensity,notes}=activityForm;
    if(!label.trim())return;
    const dateKey=dKey(weekDays[dayIdx]);
    const cur=dayExtras(dayIdx);
    const newExtra={id:String(Date.now()),label:label.trim(),emoji,duration,intensity,notes:notes.trim()||undefined};
    const isDefault=ACTIVITIES.find(a=>a.label===label.trim());
    const newSaved=isDefault?savedActivities:[...savedActivities.filter(a=>a.label!==label.trim()),{label:label.trim(),emoji}];
    setWeekSchedule({...wk,extras:{...extras,[dateKey]:[...cur,newExtra]},savedActivities:newSaved});
    setActivityModal(null);
  };
  const removeExtra=(dayIdx,id)=>{const dateKey=dKey(weekDays[dayIdx]);const cur=dayExtras(dayIdx).filter(e=>e.id!==id);setWeekSchedule({...wk,extras:{...extras,[dateKey]:cur.length?cur:undefined}});};
  const removeCustomActivity=(label)=>{const newSaved=savedActivities.filter(a=>a.label!==label);setWeekSchedule({...wk,savedActivities:newSaved});};
  const isoKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const getWell=d=>wellnessHistory[dKey(d)]||null;
  const getNutr=d=>nutritionLog[isoKey(d)]||nutritionLog[dKey(d)]||null;
  const wScore=w=>w?Math.round(((w.fatigue||3)+(w.sommeil||3)+(w.stress||3)+(w.energie||3)+(w.doms||3))/25*100):null;
  const wColor=s=>s>=80?C.g:s>=65?"#6FCF97":s>=50?C.o:s>=35?"#E8956D":C.r;
  const isThisWeek=weekOffset===0;
  const sameMonth=monday.getMonth()===sunday.getMonth();
  const weekLabel=isThisWeek?"Cette semaine":sameMonth?(monday.getDate()+" – "+sunday.getDate()+" "+MONTHS[monday.getMonth()]):(monday.getDate()+" "+MONTHS[monday.getMonth()]+" – "+sunday.getDate()+" "+MONTHS[sunday.getMonth()]);
  // Stats résumé de la semaine
  const weekSessions=weekDays.flatMap((_,i)=>sessionsForDay(i));
  const weekDone=weekSessions.filter(s=>doneSet.has(s.id)).length;
  const weekWellDays=weekDays.filter(d=>getWell(d)!==null).length;
  const weekAvgWell=(()=>{const sc=weekDays.map(d=>{const w=getWell(d);return w?wScore(w):null}).filter(v=>v!==null);return sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):null;})();
  const selData=selectDay!==null?{date:weekDays[selectDay],well:getWell(weekDays[selectDay]),nutr:getNutr(weekDays[selectDay]),sessList:sessionsForDay(selectDay),energyList:energySessionsForDay(selectDay),exs:dayExtras(selectDay),evts:dayEvents(selectDay),tests:(testSessions||[]).filter(t=>t.date===isoKeyW(weekDays[selectDay])),blockWeek:viewBlockWeek}:null;

  return(<div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden",marginBottom:14}}>
    {/* Header */}
    <div style={{padding:"14px 16px 12px",borderBottom:"1px solid "+C.brd+"80"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        {/* Nav semaine */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>{setWeekOffset(p=>p-1);setSelectDay(null);setDetailType(null);}} style={{width:28,height:28,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.15s"}}>‹</button>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:isThisWeek?C.ac:C.tx,letterSpacing:"-0.2px"}}>{weekLabel}</div>
            {isThisWeek&&<div style={{fontSize:9,color:C.tx3,marginTop:1}}>Semaine en cours</div>}
          </div>
          <button onClick={()=>{if(weekOffset<0){setWeekOffset(p=>p+1);setSelectDay(null);setDetailType(null);}}} style={{width:28,height:28,borderRadius:4,border:"1px solid "+(weekOffset<0?C.brdL:C.brd+"40"),background:weekOffset<0?C.s2:"transparent",color:weekOffset<0?C.tx2:C.tx3+"30",fontSize:15,cursor:weekOffset<0?"pointer":"default",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>
        {/* KPIs semaine */}
        <div style={{display:"flex",gap:8}}>
          {weekSessions.length>0&&<div style={{textAlign:"center",padding:"4px 10px",borderRadius:4,background:C.s2}}>
            <div style={{fontSize:13,fontWeight:800,color:weekDone===weekSessions.length?C.g:C.tx}}>{weekDone}<span style={{fontSize:10,fontWeight:400,color:C.tx3}}>/{weekSessions.length}</span></div>
            <div style={{fontSize:8,color:C.tx3,marginTop:1}}>séances</div>
          </div>}
          {weekAvgWell!==null&&<div style={{textAlign:"center",padding:"4px 10px",borderRadius:4,background:wColor(weekAvgWell)+"15"}}>
            <div style={{fontSize:13,fontWeight:800,color:wColor(weekAvgWell)}}>{weekAvgWell}</div>
            <div style={{fontSize:8,color:C.tx3,marginTop:1}}>forme moy.</div>
          </div>}
          {weekWellDays>0&&weekAvgWell===null&&<div style={{textAlign:"center",padding:"4px 10px",borderRadius:4,background:C.s2}}>
            <div style={{fontSize:13,fontWeight:800,color:C.g}}>{weekWellDays}</div>
            <div style={{fontSize:8,color:C.tx3,marginTop:1}}>wellness</div>
          </div>}
        </div>
      </div>
    </div>

    {/* Grille jours */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:0}}>
      {weekDays.map((date,i)=>{
        const isToday=dKey(date)===todStr;
        const isPast=date<new Date(new Date().setHours(0,0,0,0))&&!isToday;
        const isFuture=!isPast&&!isToday;
        const sessList=sessionsForDay(i);
        const exs=dayExtras(i);
        const isSel=selectDay===i;
        const allDone=sessList.length>0&&sessList.every(s=>doneSet.has(s.id));
        const anyDone=sessList.some(s=>doneSet.has(s.id));
        const hasMissed=isPast&&sessList.some(s=>!doneSet.has(s.id));
        const well=getWell(date);
        const ws=well?wScore(well):null;
        const nutr=getNutr(date);
        const energyList=energySessionsForDay(i);
        const dayTests=(testSessions||[]).filter(t=>t.date===isoKeyW(date));
        const evts=dayEvents(i);
        const topEvt=evts[0]||null;
        const evtEi=topEvt?EVENT_TYPES.find(t=>t.v===topEvt.type)||EVENT_TYPES[4]:null;
        const bgTop=topEvt?evtEi.c+'0C':allDone?C.g+"14":hasMissed&&!anyDone?C.r+"0A":isToday?C.ac+"12":isSel?C.ac+"0A":"transparent";
        return(<div key={i} onClick={()=>setSelectDay(isSel?null:i)}
          style={{position:"relative",padding:"8px 2px 6px",textAlign:"center",cursor:"pointer",background:bgTop,
            borderRight:i<6?"1px solid "+C.brd+"35":"none",
            borderTop:isToday?"2px solid "+C.ac:topEvt?"2px solid "+evtEi.c:"2px solid transparent",
            borderBottom:isSel?"2px solid "+C.ac:"none",
            transition:"all 0.15s",minHeight:108,boxSizing:"border-box"}}>
          {/* Jour label */}
          <div style={{fontSize:10,fontWeight:isToday?700:500,color:isToday?C.ac:C.tx3,marginBottom:2,letterSpacing:"0.4px",textTransform:"uppercase",lineHeight:1}}>{DAYS[i]}</div>
          {/* Numéro */}
          <div style={{fontSize:isToday?19:15,fontWeight:isToday?800:500,color:isToday?C.ac:isPast?C.tx3+"90":C.tx,marginBottom:4,lineHeight:1}}>{date.getDate()}</div>
          {/* Événements */}
          {evts.slice(0,1).map(ev=>{const ei=EVENT_TYPES.find(t=>t.v===ev.type)||EVENT_TYPES[4];return(<div key={ev.id} style={{fontSize:9,fontWeight:800,padding:"2px 4px",borderRadius:5,background:ei.c+"28",color:ei.c,lineHeight:1.4,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ei.e} {(ev.title||ei.l).slice(0,6)}</div>);})}
          {/* Sessions muscu */}
          {sessList.length>0&&<div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:2}}>
            {sessList.map(s=>{const done=doneSet.has(s.id);const missed=isPast&&!done;const dc=done?C.g:missed?C.r:C.b;return(<div key={s.id} style={{fontSize:9,fontWeight:700,padding:"2px 4px",borderRadius:5,background:dc+"20",color:dc,lineHeight:1.4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{done?"✓ ":missed?"✗ ":""}{s.short||s.name.slice(0,4)}</div>);})}
          </div>}
          {/* Sessions énergie */}
          {visibilitySettings.energy!==false&&energyList.length>0&&<div style={{fontSize:9,fontWeight:700,padding:"2px 4px",borderRadius:5,background:C.coach+"20",color:C.coach,lineHeight:1.4,marginBottom:2}}>E{energyList.length>1?' ×'+energyList.length:''}</div>}
          {/* Tests */}
          {visibilitySettings.tests!==false&&dayTests.length>0&&<div style={{fontSize:9,fontWeight:700,padding:"2px 4px",borderRadius:5,background:"#F5A62320",color:"#F5A623",lineHeight:1.4,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>T {dayTests[0].title.slice(0,5)}{dayTests.length>1?'+':''}</div>}
          {/* Wellness */}
          {visibilitySettings.wellness!==false&&ws!==null&&<div title={"Forme "+ws+"/100"} style={{width:22,height:22,borderRadius:"50%",background:wColor(ws),margin:"3px auto",display:"flex",alignItems:"center",justifyContent:"center"+wColor(ws)+"60"}}><span style={{fontSize:9,fontWeight:800,color:"#fff",lineHeight:1}}>{ws}</span></div>}
          {/* Activités bottom */}
          <div style={{display:"flex",justifyContent:"center",gap:3,marginTop:3,flexWrap:"wrap"}}>
            {visibilitySettings.nutrition!==false&&nutr&&<span style={{fontSize:10}} title="Nutrition">N</span>}
            {exs.slice(0,2).map(e=>(<span key={e.id} style={{fontSize:10}}>{e.emoji}</span>))}
          </div>
          {/* Vide */}
          {sessList.length===0&&energyList.length===0&&exs.length===0&&ws===null&&!nutr&&dayTests.length===0&&evts.length===0&&<div style={{width:4,height:4,borderRadius:"50%",background:C.brd+"80",margin:"8px auto 0"}}/>}
        </div>);
      })}
    </div>

    {/* Panel détail jour */}
    {selectDay!==null&&selData&&(<div style={{borderTop:"1px solid "+C.brd+"80",background:C.s2}}>
      {/* Header du jour */}
      <div style={{padding:"10px 14px 8px"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{DAYS_FULL[selectDay]}</div>
        <div style={{fontSize:10,color:C.tx3}}>{selData.date.getDate()} {MONTHS[selData.date.getMonth()]} {selData.date.getFullYear()}</div>
      </div>
      {/* Événements du jour */}
      {(selData.evts||[]).length>0&&<div style={{padding:"0 14px 8px",display:"flex",flexDirection:"column",gap:5}}>
        {(selData.evts).map(ev=>{const ei=EVENT_TYPES.find(t=>t.v===ev.type)||EVENT_TYPES[4];return(
          <div key={ev.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:6,background:ei.c+'18',border:'1px solid '+ei.c+'40'}}>
            <span style={{fontSize:20}}>{ei.e}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:ei.c}}>{ei.l}{ev.title?' — '+ev.title:''}</div>{ev.notes&&<div style={{fontSize:10,color:C.tx3,marginTop:1}}>{ev.notes}</div>}</div>
          </div>
        );})}
      </div>}
      {/* Vue résumé — tout toujours visible */}
      <div style={{padding:"0 14px 10px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {selData.well&&(()=>{const ws2=wScore(selData.well);const wc=wColor(ws2);return(<div onClick={()=>setPreviewWell(selData.well)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:wc+"15",border:"1px solid "+wc+"30",cursor:"pointer"}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:wc,display:"flex",alignItems:"center",justifyContent:"center"+wc+"60"}}><span style={{fontSize:9,fontWeight:800,color:"#fff"}}>{ws2}</span></div>
          <div><div style={{fontSize:11,fontWeight:700,color:wc}}>{ws2>=80?"Optimal":ws2>=65?"Bon":ws2>=50?"Modéré":ws2>=35?"Fatigué":"Surmenage"}</div><div style={{fontSize:9,color:C.tx3}}>forme ↗</div></div>
        </div>);})()}
        {selData.sessList.map(s=>{const done=doneSet.has(s.id);const isPD=selData.date<new Date(new Date().setHours(0,0,0,0));const missed=isPD&&!done;const dc=done?C.g:missed?C.r:C.b;const log=sessionLogs[s.id+"_"+currentWeek];return(<div key={s.id} onClick={()=>setPreviewSess(s)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:dc+"12",border:"1px solid "+dc+"30",cursor:"pointer"}}>
          <span style={{fontSize:11,fontWeight:700,color:done?C.g:missed?C.r:C.b}}>{done?"✓":missed?"✗":"M"}</span>
          <div><div style={{fontSize:11,fontWeight:700,color:dc}}>{s.name}</div>{log?.duration&&<div style={{fontSize:9,color:C.tx3}}>{fmtTime(log.duration)}</div>}</div>
          <span style={{fontSize:9,color:C.tx3,marginLeft:"auto"}}>↗</span>
        </div>);})}
        {visibilitySettings.energy!==false&&(selData.energyList||[]).map(s=><div key={s.id||s.session_key} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:C.coach+"12",border:"1px solid "+C.coach+"30"}}>
          <span style={{fontSize:11,fontWeight:700,color:C.coach}}>E</span>
          <div><div style={{fontSize:11,fontWeight:700,color:C.coach}}>{s.session_label||"Séance énergie"}</div><div style={{fontSize:9,color:C.tx3}}>{(s.appareil_types||[]).join(", ")||"Énergétique"}</div></div>
        </div>)}
        {/* Tests planifiés du jour */}
        {visibilitySettings.tests!==false&&(selData.tests||[]).length>0&&(selData.tests||[]).map(t=>{const tc=t.type==='musculation'?'#FFC933':t.type==='energetique'?'#FF5A33':t.type==='specifique'?'#F5A623':'#66F03C';return(<div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:tc+"12",border:"1px solid "+tc+"30"}}><span style={{fontSize:14}}>T</span><div><div style={{fontSize:11,fontWeight:700,color:tc}}>{t.title}</div><div style={{fontSize:9,color:C.tx3}}>{t.completed?"Réalisé":"À faire"}</div></div></div>);})}

        {visibilitySettings.nutrition!==false&&selData.nutr&&<div onClick={()=>setPreviewNutr(selData.nutr)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:C.o+"12",border:"1px solid "+C.o+"30",cursor:"pointer"}}>
          <span style={{fontSize:14}}>N</span>
          <div><div style={{fontSize:11,fontWeight:700,color:C.o}}>{selData.nutr.total_calories_consumed!=null?selData.nutr.total_calories_consumed+" kcal":"Nutrition"}</div><div style={{fontSize:9,color:C.tx3}}>consommées ↗</div></div>
        </div>}
        {selData.exs.length>0&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:4,background:C.y+"12",border:"1px solid "+C.y+"30"}}>
          <span style={{fontSize:12}}>{selData.exs.map(e=>e.emoji).join(" ")}</span>
          <div style={{fontSize:10,fontWeight:600,color:C.y}}>{selData.exs.map(e=>e.label).join(", ")}</div>
        </div>}
        {!selData.well&&!selData.sessList.length&&!(selData.energyList||[]).length&&!selData.nutr&&!selData.exs.length&&!(selData.tests||[]).length&&!(selData.evts||[]).length&&<span style={{fontSize:11,color:C.tx3}}>Aucune donnée pour ce jour</span>}
      </div>
      {/* Activités libres + ajout */}
      <div style={{borderTop:"1px solid "+C.brd+"60",padding:"10px 14px 12px"}}>
        <button onClick={()=>openActivityModal(selectDay,'','ACT')} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:6,border:"1px solid "+C.y+"50",background:C.y+"10",color:C.y,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:dayExtras(selectDay).length>0?8:0}}>
          <span style={{fontSize:10}}>+</span> Ajouter une activité
        </button>
        {/* Activités du jour */}
        {dayExtras(selectDay).length>0&&<div style={{display:"flex",flexDirection:"column",gap:5}}>
          {dayExtras(selectDay).map(e=>{const charge=chargeScore(e.duration,e.intensity);const ic=e.intensity?INT_COLORS[e.intensity-1]:C.y;return(
            <div key={e.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",borderRadius:4,background:C.y+"0C",border:"1px solid "+C.y+"30"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>{e.emoji}</span>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:C.y}}>{e.label}</div>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginTop:1}}>
                    {e.duration&&<span style={{fontSize:9,color:C.tx3}}>Durée {e.duration} min</span>}
                    {e.intensity&&<span style={{fontSize:9,fontWeight:600,color:ic}}>RPE {e.intensity}/10</span>}
                    {charge>0&&<span style={{fontSize:9,padding:"0px 5px",borderRadius:4,background:C.ac+"18",color:C.ac,fontWeight:700}}>+{charge} pts</span>}
                  </div>
                  {e.notes&&<div style={{fontSize:9,color:C.tx3,marginTop:1,fontStyle:"italic"}}>"{e.notes}"</div>}
                </div>
              </div>
              <button onClick={ev=>{ev.stopPropagation();removeExtra(selectDay,e.id);}} style={{background:"none",border:"none",color:C.tx3,fontSize:16,cursor:"pointer",padding:4,lineHeight:1}}>×</button>
            </div>
          );})}
        </div>}
      </div>
    </div>)}

    {/* Modal prévisualisation séance */}
    {previewSess&&(<div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPreviewSess(null)}>
      <div style={{width:"100%",maxWidth:500,background:C.s1,borderRadius:"6px 6px 0 0",padding:"20px 20px 32px",overflowY:"auto",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.tx}}>{previewSess.name}</div>
            {previewSess.short&&<div style={{fontSize:10,color:C.tx3,marginTop:1}}>{previewSess.short}</div>}
          </div>
          <button onClick={()=>setPreviewSess(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {/* Exercices de la séance groupés par bloc */}
        {(()=>{
          const exList=exos[previewSess.id]||[];
          const weekExos=exList.filter(ex=>ex.weeks&&ex.weeks[currentWeek]);
          if(!weekExos.length&&!exList.length)return(<div style={{fontSize:12,color:C.tx3,textAlign:"center",padding:"20px 0"}}>Aucun exercice configuré</div>);
          const displayList=weekExos.length?weekExos:exList;
          // Group by bloc
          const blocs=getSessionBlocs(previewSess,displayList);
          const byBloc={};const noBloc=[];
          displayList.forEach(ex=>{if(ex.bloc&&blocs.find(b=>b.id===ex.bloc))byBloc[ex.bloc]=[...(byBloc[ex.bloc]||[]),ex];else noBloc.push(ex);});
          const renderEx=(ex,idx)=>{const wData=ex.weeks?.[currentWeek]||{};const method=wData.method;const mInfo=method?DEF_METHODS[method]:null;const blocColor=ex.bloc&&BT[ex.bloc]?BT[ex.bloc].c:(blocs.find(b=>b.id===ex.bloc)?.color||C.ac);return(<div key={ex.id||idx} style={{padding:"9px 12px",borderRadius:4,background:C.bg,border:"1px solid "+C.brdL,marginBottom:4}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:wData.kg||wData.sets?3:0}}>
              <span style={{fontSize:12,fontWeight:600,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{ex.name}</span>
              {mInfo&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:mInfo.c+"20",color:mInfo.c,fontWeight:700,flexShrink:0,marginLeft:6}}>{mInfo.e}</span>}
            </div>
            {(wData.kg||wData.sets||wData.repsRange)&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
              {wData.sets&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:C.ac+"15",color:C.ac,fontWeight:600}}>{fmtMR(method,wData.methodParams,wData.sets,wData.repsRange)}</span>}
              {wData.kg&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:C.s2,color:C.tx,fontWeight:600}}>{wData.kg} kg</span>}
              {wData.rir!=null&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:rC(wData.rir)+"15",color:rC(wData.rir),fontWeight:600}}>RIR {rL(wData.rir)}</span>}
              {wData.tempo&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:5,background:C.s2,color:C.tx3}}>{wData.tempo}</span>}
            </div>}
          </div>);};
          return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {blocs.map(bloc=>{const exs=byBloc[bloc.id]||[];if(!exs.length)return null;return(<div key={bloc.id}><div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:4,background:bloc.color+"18",border:"1px solid "+bloc.color+"40",marginBottom:6}}><div style={{width:8,height:8,borderRadius:2,background:bloc.color,flexShrink:0}}/><span style={{fontSize:10,fontWeight:700,color:bloc.color,textTransform:"uppercase",letterSpacing:"0.3px"}}>{bloc.label}</span><span style={{fontSize:9,color:C.tx3,marginLeft:"auto"}}>{exs.length} ex.</span></div>{exs.map(renderEx)}</div>);})}
            {noBloc.length>0&&<div>{noBloc.map(renderEx)}</div>}
          </div>);
        })()}
        <div style={{marginTop:16,fontSize:10,color:C.tx3,textAlign:"center"}}>
          Semaine {currentWeek} · {(exos[previewSess.id]||[]).filter(ex=>ex.weeks&&ex.weeks[currentWeek]).length} exercice{(exos[previewSess.id]||[]).filter(ex=>ex.weeks&&ex.weeks[currentWeek]).length!==1?"s":""}
        </div>
      </div>
    </div>)}

    {/* Modal forme du jour */}
    {previewWell&&(<div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPreviewWell(null)}>
      <div style={{width:"100%",maxWidth:500,background:C.s1,borderRadius:"6px 6px 0 0",padding:"20px 20px 32px",overflowY:"auto",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
        {(()=>{const w=previewWell;const ws2=wScore(w);const wc=wColor(ws2);return(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:wc,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:15,fontWeight:800,color:"#fff"}}>{ws2}</span></div>
              <div><div style={{fontSize:15,fontWeight:700,color:wc}}>{ws2>=80?"Optimal":ws2>=65?"Bon":ws2>=50?"Modéré":ws2>=35?"Fatigué":"Surmenage"}</div><div style={{fontSize:10,color:C.tx3}}>Forme du jour</div></div>
            </div>
            <button onClick={()=>setPreviewWell(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:14}}>
            {[{l:"Récup.",v:w.fatigue,e:"R"},{l:"Sommeil",v:w.sommeil,e:"S"},{l:"Stress",v:w.stress,e:"St"},{l:"Énergie",v:w.energie,e:"E"},{l:"DOMS",v:w.doms,e:"D"}].map(item=>{const iv=item.v||0;const ic=iv>=4?C.g:iv>=3?C.o:C.r;return(<div key={item.l} style={{background:C.s2,borderRadius:4,padding:"8px 4px",textAlign:"center",border:"1px solid "+ic+"20"}}><div style={{fontSize:13,marginBottom:2}}>{item.e}</div><div style={{fontSize:15,fontWeight:800,color:ic}}>{item.v||"—"}<span style={{fontSize:8,color:C.tx3}}>/5</span></div><div style={{fontSize:8,color:C.tx3,marginTop:1}}>{item.l}</div></div>);})}
          </div>
          {(w.coucher||w.reveil||w.sleepDur!=null)&&<div style={{padding:"10px 14px",borderRadius:4,background:C.s2,marginBottom:10}}><div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Sommeil</div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>{w.coucher&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.bg}}><span style={{fontSize:11,color:C.b}}>Coucher</span><span style={{fontSize:12,fontWeight:600,color:C.tx}}>{String(w.coucher.h).padStart(2,"0")}:{String(w.coucher.m).padStart(2,"0")}</span></div>}{w.reveil&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.bg}}><span style={{fontSize:11,color:C.o}}>Réveil</span><span style={{fontSize:12,fontWeight:600,color:C.tx}}>{String(w.reveil.h).padStart(2,"0")}:{String(w.reveil.m).padStart(2,"0")}</span></div>}{w.sleepDur!=null&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.b+"18"}}><span style={{fontSize:11,color:C.b}}>Durée</span><span style={{fontSize:12,fontWeight:700,color:C.b}}>{typeof w.sleepDur==="number"?w.sleepDur.toFixed(1):w.sleepDur}h</span></div>}</div>{w.sleepInterrupt===true&&<div style={{marginTop:6,fontSize:11,color:C.o,padding:"4px 8px",borderRadius:6,background:C.o+"12"}}>Réveil nocturne{w.sleepInterruptNote?" — "+w.sleepInterruptNote:""}</div>}</div>}
          {w.poids&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:4,background:C.s2,marginBottom:10}}><span style={{fontSize:10,color:C.tx3}}>Poids</span><div><div style={{fontSize:12,fontWeight:700,color:C.tx}}>{w.poids} kg</div><div style={{fontSize:9,color:C.tx3}}>Poids ce matin</div></div></div>}
          {w.domsZones?.length>0&&<div style={{padding:"10px 14px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30",marginBottom:10}}><div style={{fontSize:9,fontWeight:600,color:C.o,textTransform:"uppercase",marginBottom:6}}>Zones DOMS</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{w.domsZones.map(id=>{const z=ALL_BZ.find(z=>z.id===id);return z?<span key={id} style={{fontSize:10,padding:"3px 8px",borderRadius:6,background:C.o+"20",color:C.o}}>{z.label}</span>:null;})}</div></div>}
          {w.injComment&&<div style={{padding:"10px 14px",borderRadius:4,background:C.r+"10",border:"1px solid "+C.r+"30",fontSize:11,color:C.r}}>Blessure : {w.injComment}</div>}
        </>);})()}
      </div>
    </div>)}

    {/* Modal nutrition */}
    {previewNutr&&(<div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setPreviewNutr(null)}>
      <div style={{width:"100%",maxWidth:500,background:C.s1,borderRadius:"6px 6px 0 0",padding:"20px 20px 32px",overflowY:"auto",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,color:C.tx}}>Alimentation</div>
          <button onClick={()=>setPreviewNutr(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {(()=>{const n=previewNutr;return(<>
          {n.total_calories_consumed!=null&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:4,background:C.o+"12",border:"1px solid "+C.o+"25",marginBottom:12}}><span style={{fontSize:11,color:C.tx3}}>Total consommé</span><span style={{fontSize:20,fontWeight:800,color:C.o}}>{n.total_calories_consumed}<span style={{fontSize:11,fontWeight:400,color:C.tx3}}> kcal</span></span></div>}
          {(n.glucides_consumed!=null||n.lipides_consumed!=null||n.proteines_consumed!=null)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[{l:"Glucides",v:n.glucides_consumed,c:C.b,e:"G"},{l:"Lipides",v:n.lipides_consumed,c:C.o,e:"L"},{l:"Protéines",v:n.proteines_consumed,c:C.g,e:"P"}].map(m=>(<div key={m.l} style={{background:C.s2,borderRadius:4,padding:"12px 6px",textAlign:"center",border:"1px solid "+m.c+"20"}}><div style={{fontSize:14,marginBottom:4}}>{m.e}</div><div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v!=null?m.v:"-"}<span style={{fontSize:9,color:C.tx3}}>g</span></div><div style={{fontSize:10,color:C.tx3,marginTop:2}}>{m.l}</div></div>))}</div>}
        </>);})()}
      </div>
    </div>)}

    {/* Modal ajout activité */}
    {activityModal!==null&&(<div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setActivityModal(null)}>
      <div style={{width:"100%",maxWidth:500,background:C.s1,borderRadius:"6px 6px 0 0",padding:"20px 20px 32px",overflowY:"auto",maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700,color:C.tx}}>Détails de l'activité</div>
          <button onClick={()=>setActivityModal(null)} style={{background:"none",border:"none",color:C.tx3,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {/* Emoji + Nom */}
        <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:9,color:C.tx3,marginBottom:5,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px"}}>Logo</div>
            <div style={{width:46,height:46,borderRadius:6,background:C.s2,border:"2px solid "+C.ac+"40",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{activityForm.emoji}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:9,color:C.tx3,marginBottom:5,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px"}}>Activité</div>
            <input value={activityForm.label} onChange={e=>setActivityForm(p=>({...p,label:e.target.value}))} style={{width:"100%",padding:"10px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontWeight:600,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
        </div>
        {/* Emoji picker */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:C.tx3,marginBottom:6,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px"}}>Choisir un logo</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {EMOJI_OPTS.map(em=>(<button key={em} onClick={()=>setActivityForm(p=>({...p,emoji:em}))} style={{width:34,height:34,borderRadius:4,border:"2px solid "+(activityForm.emoji===em?C.ac:C.brdL),background:activityForm.emoji===em?C.acS:"transparent",fontSize:17,cursor:"pointer",transition:"all 0.1s"}}>{em}</button>))}
          </div>
        </div>
        {/* Durée */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px"}}>Durée</div>
            <div style={{fontSize:14,fontWeight:800,color:C.tx}}>{activityForm.duration}<span style={{fontSize:10,fontWeight:400,color:C.tx3}}> min</span></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <button onClick={()=>setActivityForm(p=>({...p,duration:Math.max(5,p.duration-5)}))} style={{width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:16,flexShrink:0}}>−</button>
            <div style={{flex:1,height:5,background:C.s2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:(Math.min(activityForm.duration,180)/180*100)+"%",background:C.ac,borderRadius:3,transition:"width 0.15s"}}/></div>
            <button onClick={()=>setActivityForm(p=>({...p,duration:Math.min(300,p.duration+5)}))} style={{width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:16,flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {[15,30,45,60,90,120].map(d=>(<button key={d} onClick={()=>setActivityForm(p=>({...p,duration:d}))} style={{padding:"4px 9px",borderRadius:7,border:"1px solid "+(activityForm.duration===d?C.ac:C.brdL),background:activityForm.duration===d?C.acS:"transparent",color:activityForm.duration===d?C.ac:C.tx3,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}min</button>))}
          </div>
        </div>
        {/* Intensité */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px",marginBottom:6}}>Intensité</div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {INT_LABELS.map((l,i)=>{const ic=INT_COLORS[i];const active=activityForm.intensity===i+1;return(<button key={i} onClick={()=>setActivityForm(p=>({...p,intensity:i+1}))} style={{flex:"0 0 calc(20% - 3px)",padding:"7px 2px",borderRadius:4,border:"1.5px solid "+(active?ic:C.brdL),background:active?ic+"20":"transparent",color:active?ic:C.tx3,fontSize:8,fontWeight:active?700:400,cursor:"pointer",fontFamily:"inherit",textAlign:"center",lineHeight:1.4,transition:"all 0.15s"}}><span style={{fontSize:12,display:"block",fontWeight:700}}>{i+1}</span>{l}</button>);})}
          </div>
        </div>
        {/* Notes */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.4px",marginBottom:5}}>Notes <span style={{fontSize:8,fontWeight:400}}>(optionnel)</span></div>
          <textarea value={activityForm.notes} onChange={e=>setActivityForm(p=>({...p,notes:e.target.value}))} placeholder="Détails, ressenti, distance, parcours..." rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:11,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box"}}/>
        </div>
        {/* Charge estimée */}
        <div style={{marginBottom:16,padding:"9px 12px",borderRadius:4,background:C.s2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:10,color:C.tx3}}>Charge estimée</div><div style={{fontSize:9,color:C.tx3,marginTop:1}}>durée × RPE / 10</div></div>
          <div style={{fontSize:20,fontWeight:800,color:C.ac}}>{chargeScore(activityForm.duration,activityForm.intensity)}<span style={{fontSize:10,fontWeight:400,color:C.tx3}}> pts</span></div>
        </div>
        {/* Confirmer */}
        <button onClick={confirmActivity} disabled={!activityForm.label.trim()} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:activityForm.label.trim()?C.ac:"#333",color:activityForm.label.trim()?"#fff":C.tx3,fontSize:14,fontWeight:700,cursor:activityForm.label.trim()?"pointer":"default",fontFamily:"inherit",transition:"background 0.15s"}}>
          ✓ Ajouter l'activité
        </button>
      </div>
    </div>)}
  </div>);
}

// ── EXERCISE BANK COMPONENTS ─────────────────────────────────────────────────

const parseYtId=v=>{const m=(v||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);return m?m[1]:v.trim();};


export default WeekCalendar;
