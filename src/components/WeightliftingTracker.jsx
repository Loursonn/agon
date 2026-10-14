import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, ReferenceLine } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getNutritionStrategy } from "@/lib/nutrition";
import NutritionView from "@/components/athlete/NutritionView";
import EnergySessionLog from "@/components/athlete/EnergySessionLog";
import PerformanceProfile from "@/components/athlete/PerformanceProfile";
import TestSessionView from "@/components/TestSessionView";
import CoachPerfNotification from "@/components/coach/CoachPerfNotification";
import EnergyExerciseBank from "@/components/coach/EnergyExerciseBank";
import EnergySessionEditor from "@/components/coach/EnergySessionEditor";
import { PlanningEditor } from "@/components/coach/PlanningEditor";
import { PlanningOverview } from "@/components/coach/PlanningOverview";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import LogView from "@/components/athlete/LogView";
import { CoachProgramEditor, CoachExoParams } from "@/components/coach/CoachProgramEditor";
import RIRPicker from "@/components/ui/RIRPicker";
import CoachFourWeekCalendar from "@/components/coach/CoachFourWeekCalendar";
import WeekCalendar from "@/components/coach/WeekCalendar";
// ── Lib extraite du monolithe (Phase 1 refactoring) ──────────────────────────
import { C, BT, BLOC_COLORS, HABIT_COLORS, HABIT_ICONS } from "@/lib/theme";
import { SKEYS, sLoad, sSave, clearAllLocalStorage } from "@/lib/storage";
import { MTREE, ML, getMC, mL, ALL_MIDS, normPrimary, getSessionBlocs, BZFRONT, BZBACK, ALL_BZ, INJ_TYPES, INJ_STATUS, STATUS_COL, stC } from "@/lib/muscles";
import { RIR_OPTS, rL, rC, parseReps, e1rm, roundHalf, normalizeExName, normForMatch, fuzzyExMatch, DEF_METHODS, BLOC_METHODS, EVENT_TYPES, MDEF, clusterReps, fmtMR, generateRows, EX_TIER, DEF_BLOCK_CONFIG, DEF_SESSIONS } from "@/lib/exercises";
import { WELL_ITEMS, calcScore, getReco, getAlerts } from "@/lib/wellness";
import { getAllPRs, getMuscSets, get1rmByWeek, getCombinedData, getBig3, getWeightChartData, getWellnessChartData } from "@/lib/calculations";
import { todayKey, hISO, hAddDays, calcHabitStreak, streakMsg, getHabitWeekDays, checkMilestone } from "@/lib/date";

import { BodyMap, InjuryForm, WellnessFlow } from "@/components/athlete/WellnessFlow";
import { NewBlockModal, CoachEnergyProgram, CoachConfig, CoachWeeklyFeedback } from "@/components/coach/CoachComponents";
import { PRsView, InjuriesView, MuscleVolumeCard, WeeklyVolumeCard, AIChatBar } from "@/components/athlete/StatsViews";
import { ExerciseCreateModal, MergeModal, ExerciseDetailModal, ExerciseBank } from "@/components/coach/ExerciseBank";
import { HabitCreateModal, HabitDashboard, HabitTrackerProfile } from "@/components/athlete/HabitTracker";
import { DarkTip, MiniChart, SleepTunnel, WeightChart, CombinedStatsChart } from "@/components/athlete/StatsCharts";
import RetoursView from "@/components/coach/RetoursView";
// --- COMPONENTS ---


function DataManager({exos,setExos,sets,setSets,sessions,setSessions,completedSessions,setCompletedSessions,athleteNotes,setAthleteNotes,blockHistory,setBlockHistory,exMeta,setExMeta,wellness,setWellness,wellnessHistory,setWellnessHistory,weightLog,setWeightLog,injuries,setInjuries,weeksArr}){
  const[confirm,setConfirm]=useState(null);
  const section=(title,desc,items)=>(<div style={{background:C.s1,borderRadius:6,padding:"12px 16px",border:"1px solid "+C.brd,marginBottom:12}}>
    <div style={{fontSize:11,fontWeight:600,color:C.r,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>{title}</div>
    {desc&&<div style={{fontSize:10,color:C.tx3,marginBottom:10}}>{desc}</div>}
    {items.length===0&&<div style={{fontSize:11,color:C.tx3,textAlign:"center",padding:"8px 0"}}>Aucune donnée</div>}
    {items.map(({label,detail,action,key})=>(
      <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid "+C.brd}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600}}>{label}</div>{detail&&<div style={{fontSize:10,color:C.tx3}}>{detail}</div>}</div>
        {confirm===key?(<div style={{display:"flex",gap:6,flexShrink:0}}>
          <button onClick={()=>setConfirm(null)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Non</button>
          <button onClick={()=>{action();setConfirm(null);}} style={{padding:"5px 10px",borderRadius:6,border:"none",background:C.r,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Confirmer</button>
        </div>):(<button onClick={()=>setConfirm(key)} style={{padding:"5px 12px",borderRadius:7,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Supprimer</button>)}
      </div>
    ))}
  </div>);

  const totalExos=Object.values(exos).flat().length;
  const totalSets=Object.keys(sets).length;
  const totalLogs=Object.values(sets).flat().filter(s=>s.done).length;
  const totalCompleted=Object.values(completedSessions).flat().length;

  return(<div>
    <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Gestion des données</div>
    <div style={{fontSize:12,color:C.tx2,marginBottom:16}}>Supprimer sélectivement des données</div>

    <div style={{background:C.s1,borderRadius:6,padding:"12px 16px",border:"1px solid "+C.brd,marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Résumé</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[
          {l:"Séances",v:sessions.length,c:C.coach},
          {l:"Exercices",v:totalExos,c:C.ac},
          {l:"Séries logguées",v:totalLogs,c:C.g},
          {l:"Blocs archivés",v:(blockHistory||[]).length,c:C.b},
        ].map(({l,v,c})=><div key={l} style={{background:C.s2,borderRadius:4,padding:"8px 10px",textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
          <div style={{fontSize:9,color:C.tx3}}>{l}</div>
        </div>)}
      </div>
    </div>

    {section("Séances du bloc","Supprimer une séance et ses exercices",
      sessions.map((s,i)=>({key:"sess_"+s.id,label:s.name+" ("+s.short+")",detail:(exos[s.id]||[]).length+" exercices",
        action:()=>{setSessions(p=>p.filter((_,idx)=>idx!==i));setExos(p=>{const n={...p};delete n[s.id];return n;});}
      }))
    )}

    {section("Logs d'entraînement","Supprimer les données de séances réalisées",
      weeksArr.map(w=>({key:"logs_w"+w,label:"Semaine "+w,detail:(completedSessions[w]||[]).length+" séances validées",
        action:()=>{
          const newSets={...sets};Object.keys(newSets).forEach(k=>{if(k.endsWith("_"+w))delete newSets[k];});setSets(newSets);
          setCompletedSessions({...completedSessions,[w]:[]});
          const na={...athleteNotes};Object.keys(na).forEach(k=>{if(k.endsWith("_"+w))delete na[k];});setAthleteNotes(na);
        }
      }))
    )}

    {section("Historique des blocs","Supprimer des blocs archivés",
      (blockHistory||[]).map((b,i)=>({key:"block_"+i,label:b.blockConfig?.blockName||"Bloc "+(i+1),
        detail:new Date(b.archivedAt).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}),
        action:()=>setBlockHistory(blockHistory.filter((_,idx)=>idx!==i))
      }))
    )}

    {section("Nettoyage rapide","Effacer des données par catégorie",[
      {key:"all_logs",label:"Tous les logs du bloc",detail:totalLogs+" séries enregistrées + "+totalCompleted+" séances validées",
        action:()=>{setSets({});setCompletedSessions({});setAthleteNotes({});}},
      {key:"all_wellness",label:"Wellness & poids",detail:"Score du jour + historique poids",
        action:()=>{setWellness(null);setWellnessHistory({});setWeightLog({});}},
      {key:"all_injuries",label:"Toutes les blessures",detail:(injuries||[]).length+" blessure(s)",
        action:()=>setInjuries([])},
    ])}
  </div>);
}

function BlockHistoryViewer({blockHistory,onClose,onDelete}){
  if(!blockHistory?.length)return(<div style={{padding:20,textAlign:"center"}}><div style={{fontSize:14,color:C.tx3,marginBottom:16}}>Aucun bloc archive</div><button onClick={onClose} style={{padding:"8px 20px",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button></div>);
  return(<div style={{position:"fixed",inset:0,zIndex:200,background:C.bg,overflowY:"auto"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid "+C.brd,position:"sticky",top:0,background:C.bg,zIndex:1}}>
      <div style={{fontSize:14,fontWeight:700}}>Historique des blocs</div>
      <button onClick={onClose} style={{background:"none",border:"none",color:C.tx3,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>×</button>
    </div>
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
      {blockHistory.slice().reverse().map((block,i)=>{
        const realIdx=blockHistory.length-1-i;
        const prs=getAllPRs(block.exos||{});const totalDone=Object.values(block.completedSessions||{}).flat().length;
        const tw=block.blockConfig?.totalWeeks||6;const totalTarget=(block.goals?.sessionsPerWeek||6)*tw;
        const adherence=totalTarget?Math.round((totalDone/totalTarget)*100):0;
        const date=block.archivedAt?new Date(block.archivedAt).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"";
        const big3=getBig3(block.exos||{});
        return(<div key={block.id||i} style={{background:C.s1,borderRadius:6,padding:16,border:"1px solid "+C.brd}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700}}>{block.blockConfig?.blockName||"Bloc "+(blockHistory.length-i)}</div>
              <div style={{fontSize:10,color:C.tx3}}>{date} · {tw} sem. · {totalDone}/{totalTarget} seances ({adherence}%)</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{padding:"4px 10px",borderRadius:4,background:adherence>=80?C.gS:adherence>=50?C.oS:C.rS,color:adherence>=80?C.g:adherence>=50?C.o:C.r,fontSize:11,fontWeight:700}}>{adherence}%</div>
              {onDelete&&<button onClick={()=>onDelete(realIdx)} style={{padding:"4px 10px",borderRadius:4,border:"1px solid "+C.r+"40",background:"transparent",color:C.r,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Suppr.</button>}
            </div>
          </div>
          {big3.length>0&&<div style={{display:"flex",gap:8,marginBottom:10}}>
            {big3.map(({name,label,c})=>{const pr=prs[name];return(<div key={label} style={{flex:1,background:C.s2,borderRadius:4,padding:"10px 8px",textAlign:"center",border:"1px solid "+c+"20"}}>
              <div style={{fontSize:9,color:C.tx3,marginBottom:2}}>{label}</div>
              <div style={{fontSize:16,fontWeight:800,color:c}}>{pr?.est||"--"}</div>
              <div style={{fontSize:8,color:C.tx3}}>kg est.</div>
            </div>);})}
          </div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {(block.sessions||[]).map(s=><span key={s.id} style={{padding:"3px 8px",borderRadius:6,background:C.s2,border:"1px solid "+C.brd,fontSize:10,color:C.tx2}}>{s.short||s.name}</span>)}
          </div>
        </div>);
      })}
    </div>
  </div>);
}

export default function App({athleteId,defaultMode,canToggleMode=true,userName,athleteProfile,onEditProfile,viewOnly=false}){
  const{user,profile:myProfile}=useAuth();
  const load=(k,fb)=>sLoad(k,fb,athleteId);
  const save=(k,v)=>sSave(k,v,athleteId);
  const[mode,setMode]=useState(defaultMode||"athlete");const[tab,setTab]=useState("dash");const[coachTab,setCoachTab]=useState("prog");const[logSubTab,setLogSubTab]=useState("muscu");const[testSubTab,setTestSubTab]=useState("musculation");const[banqueSubTab,setBanqueSubTab]=useState("muscu");const[progSubTab,setProgSubTab]=useState("muscu");const[energyEditorKey,setEnergyEditorKey]=useState(null);const[energySessions,setEnergySessions]=useState([]);const[energySessionsLoaded,setEnergySessionsLoaded]=useState(false);const[energyWeekPlan,setEnergyWeekPlan]=useState({});const[energyDayPlan,setEnergyDayPlan]=useState({});const[energyPlanLoaded,setEnergyPlanLoaded]=useState(false);const[drawerPrOpen,setDrawerPrOpen]=useState(false);const[drawerInjOpen,setDrawerInjOpen]=useState(false);
  const[exos,setExosState]=useState({});const[exMeta,setExMetaState]=useState({});
  const[aW,setAW]=useState(1);const[sets,setSetsState]=useState({});const[anaTab,setAnaTab]=useState("combined");const[weightRange,setWeightRange]=useState("bloc");
  const[wellness,setWellnessState]=useState(null);const[wellnessHistory,setWellnessHistoryState]=useState({});const[wellnessPeriod,setWellnessPeriod]=useState("month");
  const[bodyWeight,setBodyWeightState]=useState({current:0,target:0});
  const[completedSessions,setCompletedSessionsState]=useState({});
  const[goals,setGoalsState]=useState({sessionsPerWeek:6,sleepTarget:8});
  const[athleteNotes,setAthleteNotesState]=useState({});const[customMethods,setCustomMethodsState]=useState([]);
  const[weightLog,setWeightLogState]=useState({});const[weightMilestones,setWeightMilestonesState]=useState([]);
  const[injuries,setInjuriesState]=useState([]);
  const[nutritionStrategy,setNutritionStrategy]=useState(null);
  const[nutritionLog,setNutritionLogState]=useState({});
  const[prExName,setPrExName]=useState(null);const[prSearch,setPrSearch]=useState('');const[prTab,setPrTab]=useState("est");
  const[sessions,setSessionsState]=useState(DEF_SESSIONS);
  const[blockConfig,setBlockConfigState]=useState(DEF_BLOCK_CONFIG);
  const[loaded,setLoaded]=useState(false);const[saveStatus,setSaveStatus]=useState(null);
  const[weekJustCompleted,setWeekJustCompleted]=useState(null);const[showBilan,setShowBilan]=useState(false);
  const[showWellness,setShowWellness]=useState(false);const[milestoneNotif,setMilestoneNotif]=useState(null);
  const[blockHistory,setBlockHistoryState]=useState([]);
  const[weekSchedule,setWeekScheduleState]=useState({});
  const[sessionLogs,setSessionLogsState]=useState({});
  const[freeSessions,setFreeSessionsState]=useState([]);
  const[testSessions,setTestSessions]=useState([]);
  const[visibilitySettings,setVisibilitySettingsState]=useState({muscu:true,energy:true,tests:true,wellness:true,nutrition:true,pr:true,weight:true});
  const[showNewBlock,setShowNewBlock]=useState(false);const[showBlockHistory,setShowBlockHistory]=useState(false);
  const[chatHistory,setChatHistory]=useState([]);
  const[aiChatOpen,setAiChatOpen]=useState(false);
  const[initialLogSess,setInitialLogSess]=useState(null);
  const[habits,setHabits]=useState([]);const[habitLogs,setHabitLogs]=useState({});const[habitEnabled,setHabitEnabled]=useState(false);
  const[habitToggling,setHabitToggling]=useState(false);const[habitToggleErr,setHabitToggleErr]=useState('');
  const[drawerOpen,setDrawerOpen]=useState(false);const[drawerSportOpen,setDrawerSportOpen]=useState(false);const[drawerZoom,setDrawerZoom]=useState(null);const[showLogoutConfirm,setShowLogoutConfirm]=useState(false);
  const[timerLeft,setTimerLeft]=useState(120);const[timerDur,setTimerDur]=useState(120);
  const[timerActive,setTimerActive]=useState(false);const[timerFinished,setTimerFinished]=useState(false);
  const timerRef=useRef(null);
  const playDing=()=>{try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const mk=(freq,t0,dur,vol=0.4)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=freq;o.type="sine";g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.001,t0+dur);o.start(t0);o.stop(t0+dur);};mk(880,ctx.currentTime,1.2);mk(1108,ctx.currentTime+0.25,1.0,0.3);mk(1318,ctx.currentTime+0.5,0.9,0.2);}catch(e){}};
  useEffect(()=>{if(!timerActive||timerLeft<=0)return;const tid=setInterval(()=>setTimerLeft(l=>l-1),1000);timerRef.current=tid;return()=>clearInterval(tid);},[timerActive]);
  useEffect(()=>{if(timerActive&&timerLeft<=0){setTimerActive(false);setTimerFinished(true);playDing();}},[timerActive,timerLeft]);
  const timerSetDur=d=>{setTimerDur(d);setTimerLeft(d);setTimerActive(false);setTimerFinished(false);};
  const timerStart=()=>{setTimerLeft(timerDur);setTimerActive(true);setTimerFinished(false);};
  const timerStop=()=>{clearInterval(timerRef.current);setTimerActive(false);setTimerFinished(false);setTimerLeft(timerDur);};

  useEffect(()=>{
    clearAllLocalStorage();
    (async()=>{
      const[e,m,s,w,wh,bw,cs,g,an,cm,wl,wmil,inj,sess,bc,bh,ws,ns,nl,sl,fs]=await Promise.all([load(SKEYS.exos,{}),load(SKEYS.exMeta,{}),load(SKEYS.sets,{}),load(SKEYS.wellness,null),load(SKEYS.wellnessHistory,{}),load(SKEYS.bw,{current:0,target:0}),load(SKEYS.completed,{}),load(SKEYS.goals,{sessionsPerWeek:6,sleepTarget:8}),load(SKEYS.anotes,{}),load(SKEYS.custMethods,[]),load(SKEYS.weightLog,{}),load(SKEYS.weightMilestones,[]),load(SKEYS.injuries,[]),load(SKEYS.sessions,DEF_SESSIONS),load(SKEYS.blockConfig,DEF_BLOCK_CONFIG),load(SKEYS.blockHistory,[]),load(SKEYS.weekSchedule,{}),getNutritionStrategy(athleteId).catch(()=>null),load("asp:nutrition_log",{}),load(SKEYS.sessionLogs,{}),load(SKEYS.freeSessions,[])]);
      const todayW=w?.date===todayKey()?w:null;if(w&&!todayW)save(SKEYS.wellness,null).catch(()=>{});
      setExosState(e);setExMetaState(m);setSetsState(s);setWellnessState(todayW);setWellnessHistoryState(wh);setBodyWeightState(bw);setCompletedSessionsState(cs);setGoalsState(g);setAthleteNotesState(an);setCustomMethodsState(cm);setWeightLogState(wl);setWeightMilestonesState(wmil);setInjuriesState(inj);setSessionsState(sess);setBlockConfigState(bc);setBlockHistoryState(bh||[]);setWeekScheduleState(ws||{});setNutritionStrategy(ns);setNutritionLogState(nl||{});setSessionLogsState(sl);setFreeSessionsState(fs);setLoaded(true);
    })();
  },[]);

  useEffect(()=>{
    if(energyPlanLoaded)return;
    Promise.all([
      supabase.from('app_data').select('value').eq('athlete_id',athleteId).eq('key','asp:energy_week_plan').maybeSingle(),
      supabase.from('app_data').select('value').eq('athlete_id',athleteId).eq('key','asp:energy_day_plan').maybeSingle(),
      supabase.from('energy_session_config').select('id,session_key,session_label,appareil_types').eq('athlete_id',athleteId)
    ]).then(([wp,dp,es])=>{
      if(wp.data?.value)setEnergyWeekPlan(wp.data.value);
      if(dp.data?.value)setEnergyDayPlan(dp.data.value);
      if(es.data)setEnergySessions(es.data);
      setEnergyPlanLoaded(true);
    });
  },[athleteId,energyPlanLoaded]);

  useEffect(()=>{
    if(!wellness)return;
    const now=new Date();const midnight=new Date(now);midnight.setHours(24,0,0,0);
    const tid=setTimeout(()=>{setWellnessState(null);save(SKEYS.wellness,null).catch(()=>{});},midnight-now);
    return()=>clearTimeout(tid);
  },[wellness]);

  useEffect(()=>{
    if(!athleteId)return;
    supabase.from('habits').select('*').eq('athlete_id',athleteId).eq('is_active',true).order('sort_order',{ascending:true,nullsFirst:false}).then(({data})=>{if(data)setHabits(data);});
    const cutoff=hAddDays(new Date(),-365).toISOString().slice(0,10);
    supabase.from('habit_logs').select('habit_id,date').eq('athlete_id',athleteId).gte('date',cutoff).then(({data})=>{if(data){const l={};data.forEach(r=>{if(!l[r.habit_id])l[r.habit_id]=[];l[r.habit_id].push(r.date);});setHabitLogs(l);}});
    supabase.from('profiles').select('habit_tracker_enabled').eq('id',athleteId).single().then(({data})=>{if(data)setHabitEnabled(!!data.habit_tracker_enabled);});
  },[athleteId]);

  useEffect(()=>{
    if(!athleteId||mode!=="athlete")return;
    supabase.from('app_data').select('value').eq('athlete_id',athleteId).eq('key','asp:coach_feedback').maybeSingle().then(({data})=>{if(data?.value)setCoachFeedbacks(data.value);});
  },[athleteId,mode]);
  useEffect(()=>{
    if(!athleteId)return;
    supabase.from('app_data').select('value').eq('athlete_id',athleteId).eq('key','app:user_feedback').maybeSingle().then(({data})=>{if(data?.value?.entries)setAppFeedbacks(data.value.entries);});
  },[athleteId]);

  // Chargement tests + paramètres visibilité
  useEffect(()=>{
    if(!athleteId)return;
    supabase.from('test_sessions').select('id,type,title,date,completed').eq('athlete_id',athleteId).order('date',{ascending:true}).then(({data})=>{if(data)setTestSessions(data);});
    supabase.from('app_data').select('value').eq('athlete_id',athleteId).eq('key','asp:visibility').maybeSingle().then(({data})=>{if(data?.value)setVisibilitySettingsState(v=>({...v,...data.value}));});
  },[athleteId]);

  const setVisibilitySettings=async(settings)=>{
    setVisibilitySettingsState(settings);
    await supabase.from('app_data').upsert({athlete_id:athleteId,key:'asp:visibility',value:settings,updated_at:new Date().toISOString()},{onConflict:'athlete_id,key'});
  };

  const toggleHabitLog=async(habitId,dateISO)=>{
    const logs=habitLogs[habitId]||[];
    if(logs.includes(dateISO)){
      await supabase.from('habit_logs').delete().match({habit_id:habitId,date:dateISO});
      setHabitLogs(p=>({...p,[habitId]:(p[habitId]||[]).filter(d=>d!==dateISO)}));
    }else{
      await supabase.from('habit_logs').insert({habit_id:habitId,athlete_id:athleteId,date:dateISO});
      setHabitLogs(p=>({...p,[habitId]:[...(p[habitId]||[]),dateISO]}));
    }
  };

  const flash=ok=>{setSaveStatus(ok?"saved":"error");setTimeout(()=>setSaveStatus(null),2000);};
  const setExos=v=>{const val=typeof v==='function'?v(exos):v;setExosState(val);save(SKEYS.exos,val).then(()=>flash(true)).catch(()=>flash(false));};
  const setExMeta=v=>{const val=typeof v==='function'?v(exMeta):v;setExMetaState(val);save(SKEYS.exMeta,val).then(()=>flash(true)).catch(()=>flash(false));};
  const setSets=v=>{setSetsState(v);save(SKEYS.sets,v).catch(()=>{});};
  const setBodyWeight=v=>{setBodyWeightState(v);save(SKEYS.bw,v).catch(()=>{});};
  const setGoals=v=>{setGoalsState(v);save(SKEYS.goals,v).then(()=>flash(true)).catch(()=>flash(false));};
  const setCompletedSessions=v=>{setCompletedSessionsState(v);save(SKEYS.completed,v).catch(()=>{});};
  const setAthleteNotes=v=>{setAthleteNotesState(v);save(SKEYS.anotes,v).catch(()=>{});};
  const setCustomMethods=v=>{setCustomMethodsState(v);save(SKEYS.custMethods,v).then(()=>flash(true)).catch(()=>flash(false));};
  const setSessions=v=>{const val=typeof v==='function'?v(sessions):v;setSessionsState(val);save(SKEYS.sessions,val).then(()=>flash(true)).catch(()=>flash(false));};
  // Mise à jour du jour d'une séance muscu depuis le calendrier coach
  const updateSessionDay=(sessId,dayIdx)=>{setSessions(prev=>prev.map(s=>s.id===sessId?{...s,day_of_week:dayIdx}:s));};
  // Mise à jour du jour par semaine de bloc (override par semaine)
  // -1 = "pas planifié cette semaine" (sentinel pour différencier de "non défini")
  const updateSessionWeekDay=(sessId,blockWeek,dayIdx)=>{setSessions(prev=>prev.map(s=>{if(s.id!==sessId)return s;const wd={...(s.weekDays||{})};if(dayIdx===null)wd[String(blockWeek)]=-1;else wd[String(blockWeek)]=dayIdx;return{...s,weekDays:wd};}));};
  const setBlockConfig=v=>{const val=typeof v==='function'?v(blockConfig):v;setBlockConfigState(val);save(SKEYS.blockConfig,val).then(()=>flash(true)).catch(()=>flash(false));};
  const setWeekSchedule=v=>{setWeekScheduleState(v);save(SKEYS.weekSchedule,v).catch(()=>{});};
  const updSets=(k,ns)=>setSets({...sets,[k]:ns});
  const setInjuries=v=>{setInjuriesState(v);save(SKEYS.injuries,v).catch(()=>{});};
  const addInjury=inj=>setInjuries([...injuries,inj]);
  const updateInjury=inj=>setInjuries(injuries.map(i=>i.id===inj.id?inj:i));
  const deleteInjury=id=>setInjuries(injuries.filter(i=>i.id!==id));
  const setBlockHistory=v=>{setBlockHistoryState(v);save(SKEYS.blockHistory,v).then(()=>flash(true)).catch(()=>flash(false));};
  const setSessionLogs=v=>{setSessionLogsState(v);save(SKEYS.sessionLogs,v).catch(()=>{});};
  const setFreeSessions=v=>{setFreeSessionsState(v);save(SKEYS.freeSessions,v).catch(()=>{});};
  const archiveAndNewBlock=(opts)=>{
    const hasData=Object.values(exos).flat().length>0||Object.values(completedSessions).flat().length>0;
    if(hasData){
      const archived={id:"blk_"+Date.now(),archivedAt:new Date().toISOString(),exos,sets,completedSessions,sessions,blockConfig,goals,wellnessHistory,bodyWeight,athleteNotes};
      setBlockHistory([...blockHistory,archived]);
    }
    // Set new sessions from wizard
    setSessions(opts.sessions||[]);
    // Exos : reprise historique > garder actuels > reset
    if(opts.restoredExos){
      // Restauration depuis l'historique : exos déjà remappés aux nouveaux IDs
      setExos(opts.restoredExos);
    }else if(!opts.exos){
      const newExos={};(opts.sessions||[]).forEach(s=>{newExos[s.id]=[];});setExos(newExos);
    }else{
      const newExos={...exos};(opts.sessions||[]).forEach(s=>{if(!newExos[s.id])newExos[s.id]=[];});setExos(newExos);
    }
    // Block config
    const newBc=opts.config?{...blockConfig}:{...DEF_BLOCK_CONFIG};
    newBc.blockName=opts.blockName||"";newBc.objective=opts.objective||"";newBc.totalWeeks=opts.totalWeeks||6;newBc.deloadWeek=opts.deloadWeek||0;newBc.startDate=new Date().toISOString().slice(0,10);
    setBlockConfig(newBc);
    setGoals(g=>({...g,sessionsPerWeek:opts.sessPerWeek||g.sessionsPerWeek}));
    // Always reset progress
    setSets({});setCompletedSessions({});setAthleteNotes({});
    setWellnessState(null);save(SKEYS.wellness,null).catch(()=>{});
    setWellnessHistoryState({});save(SKEYS.wellnessHistory,{}).catch(()=>{});
    setAW(1);setShowNewBlock(false);setShowBilan(false);
  };

  const applyAIEdit=(newSessions)=>{
    const merged={...exos};
    Object.entries(newSessions).forEach(([sid,exList])=>{merged[sid]=exList;});
    setExos(merged);
  };

  const saveWellness=(data)=>{
    const dataWithDate={...data,date:todayKey()};
    setWellnessState(dataWithDate);save(SKEYS.wellness,dataWithDate).catch(()=>{});
    const wh={...wellnessHistory,[todayKey()]:dataWithDate,[currentWeek]:data.score};setWellnessHistoryState(wh);save(SKEYS.wellnessHistory,wh).catch(()=>{});
    if(data.poids){const key=todayKey();const nwl={...weightLog,[key]:data.poids};setWeightLogState(nwl);save(SKEYS.weightLog,nwl).catch(()=>{});const milestone=checkMilestone(nwl,bodyWeight.current);if(milestone&&milestone>bodyWeight.current){const nm=[...weightMilestones,{date:key,kg:milestone}];setWeightMilestonesState(nm);save(SKEYS.weightMilestones,nm).catch(()=>{});const newBw={...bodyWeight,current:milestone};setBodyWeightState(newBw);save(SKEYS.bw,newBw).catch(()=>{});setMilestoneNotif(milestone);setTimeout(()=>setMilestoneNotif(null),3500);}}
    setShowWellness(false);
  };

  const allMethods=useMemo(()=>({...DEF_METHODS,...Object.fromEntries(customMethods.map(m=>[m.key,m]))}),[customMethods]);
  const tw=blockConfig.totalWeeks||6;
  const dw=blockConfig.deloadWeek||0;
  const weeksArr=Array.from({length:tw},(_,i)=>i+1);
  const isDeload=w=>blockConfig.deloadWeek&&w===blockConfig.deloadWeek;
  const weeklyTarget=useMemo(()=>{const t={};for(let w=1;w<=tw;w++){const n=sessions.filter(s=>(exos[s.id]||[]).some(ex=>ex.weeks?.[w]?.sets)).length;t[w]=n>0?n:sessions.length||1;}return t;},[sessions,exos,tw]);
  const currentWeek=useMemo(()=>{
    if(blockConfig?.startDate){
      const days=Math.floor((Date.now()-new Date(blockConfig.startDate).getTime())/86400000);
      return Math.min(Math.max(1,Math.floor(days/7)+1),tw);
    }
    // Fallback pour les blocs sans date de début (ancien comportement)
    for(let w=1;w<=tw;w++){if((completedSessions[w]||[]).length<(weeklyTarget[w]||goals.sessionsPerWeek))return w;}
    return tw;
  },[blockConfig?.startDate,completedSessions,weeklyTarget,goals.sessionsPerWeek,tw]);
  const totalTarget=useMemo(()=>weeksArr.reduce((acc,w)=>acc+(weeklyTarget[w]||goals.sessionsPerWeek),0),[weeksArr,weeklyTarget,goals.sessionsPerWeek]);
  const streak=useMemo(()=>{let s=0;for(let w=currentWeek-1;w>=1;w--){if((completedSessions[w]||[]).length>=(weeklyTarget[w]||goals.sessionsPerWeek))s++;else break;}return s;},[completedSessions,currentWeek,weeklyTarget,goals.sessionsPerWeek]);
  const weekAdherence=Math.round(((completedSessions[currentWeek]||[]).length/(weeklyTarget[currentWeek]||goals.sessionsPerWeek))*100);
  const motivMsg=()=>{if(isDeload(currentWeek))return{t:"Semaine deload",d:"Recuperation active.",c:C.b};if(currentWeek===tw)return{t:"Derniere semaine !",d:"Tout donner.",c:C.coach};if(streak>=3&&(wellness?.score||50)>=70)return{t:"En feu ! "+streak+" sem.",d:"Continue.",c:C.g};if((wellness?.score||50)<40)return{t:"Corps en recuperation",d:"Seance legere.",c:C.o};if(weekAdherence>=100)return{t:"Semaine "+currentWeek+" complete !",d:"Repos merite.",c:C.g};return{t:"Reste focus",d:"Chaque seance compte.",c:C.ac};};
  const msg=motivMsg();
  const prs=getAllPRs(exos);const muscSets=getMuscSets(exos,exMeta);
  const wScore=wellness?.score||50;const wReco=getReco(wScore);
  const combinedData=getCombinedData(exos,sets,wellnessHistory,tw);const totalDone=Object.values(completedSessions).flat().length;
  const activeInjuries=injuries.filter(i=>i.status!=="Guerie");

  const switchMode=m=>{setMode(m);if(m==="coach")setCoachTab("prog");else setTab("dash");};
  const completeSession=(sessId,week)=>{const prev=completedSessions[week]||[];if(prev.includes(sessId))return;const newW=[...prev,sessId];const newC={...completedSessions,[week]:newW};setCompletedSessions(newC);if(newW.length>=(weeklyTarget[week]||goals.sessionsPerWeek)){setWeekJustCompleted(week);setTimeout(()=>{setWeekJustCompleted(null);if(week>=tw)setShowBilan(true);else setAW(week+1);},2800);}};
  const uncompleteSession=(sessId,week)=>setCompletedSessions({...completedSessions,[week]:(completedSessions[week]||[]).filter(s=>s!==sessId)});
  const[bankAddEx,setBankAddEx]=useState(null);const[bankAddMsg,setBankAddMsg]=useState('');
  const handleBankAdd=ex=>{
    if(sessions.length===0){setBankAddMsg('Crée un bloc programme d\'abord (onglet Prog)');setTimeout(()=>setBankAddMsg(''),3000);return;}
    const makeEx=sid=>({id:"g_"+Date.now(),name:ex.name,bloc:ex.bloc||"ESTH",target:ex.target||"Pecs",exType:ex.ex_type||"muscu",exercise_id:ex.id,weeks:{1:{kg:0,sets:3,repsRange:"10",rir:2}}});
    if(sessions.length===1){const sid=sessions[0].id;setExos(prev=>({...prev,[sid]:[...(prev[sid]||[]),makeEx(sid)]}));setCoachTab("prog");setBankAddMsg('Ajouté à '+sessions[0].name+' !');setTimeout(()=>setBankAddMsg(''),2500);}
    else setBankAddEx(ex);
  };
  const[showExoParams,setShowExoParams]=useState(false);
  const[coachFeedbacks,setCoachFeedbacks]=useState({});
  const[showAppFeedback,setShowAppFeedback]=useState(false);
  const[appFeedbacks,setAppFeedbacks]=useState([]);
  const coachTabs=[{k:"prog",l:"Prog"},{k:"banque",l:"Banque"},{k:"stats",l:"Stats"},{k:"data",l:"Données"},{k:"test",l:"Test"},{k:"retours",l:"Retours"}];
  const athTabs=[{k:"dash",l:"Accueil"},{k:"log",l:"Seance"},{k:"alim",l:"Alim"},{k:"test",l:"Test"}];
  const activeTabs=mode==="coach"?coachTabs:athTabs;const activeTab=mode==="coach"?coachTab:tab;const setActiveTab=mode==="coach"?setCoachTab:setTab;
  const tabS=t=>({flex:1,padding:"10px 0",border:"none",borderBottom:"2px solid "+(activeTab===t?(mode==="coach"?C.coach:C.ac):"transparent"),background:"transparent",color:activeTab===t?(mode==="coach"?C.coach:C.ac):C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.3px"});

  if(!loaded)return(<div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,fontFamily:"system-ui"}}><div style={{width:48,height:48,borderRadius:6,background:C.acS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>~</div><div style={{fontSize:13,color:C.tx2}}>Chargement...</div></div>);

  return(<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,system-ui,sans-serif",color:C.tx,maxWidth:mode==="athlete"?480:"100%",margin:mode==="athlete"?"0 auto":0,display:mode==="coach"?"flex":undefined,flexDirection:mode==="coach"?"column":undefined}}>

    {drawerOpen&&mode==="athlete"&&(<>
      <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.55)"}}/>
      {drawerZoom&&(<div style={{position:"fixed",inset:0,zIndex:103,background:C.bg,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid "+C.brd,position:"sticky",top:0,background:C.bg,zIndex:2}}>
          <button onClick={()=>setDrawerZoom(null)} style={{width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
          <div style={{fontSize:14,fontWeight:700}}>{drawerZoom==="weight"?"Poids de corps":drawerZoom==="wellness"?"Forme du jour":drawerZoom==="goals"?"Objectifs":"Score de santé"}</div>
        </div>
        <div style={{padding:"16px"}}>
          {drawerZoom==="weight"&&(<div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:13,fontWeight:700}}>Évolution du poids</div><div style={{fontSize:13,fontWeight:800,color:C.ac}}>{bodyWeight.current||"—"}<span style={{fontSize:10,fontWeight:400,color:C.tx3}}> / {bodyWeight.target||"—"} kg</span></div></div>{Object.keys(weightLog).length>0?<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>:<div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"24px 0"}}>Aucune mesure enregistrée</div>}</div>)}
          {drawerZoom==="wellness"&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Aujourd'hui */}
            <div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
              <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>Forme du jour</div>
              {wellness?(<>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                  <div style={{position:"relative",width:72,height:72,flexShrink:0}}><svg viewBox="0 0 64 64" style={{width:72,height:72,transform:"rotate(-90deg)"}}><circle cx="32" cy="32" r="26" fill="none" stroke={C.s2} strokeWidth="5"/><circle cx="32" cy="32" r="26" fill="none" stroke={wReco.c} strokeWidth="5" strokeDasharray={String(2*Math.PI*26)} strokeDashoffset={String(2*Math.PI*26*(1-wScore/100))} strokeLinecap="round"/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:wReco.c}}>{wScore}</div></div>
                  <div><div style={{fontSize:16,fontWeight:700,color:wReco.c}}>{wReco.label}</div><div style={{fontSize:12,color:C.tx2,marginTop:4}}>{wReco.desc}</div>{wellness.sleepDur&&<div style={{fontSize:11,color:C.b,fontWeight:600,marginTop:4}}>{wellness.sleepDur}h de sommeil</div>}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>{[{l:"Récupération",v:wellness.fatigue,e:"sommeil"},{l:"Sommeil",v:wellness.sommeil,e:"repos"},{l:"Sérénité",v:wellness.stress,e:"cerveau"},{l:"Énergie",v:wellness.energie,e:"intensite"},{l:"Fraîcheur",v:wellness.doms,e:"musculation"}].map(m=>{const mv=m.v||0;const mc=mv>=4?C.g:mv>=3?C.o:C.r;return(<div key={m.l} style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:C.tx3,width:84,flexShrink:0}}>{m.e} {m.l}</span><div style={{flex:1,height:6,background:C.s2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:(mv/5*100)+"%",background:mc,borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:mc,width:16,textAlign:"right"}}>{mv||"?"}</span></div>);})}</div>
                {(wellness.coucher||wellness.reveil||wellness.sleepDur)&&<div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                  {wellness.coucher&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.s2}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.tx2,fontWeight:600}}>{String(wellness.coucher.h).padStart(2,"0")}:{String(wellness.coucher.m).padStart(2,"0")}</span></div>}
                  {wellness.reveil&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.s2}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.tx2,fontWeight:600}}>{String(wellness.reveil.h).padStart(2,"0")}:{String(wellness.reveil.m).padStart(2,"0")}</span></div>}
                  {wellness.sleepDur!=null&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.b+"18"}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.b,fontWeight:700}}>{wellness.sleepDur}h</span></div>}
                </div>}
                {wellness.sleepInterrupt===true&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:4,background:C.o+"12",border:"1px solid "+C.o+"30",fontSize:11,color:C.o}}>Réveil nocturne{wellness.sleepInterruptNote?" — "+wellness.sleepInterruptNote:""}</div>}
                {wellness.poids&&<div style={{marginTop:8,display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:4,background:C.s2}}><span style={{fontSize:10}}></span><span style={{fontSize:11,fontWeight:700,color:C.tx}}>{wellness.poids} kg</span><span style={{fontSize:9,color:C.tx3}}>ce matin</span></div>}
                {wellness.domsZones?.length>0&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.o,textTransform:"uppercase",marginBottom:4}}>Zones DOMS</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{wellness.domsZones.map(id=>{const z=ALL_BZ.find(z=>z.id===id);return z?<span key={id} style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:C.o+"20",color:C.o}}>{z.label}</span>:null;})}</div></div>}
                {wellness.injComment&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:4,background:C.r+"10",border:"1px solid "+C.r+"30",fontSize:11,color:C.r}}>{wellness.injComment}</div>}
              </>):<div style={{textAlign:"center",color:C.tx3,fontSize:12,padding:"20px 0"}}>Aucune donnée de forme aujourd'hui</div>}
            </div>
            {/* Historique score */}
            <div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Score de santé</div>
                <div style={{display:"flex",gap:3}}>{[{k:"week",l:"7j"},{k:"month",l:"30j"},{k:"year",l:"12m"}].map(t=>(<button key={t.k} onClick={()=>setWellnessPeriod(t.k)} style={{padding:"3px 8px",borderRadius:6,border:"none",background:wellnessPeriod===t.k?C.acS:"transparent",color:wellnessPeriod===t.k?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>))}</div>
              </div>
              {(()=>{const wData=getWellnessChartData(wellnessHistory,wellnessPeriod);const has=wData.some(d=>d.score!==null);return has?(<><div style={{display:"flex",gap:10,marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:3,borderRadius:2,background:C.g}}/><span style={{fontSize:9,color:C.tx3}}>Forme /100</span></div><div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:2,background:C.b,opacity:0.5}}/><span style={{fontSize:9,color:C.tx3}}>Sommeil (h)</span></div></div><ResponsiveContainer width="100%" height={130}><ComposedChart data={wData} margin={{top:4,right:4,bottom:0,left:-28}}><XAxis dataKey="label" tick={{fontSize:9,fill:C.tx3}} tickLine={false} axisLine={false}/><YAxis yAxisId="score" domain={[0,100]} hide/><YAxis yAxisId="sleep" orientation="right" domain={[0,12]} hide/><Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;const sc=payload.find(p=>p.dataKey==='score');const sl=payload.find(p=>p.dataKey==='sleep');return(<div style={{background:C.s1,border:"1px solid "+C.brdL,borderRadius:4,padding:"6px 10px",fontSize:10}}><div style={{color:C.tx3,marginBottom:4}}>{label}</div>{sc?.value!=null&&<div style={{color:getReco(sc.value).c,fontWeight:700}}>Forme : {sc.value}</div>}{sl?.value!=null&&<div style={{color:C.b}}>Sommeil : {sl.value}h</div>}</div>);}}/><Bar yAxisId="sleep" dataKey="sleep" fill={C.b} opacity={0.3} radius={[3,3,0,0]} maxBarSize={20}/><Line yAxisId="score" dataKey="score" stroke={C.g} strokeWidth={2} dot={(props)=>{if(props.value==null)return<g/>;const rc=getReco(props.value);return<circle cx={props.cx} cy={props.cy} r={3.5} fill={rc.c} stroke={C.bg} strokeWidth={1}/>;}} connectNulls={false}/></ComposedChart></ResponsiveContainer></>):(<div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"20px 0"}}>Aucune donnée wellness</div>);})()}
            </div>
            {/* Tunnel sommeil */}
            <div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
              <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>Tunnel de sommeil — 14 jours</div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>{[{c:C.g,l:"≥ 7.5h"},{c:C.o,l:"6.5–7.5h"},{c:C.r,l:"< 6.5h"}].map(({c,l})=><div key={l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:2,background:c,opacity:0.7}}/><span style={{fontSize:9,color:C.tx3}}>{l}</span></div>)}</div>
              <SleepTunnel wellnessHistory={wellnessHistory} C={C}/>
            </div>
          </div>)}
          {drawerZoom==="goals"&&(<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
              <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>Séances — Bloc en cours</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:10}}><span style={{fontSize:36,fontWeight:900,color:C.g,letterSpacing:"-1px"}}>{totalDone}</span><span style={{fontSize:16,color:C.tx3}}>/ {totalTarget}</span></div>
              <div style={{height:6,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:Math.min((totalDone/totalTarget)*100,100)+"%",background:C.g,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:C.tx3}}>{Math.max(0,totalTarget-totalDone)} séance(s) restante(s)</div>
            </div>
            {(()=>{
              const lastEntry=Object.keys(weightLog).length>0?Object.entries(weightLog).sort((a,b)=>a[0]>b[0]?-1:1)[0][1]:null;
              const todayW=weightLog[todayKey()]||lastEntry||bodyWeight.current||null;
              const start=bodyWeight.current||null;
              const tgt=nutritionStrategy?.target_weight||bodyWeight.target||null;
              if(!tgt)return null;
              const isGain=start&&tgt?tgt>=start:true;
              const delta=tgt&&todayW?+(tgt-todayW).toFixed(1):null;
              const pct=start&&tgt&&start!==tgt&&todayW?Math.min(100,Math.max(0,isGain?((todayW-start)/(tgt-start))*100:((start-todayW)/(start-tgt))*100)):0;
              const reached=delta!==null&&Math.abs(delta)<0.3;
              const wC=reached?C.g:C.ac;
              return(<div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Objectif poids</div>
                  {start&&tgt&&<span style={{fontSize:10,fontWeight:700,color:isGain?C.g:C.b,padding:"2px 8px",borderRadius:5,background:(isGain?C.g:C.b)+"18"}}>{isGain?"▲ Prise":"▼ Sèche"}</span>}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:10}}>
                  <span style={{fontSize:36,fontWeight:900,color:wC,letterSpacing:"-1px"}}>{todayW||"--"}</span>
                  <span style={{fontSize:16,color:C.tx3}}>/ {tgt} kg</span>
                </div>
                <div style={{height:6,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:pct+"%",background:wC,borderRadius:3,transition:"width 0.4s"}}/></div>
                <div style={{fontSize:11,color:reached?C.g:C.tx3,fontWeight:reached?600:400}}>{reached?"Objectif atteint !":delta!==null?(Math.abs(delta)+" kg restants"):"—"}</div>
              </div>);
            })()}
            {nutritionStrategy&&<div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>
              <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Stratégie nutritionnelle</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:800,color:nutritionStrategy.strategy==="seche"?C.r:nutritionStrategy.strategy==="prise_de_masse"?C.g:C.b}}>{nutritionStrategy.strategy==="seche"?"Sèche":nutritionStrategy.strategy==="prise_de_masse"?"Prise de masse":"Maintenance"}</span>
              </div>
              {nutritionStrategy.surplus_deficit_min!=null&&<div style={{fontSize:11,color:C.tx2}}>Fourchette : {nutritionStrategy.surplus_deficit_min}% à {nutritionStrategy.surplus_deficit_max}%</div>}
            </div>}
          </div>)}
          {drawerZoom==="health"&&(<div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd}}>{(()=>{const wData=getWellnessChartData(wellnessHistory,wellnessPeriod);const hasSomeData=wData.some(d=>d.score!==null);return(<><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><div style={{fontSize:13,fontWeight:700}}>Score de santé</div><div style={{display:"flex",gap:3}}>{[{k:"week",l:"7j"},{k:"month",l:"30j"},{k:"year",l:"12m"}].map(t=>(<button key={t.k} onClick={()=>setWellnessPeriod(t.k)} style={{padding:"3px 8px",borderRadius:6,border:"none",background:wellnessPeriod===t.k?C.acS:"transparent",color:wellnessPeriod===t.k?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>))}</div></div>{hasSomeData?<ResponsiveContainer width="100%" height={200}><ComposedChart data={wData} margin={{top:4,right:4,bottom:0,left:-28}}><XAxis dataKey="label" tick={{fontSize:9,fill:C.tx3}} tickLine={false} axisLine={false}/><YAxis yAxisId="score" domain={[0,100]} hide/><YAxis yAxisId="sleep" orientation="right" domain={[0,12]} hide/><Tooltip content={({active,payload,label})=>{if(!active||!payload?.length)return null;const sc=payload.find(p=>p.dataKey==='score');const sl=payload.find(p=>p.dataKey==='sleep');return(<div style={{background:C.s1,border:"1px solid "+C.brdL,borderRadius:4,padding:"6px 10px",fontSize:10}}><div style={{color:C.tx3,marginBottom:4}}>{label}</div>{sc?.value!=null&&<div style={{color:getReco(sc.value).c,fontWeight:700}}>Forme : {sc.value}</div>}{sl?.value!=null&&<div style={{color:C.b}}>Sommeil : {sl.value}h</div>}</div>);}}/><Bar yAxisId="sleep" dataKey="sleep" fill={C.b} opacity={0.3} radius={[3,3,0,0]} maxBarSize={20}/><Line yAxisId="score" dataKey="score" stroke={C.g} strokeWidth={2} dot={(props)=>{if(props.value==null)return<g/>;const rc=getReco(props.value);return<circle cx={props.cx} cy={props.cy} r={3.5} fill={rc.c} stroke={C.bg} strokeWidth={1}/>;}} connectNulls={false}/></ComposedChart></ResponsiveContainer>:<div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"30px 0"}}>Aucune donnée wellness</div>}</>);})()}</div>)}
        </div>
      </div>)}
      <div style={{position:"fixed",top:0,right:0,bottom:0,width:"min(360px,92vw)",zIndex:102,background:C.bg,overflowY:"auto",display:"flex",flexDirection:"column",borderLeft:"1px solid "+C.brd}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid "+C.brd,position:"sticky",top:0,background:C.bg,zIndex:2}}>
          <div style={{fontSize:15,fontWeight:700}}>Mon profil</div>
          <button onClick={()=>setDrawerOpen(false)} style={{width:28,height:28,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:"16px",flex:1,display:"flex",flexDirection:"column",gap:12}}>
          {/* Profile card */}
          <div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:C.acS,border:"2px solid "+C.ac+"40",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:C.ac}}>
                {athleteProfile?([athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name||"?").split(" ").filter(n=>n).map(n=>n[0]).join("").toUpperCase().slice(0,2):"?"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{athleteProfile?([athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name||"Athlète"):"Athlète"}</div>
                {athleteProfile?.gender&&<div style={{fontSize:11,color:C.tx3}}>{athleteProfile.gender==="male"?"Homme":athleteProfile.gender==="female"?"Femme":""}</div>}
              </div>
            </div>
            {athleteProfile&&(<>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:C.brd,borderTop:"1px solid "+C.brd}}>
                {[{l:"Âge",v:athleteProfile.age?athleteProfile.age+" ans":null},{l:"Taille",v:athleteProfile.height_cm?athleteProfile.height_cm+" cm":null},{l:"MB",v:athleteProfile.base_metabolism?Math.round(athleteProfile.base_metabolism).toLocaleString("fr-FR")+" kcal":null}].map(s=>(<div key={s.l} style={{background:C.s2,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:10,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{s.l}</div><div style={{fontSize:13,fontWeight:700,color:s.v?C.tx:C.tx3}}>{s.v||"—"}</div></div>))}
              </div>
              {(athleteProfile.weight_kg||athleteProfile.body_fat_pct)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.brd,borderTop:"1px solid "+C.brd}}>
                {[{l:"Poids réf.",v:athleteProfile.weight_kg?athleteProfile.weight_kg+" kg":null},{l:"Masse grasse",v:athleteProfile.body_fat_pct?athleteProfile.body_fat_pct+" %":null}].map(s=>(<div key={s.l} style={{background:C.s2,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:10,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{s.l}</div><div style={{fontSize:13,fontWeight:700,color:s.v?C.tx:C.tx3}}>{s.v||"—"}</div></div>))}
              </div>}
            </>)}
            {!athleteProfile&&<div style={{padding:"12px 16px",fontSize:12,color:C.tx3,textAlign:"center"}}>Profil non renseigné</div>}
          </div>
          {/* Données sportives */}
          <div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden"}}>
            <button onClick={()=>setDrawerSportOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Données sportives</div>
              <span style={{fontSize:12,color:C.tx3,display:"inline-block",transition:"transform 0.2s",transform:drawerSportOpen?"rotate(180deg)":"none"}}>∨</span>
            </button>
            {drawerSportOpen&&<div style={{borderTop:"1px solid "+C.brd,padding:"0 0 8px"}}><PerformanceProfile athleteId={athleteId} viewOnly={viewOnly} C={C}/></div>}
          </div>
          {/* Poids de corps */}
          <button onClick={()=>setDrawerZoom("weight")} style={{width:"100%",background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Poids de corps</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:13,fontWeight:800,color:C.ac}}>{(()=>{const e=Object.entries(weightLog).sort((a,b)=>b[0]>a[0]?1:-1)[0];return weightLog[todayKey()]||e?.[1]||bodyWeight.current||"—";})()}<span style={{fontSize:10,fontWeight:400,color:C.tx3}}> kg</span></span><span style={{fontSize:11,color:C.tx3}}>→</span></div>
            </div>
            {Object.keys(weightLog).length>0?<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>:<div style={{fontSize:11,color:C.tx3,textAlign:"center",padding:"8px 0"}}>Aucune mesure</div>}
          </button>
          {/* Forme du jour */}
          <button onClick={()=>setDrawerZoom("wellness")} style={{width:"100%",background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+(wellness?wReco.c+30:C.brd),textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:wellness?10:0}}>
              <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Forme du jour</div>
              {wellness&&<div style={{display:"flex",alignItems:"center",gap:6}}><div style={{position:"relative",width:36,height:36}}><svg viewBox="0 0 32 32" style={{width:36,height:36,transform:"rotate(-90deg)"}}><circle cx="16" cy="16" r="12" fill="none" stroke={C.s2} strokeWidth="3"/><circle cx="16" cy="16" r="12" fill="none" stroke={wReco.c} strokeWidth="3" strokeDasharray={String(2*Math.PI*12)} strokeDashoffset={String(2*Math.PI*12*(1-wScore/100))} strokeLinecap="round"/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:wReco.c}}>{wScore}</div></div><span style={{fontSize:11,color:C.tx3}}>→</span></div>}
            </div>
            {wellness?<><div style={{fontSize:12,fontWeight:600,color:wReco.c}}>{wReco.label}</div>
            {(wellness.coucher||wellness.reveil||wellness.sleepDur)&&<div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {wellness.coucher&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.s2}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.tx2,fontWeight:600}}>{String(wellness.coucher.h).padStart(2,"0")}:{String(wellness.coucher.m).padStart(2,"0")}</span></div>}
              {wellness.reveil&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.s2}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.tx2,fontWeight:600}}>{String(wellness.reveil.h).padStart(2,"0")}:{String(wellness.reveil.m).padStart(2,"0")}</span></div>}
              {wellness.sleepDur&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,background:C.b+"18"}}><span style={{fontSize:10}}></span><span style={{fontSize:10,color:C.b,fontWeight:700}}>{wellness.sleepDur}h</span></div>}
            </div>}</>:<div style={{fontSize:11,color:C.tx3}}>Aucun bilan aujourd'hui</div>}
          </button>
          {/* Score de santé */}
          <button onClick={()=>setDrawerZoom("health")} style={{width:"100%",background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Score de santé</div>
              <span style={{fontSize:11,color:C.tx3}}>→</span>
            </div>
            {(()=>{const wData=getWellnessChartData(wellnessHistory,wellnessPeriod);const hasSomeData=wData.some(d=>d.score!==null);return hasSomeData?<ResponsiveContainer width="100%" height={72}><ComposedChart data={wData} margin={{top:2,right:2,bottom:0,left:-28}}><YAxis yAxisId="score" domain={[0,100]} hide/><YAxis yAxisId="sleep" orientation="right" domain={[0,12]} hide/><Bar yAxisId="sleep" dataKey="sleep" fill={C.b} opacity={0.3} radius={[2,2,0,0]} maxBarSize={10}/><Line yAxisId="score" dataKey="score" stroke={C.g} strokeWidth={1.5} dot={false} connectNulls={false}/></ComposedChart></ResponsiveContainer>:<div style={{fontSize:11,color:C.tx3,textAlign:"center",padding:"8px 0"}}>Aucune donnée</div>;})()}
          </button>
          {/* 1RM Record */}
          <div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden"}}>
            <button onClick={()=>setDrawerPrOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>1RM Record</div>
              <span style={{fontSize:12,color:C.tx3,display:"inline-block",transition:"transform 0.2s",transform:drawerPrOpen?"rotate(180deg)":"none"}}>∨</span>
            </button>
            {drawerPrOpen&&(<div style={{borderTop:"1px solid "+C.brd,padding:"12px 16px"}}>
              {(()=>{
                const seen=new Set();
                const progExNames=Object.values(exos||{}).flat().map(ex=>ex.name||'').filter(n=>{if(!n||seen.has(n.toLowerCase()))return false;seen.add(n.toLowerCase());return true;}).sort();
                const filtered=prSearch?progExNames.filter(n=>n.toLowerCase().includes(prSearch.toLowerCase())):progExNames;
                const getActual1rm=(exName,w)=>{const exIds=Object.values(exos||{}).flat().filter(ex=>(ex.name||'').toLowerCase()===exName.toLowerCase()).map(ex=>ex.id);let best=null;exIds.forEach(id=>{(sets[id+"_"+w]||[]).filter(r=>r.done&&r.kg>0).forEach(r=>{const est=e1rm(r.kg,r.reps||1);if(!best||est>best)best=est;});});return best;};
                const actual1rmByWeek=prExName?Array.from({length:tw},(_,i)=>({w:i+1,week:"S"+(i+1),val:getActual1rm(prExName,i+1)})):[];
                const bestActual=actual1rmByWeek.reduce((mx,d)=>d.val&&d.val>mx.val?d:mx,{val:0,w:null});
                const showDropdown=prSearch&&filtered.length>0&&!progExNames.find(n=>n.toLowerCase()===prSearch.toLowerCase());
                return(<>
                  <div style={{position:"relative",marginBottom:10}}>
                    <input value={prSearch} onChange={e=>{setPrSearch(e.target.value);setPrExName(null);}} placeholder={progExNames.length?"Rechercher un exercice...":"Aucun exercice"} style={{width:"100%",padding:"7px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                    {showDropdown&&(<div style={{position:"absolute",top:"100%",left:0,right:0,background:C.s1,border:"1px solid "+C.brdL,borderRadius:4,zIndex:50,maxHeight:140,overflowY:"auto",marginTop:4}}>
                      {filtered.slice(0,6).map(n=>(<div key={n} onClick={()=>{setPrExName(n);setPrSearch(n);}} style={{padding:"8px 12px",fontSize:12,cursor:"pointer",color:C.tx,borderBottom:"1px solid "+C.brd}}>{n}</div>))}
                    </div>)}
                  </div>
                  {prExName?(
                    <>
                      <div style={{display:"flex",gap:5,marginBottom:10}}>
                        {[{k:"est",l:"1RM Estimé"},{k:"evo",l:"Évolution"}].map(t=>(<button key={t.k} onClick={()=>setPrTab(t.k)} style={{padding:"4px 12px",borderRadius:7,border:"none",background:prTab===t.k?C.acS:C.s2,color:prTab===t.k?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>))}
                      </div>
                      {prTab==="est"&&<div style={{textAlign:"center"}}><div style={{fontSize:44,fontWeight:900,color:C.ac,letterSpacing:"-2px",lineHeight:1}}>{bestActual.val||"--"}</div><div style={{fontSize:10,color:C.tx3,marginTop:3}}>kg estimé 1RM</div>{bestActual.w&&<div style={{marginTop:6,fontSize:10,color:C.tx3,padding:"2px 8px",borderRadius:5,background:C.s2,display:"inline-block"}}>Meilleure perf. S{bestActual.w}</div>}</div>}
                      {prTab==="evo"&&(actual1rmByWeek.some(d=>d.val)?<MiniChart data={actual1rmByWeek} color={C.ac} h={70}/>:<div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"16px 0"}}>Aucune série effectuée</div>)}
                    </>
                  ):(
                    <div style={{fontSize:11,color:C.tx3,textAlign:"center",padding:"10px 0"}}>{progExNames.length?"Recherche et sélectionne un exercice":"Aucun exercice dans la programmation"}</div>
                  )}
                </>);
              })()}
            </div>)}
          </div>
          {/* Blessures */}
          {activeInjuries.length>0&&(<div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.r+"30",overflow:"hidden"}}>
            <button onClick={()=>setDrawerInjOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:6,height:6,borderRadius:"50%",background:C.r}}/><div style={{fontSize:12,fontWeight:600,color:C.r,textTransform:"uppercase",letterSpacing:"0.5px"}}>Blessures actives ({activeInjuries.length})</div></div>
              <span style={{fontSize:12,color:C.tx3,display:"inline-block",transition:"transform 0.2s",transform:drawerInjOpen?"rotate(180deg)":"none"}}>∨</span>
            </button>
            {drawerInjOpen&&(<div style={{borderTop:"1px solid "+C.r+"30",padding:"8px 16px"}}>
              {activeInjuries.map(inj=>{const sc=stC(inj.status);const zn=ALL_BZ.filter(z=>inj.zones.includes(z.id)).map(z=>z.label).join(", ")||"Zone non précisée";return(<div key={inj.id} style={{padding:"8px 10px",borderRadius:4,background:C.s2,marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><div style={{fontSize:12,fontWeight:600,color:C.tx}}>{zn}</div><div style={{fontSize:10,color:C.tx3}}>Intensité {inj.intensity}/10</div></div><span style={{fontSize:10,fontWeight:700,color:sc,padding:"2px 8px",borderRadius:5,background:sc+"15"}}>{inj.status}</span></div>);})}
            </div>)}
          </div>)}
          {/* Retour du coach */}
          {(()=>{
            const weeks=Object.keys(coachFeedbacks).map(Number).filter(Boolean).sort((a,b)=>b-a);
            const latestWeek=weeks[0];
            const latestFb=latestWeek?coachFeedbacks[latestWeek]:null;
            if(!latestFb?.note)return null;
            return(<div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.coach+"40",overflow:"hidden"}}>
              <button onClick={()=>{setTab("coachfeedback");setDrawerOpen(false);}} style={{width:"100%",padding:"12px 14px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13}}></span>
                    <span style={{fontSize:11,fontWeight:700,color:C.coach}}>Retour du coach</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:9,color:C.tx3}}>S{latestWeek}</span>
                    <span style={{fontSize:11,color:C.coach}}>›</span>
                  </div>
                </div>
                <div style={{fontSize:11,color:C.tx2,lineHeight:1.55,fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>"{latestFb.note}"</div>
              </button>
            </div>);
          })()}
          {/* Objectifs */}
          <button onClick={()=>{setDrawerZoom("goals");}} style={{width:"100%",background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,textAlign:"left",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Objectifs</div>
            <span style={{fontSize:11,color:C.tx3}}>→</span>
          </button>
          {/* Déconnexion */}
          <div style={{marginTop:"auto",paddingTop:8}}>
            <button onClick={()=>{setShowLogoutConfirm(true);}} style={{width:"100%",padding:"12px 0",borderRadius:6,border:"1px solid "+C.r+"30",background:C.rS,color:C.r,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <span>⏻</span><span>Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </>)}
    {showLogoutConfirm&&(<div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setShowLogoutConfirm(false)}>
      <div style={{background:C.s1,borderRadius:6,padding:24,maxWidth:320,width:"100%",border:"1px solid "+C.brd}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:700,color:C.tx,marginBottom:8}}>Se déconnecter ?</div>
        <div style={{fontSize:13,color:C.tx3,marginBottom:20}}>Êtes-vous sûr de vouloir vous déconnecter ?</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setShowLogoutConfirm(false)} style={{flex:1,padding:"12px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
          <button onClick={async()=>{await supabase.auth.signOut();window.location.href="/login";}} style={{flex:1,padding:"12px 0",borderRadius:4,border:"none",background:C.r,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Déconnecter</button>
        </div>
      </div>
    </div>)}
    {showWellness&&(<div style={{position:"fixed",inset:0,zIndex:300,background:C.bg,overflowY:"auto"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid "+C.brd}}><div style={{fontSize:14,fontWeight:700}}>Wellness du jour</div><button onClick={()=>setShowWellness(false)} style={{background:"none",border:"none",color:C.tx3,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>x</button></div><WellnessFlow existing={wellness} onSave={saveWellness} sleepTarget={goals.sleepTarget} onAddInjury={addInjury} weightLog={weightLog}/></div>)}
    {showAppFeedback&&(()=>{
      let fbRating=null,fbText="",fbSending=false;
      const AppFbForm=()=>{
        const[rating,setRating]=React.useState(null);
        const[text,setText]=React.useState("");
        const[sending,setSending]=React.useState(false);
        const[done,setDone]=React.useState(false);
        const submit=async()=>{
          if(!rating||sending)return;
          setSending(true);
          const entry={id:"fb_"+Date.now(),date:new Date().toISOString(),rating,text:text.trim()};
          const newList=[...appFeedbacks,entry];
          await supabase.from('app_data').upsert({athlete_id:athleteId,key:'app:user_feedback',value:{entries:newList},updated_at:new Date().toISOString()},{onConflict:'athlete_id,key'});
          setAppFeedbacks(newList);
          setSending(false);setDone(true);
          setTimeout(()=>setShowAppFeedback(false),1500);
        };
        if(done)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,padding:32}}><div style={{fontSize:40}}></div><div style={{fontSize:18,fontWeight:800,color:C.g}}>Merci !</div><div style={{fontSize:13,color:C.tx2}}>Ton avis nous aide à améliorer l'app.</div></div>);
        return(<div style={{padding:"24px 20px",display:"flex",flexDirection:"column",gap:20}}>
          <div><div style={{fontSize:22,fontWeight:900,letterSpacing:"-0.5px",marginBottom:6}}>Donne ton avis</div><div style={{fontSize:13,color:C.tx2}}>Ton retour nous aide à améliorer l'expérience. Ça prend 30 secondes.</div></div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Note globale</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRating(n)} style={{fontSize:32,background:"none",border:"none",cursor:"pointer",opacity:rating&&n<=rating?1:0.3,transform:rating===n?"scale(1.2)":"scale(1)",transition:"all 0.15s",padding:"4px 6px"}}></button>)}
            </div>
            <div style={{textAlign:"center",fontSize:12,color:C.tx3,marginTop:6}}>{rating===1?"À améliorer":rating===2?"Moyen":rating===3?"Correct":rating===4?"Bien":"Excellent !"}</div>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Commentaire (optionnel)</div>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Ce que tu aimes, ce qui manque, un bug rencontré..." rows={4} style={{width:"100%",padding:"12px 14px",borderRadius:6,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.6}}/>
          </div>
          <button onClick={submit} disabled={!rating||sending} style={{padding:"14px 0",borderRadius:6,border:"none",background:rating?C.ac:"#333",color:rating?"#fff":C.tx3,fontSize:14,fontWeight:700,cursor:rating?"pointer":"default",fontFamily:"inherit",opacity:sending?0.7:1}}>
            {sending?"Envoi…":"Envoyer mon avis"}
          </button>
        </div>);
      };
      return(<div style={{position:"fixed",inset:0,zIndex:300,background:C.bg,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid "+C.brd,flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:700}}>Avis sur l'app</div>
          <button onClick={()=>setShowAppFeedback(false)} style={{background:"none",border:"none",color:C.tx3,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>×</button>
        </div>
        <AppFbForm/>
      </div>);
    })()}
    {milestoneNotif&&(<div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",zIndex:250,background:C.s1,border:"1px solid "+C.g+"50",borderRadius:6,padding:"12px 20px",display:"flex",alignItems:"center",gap:10}}><div><div style={{fontSize:13,fontWeight:700,color:C.g}}>Nouveau palier valide !</div><div style={{fontSize:11,color:C.tx2}}>Poids mis a jour : {milestoneNotif} kg</div></div></div>)}
    {weekJustCompleted&&(<div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><div style={{fontSize:26,fontWeight:800,color:C.g}}>Semaine {weekJustCompleted} validee !</div><div style={{fontSize:14,color:C.tx2}}>{weekJustCompleted<tw?"En route pour S"+(weekJustCompleted+1):"Bloc termine !"}</div><div style={{display:"flex",gap:6,marginTop:8}}>{[...Array(tw)].map((_,i)=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:i<weekJustCompleted?C.g:C.s2}}/>)}</div></div>)}
    {showBilan&&(<div style={{position:"fixed",inset:0,zIndex:200,background:C.bg,overflowY:"auto"}}><div style={{padding:"40px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:20}}><div style={{fontSize:28,fontWeight:800,textAlign:"center"}}>Bloc termine !</div><div style={{fontSize:14,color:C.tx2}}>{totalDone} seances realisees</div><div style={{display:"flex",gap:12,width:"100%"}}>{getBig3(exos).map(({name,label,c})=>{const pr=prs[name];return(<div key={label} style={{flex:1,background:C.s1,borderRadius:6,padding:"14px 10px",textAlign:"center",border:"1px solid "+c+"30"}}><div style={{fontSize:11,color:C.tx3,marginBottom:4}}>{label}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{pr?.est||"--"}</div><div style={{fontSize:9,color:C.tx3}}>kg est.</div></div>);})}</div><div style={{width:"100%",background:C.s1,borderRadius:6,padding:16,border:"1px solid "+C.brd}}><CombinedStatsChart data={combinedData}/></div><button onClick={()=>{setShowBilan(false);setShowNewBlock(true);}} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:C.coach,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Nouveau bloc</button><button onClick={()=>setShowBilan(false)} style={{background:"none",border:"none",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button></div></div>)}
    {showNewBlock&&<NewBlockModal onStart={archiveAndNewBlock} onClose={()=>setShowNewBlock(false)} onResume={()=>setShowNewBlock(false)} hasCurrentData={sessions.length>0&&Object.values(exos).flat().length>0} blockHistory={blockHistory} onDelete={idx=>setBlockHistory(blockHistory.filter((_,i)=>i!==idx))} currentAthleteId={athleteId}/>}
    {showBlockHistory&&<BlockHistoryViewer blockHistory={blockHistory} onClose={()=>setShowBlockHistory(false)} onDelete={idx=>setBlockHistory(blockHistory.filter((_,i)=>i!==idx))}/>}
    {mode==="coach"&&coachTab==="prog"&&sessions.length>0&&<AIChatBar exos={exos} sessions={sessions} chatHistory={chatHistory} setChatHistory={setChatHistory} onApply={applyAIEdit} onOpenChange={setAiChatOpen} C={C}/>}
    {mode==="athlete"&&(timerActive||timerFinished)&&(<div style={{position:"fixed",bottom:64,left:"50%",transform:"translateX(-50%)",zIndex:150,background:timerFinished?"rgba(34,201,147,0.15)":C.s1,border:"1px solid "+(timerFinished?C.g:timerActive&&timerLeft<=10?C.r:C.ac)+"70",borderRadius:50,padding:"9px 18px",display:"flex",alignItems:"center",gap:12}}>
      {timerFinished?<span style={{fontSize:16}}></span>:<div style={{width:24,height:24,position:"relative"}}><svg viewBox="0 0 24 24" style={{width:24,height:24,transform:"rotate(-90deg)"}}><circle cx="12" cy="12" r="9" fill="none" stroke={C.s2} strokeWidth="2.5"/><circle cx="12" cy="12" r="9" fill="none" stroke={timerLeft<=10?C.r:C.ac} strokeWidth="2.5" strokeDasharray={String(2*Math.PI*9)} strokeDashoffset={String(2*Math.PI*9*(1-Math.min((timerDur-timerLeft)/timerDur,1)))} strokeLinecap="round"/></svg></div>}
      <span style={{fontSize:13,fontWeight:700,color:timerFinished?C.g:timerLeft<=10?C.r:C.tx,fontFamily:"monospace",minWidth:42}}>{timerFinished?"Repos OK !":Math.floor(timerLeft/60)+":"+String(timerLeft%60).padStart(2,"0")}</span>
      <button onClick={timerStop} style={{width:22,height:22,borderRadius:"50%",border:"none",background:(timerFinished?C.g:C.r)+"25",color:timerFinished?C.g:C.r,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
    </div>)}

    <div style={{position:"sticky",top:0,zIndex:20,background:C.bg,borderBottom:"1px solid "+C.brd}}>
      <div style={{padding:"8px "+(mode==="coach"?"16px":"16px")+" 8px",display:"flex",alignItems:"center",justifyContent:"space-between",maxWidth:"none",margin:"0"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.3px"}}>Agon</div>
          {saveStatus&&<div style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:6,background:saveStatus==="saved"?C.gS:C.rS,color:saveStatus==="saved"?C.g:C.r}}>{saveStatus==="saved"?"OK":"Err"}</div>}
          {activeInjuries.length>0&&<div style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:6,background:C.rS,color:C.r}}>{activeInjuries.length} bless.</div>}
          {viewOnly&&mode==="athlete"&&<div style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:6,background:C.coachS,color:C.coach,border:"1px solid "+C.coach+"40"}}>Observation</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {canToggleMode&&<div style={{display:"flex",background:C.s1,borderRadius:4,padding:2,border:"1px solid "+C.brdL}}>{[{k:"athlete",l:"Athlete"},{k:"coach",l:"Coach"}].map(({k,l})=>(<button key={k} onClick={()=>switchMode(k)} style={{padding:"5px 10px",borderRadius:6,border:"none",background:mode===k?(k==="coach"?C.coach:C.ac):"transparent",color:mode===k?"#fff":C.tx3,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>{l}</button>))}</div>}
          {mode==="athlete"&&<button onClick={()=>setDrawerOpen(true)} title="Mon profil" style={{width:30,height:30,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}></button>}
          {userName&&!myProfile?.is_admin&&<div style={{fontSize:11,color:C.tx3,fontWeight:500,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userName}</div>}
        </div>
      </div>
      {mode!=="coach"&&<div style={{display:"flex",maxWidth:"none",margin:"unset",paddingLeft:0}}>{activeTabs.map(t=><button key={t.k} onClick={()=>setActiveTab(t.k)} style={tabS(t.k)}>{t.l}</button>)}</div>}
    </div>

    {mode==="coach"&&(<>
      <style>{`
        .coach-layout { display: flex; flex: 1; min-height: 0; }
        .coach-sidebar {
          width: clamp(180px, 16vw, 240px);
          position: sticky; top: 48px;
          height: calc(100vh - 48px);
          overflow-y: auto; overflow-x: hidden;
          flex-shrink: 0; align-self: flex-start;
          display: flex; flex-direction: column;
        }
        .coach-sidebar-athlete { display: flex; flex-direction: column; }
        .coach-sidebar-label { display: inline; }
        .coach-sidebar-footer { display: block; }
        .coach-sidebar-nav button {
          display: flex; align-items: center; gap: 10px;
          width: 100%; border: none; cursor: pointer;
          font-family: inherit; text-align: left;
          padding: 10px 14px;
          transition: background 0.12s, color 0.12s;
        }
        .coach-content {
          flex: 1; min-width: 0;
          padding: clamp(16px, 2.5vw, 32px) clamp(16px, 3vw, 44px);
        }
        @media (max-width: 1100px) {
          .coach-sidebar { width: clamp(56px, 14vw, 180px); }
        }
        @media (max-width: 900px) {
          .coach-sidebar { width: 56px; }
          .coach-sidebar-label { display: none; }
          .coach-sidebar-athlete { display: none; }
          .coach-sidebar-footer { display: none; }
          .coach-sidebar-nav button { justify-content: center; padding: 12px 0; gap: 0; }
          .coach-content { padding: 16px 14px; }
        }
        @media (max-width: 640px) {
          .coach-layout { flex-direction: column; }
          .coach-sidebar { width: 100%; height: auto; position: static; flex-direction: row; overflow-x: auto; top: 0; }
          .coach-sidebar-nav { display: flex; flex-direction: row; padding: 0; flex: 1; }
          .coach-sidebar-nav button { flex: 1; flex-direction: column; padding: 8px 4px; gap: 3px; justify-content: center; font-size: 9px; }
          .coach-sidebar-nav button span:first-child { font-size: 18px; }
          .coach-sidebar-label { display: inline; font-size: 9px; }
          .coach-content { padding: 12px; }
        }
      `}</style>
      <div className="coach-layout">
      {/* ── Sidebar navigation ── */}
      <div className="coach-sidebar" style={{borderRight:"1px solid "+C.brd,background:C.s1}}>
        {/* Athlete info */}
        {athleteProfile&&(<div className="coach-sidebar-athlete" style={{padding:"14px 12px",borderBottom:"1px solid "+C.brd}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:blockConfig?.blockName?10:0}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:C.coach+"25",border:"2px solid "+C.coach+"40",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:C.coach,flexShrink:0}}>
              {([athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name||"?").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)}
            </div>
            <div className="coach-sidebar-label" style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name}</div>
              <div style={{fontSize:10,color:C.coach,fontWeight:600}}>Mode coach</div>
            </div>
          </div>
          {blockConfig?.blockName&&(<div style={{padding:"7px 10px",borderRadius:4,background:C.s2,border:"1px solid "+C.brd}}>
            <div className="coach-sidebar-label" style={{fontSize:11,fontWeight:700,color:C.tx,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{blockConfig.blockName}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:10,color:C.b,fontWeight:600}}>S{currentWeek}/{tw}</span>
              {dw>0&&<span className="coach-sidebar-label" style={{fontSize:9,color:C.b+"90"}}>DL S{dw}</span>}
            </div>
          </div>)}
        </div>)}
        {/* Nav tabs */}
        <nav className="coach-sidebar-nav" style={{flex:1,paddingTop:6}}>
          {coachTabs.map(t=>{
            const ICONS={prog:"clipboard",banque:"musculation",stats:"statistiques",data:"athlete",test:"test",retours:"commentaire"};
            const active=coachTab===t.k;
            return(<button key={t.k} onClick={()=>setCoachTab(t.k)} style={{borderLeft:"3px solid "+(active?C.coach:"transparent"),background:active?C.coach+"14":"transparent",color:active?C.coach:C.tx2,fontSize:12,fontWeight:active?700:500}}>
              <span style={{fontSize:15,flexShrink:0,opacity:active?1:0.6}}>{ICONS[t.k]}</span>
              <span className="coach-sidebar-label">{t.l}</span>
            </button>);
          })}
        </nav>
        {/* Footer infos */}
        {saveStatus&&(<div className="coach-sidebar-footer" style={{padding:"10px 14px",borderTop:"1px solid "+C.brd}}>
          <div style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:6,display:"inline-block",background:saveStatus==="saved"?C.gS:C.rS,color:saveStatus==="saved"?C.g:C.r}}>
            {saveStatus==="saved"?"✓ Sauvegardé":"✕ Erreur"}
          </div>
        </div>)}
      </div>
      {/* ── Content area ── */}
      <div className="coach-content" style={{paddingBottom:aiChatOpen?"calc(60vh + 36px)":"60px"}}>
      {coachTab==="prog"&&(<>
        {/* Paramètres de bloc au-dessus des sous-onglets */}
        <div style={{background:C.s1,borderRadius:6,padding:"12px 16px",border:"1px solid "+C.b+"30",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:C.b,textTransform:"uppercase",letterSpacing:"0.5px"}}>Bloc d'entraînement</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowNewBlock(true)} style={{padding:"4px 10px",borderRadius:7,border:"1px solid "+C.coach+"40",background:C.coachS,color:C.coach,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Nouveau bloc</button>
              <button onClick={()=>setShowBlockHistory(true)} style={{padding:"4px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",position:"relative"}}>Historique{blockHistory.length>0&&<span style={{position:"absolute",top:-3,right:-3,background:C.ac,color:"#fff",fontSize:8,fontWeight:800,width:13,height:13,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>{blockHistory.length}</span>}</button>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={blockConfig?.blockName||""} onChange={e=>setBlockConfig(c=>({...c,blockName:e.target.value}))} placeholder="Nom du bloc..." style={{flex:1,padding:"7px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontWeight:600,fontFamily:"inherit"}}/>
          </div>
          {/* Dates + durée */}
          <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:C.tx3,flexShrink:0}}>Début</span>
              <input type="date" value={blockConfig?.startDate||""} onChange={e=>setBlockConfig(c=>({...c,startDate:e.target.value||null}))} style={{padding:"6px 8px",borderRadius:4,border:"1px solid "+(blockConfig?.startDate?C.brdL:C.o+"60"),background:C.s2,color:blockConfig?.startDate?C.tx:C.o,fontSize:12,fontFamily:"inherit"}}/>
            </div>
            {blockConfig?.startDate&&(()=>{const end=new Date(new Date(blockConfig.startDate).getTime()+tw*7*86400000);const fmtDate=d=>d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});return(<div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:4,background:C.s2}}><span style={{fontSize:10,color:C.tx3}}>Fin</span><span style={{fontSize:11,fontWeight:700,color:C.b}}>{fmtDate(end)}</span></div>);})()}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:4,background:C.s2,border:"1px solid "+C.brd}}>
              <span style={{fontSize:10,color:C.tx3}}>Durée</span>
              <button onClick={()=>setBlockConfig(c=>({...c,totalWeeks:Math.max(3,c.totalWeeks-1)}))} style={{width:22,height:22,borderRadius:5,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:14,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>-</button>
              <span style={{fontSize:13,fontWeight:800,color:C.b,minWidth:36,textAlign:"center"}}>{tw}sem</span>
              <button onClick={()=>setBlockConfig(c=>({...c,totalWeeks:Math.min(16,c.totalWeeks+1)}))} style={{width:22,height:22,borderRadius:5,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:14,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>+</button>
            </div>
            {blockConfig?.startDate&&(()=>{const days=Math.floor((Date.now()-new Date(blockConfig.startDate).getTime())/86400000);const wk=Math.min(Math.max(1,Math.floor(days/7)+1),tw);return<span style={{fontSize:10,color:C.g,padding:"5px 8px",borderRadius:7,background:C.gS,fontWeight:600}}>S{wk} · J{days+1}</span>;})()}
          </div>
          {/* Deload : sélection par semaine */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:C.tx3,flexShrink:0}}>Deload :</span>
            {weeksArr.map(w=>{const isDL=dw===w;return(<button key={w} onClick={()=>setBlockConfig(c=>({...c,deloadWeek:c.deloadWeek===w?0:w}))} style={{padding:"4px 9px",borderRadius:6,border:"1px solid "+(isDL?C.b+"60":C.brdL),background:isDL?C.bS:"transparent",color:isDL?C.b:C.tx3,fontSize:10,fontWeight:isDL?700:400,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>S{w}</button>);})}
            {dw>0&&<button onClick={()=>setBlockConfig(c=>({...c,deloadWeek:0}))} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+C.r+"40",background:"transparent",color:C.r,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✕</button>}
          </div>
        </div>
        {/* Planning 4 semaines */}
        <CoachFourWeekCalendar sessions={sessions} completedSessions={completedSessions} currentWeek={currentWeek} C={C} wellnessHistory={wellnessHistory} sessionLogs={sessionLogs} energySessions={energySessions} energyWeekPlan={energyWeekPlan} energyDayPlan={energyDayPlan} setEnergyWeekPlan={setEnergyWeekPlan} setEnergyDayPlan={setEnergyDayPlan} testSessions={testSessions} visibilitySettings={visibilitySettings} onUpdateSessionDay={updateSessionDay} onUpdateSessionWeekDay={updateSessionWeekDay} onUpdateVisibility={setVisibilitySettings} athleteId={athleteId} blockConfig={blockConfig} weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule} exos={exos} allMethods={allMethods}/>
        {/* Sous-onglets prog */}
        <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.brd,marginBottom:16}}>
          {[{k:"planification",l:"Planification"},{k:"muscu",l:"Musculation"},{k:"energie",l:"Énergétique"},{k:"specifique",l:"Spécifique"}].map(t=>(
            <button key={t.k} onClick={()=>{setProgSubTab(t.k);setEnergyEditorKey(null);}} style={{padding:"9px 18px",border:"none",borderBottom:"2px solid "+(progSubTab===t.k?C.coach:"transparent"),background:"transparent",color:progSubTab===t.k?C.coach:C.tx3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.3px",flexShrink:0}}>{t.l}</button>
          ))}
        </div>
        {progSubTab==="planification"&&(<PlanningEditor athleteId={athleteId} coachId={user?.id} sessions={sessions}/>)}
        {progSubTab==="muscu"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:700}}>Musculation{blockConfig?.blockName&&<span style={{fontSize:11,color:C.b,fontWeight:600,marginLeft:8}}>{blockConfig.blockName} · {tw} sem.</span>}</div>
            <div style={{display:"flex",gap:6}}>
            </div>
          </div>
          {sessions.length===0?(<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:40,marginBottom:12}}></div><div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:4}}>Aucun bloc actif</div><div style={{fontSize:12,color:C.tx3,marginBottom:16}}>Crée un nouveau bloc pour commencer à planifier.</div><button onClick={()=>setShowNewBlock(true)} style={{padding:"12px 24px",borderRadius:6,border:"none",background:C.coach,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Créer un bloc</button></div>):<CoachProgramEditor exos={exos} setExos={setExos} sessions={sessions} setSessions={setSessions} athleteNotes={athleteNotes} allMethods={allMethods} customMethods={customMethods} setCustomMethods={setCustomMethods} blockConfig={blockConfig} exMeta={exMeta} setExMeta={setExMeta} currentWeek={currentWeek} sets={sets} completedSessions={completedSessions} weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule}/>}
          {sessions.length>0&&<div style={{marginTop:16,paddingTop:14,borderTop:"1px solid "+C.brd}}>
            <button onClick={()=>setShowExoParams(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:4,border:"1px solid "+C.brdL,background:showExoParams?C.acS:"transparent",color:showExoParams?C.ac:C.tx2,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:showExoParams?12:0}}>
              Paramètres exercices{showExoParams?" ∧":" ∨"}
            </button>
            {showExoParams&&<CoachExoParams exMeta={exMeta} setExMeta={setExMeta} exos={exos} setExos={setExos} blockConfig={blockConfig}/>}
          </div>}
        </>)}
        {progSubTab==="energie"&&(<CoachEnergyProgram athleteId={athleteId} energyEditorKey={energyEditorKey} setEnergyEditorKey={setEnergyEditorKey} energySessions={energySessions} setEnergySessions={setEnergySessions} energySessionsLoaded={energySessionsLoaded} setEnergySessionsLoaded={setEnergySessionsLoaded} C={C} blockConfig={blockConfig} currentWeek={currentWeek} weekPlan={energyWeekPlan} setWeekPlan={setEnergyWeekPlan} dayPlan={energyDayPlan} setDayPlan={setEnergyDayPlan}/>)}
        {progSubTab==="specifique"&&(<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:40,marginBottom:12}}></div><div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:4}}>Séances Spécifiques</div><div style={{fontSize:12,color:C.tx3}}>Planification des séances spécifiques à venir prochainement.</div></div>)}
      </>)}
      {coachTab==="banque"&&(<>
        {/* Sous-onglets banque */}
        <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.brd,marginBottom:16}}>
          {[{k:"muscu",l:"Musculation"},{k:"energie",l:"Énergétique"}].map(t=>(
            <button key={t.k} onClick={()=>setBanqueSubTab(t.k)} style={{padding:"9px 18px",border:"none",borderBottom:"2px solid "+(banqueSubTab===t.k?C.coach:"transparent"),background:"transparent",color:banqueSubTab===t.k?C.coach:C.tx3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.3px"}}>{t.l}</button>
          ))}
        </div>
        {banqueSubTab==="muscu"&&<><ExerciseBank coachId={athleteId} onAddToExos={handleBankAdd}/>{bankAddMsg&&<div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:250,background:C.g,color:"#fff",borderRadius:6,padding:"10px 20px",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>{bankAddMsg}</div>}</>}
        {banqueSubTab==="energie"&&<EnergyExerciseBank coachId={athleteId} C={C}/>}
      </>)}
      {bankAddEx&&sessions.length>1&&(<div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setBankAddEx(null)}><div style={{width:"100%",maxWidth:640,background:C.s1,borderRadius:"6px 6px 0 0",padding:24}} onClick={e=>e.stopPropagation()}><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Ajouter à quelle séance ?</div><div style={{fontSize:12,color:C.tx3,marginBottom:16}}>{bankAddEx.name}</div>{sessions.map(s=>(<button key={s.id} onClick={()=>{const newEx={id:"g_"+Date.now(),name:bankAddEx.name,bloc:bankAddEx.bloc||"ESTH",target:bankAddEx.target||"Pecs",exType:bankAddEx.ex_type||"muscu",exercise_id:bankAddEx.id,weeks:{1:{kg:0,sets:3,repsRange:"10",rir:2}}};setExos(prev=>({...prev,[s.id]:[...(prev[s.id]||[]),newEx]}));setBankAddEx(null);setCoachTab("prog");}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,marginBottom:8,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}><div style={{width:32,height:32,borderRadius:4,background:C.acS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:C.ac}}>{s.short||s.name.charAt(0)}</div><div style={{fontSize:13,fontWeight:600,color:C.tx}}>{s.name}</div></button>))}<button onClick={()=>setBankAddEx(null)} style={{width:"100%",padding:"10px 0",borderRadius:4,border:"none",background:"transparent",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>Annuler</button></div></div>)}
      {coachTab==="stats"&&(<>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Suivi athlete</div>
        <div style={{fontSize:12,color:C.tx2,marginBottom:12}}>{sessions.length>0?(blockConfig?.blockName||"Programme")+" · S"+currentWeek+"/"+tw:"Aucun bloc actif"}</div>
        <PlanningOverview athleteId={athleteId}/>

        {/* 1RM Progression */}
        <div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.brd,marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>Progression 1RM</div>
          {getBig3(exos).map(({name,label,c})=>{const pr=prs[name]||null;const data=get1rmByWeek(exos,name,tw);const filled=data.filter(d=>d.val!=null);const prog=filled.length>=2?filled[filled.length-1].val-filled[0].val:null;return(<div key={name} style={{marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:3,height:16,borderRadius:2,background:c}}/><span style={{fontSize:13,fontWeight:700}}>{label}</span></div>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}><span style={{fontSize:18,fontWeight:800,color:c}}>{pr?.est||"--"}</span><span style={{fontSize:10,color:C.tx3}}>kg</span>{prog!=null&&<span style={{fontSize:11,fontWeight:700,color:prog>0?C.g:prog<0?C.r:C.tx3,padding:"2px 6px",borderRadius:5,background:(prog>0?C.g:prog<0?C.r:C.tx3)+"15"}}>{prog>0?"+":""}{prog}</span>}</div>
            </div>
            <MiniChart data={data} color={c} h={44}/>
          </div>);})}
        </div>

        {/* Poids de corps */}
        <div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.brd,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Poids de corps</div>
            <div style={{fontSize:13,fontWeight:800,color:C.ac}}>{bodyWeight.current} <span style={{fontSize:10,fontWeight:400,color:C.tx3}}>/ {bodyWeight.target} kg</span></div>
          </div>
          {Object.keys(weightLog).length>0?<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>:<div style={{textAlign:"center",color:C.tx3,fontSize:11,padding:"14px 0"}}>Aucune mesure</div>}
        </div>

        {/* Séries par muscle */}
        <MuscleVolumeCard exos={exos} exMeta={exMeta} sets={sets} sessions={sessions} weeksArr={weeksArr} tw={tw}/>

        {/* Blessures */}
        {injuries.length>0?(<div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.r+"30"}}>
          <div style={{fontSize:11,fontWeight:600,color:C.r,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Blessures ({activeInjuries.length} active{activeInjuries.length>1?"s":""})</div>
          {injuries.map(inj=>{const sc=stC(inj.status);const zn=ALL_BZ.filter(z=>inj.zones.includes(z.id)).map(z=>z.label).join(", ")||"Zone non precisee";return(<div key={inj.id} style={{padding:"8px 12px",borderRadius:4,background:C.s2,border:"1px solid "+sc+"30",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><div style={{fontSize:12,fontWeight:600,color:C.tx}}>{zn}</div><div style={{fontSize:10,color:C.tx3}}>{inj.type||"Type non precise"} - Intensite {inj.intensity}/10</div></div><span style={{fontSize:10,fontWeight:700,color:sc,padding:"2px 8px",borderRadius:5,background:sc+"15"}}>{inj.status}</span></div>);})}
        </div>):(<div style={{background:C.s1,borderRadius:6,padding:"14px",border:"1px solid "+C.g+"30",textAlign:"center"}}><span style={{fontSize:12,color:C.g,fontWeight:600}}>Aucune blessure</span></div>)}
      {/* Comptes rendus de séances */}
      {Object.keys(sessionLogs).filter(k=>sessionLogs[k]?.note||sessionLogs[k]?.forme).length>0&&(()=>{
        const logs=Object.entries(sessionLogs).filter(([,l])=>l?.note||l?.forme).sort((a,b)=>(b[1].date||"")>(a[1].date||"")?1:-1).slice(0,10);
        return(<div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.brd,marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Comptes rendus de séances</div>
          {logs.map(([key,log])=>{
            const parts=key.split("_");const wkNum=parts[parts.length-1];const sessId=parts.slice(0,-1).join("_");
            const sess=sessions.find(s=>s.id===sessId);
            return(<div key={key} style={{padding:"8px 10px",borderRadius:4,background:C.s2,marginBottom:6,border:"1px solid "+C.brd}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:log.note?4:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.ac}}>{sess?.name||sessId}</span>
                  <span style={{fontSize:9,color:C.tx3,padding:"1px 6px",borderRadius:4,background:C.acS}}>S{wkNum}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {log.forme&&<span style={{fontSize:10,fontWeight:600,color:log.forme>=4?C.g:log.forme>=3?C.o:C.r}}>Forme {log.forme}/5</span>}
                  {log.duration&&<span style={{fontSize:10,color:C.tx3}}>{fmtTime(log.duration)}</span>}
                  {log.date&&<span style={{fontSize:9,color:C.tx3}}>{new Date(log.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}</span>}
                </div>
              </div>
              {log.note&&<div style={{fontSize:11,color:C.tx2,lineHeight:1.5,fontStyle:"italic"}}>"{log.note}"</div>}
            </div>);
          })}
        </div>);
      })()}
      </>)}
      {coachTab==="data"&&(<><div style={{padding:"16px 16px 0"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Profil athlète</div>
        <div style={{fontSize:12,color:C.tx2,marginBottom:12}}>Informations personnelles</div>
        <div style={{padding:'12px 14px',borderRadius:6,background:C.s1,border:`1px solid ${C.brd}`,marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div><div style={{fontSize:13,fontWeight:700,color:C.tx}}>Tracker d'habitudes</div><div style={{fontSize:11,color:habitToggleErr?C.r:C.tx3,marginTop:2}}>{habitToggleErr||"Activer le suivi d'habitudes pour cet athlète"}</div></div>
          <button disabled={habitToggling} onClick={async()=>{setHabitToggling(true);setHabitToggleErr('');const ne=!habitEnabled;setHabitEnabled(ne);const{error}=await supabase.from('profiles').update({habit_tracker_enabled:ne}).eq('id',athleteId);if(error){setHabitEnabled(!ne);setHabitToggleErr('Erreur : migration SQL non appliquée ?');console.error('habit toggle:',error);}setHabitToggling(false);}} style={{width:46,height:26,borderRadius:13,background:habitEnabled?C.g:C.s2,border:`2px solid ${habitEnabled?C.g:C.brdL}`,cursor:habitToggling?'default':'pointer',position:'relative',transition:'all 0.2s',flexShrink:0,outline:'none',opacity:habitToggling?0.6:1}}>
            <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:habitEnabled?24:2,transition:'left 0.2s'}}/>
          </button>
        </div>
        {athleteProfile?(
          <div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid "+C.brd}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:C.coach+"25",border:"2px solid "+C.coach+"40",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:C.coach,flexShrink:0}}>
                {([athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name||"?").split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{[athleteProfile.first_name,athleteProfile.last_name].filter(Boolean).join(" ")||athleteProfile.full_name}</div>
                <div style={{fontSize:11,color:C.tx3}}>{athleteProfile.gender==="male"?"Homme":athleteProfile.gender==="female"?"Femme":"Genre non renseigné"}</div>
              </div>
              {onEditProfile&&<button onClick={onEditProfile} style={{padding:"6px 14px",borderRadius:4,border:"1px solid "+C.coach+"50",background:C.coachS,color:C.coach,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Modifier</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:C.brd}}>
              {[{l:"Âge",v:athleteProfile.age?athleteProfile.age+" ans":null},{l:"Taille",v:athleteProfile.height_cm?athleteProfile.height_cm+" cm":null},{l:"MB",v:athleteProfile.base_metabolism?athleteProfile.base_metabolism.toLocaleString("fr-FR")+" kcal":null}].map(s=>(
                <div key={s.l} style={{background:C.s2,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{s.l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:s.v?C.tx:C.tx3}}>{s.v||"—"}</div>
                </div>
              ))}
            </div>
            {athleteProfile.weight_kg||athleteProfile.body_fat_pct?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.brd,borderTop:"1px solid "+C.brd}}>
                {[{l:"Poids réf.",v:athleteProfile.weight_kg?athleteProfile.weight_kg+" kg":null},{l:"Masse grasse",v:athleteProfile.body_fat_pct?athleteProfile.body_fat_pct+" %":null}].map(s=>(
                  <div key={s.l} style={{background:C.s2,padding:"10px 8px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{s.l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:s.v?C.tx:C.tx3}}>{s.v||"—"}</div>
                  </div>
                ))}
              </div>
            ):null}
          </div>
        ):(
          <div style={{background:C.s1,borderRadius:6,padding:"16px",border:"1px solid "+C.brd,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,color:C.tx3}}>Profil non renseigné</div>
            {onEditProfile&&<button onClick={onEditProfile} style={{padding:"6px 14px",borderRadius:4,border:"1px solid "+C.coach+"50",background:C.coachS,color:C.coach,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Créer le profil</button>}
          </div>
        )}
        {/* ── Stratégie alimentaire ── */}
        <div style={{fontSize:16,fontWeight:700,marginBottom:4,marginTop:4}}>Stratégie alimentaire</div>
        <div style={{fontSize:12,color:C.tx2,marginBottom:12}}>Plan nutritionnel défini</div>
        {nutritionStrategy?(()=>{
          const ns=nutritionStrategy;
          const SC={maintenance:C.b,seche:C.r,prise_de_masse:C.g};
          const SL={maintenance:"Maintenance",seche:"Sèche",prise_de_masse:"Prise de masse"};
          const sc=SC[ns.strategy]||C.ac;
          const sl=SL[ns.strategy]||ns.strategy;
          const theorKcal=((ns.macros_glucides||0)*4)+((ns.macros_lipides||0)*9)+((ns.macros_proteines||0)*4);
          const NAP_L={1.2:"Sédentaire",1.375:"Légère",1.55:"Modérée",1.725:"Intense",1.9:"Très intense"};
          return(<div style={{background:C.s1,borderRadius:6,border:"1px solid "+C.brd,overflow:"hidden",marginBottom:16}}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+C.brd}}>
              <span style={{fontSize:13,fontWeight:700,color:sc}}>{sl}</span>
              {ns.target_weight&&<span style={{fontSize:12,color:C.tx3}}>Cible : <span style={{color:C.ac,fontWeight:700}}>{ns.target_weight} kg</span></span>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.brd}}>
              <div style={{background:C.s2,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Calories cibles</div>
                <div style={{fontSize:16,fontWeight:800,color:C.o}}>{ns.total_calories_coach?ns.total_calories_coach.toLocaleString("fr-FR")+"  kcal":"—"}</div>
                {ns.nap&&<div style={{fontSize:10,color:C.tx3,marginTop:2}}>NAP {NAP_L[ns.nap]||ns.nap} (×{ns.nap})</div>}
              </div>
              <div style={{background:C.s2,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>
                  {ns.strategy==="seche"?"Déficit cible":ns.strategy==="prise_de_masse"?"Surplus cible":"Tolérance"}
                </div>
                {ns.surplus_deficit_min!=null&&ns.surplus_deficit_max!=null?(
                  <div style={{fontSize:16,fontWeight:800,color:sc}}>
                    {ns.strategy==="seche"?Math.abs(ns.surplus_deficit_min)+"%":ns.strategy==="prise_de_masse"?"+"+ns.surplus_deficit_max+"%":"±"+ns.surplus_deficit_max+"%"}
                  </div>
                ):<div style={{fontSize:13,color:C.tx3}}>—</div>}
              </div>
            </div>
            {(ns.macros_glucides||ns.macros_lipides||ns.macros_proteines||ns.macros_glucides_pct||ns.macros_lipides_pct||ns.macros_proteines_pct)&&(
              <div style={{padding:"10px 16px",borderTop:"1px solid "+C.brd}}>
                <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Macros cibles</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[{label:"Glucides",pct:ns.macros_glucides_pct,g:ns.macros_glucides,color:C.b},{label:"Lipides",pct:ns.macros_lipides_pct,g:ns.macros_lipides,color:C.o},{label:"Protéines",pct:ns.macros_proteines_pct,g:ns.macros_proteines,color:C.g}].map(m=>(
                    <div key={m.label} style={{background:C.s2,borderRadius:4,padding:"8px",textAlign:"center",border:"1px solid "+m.color+"20"}}>
                      <div style={{fontSize:9,color:m.color,fontWeight:700,marginBottom:3}}>{m.label}</div>
                      {m.pct!=null&&<div style={{fontSize:18,fontWeight:900,color:m.color,lineHeight:1}}>{m.pct}<span style={{fontSize:10}}>%</span></div>}
                      {m.g!=null&&<div style={{fontSize:12,fontWeight:600,color:C.tx2,marginTop:1}}>{m.g} g</div>}
                      {m.pct==null&&m.g==null&&<div style={{fontSize:12,color:C.tx3}}>—</div>}
                    </div>
                  ))}
                </div>
                {theorKcal>0&&<div style={{marginTop:8,fontSize:11,color:C.tx3,textAlign:"right"}}>Total macros : <span style={{fontWeight:700,color:C.tx}}>{theorKcal} kcal</span></div>}
              </div>
            )}
            <div style={{padding:"8px 16px",borderTop:"1px solid "+C.brd,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:C.tx3}}>{
                (ns.calorie_mode||"nap")==="active"?"Mode : BMR + calories actives (athlète)":
                (ns.calorie_mode||"nap")==="hybrid"?"Mode : Hybride (NAP ou actives)":
                "Mode : BMR × NAP (calories fixes)"
              }</span>
              {onEditProfile&&<button onClick={onEditProfile} style={{padding:"4px 12px",borderRadius:7,border:"1px solid "+C.coach+"50",background:C.coachS,color:C.coach,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Modifier</button>}
            </div>
          </div>);
        })():(
          <div style={{background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,color:C.tx3}}>Aucune stratégie définie</div>
            {onEditProfile&&<button onClick={onEditProfile} style={{padding:"6px 14px",borderRadius:4,border:"1px solid "+C.coach+"50",background:C.coachS,color:C.coach,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Définir</button>}
          </div>
        )}
        {/* Performances sportives de l'athlète */}
        <div style={{marginBottom:20}}>
          <PerformanceProfile athleteId={athleteId} viewOnly={false} isCoach={true} C={C}/>
        </div>
        {/* Notifications de validation des performances */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Validations de performances</div>
          <CoachPerfNotification coachId={athleteId} C={C}/>
        </div>
        {/* Gestion du bloc */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Gestion du bloc</div>
          <div style={{fontSize:12,color:C.tx2,marginBottom:12}}>Annulation de séances et historique</div>
          <CoachConfig completedSessions={completedSessions} uncompleteSession={uncompleteSession} sessions={sessions} weeksArr={weeksArr} onNewBlock={()=>setShowNewBlock(true)} onShowHistory={()=>setShowBlockHistory(true)} blockHistoryCount={blockHistory.length}/>
        </div>
        {/* Avis sur l'app */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Avis sur l'app</div>
          <div style={{fontSize:12,color:C.tx2,marginBottom:12}}>Retours de cet athlète sur l'application</div>
          {appFeedbacks.length===0?(<div style={{background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.brd,fontSize:12,color:C.tx3}}>Aucun avis envoyé pour l'instant</div>):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...appFeedbacks].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(fb=>{
                const sc=fb.rating>=4?C.g:fb.rating>=3?C.o:C.r;
                return(<div key={fb.id} style={{background:C.s1,borderRadius:6,padding:"12px 14px",border:"1px solid "+C.brd}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:fb.text?8:0}}>
                    <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(n=><span key={n} style={{fontSize:14,opacity:n<=fb.rating?1:0.2}}></span>)}</div>
                    <span style={{fontSize:10,color:C.tx3}}>{new Date(fb.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"})}</span>
                  </div>
                  {fb.text&&<div style={{fontSize:12,color:C.tx2,lineHeight:1.55,fontStyle:"italic"}}>"{fb.text}"</div>}
                </div>);
              })}
            </div>
          )}
        </div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Gestion des données</div>
        <div style={{fontSize:12,color:C.tx2,marginBottom:16}}>Supprimer sélectivement des données</div>
      </div>
      <DataManager
        exos={exos} setExos={setExos} sets={sets} setSets={setSets} sessions={sessions} setSessions={setSessions}
        completedSessions={completedSessions} setCompletedSessions={setCompletedSessions}
        athleteNotes={athleteNotes} setAthleteNotes={setAthleteNotes}
        blockHistory={blockHistory} setBlockHistory={setBlockHistory}
        exMeta={exMeta} setExMeta={setExMeta}
        wellness={wellness} setWellness={v=>{setWellnessState(v);save(SKEYS.wellness,v).catch(()=>{});}}
        wellnessHistory={wellnessHistory} setWellnessHistory={v=>{setWellnessHistoryState(v);save(SKEYS.wellnessHistory,v).catch(()=>{});}}
        weightLog={weightLog} setWeightLog={v=>{setWeightLogState(v);save(SKEYS.weightLog,v).catch(()=>{});}}
        injuries={injuries} setInjuries={setInjuries}
        weeksArr={weeksArr}
      /></>)}
      {coachTab==="test"&&<TestSessionView athleteId={athleteId} viewOnly={viewOnly} C={C} testSubTab={testSubTab} setTestSubTab={setTestSubTab} isCoach={true}/>}
      {coachTab==="retours"&&<CoachWeeklyFeedback athleteId={athleteId} sessions={sessions} completedSessions={completedSessions} energySessions={energySessions} currentWeek={currentWeek} blockConfig={blockConfig} exos={exos} sets={sets} wellnessHistory={wellnessHistory} C={C}/>}
      </div>{/* end coach-content */}
      </div>{/* end coach-layout */}
    </>)}

    {mode==="athlete"&&tab!=="log"&&(()=>{const lsA=(()=>{try{const d=JSON.parse(localStorage.getItem('mpp:sess_start')||'null');if(d?.sid&&d?.wk){const s=sessions.find(x=>x.id===d.sid);return s?{...d,name:s.name}:null;}return null;}catch{return null;}})();const lsF=(()=>{try{const d=JSON.parse(localStorage.getItem('mpp:free_start')||'null');if(d?.id){const f=(freeSessions||[]).find(x=>x.id===d.id);return f&&!f.completed?{...d,name:f.name}:null;}return null;}catch{return null;}})();if(!lsA&&!lsF)return null;const active=lsA||lsF;return(<div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:300,maxWidth:360,width:"calc(100% - 32px)"}}>
      <button onClick={()=>setTab("log")} style={{width:"100%",padding:"12px 16px",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
        <span style={{fontSize:16}}>▶</span><span>Reprendre — {active.name}</span>
      </button>
    </div>);})()}
    {mode==="athlete"&&(<>
      {tab==="dash"&&(<div style={{padding:"16px 16px 40px"}}>
        <div style={{marginBottom:18}}><div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>Bonjour</div>{sessions.length>0?<div style={{fontSize:12,color:C.tx2,marginTop:2}}>{blockConfig?.blockName||"Programme"} · S{currentWeek}/{tw}{isDeload(currentWeek)?" (Deload)":""}</div>:<div style={{fontSize:12,color:C.tx3,marginTop:2}}>Aucun bloc actif</div>}</div>
        {activeInjuries.length>0&&(<button onClick={()=>setTab("stats")} style={{width:"100%",background:C.rS,borderRadius:6,padding:"10px 14px",border:"1.5px solid "+C.r+"50",marginBottom:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:10}}><div style={{width:8,height:8,borderRadius:"50%",background:C.r,flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:C.r}}>{activeInjuries.length} blessure(s) en cours</div><div style={{fontSize:10,color:C.r+"90"}}>{activeInjuries.map(i=>ALL_BZ.filter(z=>i.zones.includes(z.id)).map(z=>z.label).join(", ")||"Zone non precisee").join(" | ")}</div></div><span style={{fontSize:12,color:C.r}}>&gt;</span></button>)}
        <button onClick={()=>{if(!viewOnly)setShowWellness(true);}} style={{width:"100%",background:C.s1,borderRadius:6,padding:"14px 16px",border:"1.5px solid "+wReco.c+"35",marginBottom:12,cursor:viewOnly?"default":"pointer",fontFamily:"inherit",textAlign:"left",display:"block"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Wellness du jour</div>{!viewOnly&&<div style={{fontSize:10,color:C.ac,padding:"3px 10px",borderRadius:6,border:"1px solid "+C.ac+"40",fontWeight:600}}>{wellness?"Modifier":"Remplir"} &gt;</div>}</div>
          {wellness?(<div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{position:"relative",width:64,height:64,flexShrink:0}}><svg viewBox="0 0 64 64" style={{width:64,height:64,transform:"rotate(-90deg)"}}><circle cx="32" cy="32" r="26" fill="none" stroke={C.s2} strokeWidth="5"/><circle cx="32" cy="32" r="26" fill="none" stroke={wReco.c} strokeWidth="5" strokeDasharray={String(2*Math.PI*26)} strokeDashoffset={String(2*Math.PI*26*(1-wScore/100))} strokeLinecap="round"/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:wReco.c}}>{wScore}</div></div>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:wReco.c,marginBottom:4}}>{wReco.label}</div><div style={{fontSize:11,color:C.tx2}}>{wReco.desc}</div>
              <div style={{display:"flex",gap:8,marginTop:8}}>{WELL_ITEMS.map(it=>{const v=wellness[it.k];const vc=it.inv?(v>=4?C.r:v<=2?C.g:C.o):(v>=4?C.g:v<=2?C.r:C.o);return(<div key={it.k} style={{textAlign:"center"}}><div style={{fontSize:12,fontWeight:700,color:vc}}>{v}</div><div style={{fontSize:8,color:C.tx3}}>{it.k.slice(0,4)}</div></div>);})}{wellness.sleepDur&&<div style={{textAlign:"center"}}><div style={{fontSize:12,fontWeight:700,color:C.b}}>{wellness.sleepDur}h</div><div style={{fontSize:8,color:C.tx3}}>som.</div></div>}{wellness.poids&&<div style={{textAlign:"center"}}><div style={{fontSize:12,fontWeight:700,color:C.ac}}>{wellness.poids}</div><div style={{fontSize:8,color:C.tx3}}>kg</div></div>}</div>
              {wellness.domsZones?.length>0&&<div style={{display:"flex",gap:3,marginTop:6,flexWrap:"wrap"}}>{wellness.domsZones.map(id=>{const z=ALL_BZ.find(z=>z.id===id);return z?<span key={id} style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.o+"20",color:C.o}}>{z.label}</span>:null;})}</div>}
            </div>
          </div>):<div style={{fontSize:12,color:C.tx3,textAlign:"center",padding:"10px 0"}}>Appuyez pour remplir le bilan</div>}
        </button>
        <WeekCalendar sessions={sessions} completedSessions={completedSessions} currentWeek={currentWeek} weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule} C={C} wellnessHistory={wellnessHistory} weightLog={weightLog} sessionLogs={sessionLogs} nutritionLog={nutritionLog} exos={exos} energySessions={energySessions} energyWeekPlan={energyWeekPlan} energyDayPlan={energyDayPlan} testSessions={testSessions} visibilitySettings={visibilitySettings}/>
        {nutritionStrategy&&(()=>{const todayISO=new Date().toISOString().slice(0,10);const todayNL=nutritionLog[todayISO]||null;const strat=nutritionStrategy;const consumed=todayNL?.total_calories_consumed||null;const bmrV=athleteProfile?.base_metabolism||0;const targetCal=strat.can_track_calories?(bmrV+(todayNL?.active_calories||0)):strat.total_calories_coach||null;const stratC=strat.strategy==="seche"?C.r:strat.strategy==="prise_de_masse"?C.g:C.b;const stratL=strat.strategy==="seche"?"Sèche":strat.strategy==="prise_de_masse"?"Prise":"Maintenance";
          const surplusPct=(consumed&&targetCal&&targetCal>0)?((consumed-targetCal)/targetCal)*100:null;
          const inRange=surplusPct!==null&&strat.surplus_deficit_min!=null&&strat.surplus_deficit_max!=null&&surplusPct>=strat.surplus_deficit_min&&surplusPct<=strat.surplus_deficit_max;
          const feedbackC=surplusPct===null?null:inRange?C.g:C.o;
          const feedbackMsg=surplusPct===null?null:inRange?"✅ Dans la fourchette aujourd'hui":""+(surplusPct>0?"+":"")+surplusPct.toFixed(1)+"% — objectif "+strat.surplus_deficit_min+"% à "+strat.surplus_deficit_max+"%";
          return(<div style={{background:C.s1,borderRadius:6,padding:"11px 16px",border:"1px solid "+(feedbackC?feedbackC+"40":C.brd),marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:consumed?8:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Alimentation</div>
                <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:stratC+"18",color:stratC}}>{stratL}</span>
              </div>
              <button onClick={()=>setTab("alim")} style={{fontSize:10,color:C.ac,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0}}>Détail →</button>
            </div>
            {!consumed?(<div style={{fontSize:11,color:C.tx3}}>Aucune saisie aujourd'hui</div>):(
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:feedbackMsg?8:0}}>
                  <div><span style={{fontSize:20,fontWeight:800,color:feedbackC||stratC}}>{consumed}</span>{targetCal&&<span style={{fontSize:10,color:C.tx3}}> / {targetCal} kcal</span>}</div>
                  <div style={{display:"flex",gap:10,marginLeft:"auto"}}>{[{l:"G",v:todayNL?.glucides_consumed,c:C.b},{l:"L",v:todayNL?.lipides_consumed,c:C.o},{l:"P",v:todayNL?.proteines_consumed,c:C.g}].map(macro=>(<div key={macro.l} style={{textAlign:"center"}}><div style={{fontSize:12,fontWeight:700,color:macro.c}}>{macro.v??"—"}</div><div style={{fontSize:9,color:C.tx3}}>{macro.l} (g)</div></div>))}</div>
                </div>
                {feedbackMsg&&<div style={{fontSize:11,fontWeight:600,color:feedbackC,padding:"5px 10px",borderRadius:7,background:feedbackC+"12"}}>{feedbackMsg}</div>}
              </>
            )}
          </div>);})()}
        <div style={{marginBottom:12}}>
        {(()=>{
          const todayDow=(new Date().getDay()+6)%7;
          const doneNow=completedSessions[currentWeek]||[];
          const todaySessions=sessions.filter(s=>s.day_of_week===todayDow&&(exos[s.id]||[]).length>0);
          const todayNotDone=todaySessions.filter(s=>!doneNow.includes(s.id));
          const todayAllDone=todaySessions.length>0&&todayNotDone.length===0;
          if(todayAllDone){
            const nextSess=sessions.find(s=>!doneNow.includes(s.id)&&(exos[s.id]||[]).length>0);
            return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{padding:"10px 14px",borderRadius:4,background:C.gS,border:"1px solid "+C.g+"40",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>✓</span><div style={{fontSize:12,fontWeight:700,color:C.g}}>Séance du jour effectuée !</div></div>
              {nextSess&&(<button onClick={()=>{setInitialLogSess(nextSess);setTab("log");}} style={{width:"100%",padding:"10px 14px",borderRadius:4,border:"none",background:C.acS,color:C.ac,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:10}}><div><div style={{fontSize:11,fontWeight:700}}>Prochaine séance</div><div style={{fontSize:10,color:C.tx2}}>{nextSess.short} - {nextSess.name}</div></div><span style={{marginLeft:"auto",fontSize:14}}>&gt;</span></button>)}
            </div>);
          }
          if(todayNotDone.length>0){
            const s=todayNotDone[0];
            return(<button onClick={()=>{setInitialLogSess(s);setTab("log");}} style={{width:"100%",padding:"10px 14px",borderRadius:4,border:"none",background:C.coachS,color:C.coach,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
              <div><div style={{fontSize:11,fontWeight:700,color:C.coach}}>Séance du jour</div><div style={{fontSize:10,color:C.tx2}}>{s.short} - {s.name}</div>{todayNotDone.length>1&&<div style={{fontSize:9,color:C.tx3,marginTop:2}}>+{todayNotDone.length-1} autre(s) aujourd'hui</div>}</div>
              <span style={{marginLeft:"auto",fontSize:14}}>&gt;</span>
            </button>);
          }
          const nextSess=sessions.find(s=>!doneNow.includes(s.id)&&(exos[s.id]||[]).length>0);
          if(!nextSess)return(<div style={{padding:"10px",borderRadius:4,background:C.gS,color:C.g,fontSize:11,fontWeight:600,textAlign:"center"}}>Semaine {currentWeek} complete !</div>);
          return(<button onClick={()=>{setInitialLogSess(nextSess);setTab("log");}} style={{width:"100%",padding:"10px 14px",borderRadius:4,border:"none",background:C.acS,color:C.ac,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:10}}><div><div style={{fontSize:11,fontWeight:700}}>Prochaine séance</div><div style={{fontSize:10,color:C.tx2}}>{nextSess.short} - {nextSess.name}</div></div><span style={{marginLeft:"auto",fontSize:14}}>&gt;</span></button>);
        })()}
        </div>
        {(habitEnabled||habits.length>0)&&<HabitDashboard habits={habits} setHabits={setHabits} habitLogs={habitLogs} onToggle={toggleHabitLog} viewOnly={viewOnly} athleteId={athleteId}/>}
      </div>)}

      {tab==="log"&&(<>
        {/* Sous-onglets Séance */}
        <div style={{display:"flex",borderBottom:"1px solid "+C.brd,background:C.bg,paddingLeft:16,paddingRight:16,gap:0}}>
          {[{k:"muscu",l:"Musculation"},{k:"energie",l:"Énergétique"},{k:"specifique",l:"Spécifique"}].map(t=>(
            <button key={t.k} onClick={()=>setLogSubTab(t.k)} style={{padding:"10px 14px",border:"none",borderBottom:"2px solid "+(logSubTab===t.k?C.ac:"transparent"),background:"transparent",color:logSubTab===t.k?C.ac:C.tx3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.3px",flexShrink:0}}>{t.l}</button>
          ))}
        </div>
        {logSubTab==="muscu"&&<LogView exos={exos} sets={sets} updSets={updSets} completedSessions={completedSessions} completeSession={completeSession} uncompleteSession={uncompleteSession} goals={goals} weeklyTarget={weeklyTarget} currentWeek={currentWeek} allMethods={allMethods} athleteNotes={athleteNotes} setAthleteNotes={setAthleteNotes} sessions={sessions} blockConfig={blockConfig} initialSess={initialLogSess} timerLeft={timerLeft} timerDur={timerDur} timerActive={timerActive} timerFinished={timerFinished} onTimerSetDur={timerSetDur} onTimerStart={timerStart} onTimerStop={timerStop} viewOnly={viewOnly} sessionLogs={sessionLogs} setSessionLogs={setSessionLogs} freeSessions={freeSessions} setFreeSessions={setFreeSessions} onAddExercise={(sessId,ex)=>setExos(prev=>({...prev,[sessId]:[...(prev[sessId]||[]),ex]}))} weekSchedule={weekSchedule}/>}
        {logSubTab==="energie"&&<EnergySessionLog athleteId={athleteId} viewOnly={viewOnly} C={C}/>}
        {logSubTab==="specifique"&&(<div style={{padding:"40px 20px",textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}></div><div style={{fontSize:15,fontWeight:700,color:C.tx,marginBottom:6}}>Séances Spécifiques</div><div style={{fontSize:13,color:C.tx3}}>Cette fonctionnalité sera disponible prochainement.</div></div>)}
      </>)}


      {tab==="alim"&&<NutritionView athleteId={athleteId} bmr={athleteProfile?.base_metabolism||null} nutritionStrategy={nutritionStrategy} onLogSaved={(date,log)=>{const updated={...nutritionLog,[date]:log};setNutritionLogState(updated);save("asp:nutrition_log",updated).catch(()=>{});}} viewOnly={viewOnly}/>}

      {tab==="test"&&<TestSessionView athleteId={athleteId} viewOnly={viewOnly} C={C} testSubTab={testSubTab} setTestSubTab={setTestSubTab}/>}

      {tab==="retours"&&<RetoursView/>}

      {tab==="coachfeedback"&&(<div style={{padding:"16px 16px 40px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <button onClick={()=>setTab("dash")} style={{width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
          <div style={{fontSize:16,fontWeight:700}}>Retours du coach</div>
        </div>
        {(()=>{
          const weeks=Object.keys(coachFeedbacks).map(Number).filter(Boolean).sort((a,b)=>b-a);
          if(weeks.length===0)return(<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:32,marginBottom:12}}></div><div style={{fontSize:14,color:C.tx3}}>Aucun retour du coach pour l'instant.</div></div>);
          return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
            {weeks.map(wk=>{
              const fb=coachFeedbacks[wk];
              if(!fb?.note)return null;
              return(<div key={wk} style={{background:C.s1,borderRadius:6,padding:"14px 16px",border:"1px solid "+C.coach+"30"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.coach,textTransform:"uppercase",letterSpacing:"0.5px"}}>Semaine {wk}</div>
                  {fb.date&&<div style={{fontSize:10,color:C.tx3}}>{new Date(fb.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})}</div>}
                </div>
                <div style={{fontSize:13,color:C.tx,lineHeight:1.6,fontStyle:"italic"}}>"{fb.note}"</div>
                {fb.rating&&<div style={{marginTop:8,display:"flex",gap:2}}>{[1,2,3,4,5].map(n=><span key={n} style={{fontSize:14,opacity:n<=fb.rating?1:0.2}}></span>)}</div>}
              </div>);
            })}
          </div>);
        })()}
      </div>)}

    </>)}

  </div>);
}