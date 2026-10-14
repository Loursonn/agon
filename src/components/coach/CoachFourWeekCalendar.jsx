import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useUnifiedCalendar } from "@/features/shared/hooks/useUnifiedCalendar";
import { C, BT, BLOC_COLORS, HABIT_COLORS, HABIT_ICONS } from "@/lib/theme";
import { todayKey, hISO } from "@/lib/date";
import { parseReps, fmtMR, clusterReps, DEF_METHODS, BLOC_METHODS, EVENT_TYPES, normalizeExName, fuzzyExMatch } from "@/lib/exercises";
import { getMC, mL } from "@/lib/muscles";

function CoachFourWeekCalendar({sessions=[],completedSessions={},currentWeek=1,C,wellnessHistory={},sessionLogs={},energySessions=[],energyWeekPlan={},energyDayPlan={},setEnergyWeekPlan,setEnergyDayPlan,testSessions=[],visibilitySettings={},onUpdateSessionDay,onUpdateSessionWeekDay,onUpdateVisibility,athleteId,blockConfig,weekSchedule={},setWeekSchedule,exos={},allMethods={}}){
  const[weekOffset,setWeekOffset]=useState(0);
  const[selectDay,setSelectDay]=useState(null);
  const[showPlanModal,setShowPlanModal]=useState(null);
  const[showVisModal,setShowVisModal]=useState(false);
  const[previewItem,setPreviewItem]=useState(null);// {type:'muscu'|'energy'|'test', data, planWeek}
  const touchStartX=useRef(null);

  const DAYS_ABBR=["L","M","M","J","V","S","D"];
  const DAYS_FULL=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const MONTHS_S=["Janv","Févr","Mars","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"];
  const MONTHS_F=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  const today=new Date();
  const dow=today.getDay();
  const baseMonday=new Date(today);
  baseMonday.setDate(today.getDate()-(dow===0?6:dow-1));

  // Semaine n-1 + offset (en semaines)
  const startMonday=new Date(baseMonday);
  startMonday.setDate(baseMonday.getDate()-7+weekOffset*7);

  // ── Single source of truth: workout_logs via useUnifiedCalendar ──────────────
  const _rangeEnd=new Date(startMonday);_rangeEnd.setDate(startMonday.getDate()+27);
  const _schedRange={start:hISO(startMonday),end:hISO(_rangeEnd)};
  const{data:_schedData=[]}=useUnifiedCalendar(athleteId||'',_schedRange,{includeExercises:false,staleTime:30000});
  // Map to session-like shape for rendering compatibility
  const workoutsForDate=dateStr=>(_schedData||[]).filter(e=>e.type==='workout'&&e.date===dateStr).map(e=>({id:e.sessionId||e.id,name:e.title,short:(e.title||'').slice(0,8),_done:e.status==='completed'}));
  const _hasRealData=(_schedData||[]).some(e=>e.type==='workout');

  const weeks=Array.from({length:4},(_,wi)=>{
    const ws=new Date(startMonday);ws.setDate(startMonday.getDate()+wi*7);
    return Array.from({length:7},(_,di)=>{const d=new Date(ws);d.setDate(ws.getDate()+di);return d;});
  });

  const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dKey2=d=>String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const todStr=isoDate(today);

  const isCurrentWeek=wi=>{
    const wm=weeks[wi][0],bm=new Date(baseMonday);
    return wm.getFullYear()===bm.getFullYear()&&wm.getMonth()===bm.getMonth()&&wm.getDate()===bm.getDate();
  };

  const coverStart=weeks[0][0];const coverEnd=weeks[3][6];
  const rangeLabel=coverStart.getMonth()===coverEnd.getMonth()?
    MONTHS_F[coverStart.getMonth()]+' '+coverStart.getFullYear():
    MONTHS_S[coverStart.getMonth()]+' – '+MONTHS_S[coverEnd.getMonth()]+' '+coverEnd.getFullYear();

  const[showEventForm,setShowEventForm]=useState(null);// {dateStr, planWeek}
  const[eventForm,setEventForm]=useState({type:"competition",title:"",notes:""});

  // Helpers sessions : per-week override → fallback day_of_week
  const sessForDay=(di,blockWeek)=>(sessions||[]).filter(s=>{
    const wd=s.weekDays;
    if(wd&&String(blockWeek) in wd)return wd[String(blockWeek)]===di;
    return s.day_of_week===di;
  });
  // Events helpers
  const wkEvents=(weekSchedule||{}).events||{};
  const eventsForDate=dateStr=>(wkEvents[dateStr]||[]);
  const addEvent=(dateStr,evt)=>{if(setWeekSchedule)setWeekSchedule({...(weekSchedule||{}),events:{...wkEvents,[dateStr]:[...eventsForDate(dateStr),evt]}});};
  const removeEvent=(dateStr,id)=>{if(setWeekSchedule){const n=(wkEvents[dateStr]||[]).filter(e=>e.id!==id);setWeekSchedule({...(weekSchedule||{}),events:{...wkEvents,[dateStr]:n.length?n:undefined}});}};
  // Compétitions planification (Supabase) — read-only dans le calendrier
  const { data: planComps=[] } = useCompetitions(athleteId||'');
  const planCompsForDate=dateStr=>(planComps||[]).filter(c=>c.date===dateStr);
  // Pour l'énergie : filtre par semaine de bloc + jour (semaines passées exclues)
  const energyForDay=(di,blockWeek)=>{
    if(blockWeek<currentWeek)return[];
    return(energySessions||[]).filter(s=>{
      const sid=s.id||s.session_key;
      const inWeek=(energyWeekPlan[blockWeek]||[]).includes(sid)||(energyWeekPlan[blockWeek]||[]).includes(s.session_key);
      if(!inWeek)return false;
      const dayMap=energyDayPlan[blockWeek]||{};
      return dayMap[sid]===di||dayMap[s.session_key]===di;
    });
  };
  const testsForDate=dateStr=>(testSessions||[]).filter(t=>t.date===dateStr);
  const wScore2=w=>w?Math.round(((w.fatigue||3)+(w.sommeil||3)+(w.stress||3)+(w.energie||3)+(w.doms||3))/25*100):null;
  const wColor2=s=>s>=80?C.g:s>=65?'#6FCF97':s>=50?C.o:s>=35?'#E8956D':C.r;

  // Swipe
  const onTouchStart=e=>{touchStartX.current=e.touches[0].clientX;};
  const onTouchEnd=e=>{
    if(touchStartX.current===null)return;
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    if(Math.abs(dx)>50){setWeekOffset(w=>w+(dx<0?1:-1));setSelectDay(null);}
    touchStartX.current=null;
  };

  // Save energy helpers
  const saveEDay=async plan=>{if(!athleteId)return;await supabase.from('app_data').upsert({athlete_id:athleteId,key:'asp:energy_day_plan',value:plan,updated_at:new Date().toISOString()},{onConflict:'athlete_id,key'});};
  const saveEWeek=async plan=>{if(!athleteId)return;await supabase.from('app_data').upsert({athlete_id:athleteId,key:'asp:energy_week_plan',value:plan,updated_at:new Date().toISOString()},{onConflict:'athlete_id,key'});};

  const assignEnergyDay=(sid,week,di)=>{
    const wDays={...(energyDayPlan[week]||{}),[sid]:di===null?undefined:di};
    const plan={...energyDayPlan,[week]:wDays};
    if(setEnergyDayPlan)setEnergyDayPlan(plan);saveEDay(plan);
  };
  const toggleEnergyWeek=(sid,week)=>{
    const cur=energyWeekPlan[week]||[];
    const next=cur.includes(sid)?cur.filter(k=>k!==sid):[...cur,sid];
    const plan={...energyWeekPlan,[week]:next};
    if(setEnergyWeekPlan)setEnergyWeekPlan(plan);saveEWeek(plan);
  };

  // Calcul semaine du bloc pour un wi
  const weekForWi=wi=>{
    const thisMonday=weeks[wi][0];
    const diffW=Math.round((thisMonday-new Date(baseMonday))/(7*24*3600*1000));
    return Math.max(1,currentWeek+diffW);
  };

  const doneSet=new Set(completedSessions[currentWeek]||[]);

  const VIS_ITEMS=[
    {k:'muscu',label:'Séances musculation',emoji:'MSC'},
    {k:'energy',label:'Séances énergétiques',emoji:'NRJ'},
    {k:'tests',label:'Tests planifiés',emoji:'TST'},
    {k:'wellness',label:'Scores wellness',emoji:'W'},
    {k:'nutrition',label:'Nutrition',emoji:'N'},
    {k:'pr',label:'Records personnels',emoji:'PR'},
    {k:'weight',label:'Poids de corps',emoji:'kg'},
  ];

  return(
    <div style={{background:C.s1,borderRadius:6,border:'1px solid '+C.brd,overflow:'hidden',marginBottom:14,userSelect:'none'}}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* Header nav */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid '+C.brd+'80',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{rangeLabel}</div>
          <div style={{fontSize:9,color:C.tx3,marginTop:1}}>Planning 4 semaines — glisser pour naviguer</div>
        </div>
        <div style={{display:'flex',gap:5,alignItems:'center'}}>
          <button onClick={()=>{setWeekOffset(w=>w-1);setSelectDay(null);}} style={{width:28,height:28,borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx2,fontSize:15,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>‹</button>
          {weekOffset!==0&&<button onClick={()=>{setWeekOffset(0);setSelectDay(null);}} style={{padding:'3px 7px',borderRadius:6,border:'1px solid '+C.ac+'40',background:C.acS,color:C.ac,fontSize:9,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Auj.</button>}
          <button onClick={()=>{setWeekOffset(w=>w+1);setSelectDay(null);}} style={{width:28,height:28,borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx2,fontSize:15,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>›</button>
          <button onClick={()=>setShowVisModal(true)} title="Visibilité athlète" style={{width:28,height:28,borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx3,fontSize:13,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>Cfg</button>
        </div>
      </div>

      {/* En-têtes jours */}
      <div style={{display:'grid',gridTemplateColumns:'22px repeat(7,1fr)',background:C.s2,borderBottom:'1px solid '+C.brd+'40'}}>
        <div/>
        {DAYS_ABBR.map((d,i)=>(
          <div key={i} style={{padding:'6px 2px',textAlign:'center',fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px'}}>{d}</div>
        ))}
      </div>

      {/* 4 semaines */}
      {weeks.map((week,wi)=>{
        const isCurr=isCurrentWeek(wi);
        const wLabel=wi===0?'N-1':isCurr?'●':wi===1&&!isCurr?'N+1':wi===2?'N+2':'N+3';
        return(
          <div key={wi} style={{display:'grid',gridTemplateColumns:'22px repeat(7,1fr)',borderTop:'1px solid '+C.brd+'40',background:isCurr?C.ac+'06':'transparent'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',borderRight:'1px solid '+C.brd+'40',background:isCurr?C.ac+'10':'transparent'}}>
              <span style={{fontSize:7,fontWeight:700,color:isCurr?C.ac:C.tx3,textTransform:'uppercase',letterSpacing:'0.2px',writingMode:'vertical-rl',transform:'rotate(180deg)'}}>{wLabel}</span>
            </div>
            {week.map((date,di)=>{
              const bw=weekForWi(wi);
              const isToday=isoDate(date)===todStr;
              const isPast=date<new Date(new Date().setHours(0,0,0,0))&&!isToday;
              const isSel=selectDay&&selectDay.wi===wi&&selectDay.di===di;
              const sessList=_hasRealData?workoutsForDate(isoDate(date)):sessForDay(di,bw);
              const tests=testsForDate(isoDate(date));
              const well=wellnessHistory[dKey2(date)]||null;
              const ws2=wScore2(well);
              const eList=energyForDay(di,bw);
              const dayEvts=eventsForDate(isoDate(date));
              const planCompsDay=planCompsForDate(isoDate(date));
              const topEvt=dayEvts[0]||null;
              const topComp=planCompsDay[0]||null;
              const evtInfo=topEvt?EVENT_TYPES.find(t=>t.v===topEvt.type)||EVENT_TYPES[4]:null;
              const hlColor=topEvt?evtInfo.c:topComp?'#F5A623':null;
              return(
                <div key={di} onClick={()=>setSelectDay(isSel?null:{wi,di,date,bw})}
                  style={{position:'relative',padding:'6px 2px 5px',textAlign:'center',cursor:'pointer',
                    background:isToday?C.ac+'1A':isSel?C.ac+'14':hlColor?hlColor+'0A':'transparent',
                    borderRight:di<6?'1px solid '+C.brd+'25':'none',
                    borderLeft:isToday?'2px solid '+C.ac:hlColor?'2px solid '+hlColor:'2px solid transparent',
                    borderBottom:isSel?'2px solid '+C.ac:'none',
                    minHeight:72,transition:'background 0.1s',boxSizing:'border-box'}}>
                  {/* Date */}
                  <div style={{fontSize:12,fontWeight:isToday?800:isPast?400:600,color:isToday?C.ac:isPast?C.tx3+'90':C.tx,lineHeight:1,marginBottom:3}}>{date.getDate()}</div>
                  {/* Événements locaux */}
                  {dayEvts.slice(0,1).map(ev=>{const ei=EVENT_TYPES.find(t=>t.v===ev.type)||EVENT_TYPES[4];return(<div key={ev.id} style={{fontSize:8,fontWeight:800,padding:'2px 3px',borderRadius:4,background:ei.c+'30',color:ei.c,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2,lineHeight:1.3}}>{ei.e} {(ev.title||ei.l).slice(0,5)}</div>);})}
                  {/* Compétitions planification */}
                  {planCompsDay.slice(0,1).map(comp=>(<div key={comp.id} style={{fontSize:8,fontWeight:800,padding:'2px 3px',borderRadius:4,background:'#F5A62330',color:'#F5A623',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2,lineHeight:1.3}}>{comp.name.slice(0,6)}</div>))}
                  {planCompsDay.length>1&&<div style={{fontSize:7,color:'#F5A623',lineHeight:1,marginBottom:2}}>+{planCompsDay.length-1}</div>}
                  {/* Séances muscu */}
                  {visibilitySettings.muscu!==false&&sessList.length>0&&<div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:2}}>
                    {sessList.slice(0,2).map(s=>{const done=s._done!==undefined?s._done:doneSet.has(s.id);const dc=done?C.g:C.b;return(
                      <div key={s.id} style={{fontSize:8,fontWeight:700,padding:'2px 3px',borderRadius:4,background:dc+'22',color:dc,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.3}}>{done?'✓ ':''}{s.short||s.name?.slice(0,4)}</div>
                    );})}
                    {sessList.length>2&&<div style={{fontSize:7,color:C.tx3,lineHeight:1}}>+{sessList.length-2}</div>}
                  </div>}
                  {/* Énergie */}
                  {visibilitySettings.energy!==false&&eList.length>0&&(
                    <div style={{fontSize:8,fontWeight:700,padding:'2px 3px',borderRadius:4,background:C.coach+'22',color:C.coach,lineHeight:1.3,marginBottom:2}}>NRJ{eList.length>1?' ×'+eList.length:''}</div>
                  )}
                  {/* Tests */}
                  {visibilitySettings.tests!==false&&tests.length>0&&(
                    <div style={{fontSize:8,fontWeight:700,padding:'2px 3px',borderRadius:4,background:'#F5A62322',color:'#F5A623',lineHeight:1.3,marginBottom:2}}>TST{tests.length>1?' ×'+tests.length:''}</div>
                  )}
                  {/* Wellness */}
                  {visibilitySettings.wellness!==false&&ws2!==null&&(
                    <div style={{width:14,height:14,borderRadius:'50%',background:wColor2(ws2),margin:'2px auto 0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:7,fontWeight:800,color:'#fff'}}>{ws2}</span>
                    </div>
                  )}
                  {/* Vide */}
                  {sessList.length===0&&eList.length===0&&tests.length===0&&ws2===null&&dayEvts.length===0&&planCompsDay.length===0&&(
                    <div style={{width:4,height:4,borderRadius:'50%',background:C.brd+'80',margin:'6px auto 0'}}/>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Panel détail */}
      {selectDay&&(()=>{
        const date=weeks[selectDay.wi][selectDay.di];
        const di=selectDay.di;
        const planWeek=selectDay.bw||weekForWi(selectDay.wi);
        const sessList=_hasRealData?workoutsForDate(isoDate(date)):sessForDay(di,planWeek);
        const tests=testsForDate(isoDate(date));
        const well=wellnessHistory[dKey2(date)]||null;
        const ws3=wScore2(well);
        const eAssigned=(energySessions||[]).filter(s=>{const sid=s.id||s.session_key;return(energyWeekPlan[planWeek]||[]).includes(sid)&&(energyDayPlan[planWeek]?.[sid]===di||energyDayPlan[planWeek]?.[s.session_key]===di);});
        const dayEvts=eventsForDate(isoDate(date));
        const planCompsDay=planCompsForDate(isoDate(date));
        return(
          <div style={{borderTop:'1px solid '+C.brd+'80',background:C.s2,padding:'12px 14px 14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{DAYS_FULL[di]} {date.getDate()} {MONTHS_F[date.getMonth()]}</div>
                <div style={{fontSize:9,color:C.tx3,marginTop:1}}>S{planWeek}{ws3!==null?' · Forme '+ws3+'/100':''}</div>
              </div>
              <button onClick={()=>setShowPlanModal({wi:selectDay.wi,di,date,planWeek})} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:4,border:'none',background:C.coach,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Planifier</button>
            </div>
            {/* Compétitions depuis Planification (read-only) */}
            {planCompsDay.length>0&&<div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:8}}>
              {planCompsDay.map(comp=>(
                <div key={comp.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:4,background:'#F5A62318',border:'1px solid #F5A62350'}}>
                  <span style={{fontSize:14,fontWeight:700}}>COMP</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#F5A623',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{comp.name}</div>
                    {comp.location&&<div style={{fontSize:9,color:C.tx3}}>{comp.location}</div>}
                  </div>
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'#F5A62325',color:'#F5A623',flexShrink:0}}>{comp.priority||comp.type}</span>
                </div>
              ))}
            </div>}
            {/* Événements locaux */}
            {dayEvts.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
              {dayEvts.map(ev=>{const ei=EVENT_TYPES.find(t=>t.v===ev.type)||EVENT_TYPES[4];return(
                <div key={ev.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:4,background:ei.c+'20',border:'1px solid '+ei.c+'50',flex:'1 1 auto'}}>
                  <span style={{fontSize:16}}>{ei.e}</span>
                  <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:ei.c}}>{ei.l}{ev.title?' — '+ev.title:''}</div>{ev.notes&&<div style={{fontSize:9,color:C.tx3}}>{ev.notes}</div>}</div>
                  <button onClick={e=>{e.stopPropagation();removeEvent(isoDate(date),ev.id);}} style={{background:'none',border:'none',color:C.tx3,fontSize:14,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>×</button>
                </div>
              );})}
            </div>}
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {sessList.map(s=>{const done=s._done!==undefined?s._done:doneSet.has(s.id);return(
                <button key={s.id} onClick={()=>setPreviewItem({type:'muscu',data:s,planWeek:planWeek})} style={{padding:'5px 10px',borderRadius:4,background:C.b+'15',border:'1px solid '+C.b+'30',fontSize:11,fontWeight:600,color:C.b,cursor:'pointer',fontFamily:'inherit'}}>{s.name}{done?' ✓':''} ›</button>
              );})}
              {eAssigned.map(s=>(
                <button key={s.id||s.session_key} onClick={()=>setPreviewItem({type:'energy',data:s,planWeek:planWeek})} style={{padding:'5px 10px',borderRadius:4,background:C.coach+'15',border:'1px solid '+C.coach+'30',fontSize:11,fontWeight:600,color:C.coach,cursor:'pointer',fontFamily:'inherit'}}>{s.session_label||'Energie'} ›</button>
              ))}
              {tests.map(t=>{const tc=t.type==='musculation'?'#FFC933':t.type==='energetique'?'#FF5A33':t.type==='specifique'?'#F5A623':'#66F03C';return(
                <button key={t.id} onClick={()=>setPreviewItem({type:'test',data:t,planWeek:planWeek})} style={{padding:'5px 10px',borderRadius:4,background:tc+'15',border:'1px solid '+tc+'30',fontSize:11,fontWeight:600,color:tc,cursor:'pointer',fontFamily:'inherit'}}>{t.title} ›</button>
              );})}
              {sessList.length===0&&eAssigned.length===0&&tests.length===0&&dayEvts.length===0&&planCompsDay.length===0&&<span style={{fontSize:11,color:C.tx3}}>Aucun contenu planifié — cliquer "+ Planifier"</span>}
            </div>
          </div>
        );
      })()}

      {/* Modal planification */}
      {showPlanModal&&(()=>{
        const{di,date,planWeek}=showPlanModal;
        return(
          <div style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setShowPlanModal(null)}>
            <div style={{width:'100%',maxWidth:640,background:C.s1,borderRadius:'6px 6px 0 0',padding:'20px 20px 32px',overflowY:'auto',maxHeight:'80vh'}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.tx}}>Planifier — {DAYS_FULL[di]} {date.getDate()} {MONTHS_F[date.getMonth()]}</div>
                  <div style={{fontSize:10,color:C.tx3,marginTop:2}}>Semaine bloc estimée : S{planWeek}</div>
                </div>
                <button onClick={()=>setShowPlanModal(null)} style={{background:'none',border:'none',color:C.tx3,fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
              </div>

              {/* Événements */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',margin:'0 0 8px'}}>Événement</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                  {EVENT_TYPES.map(et=>{
                    const alreadyHas=eventsForDate(isoDate(date)).some(ev=>ev.type===et.v);
                    return(<button key={et.v} onClick={()=>{if(alreadyHas)return;const id=String(Date.now());addEvent(isoDate(date),{id,type:et.v,title:"",notes:""}); /* ne pas fermer la modale → edition inline */}} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:4,border:'1px solid '+(alreadyHas?et.c:et.c+'50'),background:alreadyHas?et.c+'30':et.c+'15',color:et.c,fontSize:11,fontWeight:700,cursor:alreadyHas?'default':'pointer',fontFamily:'inherit',opacity:alreadyHas?0.6:1}}>
                      <span>{et.e}</span><span>{et.l}</span>
                    </button>);
                  })}
                </div>
                {eventsForDate(isoDate(date)).length>0&&<div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {eventsForDate(isoDate(date)).map(ev=>{const ei=EVENT_TYPES.find(t=>t.v===ev.type)||EVENT_TYPES[4];return(
                    <div key={ev.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:4,background:ei.c+'15',border:'1px solid '+ei.c+'40'}}>
                      <span style={{fontSize:18}}>{ei.e}</span>
                      <div style={{flex:1}}>
                        <input value={ev.title||''} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();const updated=eventsForDate(isoDate(date)).map(x=>x.id===ev.id?{...x,title:e.target.value}:x);if(setWeekSchedule)setWeekSchedule({...(weekSchedule||{}),events:{...wkEvents,[isoDate(date)]:updated}});}} placeholder={`Nom — ex: ${ei.l}`} style={{width:'100%',background:ei.c+'08',border:'1px solid '+ei.c+'30',borderRadius:6,padding:'4px 7px',color:ei.c,fontSize:12,fontWeight:700,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                        <input value={ev.notes||''} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();const updated=eventsForDate(isoDate(date)).map(x=>x.id===ev.id?{...x,notes:e.target.value}:x);if(setWeekSchedule)setWeekSchedule({...(weekSchedule||{}),events:{...wkEvents,[isoDate(date)]:updated}});}} placeholder="Notes (optionnel)" style={{width:'100%',background:'transparent',border:'none',color:C.tx3,fontSize:10,fontFamily:'inherit',outline:'none',marginTop:4,padding:'2px 0',boxSizing:'border-box'}}/>
                      </div>
                      <button onClick={()=>removeEvent(isoDate(date),ev.id)} style={{background:'none',border:'none',color:C.tx3,fontSize:16,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>×</button>
                    </div>
                  );})}
                </div>}
              </div>

              {/* Séances muscu */}
              {sessions.length>0&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',margin:'0 0 8px'}}>Séances musculation — S{planWeek}</div>
                  <div style={{fontSize:9,color:C.tx3,marginBottom:8,padding:'6px 10px',borderRadius:7,background:C.b+'10',border:'1px solid '+C.b+'20'}}>Planning pour cette semaine uniquement. Le jour par défaut reste le même pour les autres semaines.</div>
                  {sessions.map(s=>{
                    const wd=s.weekDays;
                    const effDay=wd&&String(planWeek) in wd?wd[String(planWeek)]:s.day_of_week;
                    const assigned=effDay===di;
                    const hasOverride=wd&&String(planWeek) in wd;
                    return(
                      <div key={s.id} onClick={()=>{if(onUpdateSessionWeekDay)onUpdateSessionWeekDay(s.id,planWeek,assigned?null:di);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:4,border:'1px solid '+(assigned?C.b+'60':C.brdL),background:assigned?C.b+'12':C.s2,marginBottom:6,cursor:'pointer',transition:'all 0.15s'}}>
                        <div style={{width:22,height:22,borderRadius:6,border:'2px solid '+(assigned?C.b:C.tx3),background:assigned?C.b:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:800,flexShrink:0}}>{assigned?'✓':''}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:13,fontWeight:600,color:assigned?C.b:C.tx}}>{s.name}</span>{hasOverride&&<span style={{fontSize:8,padding:'1px 5px',borderRadius:4,background:C.ac+'20',color:C.ac,fontWeight:700}}>modif</span>}</div>
                          {s.day_of_week!=null&&!assigned&&<div style={{fontSize:9,color:C.tx3}}>Défaut : {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][s.day_of_week]||'?'}{effDay!=null&&effDay!==di?' · Cette sem. : '+['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][effDay]:''}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Séances énergie */}
              {energySessions.length>0&&(
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Séances énergétiques</div>
                  {energySessions.map(s=>{
                    const sid=s.id||s.session_key;
                    const inWeek=(energyWeekPlan[planWeek]||[]).includes(sid);
                    const assignedDay=inWeek?(energyDayPlan[planWeek]?.[sid]??null):null;
                    const isHere=inWeek&&assignedDay===di;
                    return(
                      <div key={sid} onClick={()=>{
                        if(!inWeek){toggleEnergyWeek(sid,planWeek);assignEnergyDay(sid,planWeek,di);}
                        else if(!isHere){assignEnergyDay(sid,planWeek,di);}
                        else{assignEnergyDay(sid,planWeek,null);}
                      }} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:4,border:'1px solid '+(isHere?C.coach+'60':inWeek?C.coach+'30':C.brdL),background:isHere?C.coach+'15':inWeek?C.coach+'08':C.s2,marginBottom:6,cursor:'pointer',transition:'all 0.15s'}}>
                        <div style={{width:22,height:22,borderRadius:6,border:'2px solid '+(isHere?C.coach:C.tx3),background:isHere?C.coach:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:800,flexShrink:0}}>{isHere?'✓':''}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:isHere?C.coach:inWeek?C.coach+'CC':C.tx}}>{s.session_label||s.session_key}</div>
                          {inWeek&&!isHere&&assignedDay!=null&&<div style={{fontSize:9,color:C.tx3}}>Assignée : {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][assignedDay]||'?'}</div>}
                          {!inWeek&&<div style={{fontSize:9,color:C.tx3}}>Cliquer pour assigner à cette semaine + ce jour</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {sessions.length===0&&energySessions.length===0&&(
                <div style={{textAlign:'center',padding:'20px 0',color:C.tx3,fontSize:12}}>Crée d'abord des séances dans l'onglet Programme</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal visibilité athlète */}
      {showVisModal&&(
        <div style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setShowVisModal(false)}>
          <div style={{width:'100%',maxWidth:500,background:C.s1,borderRadius:'6px 6px 0 0',padding:'20px 20px 32px',overflowY:'auto',maxHeight:'75vh'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{fontSize:15,fontWeight:700,color:C.tx}}>Visibilite athlete</div>
              <button onClick={()=>setShowVisModal(false)} style={{background:'none',border:'none',color:C.tx3,fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:11,color:C.tx3,marginBottom:16}}>Choisissez ce que l'athlète peut voir dans son application</div>
            {VIS_ITEMS.map(({k,label,emoji})=>{
              const visible=visibilitySettings[k]!==false;
              return(
                <div key={k} onClick={()=>onUpdateVisibility&&onUpdateVisibility({...visibilitySettings,[k]:!visible})} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:6,border:'1px solid '+(visible?C.g+'40':C.brd),background:visible?C.g+'08':C.s2,marginBottom:7,cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:18}}>{emoji}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:visible?C.tx:C.tx3}}>{label}</div>
                      <div style={{fontSize:9,color:C.tx3}}>{visible?'Visible par l\'athlète':'Masqué'}</div>
                    </div>
                  </div>
                  <div style={{width:44,height:24,borderRadius:6,background:visible?C.g:'rgba(255,255,255,0.12)',position:'relative',transition:'all 0.2s',flexShrink:0}}>
                    <div style={{position:'absolute',top:3,left:visible?23:3,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'all 0.2s'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom sheet preview séance/énergie/test */}
      {previewItem&&(()=>{
        const{type,data,planWeek}=previewItem;
        return(
          <div style={{position:'fixed',inset:0,zIndex:600,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setPreviewItem(null)}>
            <div style={{width:'100%',maxWidth:640,background:C.s1,borderRadius:'6px 6px 0 0',padding:'20px 20px 32px',overflowY:'auto',maxHeight:'80vh'}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:700,color:C.tx}}>
                  {type==='muscu'&&data.name}
                  {type==='energy'&&(data.session_label||'Seance energetique')}
                  {type==='test'&&data.title}
                </div>
                <button onClick={()=>setPreviewItem(null)} style={{background:'none',border:'none',color:C.tx3,fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
              </div>

              {/* Prévisuel musculation : liste des exercices pour planWeek */}
              {type==='muscu'&&(()=>{
                const exList=exos[data.id]||[];
                if(!exList.length)return<div style={{fontSize:12,color:C.tx3,textAlign:'center',padding:'20px 0'}}>Aucun exercice dans cette séance</div>;
                return(<div>{exList.map((ex,i)=>{
                  const wd=ex.weeks?.[planWeek]||null;
                  const method=wd?.method||null;
                  const mInfo=allMethods?.[method]||null;
                  return(<div key={ex.id||i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid '+C.brd+'50'}}>
                    <div style={{width:3,height:36,borderRadius:2,background:mInfo?mInfo.c:C.ac,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{ex.name}</div>
                      {wd?<div style={{fontSize:11,color:C.tx2,marginTop:2}}>{wd.pdc?'Poids de corps':wd.kg+'kg'} · {wd.sets}×{wd.repsRange||'?'} reps{wd.rir!=null?' · RIR '+wd.rir:''}{method&&mInfo?' · '+mInfo.label:''}</div>
                        :<div style={{fontSize:10,color:C.tx3,marginTop:2,fontStyle:'italic'}}>Non programmé S{planWeek}</div>}
                    </div>
                  </div>);
                })}</div>);
              })()}

              {/* Prévisuel énergie */}
              {type==='energy'&&(<div>
                {(data.appareil_types||[]).length>0&&<div style={{fontSize:11,color:C.tx3,marginBottom:12}}>Équipements : {data.appareil_types.join(', ')}</div>}
                <div style={{padding:'12px 14px',borderRadius:4,background:C.coach+'10',border:'1px solid '+C.coach+'30',fontSize:12,color:C.coach,marginBottom:8}}>
                  Pour voir le détail des blocs, ouvrir l'onglet <strong>Prog → Énergétique</strong>.
                </div>
                <div style={{fontSize:10,color:C.tx3}}>Semaine planifiée : S{planWeek}</div>
              </div>)}

              {/* Prévisuel test */}
              {type==='test'&&(()=>{
                const tc=data.type==='musculation'?'#FFC933':data.type==='energetique'?'#FF5A33':data.type==='specifique'?'#F5A623':'#66F03C';
                return(<div>
                  <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,padding:'3px 10px',borderRadius:7,background:tc+'20',color:tc,fontWeight:600}}>{data.type||'Test'}</span>
                    <span style={{fontSize:11,color:C.tx3}}>{data.date}</span>
                    {data.completed&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:7,background:C.g+'20',color:C.g,fontWeight:600}}>✓ Complété</span>}
                  </div>
                  {data.protocol_description&&<div style={{padding:'10px 14px',borderRadius:4,background:C.s2,border:'1px solid '+C.brd,fontSize:12,color:C.tx,lineHeight:1.6,marginBottom:8}}>{data.protocol_description}</div>}
                  {data.results_structured?.metrics?.length>0&&(<div style={{marginTop:8}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',marginBottom:6}}>Résultats</div>
                    {data.results_structured.metrics.map((m,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid '+C.brd+'50',fontSize:12}}>
                        <span style={{color:C.tx2}}>{m.name}</span>
                        <span style={{fontWeight:700,color:tc}}>{m.value}{m.unit?' '+m.unit:''}</span>
                      </div>
                    ))}
                  </div>)}
                  {!data.protocol_description&&!data.results_structured?.metrics?.length&&<div style={{fontSize:12,color:C.tx3,textAlign:'center',padding:'16px 0'}}>Voir l'onglet <strong>Test</strong> pour le détail.</div>}
                </div>);
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── MonthCalendar ─────────────────────────────────────────────────────────────


export default CoachFourWeekCalendar;
