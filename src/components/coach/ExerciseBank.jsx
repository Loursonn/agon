import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
import { MTREE, getMC, mL, ALL_MIDS, normPrimary } from "@/lib/muscles";
import { normalizeExName, normForMatch, fuzzyExMatch } from "@/lib/exercises";
import { EX_TYPES, exTypeLabel, exTypeColor } from "@/lib/exerciseTypes";
const parseYtId=v=>{const m=(v||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);return m?m[1]:v.trim();};
function ExerciseCreateModal({coachId,onSave,onClose}){
  const{profile}=useAuth();
  const isAdmin=profile?.is_admin===true;
  const[form,setForm]=useState({name:'',target:'Pecs',secondary:[],equipment:'Barre',difficulty:'Intermédiaire',ex_type:'muscu',is_compound:true,is_unilateral:false,youtube_id:'',instructions:'',tips:''});
  const[saving,setSaving]=useState(false);const[saveError,setSaveError]=useState('');
  const TARGETS=['Pecs','Dos-GD','Dos-Trap','Dos-Rhom','Ep-Ant','Ep-Lat','Ep-Post','Quads','Ischios','Fessiers','Adducteurs','Triceps','Biceps','Core','Mollets'];
  const EQUIPS=['Barre','Haltères','Cable','Machine','Poids de corps','Élastique','Kettlebell','Smith'];
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fS={padding:'9px 12px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:'inherit',width:'100%',boxSizing:'border-box',outline:'none'};
  const lS={fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5,display:'block'};
  const save=async()=>{
    if(!form.name.trim())return;setSaving(true);setSaveError('');
    const ytId=form.youtube_id?parseYtId(form.youtube_id):null;
    const{error}=await supabase.from('exercises').insert({...form,name:form.name.trim(),youtube_id:ytId||null,created_by:coachId,is_public:true,is_verified:isAdmin});
    setSaving(false);
    if(error){setSaveError(error.message||JSON.stringify(error));console.error('ExerciseCreateModal insert error:',error);}
    else onSave();
  };
  return(<div style={{position:'fixed',inset:0,zIndex:310,background:'rgba(0,0,0,0.88)',overflowY:'auto'}}>
    <div style={{padding:16,maxWidth:480,margin:'0 auto'}}>
      <div style={{background:C.s1,borderRadius:6,padding:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700}}>Nouvel exercice</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.tx3,fontSize:22,cursor:'pointer'}}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div><label style={lS}>Nom *</label><input value={form.name} onChange={e=>upd('name',e.target.value)} placeholder="Ex: Développé couché barre" style={fS}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={lS}>Muscle principal</label><select value={form.target} onChange={e=>upd('target',e.target.value)} style={fS}>{TARGETS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={lS}>Équipement</label><select value={form.equipment} onChange={e=>upd('equipment',e.target.value)} style={fS}>{EQUIPS.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={lS}>Difficulté</label><select value={form.difficulty} onChange={e=>upd('difficulty',e.target.value)} style={fS}>{['Débutant','Intermédiaire','Avancé'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div><label style={lS}>Type</label><select value={form.ex_type} onChange={e=>upd('ex_type',e.target.value)} style={fS}>{EX_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div style={{display:'flex',gap:16}}>
            <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:C.tx2}}><input type="checkbox" checked={form.is_compound} onChange={e=>upd('is_compound',e.target.checked)} style={{accentColor:C.ac}}/>Polyarticulaire</label>
            <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:C.tx2}}><input type="checkbox" checked={form.is_unilateral} onChange={e=>upd('is_unilateral',e.target.checked)} style={{accentColor:C.ac}}/>Unilatéral</label>
          </div>
          <div><label style={lS}>Lien YouTube (URL ou ID)</label><input value={form.youtube_id} onChange={e=>upd('youtube_id',e.target.value)} placeholder="https://youtube.com/watch?v=..." style={fS}/></div>
          <div><label style={lS}>Instructions</label><textarea value={form.instructions} onChange={e=>upd('instructions',e.target.value)} placeholder="Décris l'exécution technique..." rows={3} style={{...fS,resize:'vertical'}}/></div>
          <div><label style={lS}>Conseils</label><textarea value={form.tips} onChange={e=>upd('tips',e.target.value)} placeholder="Erreurs fréquentes, points clés..." rows={2} style={{...fS,resize:'vertical'}}/></div>
        </div>
        {saveError&&<div style={{background:C.rS,border:'1px solid '+C.r+'60',borderRadius:4,padding:'10px 14px',fontSize:12,color:C.r,marginTop:12}}>{saveError}</div>}
        <button onClick={save} disabled={saving||!form.name.trim()} style={{width:'100%',padding:'12px 0',borderRadius:6,border:'none',background:form.name.trim()?C.ac:'#333',color:'#fff',fontSize:14,fontWeight:700,cursor:form.name.trim()?'pointer':'default',fontFamily:'inherit',marginTop:16}}>{saving?'Enregistrement...':'Créer l\'exercice'}</button>
      </div>
    </div>
  </div>);
}

function MergeModal({source,onMerge,onClose}){
  const[search,setSearch]=useState('');const[results,setResults]=useState([]);const[target,setTarget]=useState(null);
  useEffect(()=>{
    if(search.length<2){setResults([]);return;}
    supabase.from('exercises').select('id,name,target,youtube_id').ilike('name',`%${search}%`).neq('id',source.id).limit(8).then(({data})=>setResults(data||[]));
  },[search]);
  return(<div style={{position:'fixed',inset:0,zIndex:320,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{background:C.s1,borderRadius:6,padding:20,width:'100%',maxWidth:400}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Fusionner avec...</div>
      <div style={{fontSize:11,color:C.tx3,marginBottom:14}}>"{source.name}" sera conservé, l'autre supprimé.</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher l'exercice doublon..." style={{width:'100%',padding:'9px 12px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:'inherit',boxSizing:'border-box',marginBottom:10,outline:'none'}}/>
      {results.map(r=>(<div key={r.id} onClick={()=>setTarget(r)} style={{padding:'10px 12px',borderRadius:4,border:'1px solid '+(target?.id===r.id?C.ac:C.brdL),background:target?.id===r.id?C.acS:C.s2,marginBottom:6,cursor:'pointer'}}>
        <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{r.name}</div>
        {r.target&&<div style={{fontSize:10,color:C.tx3}}>{r.target}</div>}
      </div>))}
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button onClick={onClose} style={{flex:1,padding:'10px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx2,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Annuler</button>
        <button onClick={()=>target&&onMerge(source.id,target.id)} disabled={!target} style={{flex:1,padding:'10px 0',borderRadius:4,border:'none',background:target?C.ac:'#444',color:'#fff',fontSize:12,fontWeight:700,cursor:target?'pointer':'default',fontFamily:'inherit'}}>Fusionner</button>
      </div>
    </div>
  </div>);
}

function ExerciseCharacteristicsPanel({ex,onSaved}){
  const TARGETS=['Pecs','Dos-GD','Dos-Trap','Dos-Rhom','Ep-Ant','Ep-Lat','Ep-Post','Quads','Ischios','Fessiers','Adducteurs','Triceps','Biceps','Core','Mollets'];
  const EQUIPS=['Barre','Haltères','Cable','Machine','Poids de corps','Élastique','Kettlebell','Smith'];
  const[form,setForm]=useState({
    ex_type:ex.ex_type||'muscu',
    target:ex.target||'',
    secondary:ex.secondary||[],
    equipment:ex.equipment||'',
    difficulty:ex.difficulty||'',
    is_compound:ex.is_compound??false,
    is_unilateral:ex.is_unilateral??false,
  });
  const[saving,setSaving]=useState(false);const[msg,setMsg]=useState('');
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const toggleSec=m=>upd('secondary',form.secondary.includes(m)?form.secondary.filter(x=>x!==m):[...form.secondary,m]);
  const fS={padding:'8px 10px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:'inherit',width:'100%',boxSizing:'border-box',outline:'none'};
  const lS={fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4,display:'block'};
  const save=async()=>{
    setSaving(true);setMsg('');
    const{error}=await supabase.from('exercises').update({
      ex_type:form.ex_type||null,
      target:form.target||null,
      secondary:form.secondary,
      equipment:form.equipment||null,
      difficulty:form.difficulty||null,
      is_compound:form.is_compound,
      is_unilateral:form.is_unilateral,
    }).eq('id',ex.id);
    setSaving(false);
    if(error){setMsg('Erreur : '+error.message);}
    else{setMsg('Caractéristiques enregistrées');onSaved();setTimeout(()=>setMsg(''),2500);}
  };
  return(<div style={{background:C.s2,borderRadius:6,padding:'12px 14px',marginBottom:12,border:'1px solid '+C.brdL}}>
    <div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Caractéristiques de tri</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
      <div><label style={lS}>Type</label><select value={form.ex_type} onChange={e=>upd('ex_type',e.target.value)} style={fS}>{EX_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      <div><label style={lS}>Muscle principal</label><select value={form.target} onChange={e=>upd('target',e.target.value)} style={fS}><option value=''>—</option>{TARGETS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      <div><label style={lS}>Équipement</label><select value={form.equipment} onChange={e=>upd('equipment',e.target.value)} style={fS}><option value=''>—</option>{EQUIPS.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
      <div><label style={lS}>Difficulté</label><select value={form.difficulty} onChange={e=>upd('difficulty',e.target.value)} style={fS}><option value=''>—</option>{['Débutant','Intermédiaire','Avancé'].map(d=><option key={d} value={d}>{d}</option>)}</select></div>
    </div>
    <div style={{marginBottom:10}}>
      <label style={lS}>Muscles secondaires</label>
      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
        {TARGETS.map(m=>{const on=form.secondary.includes(m);return(<button key={m} onClick={()=>toggleSec(m)} style={{padding:'3px 9px',borderRadius:6,border:'1px solid '+(on?C.ac:C.brdL),background:on?C.ac:'transparent',color:on?'#fff':C.tx2,fontSize:10,fontWeight:on?700:400,cursor:'pointer',fontFamily:'inherit'}}>{m}</button>);})}
      </div>
    </div>
    <div style={{display:'flex',gap:16,marginBottom:12}}>
      <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:C.tx2}}><input type="checkbox" checked={form.is_compound} onChange={e=>upd('is_compound',e.target.checked)} style={{accentColor:C.ac}}/>Polyarticulaire</label>
      <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:C.tx2}}><input type="checkbox" checked={form.is_unilateral} onChange={e=>upd('is_unilateral',e.target.checked)} style={{accentColor:C.ac}}/>Unilatéral</label>
    </div>
    {msg&&<div style={{fontSize:11,fontWeight:600,color:msg.startsWith('Erreur')?C.r:C.g,marginBottom:8}}>{msg}</div>}
    <button onClick={save} disabled={saving} style={{width:'100%',padding:'9px 0',borderRadius:4,border:'none',background:C.ac,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:saving?0.7:1}}>{saving?'Enregistrement…':'Enregistrer les caractéristiques'}</button>
  </div>);
}

function ExerciseDetailModal({ex,coachId,onClose,onAdd,onDelete,onMergeClick,onRefresh}){
  const{profile}=useAuth();
  const isAdmin=profile?.is_admin===true;
  const isCertified=profile?.is_certified_coach===true||isAdmin;
  const isOwner=!ex.created_by||ex.created_by===coachId;
  const[showEdit,setShowEdit]=useState(false);
  const[promoting,setPromoting]=useState(false);
  const promote=async()=>{setPromoting(true);await supabase.from('exercises').update({is_verified:true}).eq('id',ex.id);setPromoting(false);onRefresh();onClose();};
  const[localYtId,setLocalYtId]=useState(ex.youtube_id||'');
  const[ytInput,setYtInput]=useState(ex.youtube_id||'');
  const[ytSaving,setYtSaving]=useState(false);
  const[ytMsg,setYtMsg]=useState('');
  const saveVideo=async(overrideId)=>{
    setYtSaving(true);setYtMsg('');
    const raw=overrideId!==undefined?overrideId:ytInput.trim();
    const id=raw?parseYtId(raw):null;
    const{error}=await supabase.from('exercises').update({youtube_id:id??null}).eq('id',ex.id);
    setYtSaving(false);
    if(error){setYtMsg('Erreur: '+error.message);}
    else{setLocalYtId(id||'');setYtInput(id||'');setYtMsg(id?'Vidéo ajoutée !':'Vidéo supprimée');onRefresh();setTimeout(()=>setYtMsg(''),2500);}
  };
  return(<div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.88)',overflowY:'auto'}} onClick={onClose}>
    <div style={{minHeight:'100%',display:'flex',alignItems:'flex-end'}} onClick={e=>e.stopPropagation()}>
      <div style={{width:'100%',background:C.s1,borderRadius:'6px 6px 0 0',maxHeight:'92vh',overflowY:'auto',paddingBottom:40}}>
        {localYtId&&<div style={{width:'100%',maxWidth:420,margin:'0 auto',background:'#000',aspectRatio:'16/9'}}><iframe src={`https://www.youtube.com/embed/${localYtId}?rel=0`} style={{width:'100%',height:'100%',border:'none'}} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen/></div>}
        {!localYtId&&ex.image_url&&<img src={ex.image_url} style={{width:'100%',maxWidth:420,margin:'0 auto',aspectRatio:'16/9',objectFit:'cover',display:'block'}} alt={ex.name}/>}
        {!localYtId&&!ex.image_url&&<div style={{width:'100%',aspectRatio:'16/9',background:C.s2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:C.tx3}}>Exercice</div>}
        <div style={{padding:'16px 16px 0'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
            <div style={{flex:1,marginRight:10}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                {ex.is_verified?<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:C.gS,color:C.g,fontWeight:700}}>✓ Officiel</span>:<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:C.oS,color:C.o,fontWeight:600}}>Communauté</span>}
                {ex.difficulty&&<span style={{fontSize:10,color:C.tx3}}>{ex.difficulty}</span>}
              </div>
              <div style={{fontSize:18,fontWeight:800,lineHeight:1.2}}>{ex.name}</div>
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',color:C.tx3,fontSize:24,cursor:'pointer',flexShrink:0,padding:0}}>×</button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {ex.target&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:C.acS,color:C.ac,fontWeight:600}}>{ex.target}</span>}
            {(ex.secondary||[]).map(m=><span key={m} style={{fontSize:11,padding:'3px 10px',borderRadius:6,background:C.s2,color:C.tx3}}>{m}</span>)}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
            {ex.ex_type&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:exTypeColor(ex.ex_type)+'20',color:exTypeColor(ex.ex_type),fontWeight:700}}>{exTypeLabel(ex.ex_type)}</span>}
            {ex.equipment&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:C.s2,color:C.tx2}}>{ex.equipment}</span>}
            {ex.is_compound!=null&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:C.s2,color:C.tx2}}>{ex.is_compound?'Polyarticulaire':'Monoarticulaire'}</span>}
            {ex.is_unilateral&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:5,background:C.s2,color:C.tx2}}>Unilatéral</span>}
          </div>
          {(isOwner||isCertified)&&<button onClick={()=>setShowEdit(v=>!v)} style={{width:'100%',padding:'8px 0',borderRadius:4,border:'1px solid '+C.brdL,background:showEdit?C.s2:'transparent',color:C.tx2,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:10}}>{showEdit?'Fermer l\'édition':'Modifier les caractéristiques'}</button>}
          {(isOwner||isCertified)&&showEdit&&<ExerciseCharacteristicsPanel ex={ex} onSaved={onRefresh}/>}
          {ex.instructions&&<div style={{marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Instructions</div><div style={{fontSize:12,color:C.tx2,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{ex.instructions}</div></div>}
          {ex.tips&&<div style={{marginBottom:16,padding:'10px 12px',borderRadius:4,background:C.oS,border:'1px solid '+C.o+'30'}}><div style={{fontSize:10,fontWeight:700,color:C.o,marginBottom:4}}>Conseils</div><div style={{fontSize:12,color:C.tx2,lineHeight:1.6}}>{ex.tips}</div></div>}
          <button onClick={onAdd} style={{width:'100%',padding:'12px 0',borderRadius:6,border:'none',background:C.ac,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:8}}>+ Ajouter à mes exercices</button>
          {isAdmin&&!ex.is_verified&&<button onClick={promote} disabled={promoting} style={{width:'100%',padding:'9px 0',borderRadius:4,border:'1px solid '+C.g+'50',background:C.gS,color:C.g,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:8}}>{promoting?'En cours...':'✓ Promouvoir en Officiel'}</button>}
          {(isOwner||isAdmin)&&<div style={{marginBottom:8}}>
            {!localYtId?(<div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input value={ytInput} onChange={e=>setYtInput(e.target.value)} placeholder="Lien YouTube (vidéo, Short, live…)" style={{flex:1,padding:'9px 12px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontFamily:'inherit',outline:'none'}}/>
              <button onClick={()=>saveVideo()} disabled={ytSaving||!ytInput.trim()} style={{padding:'9px 16px',borderRadius:4,border:'none',background:ytInput.trim()?C.ac:C.s2,color:ytInput.trim()?'#fff':C.tx3,fontSize:13,fontWeight:700,cursor:ytInput.trim()?'pointer':'default',fontFamily:'inherit',flexShrink:0,opacity:ytSaving?0.7:1}}>{ytSaving?'...':'+ Vidéo'}</button>
            </div>):(<div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:4,background:C.s2,border:'1px solid '+C.brdL}}>
              <span style={{fontSize:12,color:C.tx2,flex:1,fontFamily:'monospace'}}>{localYtId}</span>
              <button onClick={()=>saveVideo('')} disabled={ytSaving} style={{padding:'5px 12px',borderRadius:4,border:'1px solid '+C.r+'50',background:C.rS,color:C.r,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>{ytSaving?'...':'Supprimer vidéo'}</button>
            </div>)}
            {ytMsg&&<div style={{marginTop:5,fontSize:11,color:ytMsg.startsWith('Erreur')?C.r:C.g,fontWeight:600}}>{ytMsg}</div>}
          </div>}
          {(isOwner||isAdmin)&&<div style={{display:'flex',gap:8}}>
            <button onClick={onMergeClick} style={{flex:1,padding:'9px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx2,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Fusionner</button>
            <button onClick={onDelete} style={{flex:1,padding:'9px 0',borderRadius:4,border:'1px solid '+C.r+'50',background:C.rS,color:C.r,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Supprimer</button>
          </div>}
        </div>
      </div>
    </div>
  </div>);
}

function ExerciseBank({coachId,onAddToExos}){
  const{user,profile}=useAuth();
  const myId=user?.id||coachId;
  const canQuickType=ex=>profile?.is_admin===true||profile?.is_certified_coach===true||!ex.created_by||ex.created_by===myId;
  const PAGE=20;
  const[exList,setExList]=useState([]);const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');const[page,setPage]=useState(0);const[total,setTotal]=useState(0);
  const[fMuscles,setFMuscles]=useState([]);const[fEquip,setFEquip]=useState('');const[fDiff,setFDiff]=useState('');const[fType,setFType]=useState('');
  const[showMusclePanel,setShowMusclePanel]=useState(false);
  const[sel,setSel]=useState(null);const[showCreate,setShowCreate]=useState(false);
  const[showMerge,setShowMerge]=useState(false);const[confirmDel,setConfirmDel]=useState(null);
  const[typeMenu,setTypeMenu]=useState(null);
  const quickSetType=async(ex,t)=>{
    setTypeMenu(null);
    const{error}=await supabase.from('exercises').update({ex_type:t}).eq('id',ex.id);
    if(error){alert('Erreur : '+error.message);return;}
    setExList(prev=>prev.map(e=>e.id===ex.id?{...e,ex_type:t}:e));
  };
  const TARGETS=['Pecs','Dos-GD','Dos-Trap','Dos-Rhom','Ep-Ant','Ep-Lat','Ep-Post','Quads','Ischios','Fessiers','Adducteurs','Triceps','Biceps','Core','Mollets'];
  const EQUIPS=['Barre','Haltères','Cable','Machine','Poids de corps','Élastique','Kettlebell','Smith'];
  const toggleMuscle=m=>{setFMuscles(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m]);setPage(0);};
  useEffect(()=>{loadEx();},[search,fMuscles,fEquip,fDiff,fType,page]);
  const loadEx=async()=>{
    setLoading(true);
    let q=supabase.from('exercises').select('*',{count:'exact'}).order('name').range(page*PAGE,(page+1)*PAGE-1);
    if(search)q=q.ilike('name',`%${search}%`);
    if(fMuscles.length>0){const orParts=fMuscles.flatMap(m=>[`target.eq.${m}`,`secondary.cs.{${m}}`]);q=q.or(orParts.join(','));}
    if(fEquip)q=q.eq('equipment',fEquip);
    if(fDiff)q=q.eq('difficulty',fDiff);
    if(fType)q=q.eq('ex_type',fType);
    const{data,count}=await q;
    setExList(data||[]);setTotal(count||0);setLoading(false);
  };
  const deleteEx=async(id)=>{const{error}=await supabase.from('exercises').delete().eq('id',id);if(error){alert('Erreur suppression : '+error.message);return;}setConfirmDel(null);setSel(null);loadEx();};
  const mergeEx=async(keepId,delId)=>{
    const keep=exList.find(e=>e.id===keepId)||sel;
    const del=exList.find(e=>e.id===delId);
    if(keep&&del){
      const upd={};
      if(!keep.youtube_id&&del.youtube_id)upd.youtube_id=del.youtube_id;
      if(!keep.image_url&&del.image_url)upd.image_url=del.image_url;
      if(!keep.instructions&&del.instructions)upd.instructions=del.instructions;
      if(!keep.tips&&del.tips)upd.tips=del.tips;
      if(Object.keys(upd).length)await supabase.from('exercises').update(upd).eq('id',keepId);
    }
    await supabase.from('exercises').delete().eq('id',delId);
    setShowMerge(false);setSel(null);loadEx();
  };
  const hasFilter=fMuscles.length>0||fEquip||fDiff||fType;
  return(<div style={{padding:'0 0 60px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
      <div><div style={{fontSize:16,fontWeight:700}}>Banque d'exercices</div><div style={{fontSize:11,color:C.tx3}}>{total} exercice{total>1?'s':''}</div></div>
      <button onClick={()=>setShowCreate(true)} style={{padding:'7px 14px',borderRadius:4,border:'none',background:C.ac,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Créer</button>
    </div>
    <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Rechercher un exercice..." style={{width:'100%',padding:'10px 14px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s1,color:C.tx,fontSize:13,fontFamily:'inherit',boxSizing:'border-box',marginBottom:10,outline:'none'}}/>
    <div style={{display:'flex',gap:6,marginBottom:fMuscles.length>0?8:14,overflowX:'auto',paddingBottom:4}}>
      <button onClick={()=>setShowMusclePanel(v=>!v)} style={{flexShrink:0,padding:'5px 10px',borderRadius:4,border:'1px solid '+(fMuscles.length>0?C.ac:C.brdL),background:fMuscles.length>0?C.acS:C.s1,color:fMuscles.length>0?C.ac:C.tx3,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>
        Muscles{fMuscles.length>0&&<span style={{background:C.ac,color:'#fff',borderRadius:4,padding:'1px 6px',fontSize:10,fontWeight:700}}>{fMuscles.length}</span>}
      </button>
      {[{l:'Équip.',v:fEquip,s:setFEquip,o:EQUIPS.map(e=>({value:e,label:e}))},{l:'Niveau',v:fDiff,s:setFDiff,o:['Débutant','Intermédiaire','Avancé'].map(d=>({value:d,label:d}))},{l:'Type',v:fType,s:setFType,o:EX_TYPES}].map(({l,v,s,o})=>(
        <select key={l} value={v} onChange={e=>{s(e.target.value);setPage(0);}} style={{flexShrink:0,padding:'5px 8px',borderRadius:4,border:'1px solid '+(v?C.ac:C.brdL),background:v?C.acS:C.s1,color:v?C.ac:C.tx3,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',outline:'none'}}>
          <option value=''>{l}</option>{o.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      ))}
      {hasFilter&&<button onClick={()=>{setFMuscles([]);setFEquip('');setFDiff('');setFType('');}} style={{flexShrink:0,padding:'5px 10px',borderRadius:4,border:'1px solid '+C.r+'50',background:C.rS,color:C.r,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>✕</button>}
    </div>
    {showMusclePanel&&<div style={{background:C.s1,borderRadius:6,padding:'10px 12px',marginBottom:10,border:'1px solid '+C.brdL}}>
      <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Principal ou secondaire</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
        {TARGETS.map(m=>{const on=fMuscles.includes(m);return(<button key={m} onClick={()=>toggleMuscle(m)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+(on?C.ac:C.brdL),background:on?C.ac:'transparent',color:on?'#fff':C.tx2,fontSize:11,fontWeight:on?700:400,cursor:'pointer',fontFamily:'inherit'}}>{m}</button>);})}
      </div>
    </div>}
    {fMuscles.length>0&&<div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
      {fMuscles.map(m=><span key={m} onClick={()=>toggleMuscle(m)} style={{padding:'3px 10px',borderRadius:6,background:C.acS,border:'1px solid '+C.ac+'60',color:C.ac,fontSize:11,fontWeight:600,cursor:'pointer'}}>
        {m} ×
      </span>)}
    </div>}
    {loading?<div style={{textAlign:'center',padding:'40px 0',color:C.tx3,fontSize:13}}>Chargement...</div>:(
      <>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {exList.map(ex=>(
            <div key={ex.id} onClick={()=>{setTypeMenu(null);setSel(ex);}} style={{background:C.s1,borderRadius:6,border:'1px solid '+C.brd,cursor:'pointer',position:'relative'}}>
              <div style={{width:'100%',height:90,background:C.s2,position:'relative',overflow:'hidden',borderRadius:'6px 6px 0 0'}}>
                {ex.youtube_id?<img src={`https://img.youtube.com/vi/${ex.youtube_id}/mqdefault.jpg`} style={{width:'100%',height:'100%',objectFit:'cover'}} alt={ex.name}/>:ex.image_url?<img src={ex.image_url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt={ex.name}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:C.tx3,fontSize:11}}>Exercice</div>}
                {ex.youtube_id&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:30,height:30,borderRadius:'50%',background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#fff'}}>▶</div></div>}
                <div style={{position:'absolute',top:4,left:4,padding:'2px 6px',borderRadius:5,background:'rgba(0,0,0,0.72)',fontSize:9,color:ex.is_verified?C.g:C.o,fontWeight:700}}>{ex.is_verified?'✓ Off.':'Comm.'}</div>
              </div>
              <div style={{padding:'8px 10px'}}>
                <div style={{fontSize:12,fontWeight:700,color:C.tx,marginBottom:2,lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{ex.name}</div>
                {ex.youtube_id&&<a href={`https://youtube.com/watch?v=${ex.youtube_id}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:'#E5484D',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:3,marginBottom:3}}>▶ Voir la vidéo</a>}
                <div style={{display:'flex',gap:4,flexWrap:'wrap',paddingRight:70,minHeight:18}}>
                  {ex.target&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:C.acS,color:C.ac,fontWeight:600}}>{ex.target}</span>}
                  {ex.equipment&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:C.s2,color:C.tx3}}>{ex.equipment}</span>}
                </div>
              </div>
              {/* Ruban type — bas droite, clic = changement rapide */}
              <span
                onClick={e=>{e.stopPropagation();if(canQuickType(ex))setTypeMenu(typeMenu===ex.id?null:ex.id);}}
                title={canQuickType(ex)?'Cliquer pour changer le type':exTypeLabel(ex.ex_type)}
                style={{position:'absolute',right:0,bottom:8,padding:'3px 8px 3px 10px',borderRadius:'4px 0 0 8px',background:ex.ex_type?exTypeColor(ex.ex_type):C.s2,color:ex.ex_type?'#fff':C.tx3,fontSize:9,fontWeight:800,letterSpacing:'0.02em',cursor:canQuickType(ex)?'pointer':'default',whiteSpace:'nowrap'}}
              >{ex.ex_type?exTypeLabel(ex.ex_type):'Type ?'}</span>
              {typeMenu===ex.id&&(
                <div onClick={e=>e.stopPropagation()} style={{position:'absolute',right:6,bottom:30,zIndex:60,background:C.s1,border:'1px solid '+C.brdL,borderRadius:4,overflow:'hidden',minWidth:150}}>
                  {EX_TYPES.map(t=>{const on=ex.ex_type===t.value;return(
                    <button key={t.value} onClick={()=>quickSetType(ex,t.value)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'8px 12px',border:'none',background:on?C.s2:'transparent',color:on?exTypeColor(t.value):C.tx,fontSize:12,fontWeight:on?700:400,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
                      onMouseEnter={e=>(e.currentTarget.style.background=C.s2)} onMouseLeave={e=>(e.currentTarget.style.background=on?C.s2:'transparent')}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:exTypeColor(t.value),flexShrink:0}}/>
                      {t.label}
                    </button>
                  );})}
                </div>
              )}
            </div>
          ))}
        </div>
        {total>PAGE&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginTop:16}}>
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{padding:'6px 14px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s1,color:page===0?C.tx3:C.tx,cursor:page===0?'default':'pointer',fontFamily:'inherit',fontSize:12}}>←</button>
          <span style={{fontSize:12,color:C.tx3}}>{page+1} / {Math.ceil(total/PAGE)}</span>
          <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*PAGE>=total} style={{padding:'6px 14px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s1,color:(page+1)*PAGE>=total?C.tx3:C.tx,cursor:(page+1)*PAGE>=total?'default':'pointer',fontFamily:'inherit',fontSize:12}}>→</button>
        </div>}
      </>
    )}
    {sel&&!showMerge&&<ExerciseDetailModal ex={sel} coachId={myId} onClose={()=>setSel(null)} onAdd={()=>{onAddToExos(sel);setSel(null);}} onDelete={()=>setConfirmDel(sel.id)} onMergeClick={()=>setShowMerge(true)} onRefresh={()=>{loadEx();setSel(null);}}/>}
    {sel&&showMerge&&<MergeModal source={sel} onMerge={mergeEx} onClose={()=>setShowMerge(false)}/>}
    {confirmDel&&<div style={{position:'fixed',inset:0,zIndex:320,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:C.s1,borderRadius:6,padding:20,width:'100%',maxWidth:320}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Supprimer cet exercice ?</div>
        <div style={{fontSize:12,color:C.tx3,marginBottom:16}}>Cette action est irréversible.</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setConfirmDel(null)} style={{flex:1,padding:'10px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx2,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Annuler</button>
          <button onClick={()=>deleteEx(confirmDel)} style={{flex:1,padding:'10px 0',borderRadius:4,border:'none',background:C.r,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Supprimer</button>
        </div>
      </div>
    </div>}
    {showCreate&&<ExerciseCreateModal coachId={myId} onSave={()=>{setShowCreate(false);loadEx();}} onClose={()=>setShowCreate(false)}/>}
  </div>);
}

// ─────────────────────────────────────────────────────────────────────────────

// ── HABIT TRACKER COMPONENTS ─────────────────────────────────────────────────


export { ExerciseCreateModal, MergeModal, ExerciseDetailModal, ExerciseBank };
