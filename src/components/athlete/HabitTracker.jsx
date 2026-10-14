import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { C, HABIT_COLORS, HABIT_ICONS } from "@/lib/theme";
import { EmojiIcon } from "@/components/ui/AgonIcon";
import { calcHabitStreak, streakMsg, getHabitWeekDays, hISO, hAddDays } from "@/lib/date";
function HabitCreateModal({onSave,onClose,initial=null}){
  const[name,setName]=useState(initial?.name||'');
  const[emoji,setEmoji]=useState(initial?.emoji||'musculation');
  const[color,setColor]=useState(initial?.color||HABIT_COLORS[0]);
  return(<div onClick={onClose} style={{position:'fixed',inset:0,zIndex:450,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:480,background:C.s1,borderRadius:'6px 6px 0 0',padding:'24px 24px 48px',boxSizing:'border-box'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div style={{fontSize:16,fontWeight:800,color:C.tx}}>{initial?'Modifier':'Nouvelle habitude'}</div><button onClick={onClose} style={{background:'none',border:'none',color:C.tx2,fontSize:22,cursor:'pointer',fontFamily:'inherit'}}>×</button></div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:6,background:C.s2,border:`2px solid ${color}40`,marginBottom:20}}>
        <div style={{width:44,height:44,borderRadius:6,background:color+'20',border:`2px solid ${color}60`,display:'flex',alignItems:'center',justifyContent:'center',color:color,flexShrink:0}}><EmojiIcon value={emoji} size={20} /></div>
        <div style={{fontSize:15,fontWeight:700,color:name?C.tx:C.tx3,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name||"Nom de l'habitude"}</div>
      </div>
      <label style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',display:'block',marginBottom:6}}>Nom</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Boire 2L d'eau" maxLength={40} style={{width:'100%',padding:'10px 14px',borderRadius:4,border:`1px solid ${C.brdL}`,background:C.s2,color:C.tx,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:18}}/>
      <label style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',display:'block',marginBottom:8}}>Icone</label>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:18}}>{HABIT_ICONS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:38,height:38,borderRadius:4,border:`2px solid ${emoji===e?color:C.brdL}`,background:emoji===e?color+'20':C.s2,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:emoji===e?color:C.tx2}}><EmojiIcon value={e} size={18} /></button>)}</div>
      <label style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',display:'block',marginBottom:8}}>Couleur</label>
      <div style={{display:'flex',gap:10,marginBottom:24}}>{HABIT_COLORS.map(hc=><button key={hc} onClick={()=>setColor(hc)} style={{width:34,height:34,borderRadius:'50%',background:hc,border:`3px solid ${color===hc?C.tx:'transparent'}`,cursor:'pointer',flexShrink:0,transform:color===hc?'scale(1.2)':'scale(1)',transition:'transform 0.15s'}}/>)}</div>
      <button onClick={()=>{if(name.trim())onSave({name:name.trim(),emoji,color});}} disabled={!name.trim()} style={{width:'100%',padding:'14px 0',borderRadius:6,border:'none',background:name.trim()?color:C.s2,color:name.trim()?'#fff':C.tx3,fontSize:15,fontWeight:800,cursor:name.trim()?'pointer':'default',fontFamily:'inherit',transition:'all 0.2s'}}>{initial?'Enregistrer':'Créer l\'habitude'}</button>
    </div>
  </div>);
}

function HabitDashboard({habits,setHabits,habitLogs,onToggle,viewOnly,athleteId}){
  const[showCreate,setShowCreate]=useState(false);
  const[menuId,setMenuId]=useState(null);
  const[editHabit,setEditHabit]=useState(null);
  const wdays=getHabitWeekDays();
  const todayISO=hISO();
  const DAY_LABELS=['Di','Lu','Ma','Me','Je','Ve','Sa'];
  const dayLabel=d=>{const n=d.getDay();return DAY_LABELS[n];};
  const handleCreate=async d=>{
    const{data:h,error}=await supabase.from('habits').insert({...d,athlete_id:athleteId,sort_order:habits.length}).select().single();
    if(error||!h){toast.error("Habitude non créée — vérifie ta connexion");return;}
    setHabits(p=>[...p,h]);
    setShowCreate(false);
  };
  const handleEdit=async(id,d)=>{
    const{error}=await supabase.from('habits').update({name:d.name,emoji:d.emoji,color:d.color}).eq('id',id);
    if(error){toast.error("Modification non enregistrée — vérifie ta connexion");return;}
    setHabits(p=>p.map(h=>h.id===id?{...h,...d}:h));
    setEditHabit(null);
  };
  const handleDelete=async id=>{
    // L'habitude disparaissait de l'écran même quand l'update échouait : elle
    // revenait au rechargement suivant.
    const{error}=await supabase.from('habits').update({is_active:false}).eq('id',id);
    if(error){toast.error("Suppression échouée — vérifie ta connexion");return;}
    setHabits(p=>p.filter(h=>h.id!==id));
    setMenuId(null);
  };
  const handleMove=async(idx,dir)=>{
    const ni=idx+dir;
    if(ni<0||ni>=habits.length)return;
    const prev=habits;
    const next=[...habits];[next[idx],next[ni]]=[next[ni],next[idx]];
    setHabits(next);
    setMenuId(null);
    const res=await Promise.all([
      supabase.from('habits').update({sort_order:idx}).eq('id',next[idx].id),
      supabase.from('habits').update({sort_order:ni}).eq('id',next[ni].id),
    ]);
    // Réordonnancement non persisté → on remet l'ordre affiché en cohérence.
    if(res.some(r=>r.error)){setHabits(prev);toast.error("Ordre non enregistré — vérifie ta connexion");}
  };
  return(<div style={{background:C.s1,borderRadius:6,padding:'14px 16px',border:`1px solid ${C.brd}`,marginBottom:12}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px'}}>Mes habitudes</div>
      {!viewOnly&&<button onClick={()=>setShowCreate(true)} style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:4,border:`1px solid ${C.ac}40`,background:C.acS,color:C.ac,cursor:'pointer',fontFamily:'inherit'}}>+ Habitude</button>}
    </div>
    {habits.length===0?(<div style={{textAlign:'center',padding:'18px 0',color:C.tx3,fontSize:12}}>{viewOnly?'Aucune habitude définie':'Ajoute ta première habitude →'}</div>):(
      <div>
        {/* En-tête jours */}
        <div style={{display:'grid',gridTemplateColumns:'1fr repeat(7,30px)',gap:3,marginBottom:8}}>
          <div/>
          {wdays.map((d,i)=>{const iso=hISO(d);const isToday=iso===todayISO;const isPast=iso<todayISO;return(<div key={i} style={{textAlign:'center'}}>
            <div style={{fontSize:8,fontWeight:600,color:isToday?C.ac:isPast?C.tx3:C.tx3+"80",textTransform:'uppercase'}}>{dayLabel(d)}</div>
            <div style={{fontSize:9,fontWeight:isToday?700:400,color:isToday?C.ac:isPast?C.tx2:C.tx3+"80"}}>{d.getDate()}</div>
          </div>);})}
        </div>
        {habits.map((h,idx)=>{
          const logs=habitLogs[h.id]||[];const streak=calcHabitStreak(logs);
          return(<div key={h.id} style={{marginBottom:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr repeat(7,30px)',gap:3,alignItems:'center'}}>
              <button onClick={()=>setMenuId(menuId===h.id?null:h.id)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left',padding:'2px 0',minWidth:0}}>
                <span style={{flexShrink:0,color:h.color}}><EmojiIcon value={h.emoji} size={16} /></span>
                <span style={{fontSize:12,fontWeight:600,color:C.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.name}</span>
              </button>
              {wdays.map((d,i)=>{
                const iso=hISO(d);const done=logs.includes(iso);const isFuture=iso>todayISO;const canTap=!viewOnly&&!isFuture;
                return(<button key={i} onClick={canTap?()=>onToggle(h.id,iso):undefined}
                  style={{width:30,height:30,borderRadius:'50%',border:`2px solid ${done?h.color:isFuture?C.brd+'40':C.brdL}`,background:done?h.color+'22':isFuture?'transparent':C.s2,cursor:canTap?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.18s',opacity:isFuture?0.35:1}}>
                  {done?<div style={{width:11,height:11,borderRadius:'50%',background:h.color}}/>:(!isFuture&&iso===todayISO&&!viewOnly)?<div style={{width:4,height:4,borderRadius:'50%',background:C.ac}}/>:null}
                </button>);
              })}
            </div>
            <div style={{fontSize:10,color:streak>0?h.color:C.tx3,fontWeight:streak>0?600:400,paddingLeft:2,marginTop:3}}>{streakMsg(streak)}</div>
            {menuId===h.id&&!viewOnly&&<div style={{marginTop:6,padding:'8px 10px',borderRadius:4,background:C.s2,border:`1px solid ${C.brd}`,display:'flex',flexWrap:'wrap',gap:6}}>
              <button onClick={()=>{setEditHabit(h);setMenuId(null);}} style={{flex:1,padding:'7px 0',borderRadius:4,border:`1px solid ${C.ac}40`,background:C.acS,color:C.ac,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minWidth:70}}>Modifier</button>
              {idx>0&&<button onClick={()=>handleMove(idx,-1)} style={{width:34,padding:'7px 0',borderRadius:4,border:`1px solid ${C.brdL}`,background:'transparent',color:C.tx2,fontSize:14,cursor:'pointer',fontFamily:'inherit',textAlign:'center'}}>↑</button>}
              {idx<habits.length-1&&<button onClick={()=>handleMove(idx,1)} style={{width:34,padding:'7px 0',borderRadius:4,border:`1px solid ${C.brdL}`,background:'transparent',color:C.tx2,fontSize:14,cursor:'pointer',fontFamily:'inherit',textAlign:'center'}}>↓</button>}
              <button onClick={()=>handleDelete(h.id)} style={{flex:1,padding:'7px 0',borderRadius:4,border:`1px solid ${C.r}40`,background:C.rS,color:C.r,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',minWidth:70}}>Supprimer</button>
              <button onClick={()=>setMenuId(null)} style={{flex:1,padding:'7px 0',borderRadius:4,border:`1px solid ${C.brdL}`,background:'transparent',color:C.tx3,fontSize:11,cursor:'pointer',fontFamily:'inherit',minWidth:70}}>Annuler</button>
            </div>}
          </div>);
        })}
      </div>
    )}
    {showCreate&&<HabitCreateModal onSave={handleCreate} onClose={()=>setShowCreate(false)}/>}
    {editHabit&&<HabitCreateModal initial={editHabit} onSave={d=>handleEdit(editHabit.id,d)} onClose={()=>setEditHabit(null)}/>}
  </div>);
}

function HabitTrackerProfile({habits,habitLogs,onToggle,viewOnly}){
  const[hTab,setHTab]=useState('week');
  const[monthDate,setMonthDate]=useState(new Date());
  const[selHabit,setSelHabit]=useState(null);
  const wdays=getHabitWeekDays();
  const todayISO=hISO();
  const yISO=hISO(hAddDays(new Date(),-1));
  const DL=['L','M','M','J','V','S','D'];
  const activeH=(selHabit&&habits.find(h=>h.id===selHabit))||habits[0];

  const renderWeek=()=>(<div>
    <div style={{display:'grid',gridTemplateColumns:'1fr repeat(7,34px)',gap:4,marginBottom:10}}>
      <div/>
      {wdays.map((d,i)=>{const iso=hISO(d);const isT=iso===todayISO;return(<div key={i} style={{textAlign:'center'}}><div style={{fontSize:9,fontWeight:600,color:isT?C.ac:C.tx3,textTransform:'uppercase'}}>{DL[(d.getDay()+6)%7]}</div><div style={{fontSize:11,color:isT?C.ac:C.tx2,fontWeight:isT?700:400}}>{d.getDate()}</div></div>);})}
    </div>
    {habits.map(h=>{
      const logs=habitLogs[h.id]||[];const streak=calcHabitStreak(logs);
      return(<div key={h.id} style={{marginBottom:18}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
          <span style={{color:h.color}}><EmojiIcon value={h.emoji} size={16} /></span>
          <div><div style={{fontSize:13,fontWeight:700,color:C.tx}}>{h.name}</div><div style={{fontSize:10,color:streak>0?h.color:C.tx3,fontWeight:streak>0?600:400}}>{streakMsg(streak)}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr repeat(7,34px)',gap:4}}>
          <div/>
          {wdays.map((d,i)=>{
            const iso=hISO(d);const done=logs.includes(iso);const canTap=!viewOnly&&(iso===todayISO||iso===yISO);const future=iso>todayISO;
            return(<button key={i} onClick={canTap?()=>onToggle(h.id,iso):undefined} style={{width:34,height:34,borderRadius:4,border:`2px solid ${done?h.color:future?C.brd:C.brdL}`,background:done?h.color+'20':'transparent',cursor:canTap?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.18s'}}>
              {done?<div style={{width:13,height:13,borderRadius:'50%',background:h.color}}/>:(!future&&iso===todayISO&&!viewOnly)?<div style={{width:5,height:5,borderRadius:'50%',background:C.ac}}/>:null}
            </button>);
          })}
        </div>
      </div>);
    })}
  </div>);

  const renderMonth=()=>{
    const yr=monthDate.getFullYear(),mo=monthDate.getMonth();
    const fd=new Date(yr,mo,1);const ld=new Date(yr,mo+1,0);
    const startDow=(fd.getDay()+6)%7;const dim=ld.getDate();
    const now=new Date();const isCurMo=yr===now.getFullYear()&&mo===now.getMonth();
    const MON=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const cells=[];for(let i=0;i<startDow;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);
    return(<div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <button onClick={()=>setMonthDate(new Date(yr,mo-1,1))} style={{width:32,height:32,borderRadius:4,border:`1px solid ${C.brdL}`,background:C.s2,color:C.tx2,fontSize:18,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
        <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{MON[mo]} {yr}</div>
        <button onClick={()=>setMonthDate(new Date(yr,mo+1,1))} disabled={isCurMo} style={{width:32,height:32,borderRadius:4,border:`1px solid ${C.brdL}`,background:C.s2,color:C.tx2,fontSize:18,cursor:isCurMo?'default':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',opacity:isCurMo?0.3:1}}>›</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:6}}>{DL.map((l,i)=><div key={i} style={{textAlign:'center',fontSize:9,fontWeight:600,color:C.tx3,textTransform:'uppercase',padding:'2px 0'}}>{l}</div>)}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
        {cells.map((day,i)=>{
          if(!day)return<div key={i}/>;
          const iso=`${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isT=iso===todayISO;const future=iso>todayISO;
          const dots=habits.filter(h=>(habitLogs[h.id]||[]).includes(iso));
          return(<div key={i} style={{aspectRatio:'1',borderRadius:4,background:isT?C.acS:C.s2,border:`1px solid ${isT?C.ac+'50':C.brd}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:2,opacity:future?0.35:1}}>
            <div style={{fontSize:10,fontWeight:isT?700:400,color:isT?C.ac:C.tx3,lineHeight:1.2}}>{day}</div>
            {dots.length>0&&<div style={{display:'flex',gap:2,flexWrap:'wrap',justifyContent:'center',marginTop:2}}>{dots.slice(0,4).map(h=><div key={h.id} style={{width:5,height:5,borderRadius:'50%',background:h.color}}/>)}{dots.length>4&&<div style={{width:5,height:5,borderRadius:'50%',background:C.tx3}}/>}</div>}
          </div>);
        })}
      </div>
      {habits.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>{habits.map(h=><div key={h.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:C.tx2}}><div style={{width:7,height:7,borderRadius:'50%',background:h.color,flexShrink:0}}/>{h.name}</div>)}</div>}
    </div>);
  };

  const renderYear=()=>{
    const h=activeH;if(!h)return<div style={{textAlign:'center',padding:'20px 0',color:C.tx3,fontSize:12}}>Aucune habitude</div>;
    const logs=habitLogs[h.id]||[];const today=new Date();const todayISO=hISO(today);
    const totalDone=logs.filter(d=>d>=hISO(hAddDays(today,-364))).length;const streak=calcHabitStreak(logs);
    const MON=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const DL=['L','M','M','J','V','S','D'];
    // Build 12 mini-calendars: current month going back 11 months
    const months=Array.from({length:12},(_,i)=>{
      const d=new Date(today.getFullYear(),today.getMonth()-11+i,1);
      return{year:d.getFullYear(),month:d.getMonth()};
    });
    return(<div>
      {/* Dropdown sélecteur d'habitude */}
      {habits.length>0&&<div style={{position:'relative',marginBottom:16}}>
        <select value={selHabit||habits[0]?.id||''} onChange={e=>setSelHabit(e.target.value)}
          style={{width:'100%',padding:'10px 36px 10px 14px',borderRadius:4,border:`2px solid ${h.color}50`,background:C.s2,color:C.tx,fontSize:13,fontWeight:600,fontFamily:'inherit',outline:'none',cursor:'pointer',appearance:'none',WebkitAppearance:'none'}}>
          {habits.map(hb=><option key={hb.id} value={hb.id}>{hb.name}</option>)}
        </select>
        <div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:10,color:h.color,pointerEvents:'none'}}>▼</div>
      </div>}
      {/* Stats */}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <div style={{flex:1,background:C.s2,borderRadius:4,padding:'10px 0',textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:h.color}}>{totalDone}</div><div style={{fontSize:9,color:C.tx3}}>jours / an</div></div>
        <div style={{flex:1,background:C.s2,borderRadius:4,padding:'10px 0',textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:streak>0?h.color:C.tx3}}>{streak}</div><div style={{fontSize:9,color:C.tx3}}>streak actuel</div></div>
        <div style={{flex:1,background:C.s2,borderRadius:4,padding:'10px 0',textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:C.ac}}>{Math.round(totalDone/365*100)}%</div><div style={{fontSize:9,color:C.tx3}}>complétion</div></div>
      </div>
      <div style={{fontSize:11,fontWeight:600,color:streak>0?h.color:C.tx3,textAlign:'center',marginBottom:16}}>{streakMsg(streak)}</div>
      {/* Grille 12 mini-calendriers */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        {months.map(({year,month})=>{
          const fd=new Date(year,month,1);const dim=new Date(year,month+1,0).getDate();
          const startDow=(fd.getDay()+6)%7;
          const cells=[];for(let i=0;i<startDow;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);
          const monthDone=logs.filter(iso=>iso.startsWith(`${year}-${String(month+1).padStart(2,'0')}-`)).length;
          const pct=Math.round(monthDone/dim*100);
          const isCurMonth=year===today.getFullYear()&&month===today.getMonth();
          return(<div key={`${year}-${month}`} style={{background:C.s2,borderRadius:4,padding:'8px 6px',border:`1px solid ${isCurMonth?h.color+'50':C.brd}`}}>
            {/* En-tête mois */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5,paddingLeft:2,paddingRight:2}}>
              <div style={{fontSize:9,fontWeight:700,color:isCurMonth?h.color:C.tx2,textTransform:'uppercase',letterSpacing:'0.3px'}}>{MON[month]}</div>
              <div style={{fontSize:8,fontWeight:700,color:pct>0?h.color:C.tx3,padding:'1px 5px',borderRadius:4,background:pct>0?h.color+'18':'transparent'}}>{pct>0?pct+'%':''}</div>
            </div>
            {/* Jours header */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:3}}>
              {DL.map((l,i)=><div key={i} style={{textAlign:'center',fontSize:6,color:C.tx3,fontWeight:600}}>{l}</div>)}
            </div>
            {/* Jours */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1}}>
              {cells.map((day,i)=>{
                if(!day)return<div key={i}/>;
                const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const done=logs.includes(iso);const future=iso>todayISO;const isToday=iso===todayISO;
                return(<div key={i} style={{aspectRatio:'1',borderRadius:2,background:future?'transparent':done?h.color:C.bg,border:isToday?`1px solid ${h.color}`:done?'none':'none',opacity:future?0.15:1,transition:'background 0.15s'}}/>);
              })}
            </div>
          </div>);
        })}
      </div>
    </div>);
  };

  return(<div style={{background:C.s1,borderRadius:6,padding:'14px 16px',border:`1px solid ${C.brd}`,marginBottom:12}}>
    <div style={{fontSize:11,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:14}}>Tracker d'habitudes</div>
    {habits.length===0?(<div style={{textAlign:'center',padding:'20px 0',color:C.tx3,fontSize:12}}>Aucune habitude. Ajoute-en depuis l'onglet Accueil.</div>):(
      <>
        <div style={{display:'flex',gap:6,marginBottom:16}}>{[{k:'week',l:'Semaine'},{k:'month',l:'Mois'},{k:'year',l:'Année'}].map(t=><button key={t.k} onClick={()=>setHTab(t.k)} style={{flex:1,padding:'7px 0',borderRadius:4,border:'none',background:hTab===t.k?C.acS:C.s2,color:hTab===t.k?C.ac:C.tx3,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{t.l}</button>)}</div>
        {hTab==='week'&&renderWeek()}
        {hTab==='month'&&renderMonth()}
        {hTab==='year'&&renderYear()}
      </>
    )}
  </div>);
}

// ─────────────────────────────────────────────────────────────────────────────


export { HabitCreateModal, HabitDashboard, HabitTrackerProfile };
