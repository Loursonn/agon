import { useState, useEffect, useRef, lazy, Suspense } from "react";
const MethodPickerDialog = lazy(() => import("@/features/coach/components/library/MethodPickerDialog").then(m => ({ default: m.MethodPickerDialog })));
import { methodConfigToWeekFields } from "@/features/coach/components/library/MethodPreview";
import { usePRsByRef } from "@/features/shared/hooks/usePRLogs";
import { effectiveRmRef } from "@/features/shared/hooks/useAutoComputePRs";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import { C, BT, BLOC_COLORS } from "@/lib/theme";
import { RIR_OPTS, rL, rC, parseReps, e1rm, roundHalf, normalizeExName, normForMatch, fuzzyExMatch, DEF_METHODS, MDEF, BLOC_METHODS, clusterReps, fmtMR, generateRows, EX_TIER, DEF_TIER_CONFIG, BLOC_TO_TIER, getExTier } from "@/lib/exercises";
import { MTREE, ML, getMC, mL, ALL_MIDS, normPrimary, getSessionBlocs } from "@/lib/muscles";
import RIRPicker from "@/components/ui/RIRPicker";

function MuscleSelector({value,onChange,multi}){
  const vals=multi?normPrimary(value):[];
  const isOn=id=>multi?vals.includes(id):value===id;
  const toggle=id=>{if(multi){onChange(vals.includes(id)?vals.filter(v=>v!==id):[...vals,id]);}else{onChange(id);}};
  const[expanded,setExpanded]=useState({});const tog=id=>setExpanded(p=>({...p,[id]:!p[id]}));
  return(<div style={{display:"flex",flexWrap:"wrap",gap:4}}>{MTREE.map(g=>{const isGroup=g.s.length>0,isActive=isOn(g.id),hasSub=isGroup&&g.s.some(s=>isOn(s.id));const c=getMC(g.id);return(<div key={g.id} style={{marginBottom:(isGroup&&expanded[g.id])?0:4}}><div style={{display:"flex",gap:2,alignItems:"center"}}><button onClick={()=>toggle(g.id)} style={{padding:"5px 10px",borderRadius:7,border:"1.5px solid "+((isActive||hasSub)?c:C.brdL),background:(isActive||hasSub)?c+"20":"transparent",color:(isActive||hasSub)?c:C.tx3,fontSize:11,fontWeight:(isActive||hasSub)?700:400,cursor:"pointer",fontFamily:"inherit"}}>{mL(g.id)}</button>{isGroup&&<button onClick={()=>tog(g.id)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:9,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>{expanded[g.id]?"▲":"▼"}</button>}</div>{isGroup&&expanded[g.id]&&(<div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"4px 0 4px 8px",borderLeft:"2px solid "+c+"40",marginLeft:4,marginBottom:4}}>{g.s.map(s=>(<button key={s.id} onClick={()=>toggle(s.id)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+(isOn(s.id)?c:C.brdL),background:isOn(s.id)?c+"20":"transparent",color:isOn(s.id)?c:C.tx3,fontSize:10,fontWeight:isOn(s.id)?700:400,cursor:"pointer",fontFamily:"inherit"}}>{mL(s.id)}</button>))}</div>)}</div>);})}</div>);
}

function MethodParamsForm({method,params,onChange,exosInSession,currentExId,plannedKg}){
  if(!method||!MDEF[method])return null;const p=params||MDEF[method];const upd=(k,v)=>onChange({...p,[k]:v});
  const row=(label,key,min,max,step)=>(<div key={key}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>{label}</div><div style={{display:"flex",alignItems:"center",gap:4}}><button onClick={()=>upd(key,Math.max(min,+(p[key]||0)-(step||1)))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>-</button><div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:700,color:C.tx}}>{p[key]||0}</div><button onClick={()=>upd(key,Math.min(max,+(p[key]||0)+(step||1)))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button></div></div>);
  const mc=DEF_METHODS[method]?.c||C.ac;
  return(<div style={{marginTop:10,padding:"12px",borderRadius:4,background:C.s2,border:"1px solid "+mc+"40"}}>
    <div style={{fontSize:10,fontWeight:600,color:mc,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>{DEF_METHODS[method]?.label} - Parametres</div>
    {method==="dropset"&&(()=>{const nD=p.drops||2;const pct=p.pct||20;const autoW=i=>plannedKg?Math.round(plannedKg*Math.pow(1-pct/100,i+1)/2.5)*2.5:null;const dw=i=>p.dropWeights?.[i]??autoW(i);const updNCl=(n)=>{const newW=plannedKg?Array.from({length:n},(_,i)=>dw(i)):undefined;onChange({...p,drops:n,...(newW?{dropWeights:newW}:{})});};const updPct=(v)=>{const newW=plannedKg?Array.from({length:nD},(_,i)=>Math.round(plannedKg*Math.pow(1-v/100,i+1)/2.5)*2.5):undefined;onChange({...p,pct:v,...(newW?{dropWeights:newW}:{})});};const updDW=(i,v)=>{const arr=Array.from({length:nD},(_,j)=>dw(j));arr[i]=v;onChange({...p,dropWeights:arr});};return(<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:plannedKg?10:0}}><div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Nb drops</div><div style={{display:"flex",alignItems:"center",gap:4}}><button onClick={()=>updNCl(Math.max(1,nD-1))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>-</button><div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:700,color:C.tx}}>{nD}</div><button onClick={()=>updNCl(Math.min(6,nD+1))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button></div></div><div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Réduction %</div><div style={{display:"flex",alignItems:"center",gap:4}}><button onClick={()=>updPct(Math.max(5,pct-5))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>-</button><div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:700,color:C.tx}}>{pct}%</div><button onClick={()=>updPct(Math.min(50,pct+5))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button></div></div></div>{plannedKg&&<div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:6}}>Charges par drop</div><div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}><div style={{textAlign:"center",padding:"4px 8px",borderRadius:6,background:C.s1,fontSize:12,fontWeight:700,color:C.tx}}>{plannedKg}<span style={{fontSize:9,color:C.tx3}}> kg</span></div>{Array.from({length:nD},(_,i)=>{const w=dw(i);return(<div key={i} style={{display:"flex",alignItems:"center",gap:4}}><span style={{color:C.tx3,fontSize:12}}>→</span><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><div style={{fontSize:9,color:C.o}}>Drop {i+1}</div><div style={{display:"flex",alignItems:"center",gap:2}}><button onClick={()=>updDW(i,Math.max(0,Math.round(((w||0)-2.5)/2.5)*2.5))} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:10,flexShrink:0}}>-</button><div style={{width:36,textAlign:"center",fontSize:12,fontWeight:700,color:C.o}}>{w??"-"}</div><button onClick={()=>updDW(i,Math.round(((w||0)+2.5)/2.5)*2.5)} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:10,flexShrink:0}}>+</button></div></div></div>);})}</div></div>}</div>);})()}
    {method==="myoreps"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{row("Reps activ.","activation",5,25)}{row("Nb mini-sets","minisets",2,10)}{row("Reps/mini","reps_mini",2,10)}{row("Pause (s)","pause",3,30)}</div>}
    {method==="restpause"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{row("Nb rounds","rounds",2,6)}{row("Pause (s)","pause",5,60,5)}</div>}
    {method==="cluster"&&(()=>{const ra=clusterReps(p);const nCl=p.clusters||3;const updRep=(i,v)=>{const nr=[...ra];nr[i]=v;onChange({...p,reps:nr});};const updNCl=(n)=>{const nr=n>ra.length?[...ra,...Array(n-ra.length).fill(ra[ra.length-1]||2)]:ra.slice(0,n);onChange({...p,clusters:n,reps:nr});};return(<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}><div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Nb clusters</div><div style={{display:"flex",alignItems:"center",gap:4}}><button onClick={()=>updNCl(Math.max(2,nCl-1))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>-</button><div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:700,color:C.tx}}>{nCl}</div><button onClick={()=>updNCl(Math.min(8,nCl+1))} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button></div></div>{row("Pause (s)","pause",5,30,5)}</div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:6}}>Reps par cluster</div><div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>{ra.map((v,i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1,minWidth:32}}><div style={{fontSize:9,color:C.tx3}}>C{i+1}</div><div style={{display:"flex",alignItems:"center",gap:2}}><button onClick={()=>updRep(i,Math.max(1,v-1))} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:10,flexShrink:0}}>-</button><div style={{width:22,textAlign:"center",fontSize:13,fontWeight:700,color:mc}}>{v}</div><button onClick={()=>updRep(i,Math.min(10,v+1))} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit",fontSize:10,flexShrink:0}}>+</button></div></div>))}</div><div style={{padding:"6px 10px",borderRadius:6,background:C.s1,fontSize:12,fontWeight:700,color:mc,textAlign:"center",letterSpacing:"1px"}}>{ra.join("+")} <span style={{fontSize:10,fontWeight:400,color:C.tx3}}>({p.pause||10}s repos)</span></div></div>);})()}
    {method==="amrap"&&<div><div style={{display:"flex",gap:6,marginBottom:8}}>{["failure","timed"].map(t=><button key={t} onClick={()=>upd("type",t)} style={{flex:1,padding:"6px 0",borderRadius:7,border:"1px solid "+(p.type===t?C.b:C.brdL),background:p.type===t?C.bS:"transparent",color:p.type===t?C.b:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{t==="failure"?"A l echec":"Chrono"}</button>)}</div>{p.type==="timed"&&row("Duree (s)","duration",10,300,5)}</div>}
    {method==="isometrique"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {row("Maintien (s)","hold_sec",1,600,1)}
      <div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Nb positions</div><input type="number" min="1" value={p.positions||2} onChange={e=>upd("positions",Math.max(1,parseInt(e.target.value)||1))} style={{width:"100%",padding:"7px 4px",borderRadius:6,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:14,fontWeight:700,textAlign:"center",fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/></div>
    </div>}
    <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:C.s1,fontSize:10,color:mc}}>
      {method==="dropset"&&(p.drops||2)+" drops, -"+(p.pct||20)+"%"}
      {method==="myoreps"&&(p.activation||12)+" reps + "+(p.minisets||4)+"x"+(p.reps_mini||5)+" ("+(p.pause||5)+"s)"}
      {method==="restpause"&&(p.rounds||3)+" rounds, "+(p.pause||15)+"s"}
      {method==="cluster"&&clusterReps(p).join("+")+", "+(p.pause||10)+"s"}
      {method==="amrap"&&(p.type==="timed"?"Chrono: "+(p.duration||30)+"s":"A l echec")}
      {method==="isometrique"&&(p.positions||2)+"x"+(p.hold_sec||30)+"s"}
    </div>
  </div>);
}

function AIGeneratorModal({onGenerate,onClose,allMethods,existingExos,sessions:SESSIONS}){
  const[loading,setLoading]=useState(false);const[error,setError]=useState(null);
  const[step,setStep]=useState(0); // 0=form, 1=preview
  const[preview,setPreview]=useState(null);
  const[form,setForm]=useState({goal:"Hypertrophie",level:"Intermediaire",sessionsPerWeek:6,focus:"",constraints:"",weeks:6,style:"Mixte force/volume"});
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const GOALS=["Hypertrophie","Force pure","Mixte force/volume","Perte de gras + maintien","Remise en forme"];
  const LEVELS=["Debutant","Intermediaire","Avance","Elite"];
  const STYLES=["Mixte force/volume","Push/Pull/Legs","Full body","Upper/Lower","Specialisation"];
  const[aiTab,setAiTab]=useState("import");
  const[importText,setImportText]=useState("");
  const[importFiles,setImportFiles]=useState([]);// [{name,mimeType,data,preview,sessionTags}]
  const importTargetRef=useRef([]);// sessions ciblées — ref pour éviter problèmes d'async state
  const fileRef=useRef(null);
  // Chat IA conversationnel
  const[convMsgs,setConvMsgs]=useState([]);// [{role:"user"|"ai", content:string}]
  const[convInput,setConvInput]=useState("");
  const[convProgram,setConvProgram]=useState(null);// dernier programme généré
  const[convLoading,setConvLoading]=useState(false);
  const[convError,setConvError]=useState(null);
  const[convCooldown,setConvCooldown]=useState(0);// secondes restantes avant prochain envoi
  const convEndRef=useRef(null);
  useEffect(()=>{
    if(convCooldown<=0)return;
    const t=setTimeout(()=>setConvCooldown(c=>Math.max(0,c-1)),1000);
    return()=>clearTimeout(t);
  },[convCooldown]);
  const handleFilesUpload=(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length)return;
    files.forEach(file=>{
      const ext=file.name.split(".").pop().toLowerCase();
      const isExcel=["xlsx","xls","csv","ods"].includes(ext);
      if(isExcel){
        // Excel/CSV → convertir en texte via SheetJS puis envoyer comme texte
        const reader=new FileReader();
        reader.onload=ev=>{
          try{
            const wb=XLSX.read(ev.target.result,{type:"array"});
            const lines=[];
            wb.SheetNames.forEach(name=>{
              const ws=wb.Sheets[name];
              const txt=XLSX.utils.sheet_to_csv(ws,{blankrows:false});
              if(txt.trim())lines.push(`=== Feuille: ${name} ===\n${txt}`);
            });
            const text=lines.join("\n\n");
            setImportText(prev=>(prev?prev+"\n\n":"")+`[Fichier Excel: ${file.name}]\n${text}`);
            setImportFiles(prev=>[...prev,{name:file.name,mimeType:"text/plain",data:null,preview:null,isExcel:true,sessionTags:[]}]);
          }catch(err){console.error("Erreur lecture Excel",err);}
        };
        reader.readAsArrayBuffer(file);
      }else if(file.type.startsWith("image/")){
        const url=URL.createObjectURL(file);
        const img=new Image();
        img.onload=()=>{
          const maxW=1400;const scale=Math.min(1,maxW/img.width);
          const canvas=document.createElement("canvas");
          canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
          const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
          const b64=canvas.toDataURL("image/jpeg",0.82).split(",")[1];
          setImportFiles(prev=>[...prev,{name:file.name,mimeType:"image/jpeg",data:b64,preview:url,sessionTags:[]}]);
        };
        img.src=url;
      }else{
        // PDF et autres formats — envoi direct en base64
        const reader=new FileReader();
        reader.onload=ev=>{
          const b64=ev.target.result.split(",")[1];
          setImportFiles(prev=>[...prev,{name:file.name,mimeType:file.type||"application/pdf",data:b64,preview:null,sessionTags:[]}]);
        };
        reader.readAsDataURL(file);
      }
    });
    e.target.value="";
  };
  const removeImportFile=(idx)=>{
    setImportFiles(prev=>prev.filter((_,i)=>i!==idx));
  };
  const toggleFileSessionTag=(idx,sessId)=>{
    setImportFiles(prev=>prev.map((f,i)=>{
      if(i!==idx)return f;
      const tags=f.sessionTags||[];
      return{...f,sessionTags:tags.includes(sessId)?tags.filter(t=>t!==sessId):[...tags,sessId]};
    }));
  };
  const clearFileTags=(idx)=>{
    setImportFiles(prev=>prev.map((f,i)=>i===idx?{...f,sessionTags:[]}:f));
  };
  const sendConvMessage=async()=>{
    const msg=convInput.trim();if(!msg||convLoading||convCooldown>0||!preview)return;
    setConvInput("");
    setConvMsgs(prev=>[...prev,{role:"user",content:msg}]);
    setConvLoading(true);setConvError(null);
    setTimeout(()=>convEndRef.current?.scrollIntoView({behavior:"smooth"}),50);
    try{
      const history=convMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.content}));
      const payload={mode:"chat_edit",message:msg,currentProgram:preview.sessions,conversationHistory:history,sessions:SESSIONS};
      const resp=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
      const data=await resp.json();
      if(resp.status===429){setConvCooldown(30);throw new Error(data.error||"Trop de requetes");}
      if(!resp.ok)throw new Error(data.error||"Erreur serveur");
      setPreview(prev=>({sessions:{...prev.sessions,...data.sessions},rationale:data.rationale}));
      setConvMsgs(prev=>[...prev,{role:"ai",content:data.rationale||"Programme mis à jour."}]);
      setConvCooldown(8);// cooldown entre chaque message
    }catch(e){setConvError(e.message);}
    setConvLoading(false);
    setTimeout(()=>convEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };
  const AI_URL=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-program`;

  const DETAIL_FIELDS=[
    {k:"morpho",label:"Morphologie",placeholder:"Ex: longues jambes, bras courts, dos plat naturellement, bassin large..."},
    {k:"history",label:"Historique sportif",placeholder:"Ex: 5 ans de muscu, ancien rugbyman, arret de 6 mois en 2023..."},
    {k:"injuries",label:"Blessures / zones fragiles",placeholder:"Ex: tendinite coude gauche recurrente, genou droit (menisque 2021), lombaires sensibles..."},
    {k:"strengths",label:"Points forts",placeholder:"Ex: bonne force sur tirage, bonne connection mind-muscle pecs, recup rapide..."},
    {k:"weaknesses",label:"Points faibles / a developper",placeholder:"Ex: epaules posterieures en retard, mollets resistants, pec superieur peu developpe..."},
    {k:"equipment",label:"Equipement disponible",placeholder:"Ex: salle complete, pas de belt squat, pas de hack squat machine, barres cambrees dispo..."},
    {k:"schedule",label:"Contraintes horaires",placeholder:"Ex: seances 75 min max, mardi court (45 min), match le samedi, repos obligatoire mercredi..."},
    {k:"sport",label:"Activite sportive parallele",placeholder:"Ex: rugby XV 2x/sem + match samedi, cardio HIIT vendredi, sport collectif en loisir..."},
    {k:"maxes",label:"Charges de reference (1RM ou 5RM)",placeholder:"Ex: Bench 1RM 110kg, Squat 5RM 140kg, Traction +35kg x5, DL 160kg..."},
    {k:"preferences",label:"Preferences d entrainement",placeholder:"Ex: j aime les tempo lents sur ischios, je prefere halteres au bar pour incline, pas fan de leg press..."},
    {k:"nutrition",label:"Nutrition / recuperation",placeholder:"Ex: surplus calorique, 160g proteines/j, sommeil 7h moy, pas de complementation particuliere..."},
    {k:"other",label:"Autres infos importantes",placeholder:"Ex: competition dans 12 semaines, objectif esthetique pour ete, suivi medical en cours..."},
  ];
  const[details,setDetails]=useState(Object.fromEntries(DETAIL_FIELDS.map(f=>[f.k,form[f.k]||""])));
  const updDetail=(k,v)=>{setDetails(p=>({...p,[k]:v}));upd(k,v);};

  const generate=async()=>{
    setLoading(true);setError(null);
    const detailsBlock=DETAIL_FIELDS.filter(f=>details[f.k]?.trim()).map(f=>`- ${f.label}: ${details[f.k]}`).join("\n");
    const prompt=`Tu es un preparateur physique expert en musculation. Genere un programme de musculation structure en JSON strict.

PARAMETRES PRINCIPAUX:
- Objectif: ${form.goal}
- Niveau: ${form.level}
- Style: ${form.style}
- Seances par semaine: ${form.sessionsPerWeek}
- Nombre de semaines: ${form.weeks}
- Focus: ${form.focus||"equilibre general"}
- Contraintes: ${form.constraints||"aucune"}

PROFIL DETAILLE DE L ATHLETE:
${detailsBlock||"Aucun detail supplementaire fourni"}`;

    try{
      const resp=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({mode:"generate",prompt,sessions:SESSIONS})});
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error||"Erreur serveur");
      setPreview(data);setStep(1);
    }catch(e){setError("Erreur de generation: "+e.message);}
    setLoading(false);
  };

  const stitchImages=async(images)=>{
    // Charge toutes les images et les empile verticalement sur un seul canvas
    const imgs=await Promise.all(images.map(f=>new Promise((res,rej)=>{
      const img=new Image();
      img.onload=()=>res(img);
      img.onerror=rej;
      img.src="data:"+f.mimeType+";base64,"+f.data;
    })));
    const maxW=Math.min(1400,Math.max(...imgs.map(i=>i.width)));
    const totalH=imgs.reduce((s,i)=>s+Math.round(i.height*(maxW/i.width)),0);
    const canvas=document.createElement("canvas");
    canvas.width=maxW;canvas.height=Math.min(totalH,8000);
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
    let y=0;
    for(const img of imgs){
      const scale=maxW/img.width;
      const h=Math.round(img.height*scale);
      if(y+h>canvas.height)break;
      ctx.drawImage(img,0,y,maxW,h);
      y+=h;
    }
    const b64=canvas.toDataURL("image/jpeg",0.82).split(",")[1];
    return{name:"fusion_images.jpg",mimeType:"image/jpeg",data:b64,preview:null};
  };

  const mergePDFs=async(pdfs)=>{
    const merged=await PDFDocument.create();
    for(const f of pdfs){
      const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));
      const doc=await PDFDocument.load(bytes);
      const pages=await merged.copyPages(doc,doc.getPageIndices());
      pages.forEach(p=>merged.addPage(p));
    }
    const bytes=await merged.save();
    const b64=btoa(String.fromCharCode(...bytes));
    return{name:"fusion.pdf",mimeType:"application/pdf",data:b64,preview:null};
  };

  const mergeFilesForImport=async(files)=>{
    const images=files.filter(f=>f.mimeType.startsWith("image/"));
    const pdfs=files.filter(f=>f.mimeType==="application/pdf");
    const others=files.filter(f=>!f.mimeType.startsWith("image/")&&f.mimeType!=="application/pdf");
    const result=[];
    if(images.length===1)result.push(images[0]);
    else if(images.length>1)result.push(await stitchImages(images));
    if(pdfs.length===1)result.push(pdfs[0]);
    else if(pdfs.length>1)result.push(await mergePDFs(pdfs));
    result.push(...others);
    return result;
  };

  const importProgram=async()=>{
    if(!importText.trim()&&!importFiles.length){setError("Colle un texte ou ajoute au moins un fichier.");return;}
    setLoading(true);setError(null);
    try{
      const payload={mode:"import",prompt:importText||(importFiles.length?"Programme dans les fichiers ci-joints":""),sessions:SESSIONS};
      const binaryFiles=importFiles.filter(f=>f.data!==null);
      // Collecter les sessions explicitement ciblées (tous fichiers confondus)
      const targetIds=[...new Set(importFiles.flatMap(f=>f.sessionTags||[]))];
      importTargetRef.current=targetIds;
      if(binaryFiles.length){
        const hasTagged=binaryFiles.some(f=>f.sessionTags?.length>0);
        if(hasTagged){
          payload.filesData=binaryFiles.map(f=>({mimeType:f.mimeType,data:f.data,name:f.name,sessionTags:f.sessionTags||[]}));
        }else{
          const merged=await mergeFilesForImport(binaryFiles);
          payload.filesData=merged.map(f=>({mimeType:f.mimeType,data:f.data,name:f.name,sessionTags:[]}));
        }
      }
      // Restreindre l'IA aux sessions ciblées si précisées
      if(targetIds.length>0)payload.targetSessions=targetIds;
      const resp=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error||"Erreur serveur");
      setPreview(data);setStep(1);
    }catch(e){setError("Erreur d'import: "+e.message);}
    setLoading(false);
  };

  const sL={width:"100%",padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"};
  const chipRow=(label,opts,key)=>(<div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>{label}</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{opts.map(o=><button key={o} onClick={()=>upd(key,o)} style={{padding:"6px 11px",borderRadius:7,border:"1px solid "+(form[key]===o?C.coach:C.brdL),background:form[key]===o?C.coachS:"transparent",color:form[key]===o?C.coach:C.tx3,fontSize:11,fontWeight:form[key]===o?700:400,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>)}</div></div>);

  return(<div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
    <div style={{background:C.bg,minHeight:"100%",maxWidth:480,margin:"0 auto",width:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid "+C.brd,position:"sticky",top:0,background:C.bg,zIndex:10}}>
        <div><div style={{fontSize:15,fontWeight:700}}>Generateur IA</div><div style={{fontSize:11,color:C.tx3}}>Programme base par l IA, modifiable</div></div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.tx3,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>x</button>
      </div>

      {step===0&&(<div style={{padding:"0 0 40px"}}>
        {/* Sub-tabs */}
        <div style={{display:"flex",borderBottom:"1px solid "+C.brd,marginBottom:16}}>
          {[{k:"import",l:"Import"},{k:"form",l:"Parametres"},{k:"details",l:"Profil"}].map(t=>(
            <button key={t.k} onClick={()=>setAiTab(t.k)} style={{flex:1,padding:"10px 0",border:"none",borderBottom:"2px solid "+(aiTab===t.k?C.coach:"transparent"),background:"transparent",color:aiTab===t.k?C.coach:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.3px"}}>{t.l}</button>
          ))}
        </div>

        {aiTab==="import"&&(<div style={{padding:"0 16px"}}>
          <div style={{padding:"10px 14px",borderRadius:4,background:C.coachS,border:"1px solid "+C.coach+"40",marginBottom:16,fontSize:11,color:C.coach,lineHeight:1.6}}>
            Colle le texte de ton programme ou prends en photo ta feuille. L IA convertit automatiquement.
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>Texte du programme</div>
            <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder={"Ex:\nBench Volume:\n- Dev. couche 4x10 @80kg RIR 2.5\n- Dev. incline halt. 3x12 @28kg\n\nSquat Volume:\n- Back squat 4x10 @100kg\n..."} rows={8} style={{...sL,resize:"vertical",lineHeight:1.6}}/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>Fichiers (images, PDF…)</div>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.ods" multiple onChange={handleFilesUpload} style={{display:"none"}}/>
            <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"14px 0",borderRadius:4,border:"1.5px dashed "+C.coach+"60",background:importFiles.length?C.gS:C.coachS,color:importFiles.length?C.g:C.coach,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {importFiles.length?`${importFiles.length} fichier${importFiles.length>1?"s":" "} selectionne${importFiles.length>1?"s":""} — Ajouter d'autres`:"+ Ajouter fichiers (JPG, PNG, PDF…)"}
            </button>
            {importFiles.length>0&&(<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
              {importFiles.map((f,i)=>{
                const tags=f.sessionTags||[];
                const isTagged=tags.length>0;
                return(<div key={i} style={{background:C.s2,borderRadius:4,padding:"8px 10px",border:"1px solid "+(isTagged?C.coach+"50":C.brdL)}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {f.preview
                      ?<img src={f.preview} alt={f.name} style={{width:36,height:36,borderRadius:6,objectFit:"cover",background:C.s1,flexShrink:0}}/>
                      :<div style={{width:36,height:36,borderRadius:6,background:isTagged?C.coachS:C.s1,border:"1px solid "+C.brdL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>Ex</div>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                      <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase"}}>{f.mimeType.split("/")[1]}</div>
                    </div>
                    <button onClick={()=>removeImportFile(i)} style={{background:"none",border:"none",color:C.tx3,fontSize:16,cursor:"pointer",padding:"0 4px",flexShrink:0,fontFamily:"inherit"}}>×</button>
                  </div>
                  <div style={{marginTop:7}}>
                    <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:5}}>Affecter à :</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      <button onClick={()=>clearFileTags(i)} style={{padding:"3px 9px",borderRadius:5,border:"1px solid "+(!isTagged?C.coach:C.brdL),background:!isTagged?C.coachS:"transparent",color:!isTagged?C.coach:C.tx3,fontSize:9,fontWeight:!isTagged?700:400,cursor:"pointer",fontFamily:"inherit"}}>Global</button>
                      {SESSIONS.map(s=>{
                        const on=tags.includes(s.id);
                        return(<button key={s.id} onClick={()=>toggleFileSessionTag(i,s.id)} style={{padding:"3px 9px",borderRadius:5,border:"1px solid "+(on?C.coach:C.brdL),background:on?C.coachS:"transparent",color:on?C.coach:C.tx3,fontSize:9,fontWeight:on?700:400,cursor:"pointer",fontFamily:"inherit"}}>{s.short||s.id}</button>);
                      })}
                    </div>
                  </div>
                </div>);
              })}
              {importFiles.some(f=>(f.sessionTags||[]).length>0)&&(
                <div style={{padding:"7px 10px",borderRadius:7,background:C.coachS,border:"1px solid "+C.coach+"30",fontSize:10,color:C.coach,lineHeight:1.5}}>
                  L'IA placera les exercices de chaque fichier tagué uniquement dans les séances sélectionnées.
                </div>
              )}
            </div>)}
          </div>
          {error&&<div style={{padding:"10px 14px",borderRadius:4,background:C.rS,border:"1px solid "+C.r+"40",color:C.r,fontSize:11,marginBottom:12}}>{error}</div>}
          <button onClick={importProgram} disabled={loading} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:loading?"#333":C.coach,color:loading?C.tx3:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:"inherit"}}>
            {loading?"Analyse en cours...":"Importer le programme"}
          </button>
        </div>)}

        {aiTab==="form"&&(<div style={{padding:"0 16px"}}>
          <div style={{padding:"10px 14px",borderRadius:4,background:C.coachS,border:"1px solid "+C.coach+"40",marginBottom:16,fontSize:11,color:C.coach,lineHeight:1.6}}>
            Complete aussi l onglet <strong>Profil detaille</strong> pour un programme vraiment personnalise.
          </div>
          {chipRow("Objectif",GOALS,"goal")}
          {chipRow("Niveau",LEVELS,"level")}
          {chipRow("Style",STYLES,"style")}
          <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>Seances / semaine</div><div style={{display:"flex",gap:6}}>{[3,4,5,6].map(n=><button key={n} onClick={()=>upd("sessionsPerWeek",n)} style={{flex:1,padding:"8px 0",borderRadius:7,border:"1px solid "+(form.sessionsPerWeek===n?C.coach:C.brdL),background:form.sessionsPerWeek===n?C.coachS:"transparent",color:form.sessionsPerWeek===n?C.coach:C.tx3,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{n}</button>)}</div></div>
          <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>Focus particulier (optionnel)</div><input value={form.focus} onChange={e=>upd("focus",e.target.value)} placeholder="Ex: epaules, force sur bench, post-blessure genou..." style={sL}/></div>
          <div style={{marginBottom:20}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:7}}>Contraintes rapides</div><textarea value={form.constraints} onChange={e=>upd("constraints",e.target.value)} placeholder="Resume rapide de contraintes importantes..." rows={2} style={{...sL,resize:"none",lineHeight:1.5}}/></div>
          {error&&<div style={{padding:"10px 14px",borderRadius:4,background:C.rS,border:"1px solid "+C.r+"40",color:C.r,fontSize:11,marginBottom:12}}>{error}</div>}
          <button onClick={()=>setAiTab("details")} style={{width:"100%",padding:"11px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>Completer le profil detaille &gt;</button>
          <button onClick={generate} disabled={loading} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:loading?"#333":C.coach,color:loading?C.tx3:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:"inherit"}}>
            {loading?"Generation en cours...":"Generer le programme"}
          </button>
        </div>)}

        {aiTab==="details"&&(<div style={{padding:"0 16px"}}>
          <div style={{padding:"10px 14px",borderRadius:4,background:C.s2,border:"1px solid "+C.brdL,marginBottom:16,fontSize:11,color:C.tx2,lineHeight:1.6}}>
            Plus tu remplis ces champs, plus l IA pourra personnaliser le programme. Laisse vide ce qui ne s applique pas.
          </div>
          {DETAIL_FIELDS.map(f=>{
            const filled=details[f.k]?.trim();
            return(<div key={f.k} style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:600,color:filled?C.g:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{f.label}</div>
                {filled&&<div style={{width:6,height:6,borderRadius:"50%",background:C.g,flexShrink:0}}/>}
              </div>
              <textarea value={details[f.k]} onChange={e=>updDetail(f.k,e.target.value)} placeholder={f.placeholder} rows={2} style={{...sL,resize:"none",lineHeight:1.5,border:"1px solid "+(filled?C.g+"40":C.brdL)}}/>
            </div>);
          })}
          <div style={{padding:"10px 14px",borderRadius:4,background:C.gS,border:"1px solid "+C.g+"30",marginBottom:16,fontSize:11,color:C.g}}>
            {DETAIL_FIELDS.filter(f=>details[f.k]?.trim()).length} / {DETAIL_FIELDS.length} champs remplis
          </div>
          {error&&<div style={{padding:"10px 14px",borderRadius:4,background:C.rS,border:"1px solid "+C.r+"40",color:C.r,fontSize:11,marginBottom:12}}>{error}</div>}
          <button onClick={generate} disabled={loading} style={{width:"100%",padding:"14px 0",borderRadius:6,border:"none",background:loading?"#333":C.coach,color:loading?C.tx3:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:"inherit"}}>
            {loading?"Generation en cours...":"Generer le programme"}
          </button>
        </div>)}
      </div>)}

      {step===1&&preview&&(<div style={{padding:"16px"}}>
        {/* Résumé IA */}
        <div style={{padding:"10px 14px",borderRadius:4,background:C.gS,border:"1px solid "+C.g+"40",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.g,marginBottom:2}}>Programme généré</div>
          <div style={{fontSize:11,color:C.tx2,lineHeight:1.5}}>{preview.rationale}</div>
        </div>
        {/* Liste exercices */}
        <div style={{marginBottom:12}}>
          {Object.entries(preview.sessions||{}).map(([sid,exList])=>{const s=SESSIONS.find(x=>x.id===sid);if(!s||!exList?.length)return null;return(<div key={sid} style={{background:C.s1,borderRadius:4,padding:"10px 14px",marginBottom:6,border:"1px solid "+C.brd}}><div style={{fontSize:12,fontWeight:700,color:C.tx,marginBottom:5}}>{s.name} <span style={{fontSize:10,color:C.tx3}}>({exList.length} exos)</span></div>{exList.map((ex,i)=>{const wks=Object.keys(ex.weeks||{});return(<div key={i} style={{fontSize:11,color:C.tx2,padding:"3px 0",borderTop:i>0?"1px solid "+C.brd:""}}><span style={{color:getMC(ex.target||"Pecs"),fontWeight:600}}>{ex.name}</span><span style={{color:C.tx3}}> - {ex.bloc} - S{wks[0]}→S{wks[wks.length-1]}</span></div>);})}</div>);})}
        </div>
        {/* Chat IA pour affiner */}
        <div style={{borderTop:"1px solid "+C.brd,paddingTop:12,marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Affiner avec l'IA</div>
          {convMsgs.length>0&&(<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10,maxHeight:200,overflowY:"auto"}}>
            {convMsgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?C.coach:C.s2,color:m.role==="user"?"#fff":C.tx,fontSize:11,lineHeight:1.5}}>{m.content}</div>
              </div>
            ))}
            {convLoading&&<div style={{display:"flex"}}><div style={{padding:"8px 12px",borderRadius:"6px 6px 6px 4px",background:C.s2,color:C.tx3,fontSize:11}}>...</div></div>}
            {convError&&<div style={{fontSize:11,color:C.r,padding:"6px 10px",borderRadius:7,background:C.rS}}>{convError}</div>}
            <div ref={convEndRef}/>
          </div>)}
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <textarea value={convInput} onChange={e=>setConvInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendConvMessage();}}} placeholder='Ex: "plus de volume triceps, remplace le hack squat..."' rows={2} disabled={convLoading||convCooldown>0} style={{flex:1,padding:"9px 12px",borderRadius:4,border:"1px solid "+(convCooldown>0?C.o+"60":C.brdL),background:C.s2,color:convCooldown>0?C.tx3:C.tx,fontSize:12,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
            <button onClick={sendConvMessage} disabled={convLoading||convCooldown>0||!convInput.trim()} style={{padding:"9px 14px",borderRadius:4,border:"none",background:convInput.trim()&&!convLoading&&!convCooldown?C.coach:convCooldown>0?C.o+"30":"#333",color:convInput.trim()&&!convLoading&&!convCooldown?"#fff":convCooldown>0?C.o:C.tx3,fontSize:convCooldown>0?11:14,fontWeight:700,cursor:convInput.trim()&&!convLoading&&!convCooldown?"pointer":"default",fontFamily:"inherit",flexShrink:0,alignSelf:"flex-end",minWidth:40}}>{convLoading?"...":convCooldown>0?convCooldown+"s":"↑"}</button>
          </div>
        </div>
        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setStep(0);setConvMsgs([]);setConvError(null);}} style={{flex:1,padding:"12px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Régénérer</button>
          <button onClick={()=>{
            const targets=importTargetRef.current;
            if(targets.length>0){
              // Fusion : garder les séances existantes non ciblées, appliquer l'IA sur les séances ciblées
              const merged={};
              SESSIONS.forEach(s=>{
                if(targets.includes(s.id)){
                  // Séance ciblée : prendre le résultat IA s'il a des exercices, sinon garder l'existant
                  const aiResult=preview.sessions[s.id];
                  merged[s.id]=(aiResult&&aiResult.length>0)?aiResult:(existingExos[s.id]||[]);
                }else{
                  // Séance non ciblée : toujours garder l'existant
                  merged[s.id]=existingExos[s.id]||[];
                }
              });
              onGenerate(merged);
            }else{
              onGenerate(preview.sessions);
            }
          }} style={{flex:2,padding:"12px 0",borderRadius:4,border:"none",background:C.coach,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Appliquer</button>
        </div>
        <div style={{fontSize:10,color:C.tx3,textAlign:"center",marginTop:8}}>Tu pourras modifier chaque exercice dans l'éditeur</div>
      </div>)}
    </div>
  </div>);
}

function CoachProgramEditor({exos,setExos,sessions,setSessions,athleteNotes,allMethods,customMethods,setCustomMethods,blockConfig,exMeta,setExMeta,currentWeek=1,sets={},completedSessions={},weekSchedule={},setWeekSchedule,defaultWeek,hideWeekNav,lockedSessId,hideSplitControls,athleteId}){
  const {byRef: prByRef} = usePRsByRef(athleteId);
  const tw=blockConfig?.totalWeeks||6;const dw=blockConfig?.deloadWeek||0;const progPct=blockConfig?.progressionPct||2.5;const deloadPct=blockConfig?.deloadPct||40;
  const blockStarted=!blockConfig?.startDate||Math.floor((Date.now()-new Date(blockConfig.startDate).getTime())/86400000)>=0;
  const weeksArr=Array.from({length:tw},(_,i)=>i+1);
  const[_sess,setSess]=useState(0);const[week,setWeek]=useState(defaultWeek||currentWeek||1);const[openEx,setOpenEx]=useState(null);const[methodPickerEx,setMethodPickerEx]=useState(null);
  const[multiWeekExs,setMultiWeekExs]=useState(new Set());
  const isMultiWeek=id=>multiWeekExs.has(id);
  const toggleMultiWeek=id=>setMultiWeekExs(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const[expandedMethodWeek,setExpandedMethodWeek]=useState(null);const[exosSearch,setExosSearch]=useState("");const[exosTypeFilter,setExosTypeFilter]=useState("");
  const[copiedSet,setCopiedSet]=useState(null); // { val: number, isRm: boolean }
  const[newMForm,setNewMForm]=useState(false);const[newM,setNewM]=useState({label:"",c:"#FFC933",e:"NEW"});
  const dropRef=useRef(null);
  const[showAI,setShowAI]=useState(false);
  const[addForm,setAddForm]=useState(false);
  const[newEx,setNewEx]=useState({name:"",bloc:null,target:"Pecs",exType:"muscu"});
  const[exSearch,setExSearch]=useState("");const[showExDropdown,setShowExDropdown]=useState(false);
  const[supabaseExos,setSupabaseExos]=useState([]);
  // normalizeExName is now defined at the top level
  // Close dropdown on click outside
  useEffect(()=>{if(!showExDropdown)return;const h=e=>{if(dropRef.current&&!dropRef.current.contains(e.target))setShowExDropdown(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[showExDropdown]);
  // Sync week when parent navigates (WorkoutSplitModal changes defaultWeek without remounting)
  useEffect(()=>{if(defaultWeek)setWeek(defaultWeek);},[defaultWeek]);
  // Fetch exercises from Supabase DB on mount
  useEffect(()=>{supabase.from('exercises').select('id,name,target,ex_type,secondary,youtube_id,image_url').order('name').then(({data})=>{if(data)setSupabaseExos(data);});},[]);
  // Inject drag shake keyframe
  useEffect(()=>{const s=document.createElement('style');s.id='exShakeKf';s.textContent='@keyframes exShake{0%,100%{transform:rotate(0deg) translateX(0)}25%{transform:rotate(-0.6deg) translateX(-1.5px)}75%{transform:rotate(0.6deg) translateX(1.5px)}}';if(!document.getElementById('exShakeKf'))document.head.appendChild(s);return()=>{const el=document.getElementById('exShakeKf');if(el)el.remove();};},[]);
  // Build unified exercise DB for picker — deduplicate by normalized name
  const exoDB=(()=>{const seen=new Set();const res=[];
    const addIfNew=(e)=>{const norm=normalizeExName(e.name).toLowerCase();if(!seen.has(norm)){seen.add(norm);res.push({...e,name:normalizeExName(e.name)||e.name});}};
    Object.values(exos||{}).flat().forEach(addIfNew);
    Object.keys(exMeta||{}).forEach(n=>{const norm=normalizeExName(n).toLowerCase();if(!seen.has(norm)){seen.add(norm);res.push({name:normalizeExName(n)||n,target:exMeta[n]?.target||"Pecs",bloc:"PERF",tier:exMeta[n]?.tier||3});}});
    supabaseExos.forEach(e=>{const norm=normalizeExName(e.name).toLowerCase();if(!seen.has(norm)){seen.add(norm);res.push({name:normalizeExName(e.name)||e.name,target:e.target||"Pecs",exType:e.ex_type||"muscu",bloc:"PERF",tier:3,secondary:e.secondary||[],fromDB:true});}});
    return res;
  })();
  const[undoStack,setUndoStack]=useState([]);
  const[editingSession,setEditingSession]=useState(null);
  const[newSessForm,setNewSessForm]=useState(false);
  const[videoEx,setVideoEx]=useState(null);
  const[newSess,setNewSess]=useState({name:"",short:""});
  const[editingBlocs,setEditingBlocs]=useState(false);
  const[newBlocForm,setNewBlocForm]=useState(false);
  const[newBloc,setNewBloc]=useState({label:"",color:BLOC_COLORS[0]});
  const[expandedBlocCfg,setExpandedBlocCfg]=useState(null);
  const[editingBlocId,setEditingBlocId]=useState(null);
  const[dragId,setDragId]=useState(null);
  const[dragOverId,setDragOverId]=useState(null);
  const[dragOverBloc,setDragOverBloc]=useState(null);
  const[dragBlocId,setDragBlocId]=useState(null);
  const[dragOverBlocId,setDragOverBlocId]=useState(null);
  const[touchDragId,setTouchDragId]=useState(null);
  const touchTimerRef=useRef(null);
  const touchStartPosRef=useRef(null);
  // Bloquer scroll + sélection pendant touch drag
  useEffect(()=>{
    if(!touchDragId)return;
    const prev={us:document.body.style.userSelect,wus:document.body.style.webkitUserSelect,ov:document.body.style.overflow};
    document.body.style.userSelect='none';document.body.style.webkitUserSelect='none';document.body.style.overflow='hidden';
    return()=>{document.body.style.userSelect=prev.us;document.body.style.webkitUserSelect=prev.wus;document.body.style.overflow=prev.ov;};
  },[touchDragId]);
  const[calWeek,setCalWeek]=useState(currentWeek);
  const[showEditorModal,setShowEditorModal]=useState(false);

  const safeSessions=Array.isArray(sessions)?sessions:[];
  const lockedIdx=lockedSessId?safeSessions.findIndex(s=>s.id===lockedSessId):-1;
  const sess=lockedIdx>=0?lockedIdx:(_sess<safeSessions.length?_sess:0);
  const safeSess=sess;
  const sid=safeSessions[safeSess]?.id;const exList=exos[sid]||[];
  const sessBlocs=getSessionBlocs(safeSessions[safeSess],exList);
  const getBlocById=id=>sessBlocs.find(b=>b.id===id)||null;

  const tierCfg=blockConfig?.tierConfig||DEF_TIER_CONFIG;

  const autoFillProgression=()=>{
    const newExos={};
    Object.keys(exos).forEach(sessId=>{
      newExos[sessId]=(exos[sessId]||[]).map(ex=>{
        const eType=ex.exType||(ex.isFlexibility?"mobilite":"muscu");if(eType!=="muscu"&&eType!=="halterophilie")return ex;
        const w1=ex.weeks?.[1]||{};
        const tier=getExTier(ex.name,ex);
        const tc=tierCfg[tier]||tierCfg[3];
        const newWeeks={...ex.weeks};
        const trainWeeks=weeksArr.filter(w=>w!==dw&&w>1);
        const allTrainWeeks=weeksArr.filter(w=>w!==dw);
        const totalTrainWeeks=trainWeeks.length;
        const defSets=w1.sets||3;
        const defReps=w1.repsRange||(tc.repsStart?String(tc.repsStart):"10");

        newWeeks[1]={...(newWeeks[1]||{}),sets:defSets,repsRange:defReps};
        if(tc.mode==="rir")newWeeks[1]={...newWeeks[1],rir:tc.rirStart};
        else if(tc.mode==="reps")newWeeks[1]={...newWeeks[1],repsRange:String(tc.repsStart),rir:tc.rirStart};
        else newWeeks[1]={...newWeeks[1],repsRange:String(tc.repsStart),rir:tc.rir??0};

        for(let w=2;w<=tw;w++){
          const isDeloadW=w===dw;
          const prevW=newWeeks[w-1]||w1;
          if(isDeloadW){
            const dlPct=tc.deloadPct||40;
            newWeeks[w]={...prevW,...(w1.kg?{kg:Math.round(w1.kg*(1-dlPct/100)/2.5)*2.5}:{}),...(w1._perSetMode&&w1.setKgs?.length>0?{setKgs:w1.setKgs.map(k=>Math.round(k*(1-dlPct/100)/2.5)*2.5)}:{}),sets:Math.max(2,Math.round((prevW.sets||defSets)*0.6)),rir:(tc.rirStart||2)+2,repsRange:prevW.repsRange};
          }else{
            const weekIdx=trainWeeks.indexOf(w);
            const allWeekIdx=allTrainWeeks.indexOf(w);
            const totalAll=allTrainWeeks.length;
            const progress=totalAll>1?allWeekIdx/(totalAll-1):0;
            if(tc.mode==="rir"){
              const rirRange=tc.rirStart-tc.rirEnd;
              const newRir=Math.round((tc.rirStart-rirRange*progress)*2)/2;
              const kgStep=tc.kgStep??2.5;
              newWeeks[w]={...prevW,...(w1.kg?{kg:roundHalf(w1.kg+kgStep*allWeekIdx)}:{}),...(w1._perSetMode&&w1.setKgs?.length>0?{setKgs:w1.setKgs.map(k=>roundHalf(k+kgStep*allWeekIdx))}:{}),sets:defSets,repsRange:defReps,rir:Math.max(0,newRir)};
            }else if(tc.mode==="reps"){
              const repRange=tc.repsEnd-tc.repsStart;
              const cycleLen=Math.max(2,repRange+1);
              const cycle=Math.floor(weekIdx/cycleLen);
              const posInCycle=weekIdx%cycleLen;
              const newReps=Math.min(tc.repsEnd,tc.repsStart+posInCycle);
              const kgStep=tc.kgStep??2.5;
              const rirRange=(tc.rirStart||2)-(tc.rirEnd||1);
              const repProgress=posInCycle/(cycleLen-1||1);
              const newRir=Math.round(((tc.rirStart||2)-rirRange*repProgress)*2)/2;
              newWeeks[w]={...prevW,...(w1.kg?{kg:roundHalf(w1.kg+kgStep*cycle)}:{}),...(w1._perSetMode&&w1.setKgs?.length>0?{setKgs:w1.setKgs.map(k=>roundHalf(k+kgStep*cycle))}:{}),sets:prevW.sets||defSets,repsRange:String(newReps),rir:Math.max(0,newRir)};
            }else{
              const repRange=tc.repsEnd-tc.repsStart;
              const cycleLen=repRange+1;
              const cycle=Math.floor(weekIdx/cycleLen);
              const posInCycle=weekIdx%cycleLen;
              const kgStep=tc.kgStep??1.25;
              newWeeks[w]={...prevW,...(w1.kg?{kg:roundHalf(w1.kg+kgStep*cycle)}:{}),...(w1._perSetMode&&w1.setKgs?.length>0?{setKgs:w1.setKgs.map(k=>roundHalf(k+kgStep*cycle))}:{}),sets:prevW.sets||defSets,repsRange:String(tc.repsStart+posInCycle),rir:tc.rir??0};
            }
          }
        }
        return{...ex,weeks:newWeeks};
      });
    });
    setExos(newExos);
  };

  const pickExFromDB=(dbEx)=>{
    const et=dbEx.exType||(dbEx.isFlexibility?"mobilite":"muscu");
    const mappedBloc=sessBlocs.find(b=>b.id===dbEx.bloc)?.id||sessBlocs[0]?.id||null;
    setNewEx({name:dbEx.name,bloc:mappedBloc,target:dbEx.target||"Pecs",exType:et,tier:dbEx.tier||EX_TIER[dbEx.name]||3});
    setExSearch(dbEx.name);setShowExDropdown(false);
    // Sync target + secondary muscles into exMeta for volume counting
    if(setExMeta&&(dbEx.target||dbEx.secondary?.length)){
      setExMeta(prev=>({...prev,[dbEx.name]:{...(prev[dbEx.name]||{}),primary:dbEx.target||(prev[dbEx.name]?.primary||"Pecs"),...(dbEx.secondary?.length?{secondary:dbEx.secondary}:{})}}));
    }
  };
  const addExercise=()=>{
    if(!newEx.name.trim())return;
    const raw=newEx.name.trim();
    const norm=normalizeExName(raw);
    const suffix=raw!==norm?raw.replace(norm,"").replace(/^\s*\(?/,"").replace(/\)?\s*$/,"").trim():"";
    const id="custom_"+sid+"_"+Date.now();
    const coachNote=suffix||"";
    const isMuscu=newEx.exType==="muscu"||newEx.exType==="halterophilie";
    setExos(prev=>({...prev,[sid]:[...(prev[sid]||[]),{id,name:norm||raw,bloc:newEx.bloc,target:newEx.target,exType:newEx.exType||"muscu",isFlexibility:!isMuscu,tier:isMuscu?(newEx.tier||3):undefined,weeks:{1:{coachNote:coachNote||undefined}}}]}));
    setOpenEx(id);
    setNewEx({name:"",bloc:sessBlocs[0]?.id||null,target:"Pecs",exType:"muscu",tier:3});setExSearch("");setAddForm(false);
  };

  const removeExercise=(eid)=>{
    const ex=exList.find(e=>e.id===eid);
    const idx=exList.findIndex(e=>e.id===eid);
    if(ex)setUndoStack(prev=>[...prev,{sid,exercise:ex,index:idx}]);
    setExos(prev=>({...prev,[sid]:prev[sid].filter(e=>e.id!==eid)}));
    if(openEx===eid)setOpenEx(null);
  };

  const undoLast=()=>{
    if(!undoStack.length)return;
    const last=undoStack[undoStack.length-1];
    setUndoStack(prev=>prev.slice(0,-1));
    setExos(prev=>{
      const list=[...(prev[last.sid]||[])];
      list.splice(last.index,0,last.exercise);
      return{...prev,[last.sid]:list};
    });
  };

  const moveExercise=(eid,dir)=>{
    setExos(prev=>{
      const list=[...prev[sid]];
      const idx=list.findIndex(e=>e.id===eid);
      const newIdx=idx+dir;
      if(newIdx<0||newIdx>=list.length)return prev;
      [list[idx],list[newIdx]]=[list[newIdx],list[idx]];
      return{...prev,[sid]:list};
    });
  };

  const reorderExercise=(fromId,toId)=>{if(fromId===toId)return;setExos(prev=>{const list=[...(prev[sid]||[])];const fi=list.findIndex(e=>e.id===fromId);const ti=list.findIndex(e=>e.id===toId);if(fi<0||ti<0)return prev;const[moved]=list.splice(fi,1);list.splice(ti,0,moved);return{...prev,[sid]:list};});};
  const assignToBloc=(exId,blocId)=>{setExos(prev=>({...prev,[sid]:(prev[sid]||[]).map(e=>e.id===exId?{...e,bloc:blocId||null}:e)}));};
  const reorderBloc=(fromId,toId)=>{if(fromId===toId)return;setSessions(prev=>prev.map((s,i)=>{if(i!==safeSess)return s;const base=[...(s.blocs?.length>0?s.blocs:sessBlocs)];const fi=base.findIndex(b=>b.id===fromId);const ti=base.findIndex(b=>b.id===toId);if(fi<0||ti<0)return s;const[moved]=base.splice(fi,1);base.splice(ti,0,moved);return{...s,blocs:base};}));};
  const moveExToBloc=(fromId,toId,targetBlocId)=>{setExos(prev=>{const list=[...(prev[sid]||[])];const fi=list.findIndex(e=>e.id===fromId);const ti=list.findIndex(e=>e.id===toId);if(fi<0||ti<0)return prev;const moved={...list[fi],bloc:targetBlocId||null};list.splice(fi,1);const nti=list.findIndex(e=>e.id===toId);list.splice(nti>=0?nti:ti,0,moved);return{...prev,[sid]:list};});};
  const updField=(eid,f,val)=>setExos(prev=>({...prev,[sid]:prev[sid].map(e=>e.id===eid?{...e,weeks:{...e.weeks,[week]:{...(e.weeks[week]||{}),[f]:f==="sets"||f==="kg"||f==="rir"||f==="pct_rm"?isNaN(+val)?val:+val:val}}}:e)}));
  const updExField=(eid,f,val)=>setExos(prev=>({...prev,[sid]:prev[sid].map(e=>e.id===eid?{...e,[f]:val}:e)}));
  const updWeekN=(eid,weekN,f,val)=>setExos(prev=>({...prev,[sid]:prev[sid].map(e=>e.id===eid?{...e,weeks:{...e.weeks,[weekN]:{...(e.weeks[weekN]||{}),[f]:f==="sets"||f==="kg"||f==="rir"||f==="pct_rm"?isNaN(+val)?val:+val:val}}}:e)}));
  const updWeekNMethod=(eid,weekN,mk)=>setExos(prev=>({...prev,[sid]:prev[sid].map(e=>e.id===eid?{...e,weeks:{...e.weeks,[weekN]:{...(e.weeks[weekN]||{}),method:mk||null,methodParams:mk?(MDEF[mk]||null):null}}}:e)}));
  const updWeekNMP=(eid,weekN,p)=>setExos(prev=>({...prev,[sid]:prev[sid].map(e=>e.id===eid?{...e,weeks:{...e.weeks,[weekN]:{...(e.weeks[weekN]||{}),methodParams:p}}}:e)}));
  const updMP=(eid,p)=>setExos(prev=>{
    const list=(prev[sid]||[]).map(e=>e.id===eid?{...e,weeks:{...e.weeks,[week]:{...(e.weeks[week]||{}),methodParams:p}}}:e);
    return{...prev,[sid]:list};
  });
  const fS={background:C.s2,color:C.tx,border:"1px solid "+C.brdL,fontFamily:"inherit",fontSize:13,fontWeight:700,textAlign:"center",borderRadius:4,padding:"7px 4px",width:"100%"};
  const addCM=()=>{if(!newM.label)return;const key="custom_"+Date.now();setCustomMethods(p=>[...p,{key,...newM}]);setNewMForm(false);};

  const renameSession=(idx,field,val)=>{setSessions(prev=>prev.map((s,i)=>i===idx?{...s,[field]:val}:s));};
  const duplicateSession=(idx)=>{const src=safeSessions[idx];if(!src)return;const newId="s_"+Date.now();setSessions(prev=>[...prev,{...src,id:newId,name:src.name+" (copie)",short:src.short.slice(0,2)+"2"}]);setExos(prev=>({...prev,[newId]:(prev[src.id]||[]).map(ex=>({...ex,id:"cp_"+Date.now()+"_"+ex.id}))}));};
  const addSession=()=>{if(!newSess.name.trim())return;const id="s_"+Date.now();setSessions(prev=>[...prev,{id,name:newSess.name.trim(),short:newSess.short.trim()||newSess.name.trim().slice(0,3).toUpperCase()}]);setExos(prev=>({...prev,[id]:[]}));setNewSess({name:"",short:""});setNewSessForm(false);};
  const removeSession=(idx)=>{const removedId=safeSessions[idx]?.id;setSessions(prev=>{const next=prev.filter((_,i)=>i!==idx);if(sess>=next.length)setSess(Math.max(0,next.length-1));return next;});if(removedId)setExos(prev=>{const next={...prev};delete next[removedId];return next;});};
  const addSessionBloc=()=>{if(!newBloc.label.trim())return;const id="bloc_"+Date.now();const base=safeSessions[safeSess]?.blocs?.length>0?safeSessions[safeSess].blocs:sessBlocs;setSessions(prev=>prev.map((s,i)=>i===safeSess?{...s,blocs:[...base,{id,label:newBloc.label.trim(),color:newBloc.color}]}:s));setNewBloc({label:"",color:BLOC_COLORS[(base.length+1)%BLOC_COLORS.length]});setNewBlocForm(false);};
  const removeSessionBloc=(bid)=>{const base=safeSessions[safeSess]?.blocs?.length>0?safeSessions[safeSess].blocs:sessBlocs;setSessions(prev=>prev.map((s,i)=>i===safeSess?{...s,blocs:base.filter(b=>b.id!==bid)}:s));setExos(prev=>({...prev,[sid]:(prev[sid]||[]).map(e=>e.bloc===bid?{...e,bloc:null}:e)}));};
  const updateSessionBloc=(bid,changes)=>{const base=safeSessions[safeSess]?.blocs?.length>0?safeSessions[safeSess].blocs:sessBlocs;setSessions(prev=>prev.map((s,i)=>i===safeSess?{...s,blocs:base.map(b=>b.id===bid?{...b,...changes}:b)}:s));};

  const applyAI=sessionsData=>{
    const newExos={...exos};
    Object.entries(sessionsData).forEach(([sid,list])=>{if(list&&Array.isArray(list))newExos[sid]=list.map(ex=>({...ex,weeks:Object.fromEntries(Object.entries(ex.weeks).map(([w,v])=>[w,{...v,repsRange:v.repsRange||String(v.reps||10)}]))}));});
    setExos(newExos);setShowAI(false);
  };

  return(<div>

    {/* ── CALENDRIER SEMAINES ── */}
    {!lockedSessId&&(()=>{
      const weeks=Array.from({length:tw},(_,i)=>i+1);
      return(<div style={{marginBottom:18,background:C.s1,borderRadius:6,overflow:"hidden",border:"1px solid "+C.brd}}>
        {/* Nav semaine */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:"1px solid "+C.brd,background:C.s2}}>
          <button onClick={()=>setCalWeek(w=>Math.max(1,w-1))} disabled={calWeek<=1} style={{width:28,height:28,borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:calWeek<=1?C.tx3+"40":C.tx2,cursor:calWeek<=1?"default":"pointer",fontSize:16,fontFamily:"inherit",flexShrink:0}}>‹</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:800,color:calWeek===currentWeek&&blockStarted?C.g:C.tx}}>Semaine {calWeek} <span style={{fontSize:10,fontWeight:400,color:C.tx3}}>/ {tw}</span></div>
            <div style={{fontSize:10,fontWeight:600,color:calWeek===dw?C.b:calWeek===currentWeek&&blockStarted?C.g:calWeek<currentWeek&&blockStarted?C.o:C.tx3}}>{calWeek===dw?"Deload":calWeek===currentWeek&&blockStarted?"En cours":calWeek<currentWeek&&blockStarted?"Passée":"À venir"}</div>
          </div>
          <button onClick={()=>setCalWeek(w=>Math.min(tw,w+1))} disabled={calWeek>=tw} style={{width:28,height:28,borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:calWeek>=tw?C.tx3+"40":C.tx2,cursor:calWeek>=tw?"default":"pointer",fontSize:16,fontFamily:"inherit",flexShrink:0}}>›</button>
        </div>
        {/* Séances */}
        <div style={{display:"flex",overflowX:"auto",scrollbarWidth:"none"}}>
          {safeSessions.length===0&&<div style={{flex:1,padding:"20px",textAlign:"center",color:C.tx3,fontSize:11}}>Aucune séance</div>}
          {safeSessions.map(s=>{
            const done=(completedSessions[calWeek]||[]).includes(s.id);
            const hasP=(exos[s.id]||[]).some(ex=>ex.weeks[calWeek]);
            const isPast=calWeek<currentWeek&&blockStarted;
            const sc=done?C.g:isPast?C.o:calWeek===currentWeek&&blockStarted?C.ac:C.tx3;
            const sl=done?"Validée":isPast?"Non faite":calWeek===currentWeek&&blockStarted?"En cours":"Planifiée";
            // Stats rapides
            const exs=exos[s.id]||[];
            const setsDoneQ=exs.reduce((a,ex)=>{const r=sets[ex.id+"_"+calWeek]||[];return a+r.filter(x=>x.done).length;},0);
            const setsPlQ=exs.reduce((a,ex)=>a+(ex.weeks[calWeek]?.sets||0),0);
            return(<div key={s.id} onClick={()=>hasP&&(()=>{setSess(safeSessions.findIndex(x=>x.id===s.id));setWeek(calWeek);setShowEditorModal(true);})()} style={{flex:1,minWidth:88,maxWidth:140,padding:"10px 6px 8px",textAlign:"center",cursor:hasP?"pointer":"default",borderRight:"1px solid "+C.brd,background:done?C.g+"08":"transparent",opacity:hasP?1:0.3,transition:"background 0.12s",boxSizing:"border-box"}}
              onMouseEnter={e=>{if(hasP)e.currentTarget.style.background=done?C.g+"14":C.acS;}}
              onMouseLeave={e=>{e.currentTarget.style.background=done?C.g+"08":"transparent";}}>
              <div style={{width:34,height:34,borderRadius:4,background:sc+"20",border:"1.5px solid "+sc+"50",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 5px",fontSize:done?17:12,fontWeight:800,color:sc}}>{done?"✓":s.short}</div>
              <div style={{fontSize:10,fontWeight:700,color:C.tx,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingLeft:2,paddingRight:2}}>{s.name}</div>
              <div style={{fontSize:9,fontWeight:600,color:sc}}>{sl}</div>
              {done&&setsPlQ>0&&<div style={{fontSize:8,color:C.tx3,marginTop:2}}>{setsDoneQ}/{setsPlQ} séries</div>}
            </div>);
          })}
        </div>
        {/* Dots nav semaines */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:3,padding:"7px 10px",borderTop:"1px solid "+C.brd}}>
          {weeks.map(w=>{const wDone=(completedSessions[w]||[]).length>=safeSessions.filter(s=>(exos[s.id]||[]).some(ex=>ex.weeks[w])).length&&safeSessions.filter(s=>(exos[s.id]||[]).some(ex=>ex.weeks[w])).length>0;return(<button key={w} onClick={()=>setCalWeek(w)} title={"S"+w} style={{width:w===calWeek?18:6,height:6,borderRadius:3,border:"none",background:w===calWeek?C.ac:wDone?C.g+"70":(completedSessions[w]||[]).length>0?C.o+"60":C.brdL,cursor:"pointer",transition:"all 0.2s",padding:0,flexShrink:0}}/>);})}
        </div>
      </div>);
    })()}

    {!lockedSessId&&showAI&&<AIGeneratorModal onGenerate={applyAI} onClose={()=>setShowAI(false)} allMethods={allMethods} existingExos={exos} sessions={safeSessions}/>}
    {!lockedSessId&&<button onClick={()=>setShowAI(true)} style={{width:"100%",padding:"11px 0",borderRadius:4,border:"1.5px dashed "+C.coach+"60",background:C.coachS,color:C.coach,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      <span style={{fontSize:14}}>*</span> Generer une base avec l IA
    </button>}

    {/* Session tabs */}
    {!lockedSessId&&(<div style={{display:"flex",gap:4,marginBottom:8,overflowX:"auto",scrollbarWidth:"none",alignItems:"center"}}>
      {safeSessions.map((s,i)=><button key={s.id} onClick={()=>{setSess(i);setOpenEx(null);}} onDoubleClick={()=>setEditingSession(i)} style={{flexShrink:0,padding:"7px 12px",borderRadius:4,border:"1px solid "+(i===safeSess?C.coach:C.brdL),background:i===safeSess?C.coachS:"transparent",color:i===safeSess?C.coach:C.tx2,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{s.short}</button>)}
      <button onClick={()=>setNewSessForm(o=>!o)} style={{flexShrink:0,width:28,height:28,borderRadius:7,border:"1px dashed "+C.coach+"50",background:"transparent",color:C.coach,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>+</button>
    </div>)}

    {editingSession!==null&&(<div style={{background:C.s1,borderRadius:4,padding:"10px 12px",border:"1px solid "+C.coach+"40",marginBottom:8}}>
      <div style={{fontSize:10,fontWeight:600,color:C.coach,marginBottom:8}}>Renommer la seance</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:6,marginBottom:8}}>
        <input value={sessions[editingSession]?.name||""} onChange={e=>renameSession(editingSession,"name",e.target.value)} placeholder="Nom complet" style={{padding:"7px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"}}/>
        <input value={sessions[editingSession]?.short||""} onChange={e=>renameSession(editingSession,"short",e.target.value)} placeholder="Court" style={{padding:"7px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"}}/>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setEditingSession(null)} style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:C.coach,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>OK</button>
        <button onClick={()=>{duplicateSession(editingSession);setEditingSession(null);}} style={{padding:"7px 12px",borderRadius:7,border:"1px solid "+C.ac+"40",background:C.acS,color:C.ac,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Copier</button>
        <button onClick={()=>{removeSession(editingSession);setEditingSession(null);}} style={{padding:"7px 12px",borderRadius:7,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Suppr.</button>
      </div>
    </div>)}

    {newSessForm&&(<div style={{background:C.s1,borderRadius:4,padding:"10px 12px",border:"1px solid "+C.g+"40",marginBottom:8}}>
      <div style={{fontSize:10,fontWeight:600,color:C.g,marginBottom:8}}>Nouvelle seance</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:6,marginBottom:8}}>
        <input value={newSess.name} onChange={e=>setNewSess(p=>({...p,name:e.target.value}))} placeholder="Ex: Seance de la mort" style={{padding:"7px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"}}/>
        <input value={newSess.short} onChange={e=>setNewSess(p=>({...p,short:e.target.value}))} placeholder="SDM" style={{padding:"7px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"}}/>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setNewSessForm(false)} style={{flex:1,padding:"7px 0",borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        <button onClick={addSession} style={{flex:2,padding:"7px 0",borderRadius:7,border:"none",background:C.g,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Ajouter</button>
      </div>
    </div>)}

{!lockedSessId&&safeSessions.length>0&&<button onClick={()=>setShowEditorModal(true)} style={{width:"100%",padding:"11px 14px",borderRadius:4,border:"1.5px dashed "+C.coach+"60",background:C.coachS,color:C.coach,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>Éditer le contenu des séances</button>}

    {(showEditorModal||!!lockedSessId)&&(<div style={lockedSessId?{display:"flex",flexDirection:"column"}:{position:"fixed",inset:0,zIndex:300,background:C.bg,overflowY:"auto",display:"flex",flexDirection:"column"}}>
      {!lockedSessId&&<div style={{position:"sticky",top:0,zIndex:5,background:C.bg,borderBottom:"1px solid "+C.brd,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>{setShowEditorModal(false);setOpenEx(null);}} style={{width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:800,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{safeSessions[safeSess]?.name||"Séance"}</div>
          <div style={{fontSize:10,color:C.tx3}}>Semaine {week} / {tw}{week===dw?" · Deload":""}</div>
        </div>
        {!lockedSessId&&<div style={{display:"flex",gap:3,flexShrink:0,overflowX:"auto",scrollbarWidth:"none",maxWidth:"40%"}}>
          {safeSessions.map((s,i)=><button key={s.id} onClick={()=>{setSess(i);setOpenEx(null);}} style={{flexShrink:0,padding:"5px 10px",borderRadius:7,border:"1px solid "+(i===safeSess?C.coach:C.brdL),background:i===safeSess?C.coachS:"transparent",color:i===safeSess?C.coach:C.tx2,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{s.short}</button>)}
        </div>}
      </div>}
      <div style={{padding:"16px",maxWidth:900,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>

    {/* Bloc management per session */}
    <div style={{marginBottom:12,background:C.s1,borderRadius:4,padding:"10px 12px",border:"1px solid "+C.brdL}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Blocs de la séance</div>
        <button onClick={()=>{setEditingBlocs(o=>!o);setEditingBlocId(null);setNewBlocForm(false);}} style={{fontSize:10,color:editingBlocs?C.coach:C.tx3,fontWeight:editingBlocs?700:400,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{editingBlocs?"Fermer":"Gérer"}</button>
      </div>
      {/* Pills display */}
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {sessBlocs.length===0&&!editingBlocs&&<span style={{fontSize:10,color:C.tx3,fontStyle:"italic"}}>Aucun bloc — cliquez Gérer pour créer</span>}
        {sessBlocs.map(b=>(
          <div key={b.id} style={{padding:"3px 10px",borderRadius:6,border:"1px solid "+b.color+"50",background:b.color+"15",color:b.color,fontSize:10,fontWeight:600}}>{b.label}</div>
        ))}
      </div>
      {/* Editing panel */}
      {editingBlocs&&(<div style={{marginTop:10}}>
        {sessBlocs.map(b=>{
          const bMethod=BLOC_METHODS.find(m=>m.v===(b.method||""))||BLOC_METHODS[0];
          const isExp=expandedBlocCfg===b.id;
          return(<div key={b.id} style={{marginBottom:8,borderRadius:4,border:"1px solid "+b.color+"40",background:C.s2,overflow:"hidden"}}>
            {/* Ligne principale */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px"}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div onClick={()=>setEditingBlocId(editingBlocId===b.id?null:b.id)} style={{width:18,height:18,borderRadius:4,background:b.color,cursor:"pointer",border:"2px solid "+b.color+"80"}}/>
                {editingBlocId===b.id&&(
                  <div style={{position:"absolute",top:"100%",left:0,zIndex:50,display:"flex",flexWrap:"wrap",gap:3,padding:6,background:C.s1,borderRadius:4,border:"1px solid "+C.brdL,width:108,marginTop:3}}>
                    {BLOC_COLORS.map(col=><div key={col} onClick={()=>{updateSessionBloc(b.id,{color:col});setEditingBlocId(null);}} style={{width:18,height:18,borderRadius:4,background:col,cursor:"pointer",outline:b.color===col?"2px solid white":"none"}}/>)}
                  </div>
                )}
              </div>
              <input value={b.label} onChange={e=>updateSessionBloc(b.id,{label:e.target.value})} style={{flex:1,padding:"4px 8px",borderRadius:6,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:11,fontFamily:"inherit"}}/>
              <button onClick={()=>setExpandedBlocCfg(isExp?null:b.id)} style={{padding:"3px 7px",borderRadius:6,border:"1px solid "+(isExp?b.color:C.brdL),background:isExp?b.color+"20":"transparent",color:isExp?b.color:C.tx3,fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Cfg</button>
              <button onClick={()=>removeSessionBloc(b.id)} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:10,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
            </div>
            {/* Panneau config étendu */}
            {isExp&&(<div style={{padding:"10px 10px 12px",borderTop:"1px solid "+b.color+"30",background:b.color+"08"}}>
              {/* Méthode */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:6}}>Méthode d'entraînement</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {BLOC_METHODS.map(m=><button key={m.v} onClick={()=>updateSessionBloc(b.id,{method:m.v||null})} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+((b.method||"")===(m.v||"")?b.color:C.brdL),background:(b.method||"")===(m.v||"")?b.color+"20":"transparent",color:(b.method||"")===(m.v||"")?b.color:C.tx3,fontSize:10,fontWeight:(b.method||"")===(m.v||"")?700:400,cursor:"pointer",fontFamily:"inherit"}}>{m.l}</button>)}
                </div>
              </div>
              {/* Départ interval (EMOM) */}
              {(b.method==="emom"||b.method==="tabata")&&<div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:5}}>Départ toutes les (secondes)</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>updateSessionBloc(b.id,{departureInterval:Math.max(5,(b.departureInterval||60)-5)})} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>-</button>
                  <input type="number" value={b.departureInterval||60} onChange={e=>updateSessionBloc(b.id,{departureInterval:Math.max(1,+e.target.value||1)})} style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:14,fontWeight:700,textAlign:"center",fontFamily:"inherit",outline:"none"}}/>
                  <button onClick={()=>updateSessionBloc(b.id,{departureInterval:(b.departureInterval||60)+5})} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>+</button>
                  <span style={{fontSize:11,color:C.tx3,flexShrink:0}}>s</span>
                </div>
              </div>}
              {/* Nombre de séries du bloc */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:5}}>Séries du bloc</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>updateSessionBloc(b.id,{sets:Math.max(1,(b.sets||3)-1)})} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>-</button>
                  <input type="number" value={b.sets||""} onChange={e=>updateSessionBloc(b.id,{sets:Math.max(1,+e.target.value||1)})} placeholder="—" style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:14,fontWeight:700,textAlign:"center",fontFamily:"inherit",outline:"none"}}/>
                  <button onClick={()=>updateSessionBloc(b.id,{sets:(b.sets||3)+1})} style={{width:26,height:26,borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>+</button>
                  {b.sets&&<button onClick={()=>{const n=b.sets;setExos(prev=>({...prev,[sid]:(prev[sid]||[]).map(e=>e.bloc===b.id?{...e,weeks:{...e.weeks,[week]:{...(e.weeks[week]||{}),sets:n}}}:e)}));}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid "+b.color+"60",background:b.color+"15",color:b.color,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Appliquer aux exos</button>}
                </div>
              </div>
              {/* Consignes */}
              <div>
                <div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:5}}>Consignes du bloc</div>
                <textarea value={b.instructions||""} onChange={e=>updateSessionBloc(b.id,{instructions:e.target.value})} placeholder="Ex : repos 90s entre chaque tour, tempo 3-0-1..." rows={2} style={{width:"100%",padding:"7px 9px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",lineHeight:1.5,outline:"none"}}/>
              </div>
            </div>)}
          </div>);
        })}
        {newBlocForm?(
          <div style={{display:"flex",gap:6,alignItems:"center",padding:"6px 8px",borderRadius:4,background:C.gS,border:"1px solid "+C.g+"40"}}>
            <div style={{width:18,height:18,borderRadius:4,background:newBloc.color,flexShrink:0,border:"2px solid "+newBloc.color+"80"}}/>
            <input value={newBloc.label} onChange={e=>setNewBloc(p=>({...p,label:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")addSessionBloc();if(e.key==="Escape")setNewBlocForm(false);}} placeholder="Nom du bloc..." style={{flex:1,padding:"4px 8px",borderRadius:6,border:"1px solid "+C.g+"50",background:C.s2,color:C.tx,fontSize:11,fontFamily:"inherit"}} autoFocus/>
            <div style={{display:"flex",flexWrap:"wrap",gap:2,maxWidth:72}}>
              {BLOC_COLORS.map(col=><div key={col} onClick={()=>setNewBloc(p=>({...p,color:col}))} style={{width:14,height:14,borderRadius:3,background:col,cursor:"pointer",outline:newBloc.color===col?"2px solid white":"none"}}/>)}
            </div>
            <button onClick={addSessionBloc} style={{padding:"4px 10px",borderRadius:6,border:"none",background:C.g,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>OK</button>
          </div>
        ):(
          <button onClick={()=>setNewBlocForm(true)} style={{width:"100%",padding:"6px 0",borderRadius:7,border:"1px dashed "+C.g+"50",background:"transparent",color:C.g,fontSize:11,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>+ Nouveau bloc</button>
        )}
      </div>)}
    </div>

    {!hideWeekNav&&<div style={{display:"flex",gap:3,marginBottom:6,flexWrap:"wrap"}}>{weeksArr.map(w=><button key={w} onClick={()=>setWeek(w)} style={{flex:1,minWidth:36,padding:"9px 0",borderRadius:7,border:w===week?"2px solid "+C.coach:"1px solid "+(w===dw?C.b+"60":C.brd),background:w===week?C.coachS:(w===dw?C.bS:"transparent"),color:w===week?C.coach:(w===dw?C.b:C.tx3),fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",position:"relative"}}>{w===dw&&<span style={{position:"absolute",top:-6,right:-2,fontSize:7,background:C.b,color:"#fff",padding:"1px 4px",borderRadius:4,fontWeight:700}}>DL</span>}S{w}</button>)}</div>}
    {!hideWeekNav&&dw>0&&<div style={{fontSize:10,color:C.b,marginBottom:6,display:"flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:C.b,display:"inline-block"}}/> S{dw} = Deload (-{deloadPct}% charge, volume reduit)</div>}

    {!hideSplitControls&&<button onClick={autoFillProgression} style={{width:"100%",padding:"9px 0",borderRadius:4,border:"1px solid "+C.o+"50",background:C.oS,color:C.o,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
      ↗ Surcharge progressive — tout le bloc (S1→S{tw})
    </button>}

    {undoStack.length>0&&(<button onClick={undoLast} style={{width:"100%",padding:"8px 0",borderRadius:4,border:"1px solid "+C.o+"50",background:C.oS,color:C.o,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
      ← Annuler la suppression ({undoStack.length})
    </button>)}

    {!hideSplitControls&&exList.length>3&&<div style={{marginBottom:10}}>
      <input value={exosSearch} onChange={e=>setExosSearch(e.target.value)} placeholder="Rechercher dans la séance..." style={{width:"100%",padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:12,fontFamily:"inherit",boxSizing:"border-box",marginBottom:6,outline:"none"}}/>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {[{k:"",l:"Tous"},{k:"muscu",l:"Muscu"},{k:"halterophilie",l:"Halté."},{k:"plio",l:"Plio"},{k:"mobilite",l:"Mob."}].map(({k,l})=>{const on=exosTypeFilter===k;const tc={muscu:C.tx2,halterophilie:"#8b5cf6",plio:C.o,mobilite:C.b,"":C.tx3}[k];return(<button key={k} onClick={()=>setExosTypeFilter(k)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid "+(on?(k?tc:C.coach):C.brdL),background:on?(k?tc+"20":C.coachS):"transparent",color:on?(k?tc:C.coach):C.tx3,fontSize:11,fontWeight:on?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>);})}
        {(exosSearch||exosTypeFilter)&&<button onClick={()=>{setExosSearch("");setExosTypeFilter("");}} style={{padding:"5px 10px",borderRadius:7,border:"1px solid "+C.r+"50",background:C.rS,color:C.r,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>}
      </div>
    </div>}
    {(()=>{
      // Group exercises by bloc preserving display order
      const groups=[];const seenBloc=new Set();
      const filteredExList=exList.filter(ex=>{const nameMatch=!exosSearch||ex.name.toLowerCase().includes(exosSearch.toLowerCase());const et=ex.exType||(ex.isFlexibility?"mobilite":"muscu");const typeMatch=!exosTypeFilter||et===exosTypeFilter;return nameMatch&&typeMatch;});
      filteredExList.forEach(ex=>{
        const key=ex.bloc||"__no_bloc__";
        if(!seenBloc.has(key)){seenBloc.add(key);groups.push({blocId:ex.bloc,exs:[]});}
        groups.find(g=>g.blocId===ex.bloc).exs.push(ex);
      });
      groups.sort((a,b)=>{const ai=sessBlocs.findIndex(s=>s.id===a.blocId);const bi=sessBlocs.findIndex(s=>s.id===b.blocId);if(ai===-1&&bi===-1)return 0;if(ai===-1)return 1;if(bi===-1)return -1;return ai-bi;});
      if(filteredExList.length===0&&exList.length>0)return[<div key="empty" style={{textAlign:"center",padding:"20px 0",color:C.tx3,fontSize:12}}>Aucun exercice ne correspond</div>];
      return groups.map(({blocId,exs:groupExs})=>{
        const bloc=getBlocById(blocId);const blocC=bloc?.color||C.tx3;
        return(<div key={blocId||"__no_bloc__"} onDragOver={e=>{e.preventDefault();if(dragBlocId&&dragBlocId!==blocId)setDragOverBlocId(blocId);else if(dragId&&!dragBlocId)setDragOverBloc(blocId||null);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setDragOverBloc(null);setDragOverBlocId(null);}}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragBlocId&&dragBlocId!==blocId){reorderBloc(dragBlocId,blocId);setDragBlocId(null);setDragOverBlocId(null);}else if(dragId&&!dragBlocId){assignToBloc(dragId,blocId||null);setDragId(null);setDragOverId(null);setDragOverBloc(null);}}} style={{marginBottom:14,borderRadius:6,border:"1px solid "+(dragOverBlocId===blocId&&dragBlocId?blocC+"90":dragOverBloc===blocId&&dragId?blocC+"90":blocC+(bloc?"40":"20")),background:blocC+(bloc?"0D":"00"),overflow:"hidden",transition:"border-color 0.15s",opacity:dragBlocId===blocId?0.5:1}}>
          {/* Bloc header */}
          {bloc&&(<div draggable={true} onDragStart={e=>{e.stopPropagation();setDragBlocId(blocId);e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{e.preventDefault();e.stopPropagation();if(dragBlocId&&dragBlocId!==blocId)setDragOverBlocId(blocId);}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragBlocId&&dragBlocId!==blocId){reorderBloc(dragBlocId,blocId);setDragBlocId(null);setDragOverBlocId(null);}}} onDragEnd={()=>{setDragBlocId(null);setDragOverBlocId(null);}} style={{background:dragOverBlocId===blocId&&dragBlocId?blocC+"40":dragOverBloc===blocId&&dragId?blocC+"35":blocC+"22",borderBottom:"1px solid "+blocC+"30",cursor:dragBlocId?"grabbing":"grab",transition:"background 0.15s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}}>
              <div style={{color:blocC+"80",fontSize:12,userSelect:"none",flexShrink:0,lineHeight:1}}>⠿</div>
              <div style={{width:4,height:16,borderRadius:2,background:blocC,flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:800,color:blocC,letterSpacing:"0.2px"}}>{bloc.label}</span>
              {bloc.method&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:blocC+"30",color:blocC,fontWeight:700}}>{(BLOC_METHODS.find(m=>m.v===bloc.method)||{l:bloc.method}).l}</span>}
              {bloc.sets&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:C.s2,color:C.tx3,fontWeight:600}}>{bloc.sets} séries</span>}
              {bloc.departureInterval&&bloc.method&&<span style={{fontSize:9,color:C.tx3}}>{bloc.departureInterval}s</span>}
              <span style={{fontSize:9,color:C.tx3,marginLeft:"auto"}}>{groupExs.length} exo{groupExs.length>1?"s":""}</span>
            </div>
            {bloc.instructions&&<div style={{padding:"0 12px 8px",fontSize:10,color:blocC,fontStyle:"italic",lineHeight:1.5}}>{bloc.instructions}</div>}
          </div>)}
          {/* Exercises */}
          <div style={{padding:bloc?"6px 8px":"0"}}>
          {groupExs.map(ex=>{
            const exIdx=exList.indexOf(ex);const wd=ex.weeks[week]||{};const isOpen=openEx===ex.id;const nameOccurrences=exList.filter(x=>normalizeExName(x.name)===normalizeExName(ex.name)).length;const occIndex=nameOccurrences>1?(exList.slice(0,exIdx).filter(x=>normalizeExName(x.name)===normalizeExName(ex.name)).length+1):0;const sk=ex.id+"_"+week;const aNote=athleteNotes[sk]||"";const curM=allMethods[wd.method];const eType=ex.exType||(ex.isFlexibility?"mobilite":"muscu");const isFlex=eType!=="muscu"&&eType!=="halterophilie";const exTier=getExTier(ex.name,ex);const exTc=tierCfg[exTier]||tierCfg[3];const typeLabels={muscu:"Muscu",plio:"Plio",mobilite:"Mobilité",halterophilie:"Halté."};const typeColors={muscu:C.tx3,plio:C.o,mobilite:C.b,halterophilie:"#8b5cf6"};
            const bankEx=supabaseExos.find(b=>(ex.exercise_id&&b.id===ex.exercise_id)||fuzzyExMatch(b.name,ex.name));
            const hasVideo=!!(bankEx?.youtube_id||bankEx?.image_url);
            return(<div key={ex.id} data-exid={ex.id} draggable={true} onDragStart={e=>{setDragId(ex.id);e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{e.preventDefault();if(dragBlocId){return;}e.stopPropagation();setDragOverId(ex.id);if(dragId)setDragOverBloc(ex.bloc||null);}} onDrop={e=>{e.preventDefault();if(dragBlocId){return;}e.stopPropagation();if(dragId&&dragId!==ex.id)moveExToBloc(dragId,ex.id,ex.bloc);setDragId(null);setDragOverId(null);setDragOverBloc(null);}} onDragEnd={()=>{setDragId(null);setDragOverId(null);setDragOverBloc(null);}}
              onTouchStart={e=>{const t=e.touches[0];touchStartPosRef.current={x:t.clientX,y:t.clientY};touchTimerRef.current=setTimeout(()=>{setTouchDragId(ex.id);setDragId(ex.id);if(navigator.vibrate)navigator.vibrate(40);},800);}}
              onTouchMove={e=>{if(!touchDragId){const t=e.touches[0];if(Math.abs(t.clientX-(touchStartPosRef.current?.x||0))>8||Math.abs(t.clientY-(touchStartPosRef.current?.y||0))>8)clearTimeout(touchTimerRef.current);return;}e.preventDefault();const t=e.touches[0];const hit=[...document.querySelectorAll('[data-exid]')].find(el=>{const r=el.getBoundingClientRect();return t.clientY>=r.top&&t.clientY<=r.bottom;});if(hit&&hit.dataset.exid!==touchDragId){setDragOverId(hit.dataset.exid);setDragOverBloc(exList.find(x=>x.id===hit.dataset.exid)?.bloc||null);}}}
              onTouchEnd={()=>{clearTimeout(touchTimerRef.current);if(touchDragId){if(dragOverId&&touchDragId!==dragOverId){const tgt=exList.find(x=>x.id===dragOverId);if(tgt)moveExToBloc(touchDragId,dragOverId,tgt.bloc);}setTouchDragId(null);setDragId(null);setDragOverId(null);setDragOverBloc(null);}}}
              style={{background:C.s1,borderRadius:4,marginBottom:4,border:"1px solid "+(dragOverId===ex.id?C.ac:C.brd),overflow:"hidden",opacity:dragId===ex.id?0.65:1,animation:dragId===ex.id?"exShake 0.4s ease-in-out infinite":"none",transition:"opacity 0.15s,border-color 0.15s",userSelect:"none",WebkitUserSelect:"none"}}>
              <div onClick={()=>setOpenEx(isOpen?null:ex.id)} style={{display:"flex",alignItems:"center",padding:"11px 13px",cursor:"pointer",gap:10}}>
                <div style={{width:3,height:28,borderRadius:2,background:blocC,flexShrink:0,position:"relative"}}><span style={{position:"absolute",top:-6,left:-3,fontSize:7,fontWeight:800,color:exTc.c,background:exTc.c+"20",padding:"0 3px",borderRadius:3}}>{isFlex?"":("T"+exTier)}</span></div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13,fontWeight:600}}>{ex.name}</span>{occIndex>0&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:C.bS,color:C.b,fontWeight:700,flexShrink:0}}>({occIndex})</span>}
                    {eType!=="muscu"&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:typeColors[eType]+"20",color:typeColors[eType],fontWeight:600}}>{typeLabels[eType]}</span>}
                  </div>
                  {!isFlex&&(wd.pdc||wd.kg!=null||wd.pct_rm!=null||wd.sets||wd.method_attachment)?<div style={{fontSize:11,color:C.tx2,marginTop:2}}>
                    {wd.pdc?"PDC":wd.pct_rm!=null?wd.pct_rm+"%RM":wd.kg!=null?wd.kg+"kg":""}
                    {(wd.pdc||wd.kg!=null||wd.pct_rm!=null)&&(wd.sets||wd.repsRange)?" - ":""}
                    {wd.sets||wd.repsRange?fmtMR(wd.method,wd.methodParams,wd.sets||"?",wd.repsRange):""}
                    {wd.method_attachment&&!wd.method&&(wd.sets||wd.repsRange)?" · ":""}
                    {wd.method_attachment&&!wd.method?<span style={{color:C.ac,fontWeight:600}}>{wd.method_attachment.method_name||"Méthode"}</span>:""}
                    {(!wd.method||wd.method==="dropset"||wd.method==="restpause")&&!wd.method_attachment?" - ":""}
                    {(!wd.method||wd.method==="dropset"||wd.method==="restpause")?<span style={{color:rC(wd.rir??2)}}>RIR {rL(wd.rir??2)}</span>:""}
                  </div>
                  :isFlex&&wd.sets?<div style={{fontSize:11,color:C.tx2,marginTop:2}}>{wd.sets}x{wd.repsRange||"?"}{wd.tempo?" tempo "+wd.tempo:""}</div>
                  :<div style={{fontSize:11,color:C.tx3,marginTop:2}}>Aucune prescription</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  {aNote&&<span style={{fontSize:9,padding:"2px 5px",borderRadius:4,background:C.b+"20",color:C.b,fontWeight:600}}>retour</span>}
                  {hasVideo&&<button onClick={e=>{e.stopPropagation();setVideoEx(bankEx);}} style={{background:'none',border:'none',color:C.tx3,fontSize:16,cursor:'pointer',padding:'0',lineHeight:1}} title="Voir la vidéo">Vid</button>}
                  <button onClick={e=>{e.stopPropagation();moveExercise(ex.id,-1);}} disabled={exIdx===0} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:exIdx===0?C.tx3+"40":C.tx2,fontSize:10,cursor:exIdx===0?"default":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>↑</button>
                  <button onClick={e=>{e.stopPropagation();moveExercise(ex.id,1);}} disabled={exIdx===exList.length-1} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:exIdx===exList.length-1?C.tx3+"40":C.tx2,fontSize:10,cursor:exIdx===exList.length-1?"default":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>↓</button>
                  <button onClick={e=>{e.stopPropagation();removeExercise(ex.id);}} style={{width:20,height:20,borderRadius:4,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:10,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>x</button>
                  <span style={{fontSize:12,color:C.tx3}}>{isOpen?"^":"v"}</span>
                </div>
              </div>
              {isOpen&&(<div onMouseDown={e=>e.stopPropagation()} style={{padding:"0 13px 16px",borderTop:"1px solid "+C.brd}}>
                {/* Multi-week planning toggle */}
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,marginBottom:8}}>
                  <button onClick={()=>toggleMultiWeek(ex.id)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid "+(isMultiWeek(ex.id)?C.coach:C.brdL),background:isMultiWeek(ex.id)?C.coachS:"transparent",color:isMultiWeek(ex.id)?C.coach:C.tx3,fontSize:10,fontWeight:isMultiWeek(ex.id)?700:400,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                    {isMultiWeek(ex.id)?"Multi-semaines actif":"Planifier multi-semaines"}
                  </button>
                </div>
                {/* Multi-week table */}
                {isMultiWeek(ex.id)&&(()=>{
                  const cellSt=(w)=>({width:44,textAlign:"center",padding:"4px 2px",borderRadius:5,border:"1px solid "+(w===week?C.coach:C.brdL),background:w===week?C.coachS:C.s2,color:C.tx,fontSize:11,fontWeight:700,fontFamily:"inherit",boxSizing:"border-box"});
                  const lSt={fontSize:9,color:C.tx3,whiteSpace:"nowrap",paddingRight:6,paddingTop:2};
                  return(<div style={{marginBottom:12,overflowX:"auto",background:C.s2,borderRadius:4,padding:"10px 10px 6px",border:"1px solid "+C.coach+"30"}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.coach,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Planification — toutes les semaines</div>
                    <table style={{borderCollapse:"collapse",width:"100%"}}>
                      <thead><tr>
                        <td style={{...lSt,color:"transparent"}}>──</td>
                        {weeksArr.map(w=><td key={w} style={{textAlign:"center",padding:"0 3px 4px",fontSize:9,fontWeight:w===week?800:400,color:w===dw?C.o:w===week?C.coach:C.tx3}}>S{w}{w===dw?"↻":""}</td>)}
                      </tr></thead>
                      <tbody>
                        <tr>
                          <td style={lSt}>Séries</td>
                          {weeksArr.map(w=>{const wD=ex.weeks[w]||{};return(<td key={w} style={{padding:"2px 3px"}}><input type="number" value={wD.sets||""} placeholder="-" onChange={e=>updWeekN(ex.id,w,"sets",e.target.value)} style={cellSt(w)}/></td>);})}
                        </tr>
                        {!isFlex&&<tr>
                          <td style={lSt}>Charge</td>
                          {weeksArr.map(w=>{const wD=ex.weeks[w]||{};const isRm=wD.pct_rm!=null||wd.pct_rm!=null;const val=isRm?wD.pct_rm:wD.kg;const hasPS=!isRm&&wD._perSetMode&&wD.setKgs?.length>0;return(<td key={w} style={{padding:"2px 3px"}}>{hasPS?<div style={{...cellSt(w),display:"flex",alignItems:"center",justifyContent:"center",color:C.tx3,fontSize:9,fontStyle:"italic"}}>PS</div>:<input type="number" step={isRm?1:0.5} value={val??""} placeholder="-" onChange={e=>updWeekN(ex.id,w,isRm?"pct_rm":"kg",e.target.value)} style={{...cellSt(w),color:isRm?C.g:C.tx,background:isRm?(w===week?C.g+"25":C.g+"10"):w===week?C.coachS:C.s2}}/>}</td>);})}
                        </tr>}
                        {!isFlex&&<tr>
                          <td style={{...lSt,fontSize:8}}>{(wd.pct_rm!=null||weeksArr.some(w=>ex.weeks[w]?.pct_rm!=null))?"%RM":"kg"}</td>
                          {weeksArr.map(w=>{
                            const wD=ex.weeks[w]||{};const isRm=wD.pct_rm!=null||wd.pct_rm!=null;
                            if(!isRm||!athleteId)return <td key={w}/>;
                            const ref=effectiveRmRef(ex);const prs=ref?prByRef[ref]:null;
                            if(!prs?.length)return <td key={w} style={{textAlign:"center",fontSize:8,color:C.tx3}}>-</td>;
                            const best=prs.reduce((m,p)=>p.kg>m.kg?p:m,prs[0]);
                            const calc=Math.round((wD.pct_rm||0)/100*best.kg*2)/2;
                            return <td key={w} style={{textAlign:"center",fontSize:8,color:C.g,fontWeight:700,paddingBottom:2}}>{calc||"-"}kg</td>;
                          })}
                        </tr>}
                        <tr>
                          <td style={lSt}>Reps</td>
                          {weeksArr.map(w=>{const wD=ex.weeks[w]||{};return(<td key={w} style={{padding:"2px 3px"}}><input type="text" value={wD.repsRange||""} placeholder="-" onChange={e=>updWeekN(ex.id,w,"repsRange",e.target.value)} style={{...cellSt(w),fontSize:10}}/></td>);})}
                        </tr>
                        {!isFlex&&<tr>
                          <td style={lSt}>RIR</td>
                          {weeksArr.map(w=>{const wD=ex.weeks[w]||{};return(<td key={w} style={{padding:"2px 3px"}}><input type="number" min={0} max={5} value={wD.rir??""} placeholder="-" onChange={e=>updWeekN(ex.id,w,"rir",e.target.value)} style={{...cellSt(w),color:rC(wD.rir??2)}}/></td>);})}
                        </tr>}
                        {!isFlex&&<tr>
                          <td style={lSt}>Méthode</td>
                          {weeksArr.map(w=>{const wD=ex.weeks[w]||{};const mk=wD.method||null;const mDat=mk?(DEF_METHODS[mk]||allMethods?.[mk]):null;const mc=mDat?.c||C.tx3;const ma=wD.method_attachment;return(<td key={w} style={{padding:"2px 3px"}}>{ma&&!mk?(<div title={ma.method_name||"Méthode"} style={{width:44,padding:"3px 2px",borderRadius:5,border:"1px solid "+C.ac+"60",background:C.acS,color:C.ac,fontSize:7,fontWeight:700,textAlign:"center",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",boxSizing:"border-box",cursor:"default"}}>{(ma.method_name||"Méth.").slice(0,6)}</div>):(<select value={mk||""} onChange={e=>{e.stopPropagation();updWeekNMethod(ex.id,w,e.target.value||null);}} style={{width:44,padding:"3px 1px",borderRadius:5,border:"1px solid "+(mk?mc:C.brdL),background:mk?mc+"20":C.s2,color:mk?mc:C.tx3,fontSize:8,fontWeight:mk?700:400,fontFamily:"inherit",cursor:"pointer"}}><option value="">—</option>{Object.entries(allMethods||{}).map(([k,m])=><option key={k} value={k}>{m.label.slice(0,7)}</option>)}</select>)}</td>);})}
                        </tr>}
                      </tbody>
                    </table>
                    {weeksArr.some(w=>ex.weeks[w]?.method)&&(<div style={{marginTop:10}}>
                      <div style={{fontSize:9,color:C.coach,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Paramètres méthode par semaine</div>
                      {weeksArr.filter(w=>ex.weeks[w]?.method).map(w=>{const wD=ex.weeks[w]||{};const mk=wD.method;const mDat=DEF_METHODS[mk]||allMethods?.[mk];const mc=mDat?.c||C.ac;const isExp=expandedMethodWeek?.exId===ex.id&&expandedMethodWeek?.week===w;return(<div key={w} style={{marginBottom:4,borderRadius:7,border:"1px solid "+mc+"40",overflow:"hidden"}}>
                        <div onClick={()=>setExpandedMethodWeek(isExp?null:{exId:ex.id,week:w})} style={{padding:"6px 10px",background:mc+"15",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                          <span style={{fontSize:10,fontWeight:700,color:mc}}>S{w}{w===dw?"↻":""}</span>
                          <span style={{flex:1,fontSize:10,color:mc}}>{mDat?.label||mk}</span>
                          <span style={{fontSize:9,color:C.tx3}}>{isExp?"▲":"▼"}</span>
                        </div>
                        {isExp&&(<div style={{padding:"0 10px 10px"}}><MethodParamsForm method={mk} params={wD.methodParams} onChange={p=>updWeekNMP(ex.id,w,p)} exosInSession={exList} currentExId={ex.id} plannedKg={wD.pdc?null:wD.kg}/></div>)}
                      </div>);})}
                    </div>)}
                  </div>);
                })()}
                {aNote&&<div style={{margin:"12px 0",padding:"10px 12px",borderRadius:4,background:C.b+"12",border:"1px solid "+C.b+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.b,textTransform:"uppercase",marginBottom:4}}>Retour S{week}</div><div style={{fontSize:12,color:C.tx2,lineHeight:1.5,fontStyle:"italic"}}>"{aNote}"</div></div>}
                {(()=>{
                  if(week<=1)return null;
                  const prevW=week-1;
                  const prevSets=(sets[ex.id+"_"+prevW]||[]).filter(s=>s.done);
                  if(!prevSets.length)return null;
                  const prevWd=ex.weeks[prevW]||{};
                  const bestPrev=prevSets.reduce((b,s)=>{const est=e1rm(s.kg||0,s.reps||1);return est>b.est?{...s,est}:b;},{est:0});
                  return(<div style={{margin:"12px 0 0",padding:"10px 12px",borderRadius:4,background:C.g+"0D",border:"1px solid "+C.g+"30"}}>
                    <div style={{fontSize:9,fontWeight:600,color:C.g,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:6}}>Réalisé S{prevW}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {prevSets.map((s,i)=>{const rc=rC(s.rir??2);return(<div key={i} style={{padding:"4px 8px",borderRadius:6,background:C.s1,border:"1px solid "+C.brd,fontSize:10}}>
                        <span style={{fontWeight:700,color:C.tx}}>{s.kg||prevWd.kg||"?"}kg</span>
                        <span style={{color:C.tx3}}> × {Array.isArray(s.reps)?s.reps.join("+"):s.reps||"?"}</span>
                        {s.rir!=null&&<span style={{color:rc,marginLeft:3,fontWeight:600}}>RIR{rL(s.rir)}</span>}
                      </div>);})}
                      {bestPrev.est>0&&prevSets.length>1&&<div style={{padding:"4px 8px",borderRadius:6,background:C.g+"15",border:"1px solid "+C.g+"30",fontSize:10,fontWeight:700,color:C.g}}>~{bestPrev.est}kg 1RM</div>}
                    </div>
                    {prevWd.kg&&prevSets[0]?.kg&&prevSets[0].kg!==prevWd.kg&&<div style={{fontSize:9,color:C.tx3,marginTop:4}}>Prévu {prevWd.kg}kg · Réalisé {prevSets[0].kg}kg</div>}
                  </div>);
                })()}
                <div style={{paddingTop:12,marginBottom:12,padding:"10px 12px",borderRadius:4,background:C.s2,border:"1px solid "+C.brdL}}>
                  <div style={{fontSize:9,fontWeight:600,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Parametres exercice</div>
                  <div style={{marginBottom:8}}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4}}>Nom</div><input value={ex.name} onChange={e=>updExField(ex.id,"name",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4}}>Bloc</div>
                      <select value={ex.bloc||""} onChange={e=>updExField(ex.id,"bloc",e.target.value||null)} style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1px solid "+(getBlocById(ex.bloc)?.color||C.brdL),background:C.s1,color:getBlocById(ex.bloc)?.color||C.tx,fontSize:12,fontFamily:"inherit"}}>
                        <option value="">— Aucun —</option>
                        {sessBlocs.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </div>
                    <div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4}}>Type</div>
                      <div style={{display:"flex",gap:3}}>{[{k:"muscu",l:"Muscu",c:C.tx3},{k:"halterophilie",l:"Halté.",c:"#8b5cf6"},{k:"plio",l:"Plio",c:C.o},{k:"mobilite",l:"Mob.",c:C.b}].map(({k,l,c})=>{const on=eType===k;return(<button key={k} onClick={()=>updExField(ex.id,"exType",k)} style={{flex:1,padding:"5px 2px",borderRadius:6,border:"1px solid "+(on?c:C.brdL),background:on?c+"20":"transparent",color:on?c:C.tx3,fontSize:10,fontWeight:on?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>);})}</div>
                    </div>
                  </div>
                  {athleteId&&!isFlex&&(<div style={{marginBottom:8}}>
                    {(()=>{const effRef=effectiveRmRef(ex);const effPrs=effRef?prByRef[effRef]:null;return(<>
                    <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
                      Référence RM
                      {effPrs&&<span style={{fontSize:9,fontWeight:700,color:C.g,padding:"1px 4px",borderRadius:3,background:C.g+"18"}}>
                        {effPrs.reduce((m,p)=>p.kg>m.kg?p:m,effPrs[0]).kg} kg
                      </span>}
                      {!ex.rm_ref&&<span style={{fontSize:8,color:C.tx3,fontStyle:"italic"}}>(défaut: nom exercice)</span>}
                    </div>
                    <input value={ex.rm_ref||""} onChange={e=>updExField(ex.id,"rm_ref",e.target.value||undefined)} placeholder={`Ex: Développé couché (défaut: "${ex.name}")`} style={{width:"100%",padding:"6px 9px",borderRadius:7,border:"1px solid "+(effPrs?C.g:C.brdL),background:C.s1,color:C.tx,fontSize:11,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    </>);})()}
                  </div>)}
                </div>
                {!isFlex?(
                  <div style={{marginBottom:10}}>
                    {/* Charge header avec toggles PDC / %RM */}
                    {!wd._perSetMode&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:5,justifyContent:"center"}}>
                      <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Charge</div>
                      {/* kg — mode par défaut */}
                      <button onClick={()=>{updField(ex.id,"pdc",false);updField(ex.id,"pct_rm",undefined);}} style={{padding:"1px 5px",borderRadius:4,border:"1px solid "+(!wd.pdc&&wd.pct_rm==null?C.ac:C.brdL),background:(!wd.pdc&&wd.pct_rm==null)?C.acS:"transparent",color:(!wd.pdc&&wd.pct_rm==null)?C.ac:C.tx3,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>kg</button>
                      {/* PDC */}
                      <button onClick={()=>{updField(ex.id,"pdc",!wd.pdc);if(!wd.pdc)updField(ex.id,"pct_rm",undefined);}} style={{padding:"1px 5px",borderRadius:4,border:"1px solid "+(wd.pdc?C.ac:C.brdL),background:wd.pdc?C.acS:"transparent",color:wd.pdc?C.ac:C.tx3,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>PDC</button>
                      {/* %RM */}
                      {athleteId&&<button onClick={()=>{const on=!!wd.pct_rm||wd.pct_rm===0;if(on){updField(ex.id,"pct_rm",undefined);}else{updField(ex.id,"pct_rm",80);updField(ex.id,"pdc",false);}}} title={ex.rm_ref?"Ref: "+ex.rm_ref:"Définir une référence RM sur l'exercice d'abord"} style={{padding:"1px 5px",borderRadius:4,border:"1px solid "+((wd.pct_rm!=null)?C.g:C.brdL),background:(wd.pct_rm!=null)?C.g+"20":"transparent",color:(wd.pct_rm!=null)?C.g:C.tx3,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>%RM</button>}
                    </div>}
                    {/* Charge inputs */}
                    <div style={{display:"grid",gridTemplateColumns:(wd.setKgs?.length>0||wd.setPctRms?.length>0)?"1fr":"1fr 1fr",gap:8}}>
                      {!wd._perSetMode&&<div>
                        {wd.pdc?<div style={{...fS,display:"flex",alignItems:"center",justifyContent:"center",background:C.acS,border:"1px solid "+C.ac,color:C.ac,fontWeight:700}}>PDC</div>
                        :wd.pct_rm!=null?(
                          <div style={{display:"flex",flexDirection:"column",gap:4}}>
                            <div style={{display:"flex",gap:3,alignItems:"center"}}>
                              <input type="number" min={1} max={200} step={1} value={wd.pct_rm??80} onChange={e=>updField(ex.id,"pct_rm",Number(e.target.value))} style={{...fS,flex:1}} placeholder="80"/>
                              <span style={{fontSize:10,color:C.tx3,flexShrink:0}}>%</span>
                            </div>
                            {(()=>{
                              const ref=effectiveRmRef(ex);
                              const prs=ref?prByRef[ref]:null;
                              if(!prs||!prs.length)return <div style={{fontSize:9,color:C.o,textAlign:"center"}}>Aucun PR</div>;
                              const best=prs.reduce((m,p)=>p.kg>m.kg?p:m,prs[0]);
                              const calc=Math.round(wd.pct_rm/100*best.kg*2)/2;
                              return <div style={{fontSize:9,color:C.g,fontWeight:700,textAlign:"center"}}>{calc} kg</div>;
                            })()}
                          </div>
                        ):wd.setKgs?.length>0?(
                          <div style={{...fS,display:"flex",alignItems:"center",justifyContent:"center",background:C.s2,border:"1px solid "+C.brdL,color:C.tx3,fontSize:10,fontStyle:"italic",cursor:"default"}}>par série ↓</div>
                        ):<input type="number" step="0.5" value={wd.kg??""} placeholder="--" onChange={e=>updField(ex.id,"kg",e.target.value)} style={fS}/>}
                      </div>}
                      <div>
                        <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5,textAlign:"center"}}>Series</div>
                        <input type="number" value={wd.sets??""} placeholder="--" onChange={e=>updField(ex.id,"sets",e.target.value)} style={fS}/>
                      </div>
                    </div>
                    {/* rm_ref hint when in %RM mode and no PR found */}
                    {wd.pct_rm!=null&&athleteId&&(()=>{const effR=effectiveRmRef(ex);return(!effR||!prByRef[effR])&&<div style={{marginTop:4,fontSize:9,color:C.o,padding:"3px 6px",borderRadius:5,background:C.oS}>Aucun PR trouvé pour "{effR||ex.name}". Complète une séance ou ajoute un PR manuellement.</div>;})()}
                    {/* Per-set charge config */}
                    {(wd.sets>=2)&&!wd.pdc&&(()=>{
                      const isRm=wd.pct_rm!=null;
                      const hasPerSet=!!wd._perSetMode&&(isRm?(wd.setPctRms?.length>0):(wd.setKgs?.length>0));
                      const togglePerSet=()=>{
                        setExos(prev=>({...prev,[sid]:prev[sid].map(e=>{
                          if(e.id!==ex.id)return e;
                          const cw=e.weeks[week]||{};let patch;
                          if(hasPerSet){
                            const stashVals=cw.setKgs||cw.setPctRms;
                            const inferKg=!cw.kg&&!isRm&&stashVals?.length>0?stashVals[0]:undefined;
                            patch={_perSetMode:false,_setKgsStash:stashVals,_setKgsIsRm:isRm,setKgs:undefined,setPctRms:undefined,...(inferKg!==undefined?{kg:inferKg}:{})};
                          }else{
                            const stash=cw._setKgsStash;const stashIsRm=cw._setKgsIsRm;
                            if(stash?.length>0&&stashIsRm===isRm){patch=isRm?{_perSetMode:true,setPctRms:stash}:{_perSetMode:true,setKgs:stash};}
                            else if(isRm){patch={_perSetMode:true,setPctRms:Array.from({length:cw.sets||3},()=>cw.pct_rm??80)};}
                            else{patch={_perSetMode:true,setKgs:Array.from({length:cw.sets||3},()=>cw.kg??0)};}
                          }
                          return{...e,weeks:{...e.weeks,[week]:{...cw,...patch}}};
                        })}));
                      };
                      const vals=isRm?(wd.setPctRms||[]):(wd.setKgs||[]);
                      const key=isRm?"setPctRms":"setKgs";
                      const ref=effectiveRmRef(ex);const prs=athleteId&&ref?prByRef[ref]:null;const best=prs?.length?prs.reduce((m,p)=>p.kg>m.kg?p:m,prs[0]):null;
                      return(<div style={{marginTop:8}}>
                        <button onClick={togglePerSet} style={{padding:"2px 8px",borderRadius:5,border:"1px solid "+(hasPerSet?C.ac:C.brdL),background:hasPerSet?C.acS:"transparent",color:hasPerSet?C.ac:C.tx3,fontSize:9,fontWeight:hasPerSet?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                          {hasPerSet?"Par serie · ↩ Globale":"Par serie"}
                        </button>
                        {hasPerSet&&(<div style={{marginTop:6}}>
                          <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2}}>
                          {Array.from({length:wd.sets},(_,i)=>{
                            const val=vals[i]??(isRm?wd.pct_rm??80:wd.kg??0);
                            const calcKg=isRm&&best?Math.round((val||0)/100*best.kg*2)/2:null;
                            const canPaste=copiedSet&&copiedSet.isRm===isRm;
                            return(<div key={i} style={{textAlign:"center",minWidth:44,flexShrink:0}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,marginBottom:2}}>
                                <span style={{fontSize:8,color:C.tx3}}>S{i+1}</span>
                                {/* Dupliquer : insère une copie de ce set après */}
                                <button title="Dupliquer" onClick={()=>{const nv=[...Array.from({length:wd.sets},(_,j)=>vals[j]??(isRm?wd.pct_rm??80:wd.kg??0))];nv.splice(i+1,0,val);updField(ex.id,"sets",nv.length);updField(ex.id,key,nv);}} style={{width:14,height:14,borderRadius:3,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:8,cursor:"pointer",fontFamily:"inherit",padding:0,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                                {/* Coller : applique la dernière valeur copiée */}
                                {canPaste&&<button title="Coller" onClick={()=>{const nv=[...Array.from({length:wd.sets},(_,j)=>vals[j]??(isRm?wd.pct_rm??80:wd.kg??0))];nv[i]=copiedSet.val;updField(ex.id,key,nv);}} style={{width:14,height:14,borderRadius:3,border:"1px solid "+C.ac+"60",background:C.acS,color:C.ac,fontSize:8,cursor:"pointer",fontFamily:"inherit",padding:0,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>▼</button>}
                              </div>
                              <input type="number" step={isRm?1:0.5} value={val??""} onChange={e=>{const nv=[...Array.from({length:wd.sets},(_,j)=>vals[j]??(isRm?wd.pct_rm??80:wd.kg??0))];nv[i]=parseFloat(e.target.value)||0;updField(ex.id,key,nv);}} style={{width:44,textAlign:"center",padding:"4px 2px",borderRadius:5,border:"1px solid "+C.brdL,background:C.s2,color:isRm?C.g:C.tx,fontSize:11,fontWeight:700,fontFamily:"inherit",boxSizing:"border-box"}}/>
                              <div style={{display:"flex",gap:2,justifyContent:"center",marginTop:2}}>
                                <div style={{fontSize:8,color:isRm?C.g:C.tx3,fontWeight:700}}>{isRm?(calcKg?calcKg+"kg":"-"):(val?val+"kg":"-")}</div>
                                {/* Copier ce set */}
                                <button title="Copier" onClick={()=>setCopiedSet({val,isRm})} style={{width:12,height:12,borderRadius:2,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:7,cursor:"pointer",fontFamily:"inherit",padding:0,lineHeight:1}}>C</button>
                              </div>
                            </div>);
                          })}
                          <div style={{alignSelf:"center",paddingTop:10,fontSize:9,color:C.tx3}}>{isRm?"%":""}</div>
                          </div>
                          {copiedSet&&<div style={{fontSize:9,color:C.ac,marginTop:4}}>Copié : {copiedSet.val}{copiedSet.isRm?"%":"kg"} — clique ▼ pour coller</div>}
                        </div>)}
                      </div>);
                    })()}
                  </div>
                ):(<div style={{marginBottom:10}}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5,textAlign:"center"}}>Series</div><input type="number" value={wd.sets||""} placeholder="--" onChange={e=>updField(ex.id,"sets",e.target.value)} style={fS}/></div>)}
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px"}}>Repetitions / Duree</div>
                    {!isFlex&&wd.sets>=2&&(()=>{const isPS=(wd.repsRange||"").includes(",");return(<button onClick={()=>{setExos(prev=>({...prev,[sid]:prev[sid].map(e=>{if(e.id!==ex.id)return e;const cw=e.weeks[week]||{};let patch;if(isPS){patch={_repsRangeStash:cw.repsRange,repsRange:(cw.repsRange||"").split(",")[0]||""};}else{const stash=cw._repsRangeStash;if(stash?.includes(",")&&stash.split(",").length===(cw.sets||3)){patch={repsRange:stash};}else{const b=cw.repsRange||"";patch={repsRange:Array.from({length:cw.sets||3},()=>b).join(",")};}}return{...e,weeks:{...e.weeks,[week]:{...cw,...patch}}};}))}));}} style={{padding:"1px 5px",borderRadius:4,border:"1px solid "+(isPS?C.ac:C.brdL),background:isPS?C.acS:"transparent",color:isPS?C.ac:C.tx3,fontSize:9,fontWeight:isPS?700:400,cursor:"pointer",fontFamily:"inherit"}}>{isPS?"Global":"Par serie"}</button>);})()}
                  </div>
                  {(()=>{const isPS=!isFlex&&wd.sets>=2&&(wd.repsRange||"").includes(",");if(!isPS)return(<input type="text" value={wd.repsRange||""} placeholder={isFlex?"30s ou 10":"10 ou 8-12"} onChange={e=>updField(ex.id,"repsRange",e.target.value)} style={{...fS,textAlign:"left",paddingLeft:10}}/>);const parts=(wd.repsRange||"").split(",");return(<div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2}}>{Array.from({length:wd.sets},(_,i)=>{const val=parts[i]??parts[parts.length-1]??"";return(<div key={i} style={{textAlign:"center",minWidth:44,flexShrink:0}}><div style={{fontSize:8,color:C.tx3,marginBottom:2}}>S{i+1}</div><input type="text" value={val} onChange={e=>{const np=Array.from({length:wd.sets},(_,j)=>j===i?e.target.value:(parts[j]??parts[parts.length-1]??""));updField(ex.id,"repsRange",np.join(","));}} style={{width:44,textAlign:"center",padding:"4px 2px",borderRadius:5,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:11,fontWeight:700,fontFamily:"inherit",boxSizing:"border-box"}}/></div>);})}</div>);})()}
                </div>
                <div style={{display:"grid",gridTemplateColumns:isFlex?"1fr":"1fr 1fr",gap:8,marginBottom:14}}>
                  <div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>Tempo</div><input type="text" value={wd.tempo||""} placeholder="3-1-2-0" onChange={e=>updField(ex.id,"tempo",e.target.value)} style={{...fS,fontSize:12}}/></div>
                  {!isFlex&&<div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5,textAlign:"center"}}>RIR cible</div><div style={{display:"flex",justifyContent:"center"}}><RIRPicker value={wd.rir??2} onChange={v=>updField(ex.id,"rir",v)}/></div></div>}
                </div>
                {!isFlex&&(<div style={{marginBottom:14}}>
                  <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Méthode</div>
                  {wd.method_attachment?(
                    <div style={{padding:"8px 10px",borderRadius:4,background:C.acS,border:"1px solid "+C.ac+"50"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,fontSize:11,color:C.ac,fontWeight:700}}>
                          {wd.method_attachment.method_name||"Méthode"}
                          {wd.method_attachment.applied_to_sets?.length>0&&<span style={{fontWeight:400,color:C.tx3}}> · sets {wd.method_attachment.applied_to_sets.join(", ")}</span>}
                          {(()=>{
                            const ref=wd.method_attachment.reference;
                            if(!ref)return null;
                            const m=ref.trim().match(/^(\d+(?:\.\d+)?)%$/);
                            if(!m)return null;
                            let baseKg=wd.kg;
                            const effRefM=effectiveRmRef(ex);if(effRefM&&prByRef[effRefM]?.length){const best=prByRef[effRefM].reduce((bst,p)=>p.kg>bst.kg?p:bst,prByRef[effRefM][0]);baseKg=best.kg;}
                            if(!baseKg)return null;
                            const calc=Math.round(parseFloat(m[1])/100*baseKg*2)/2;
                            return <span style={{fontWeight:400,color:C.tx3}}> · {ref} = <span style={{fontWeight:700,color:C.tx}}>{calc} kg</span></span>;
                          })()}
                        </div>
                        <button onClick={()=>setMethodPickerEx({id:ex.id,sets:wd.sets||4,sid})} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Modifier</button>
                        <button onClick={()=>setExos(prev=>({...prev,[sid]:(prev[sid]||[]).map(e=>e.id===ex.id?{...e,weeks:{...e.weeks,[week]:{...(e.weeks[week]||{}),method_attachment:null}}}:e)}))} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Retirer</button>
                      </div>
                      {/* Hint kg manquant — scope='set' load same/free */}
                      {(()=>{
                        const ma=wd.method_attachment;if(!ma?.config?.sub_sets)return null;
                        const loadType=ma.config?.load?.type;
                        const noRef=!ma.reference&&!ma.config?.load?.reference;
                        const noKg=!wd.kg&&!wd.pct_rm&&!wd.pdc;
                        if((loadType==="same"||loadType==="free")&&noRef&&noKg)
                          return <div style={{marginTop:6,fontSize:10,color:C.o,padding:"4px 8px",borderRadius:6,background:C.o+"15",border:"1px solid "+C.o+"40"}}>Charge non définie — renseigner la valeur kg ci-dessus pour préremplir côté athlète</div>;
                        return null;
                      })()}
                      {/* Aperçu sous-séries — scope='set' */}
                      {(()=>{
                        const ss=wd.method_attachment?.config?.sub_sets;if(!ss)return null;
                        const nSets=wd.sets||3;const subCount=ss.count?.type==="fixed"?(ss.count.value??3):ss.count?.type==="range"?(ss.count.min??2):3;
                        const restSec=ss.rest_intra?.type==="fixed"?(ss.rest_intra.seconds??0):0;
                        const repsLabel=(sub)=>{const rc=ss.reps;if(rc?.type==="fixed")return rc.value??"?";if(rc?.type==="custom"&&rc.pattern?.length)return rc.pattern[sub]??rc.pattern[rc.pattern.length-1]??"?";if(rc?.type==="amrap")return"max";return"?";};
                        return(<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
                          {Array.from({length:nSets},(_,s)=>(
                            <div key={s} style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:9,fontWeight:700,color:C.tx3,minWidth:28}}>S{s+1}</span>
                              {Array.from({length:subCount},(_,sub)=>(
                                <span key={sub} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 6px",borderRadius:4,background:C.s2,border:"1px solid "+C.brd,fontSize:10,color:C.tx2}}>
                                  <span style={{fontSize:9,color:C.ac,fontWeight:700}}>SS{sub+1}</span>
                                  {(wd.kg?<span style={{color:C.tx,fontWeight:600}}>{wd.kg}kg</span>:null)}
                                  <span style={{color:C.tx3}}>×</span>
                                  <span style={{color:C.tx,fontWeight:600}}>{repsLabel(sub)}</span>
                                </span>
                              ))}
                              {restSec>0&&<span style={{fontSize:9,color:C.tx3}}>{restSec}s</span>}
                            </div>
                          ))}
                        </div>);
                      })()}
                    </div>
                  ):(
                    <button onClick={()=>setMethodPickerEx({id:ex.id,sets:wd.sets||4,sid})} style={{padding:"6px 12px",borderRadius:7,border:"1px dashed "+C.ac+"60",background:C.acS,color:C.ac,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ Ajouter une méthode</button>
                  )}
                </div>)}
                <div><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Consigne technique</div><textarea value={wd.coachNote||""} onChange={e=>updField(ex.id,"coachNote",e.target.value)} placeholder="Ex: garder les omoplates retractees..." rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+C.coach+"60",background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit",resize:"none",boxSizing:"border-box",lineHeight:1.5}}/></div>
                {!isFlex&&wd.repsRange&&(()=>{
                  let kgForCalc=wd.kg;
                  if(wd.pct_rm!=null){const effR=effectiveRmRef(ex);const prs=effR?prByRef[effR]:null;if(prs?.length){const best=prs.reduce((m,p)=>p.kg>m.kg?p:m,prs[0]);kgForCalc=Math.round(wd.pct_rm/100*best.kg*2)/2;}}
                  return kgForCalc?<div style={{marginTop:10,padding:"8px 12px",borderRadius:4,background:C.s2,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:C.tx3}}>1RM estime</span><span style={{fontSize:14,fontWeight:700,color:C.coach}}>{e1rm(kgForCalc,parseReps(wd.repsRange)||1)} kg</span></div>:null;
                })()}
              </div>)}
            </div>);
          })}
          </div>
        </div>);
      });
    })()}

    {/* Add exercise */}
    <div style={{marginTop:8}}>
      {!addForm?(<button onClick={()=>{setAddForm(true);setNewEx(p=>({...p,bloc:sessBlocs[0]?.id||null}));}} style={{width:"100%",padding:"10px 0",borderRadius:4,border:"1px dashed "+C.g+"50",background:C.gS,color:C.g,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Ajouter un exercice ({exList.length})</button>):(
        <div style={{background:C.s1,borderRadius:6,padding:"14px",border:"1px solid "+C.g+"40"}}>
          <div style={{fontSize:11,fontWeight:600,color:C.g,marginBottom:12}}>Nouvel exercice</div>
           <div style={{marginBottom:10,position:"relative"}} ref={dropRef}>
            <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5}}>Nom (depuis la base Exos)</div>
            <input value={exSearch} onChange={e=>{setExSearch(e.target.value);setNewEx(p=>({...p,name:e.target.value}));setShowExDropdown(true);}} onFocus={()=>setShowExDropdown(true)} placeholder="Rechercher ou créer..." style={{width:"100%",padding:"9px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}} onKeyDown={e=>e.key==="Enter"&&addExercise()}/>
            {/* Duplicate/similar alert */}
            {(()=>{
              const typed=normalizeExName(exSearch||"").toLowerCase();
              if(!typed)return null;
              const inThisSession=exList.some(x=>normalizeExName(x.name).toLowerCase()===typed);
              const otherSessions=safeSessions.filter(s=>s.id!==sid&&(exos[s.id]||[]).some(x=>normalizeExName(x.name).toLowerCase()===typed));
              if(!inThisSession&&!otherSessions.length)return null;
              return(<div style={{marginTop:4,padding:"6px 10px",borderRadius:7,border:"1px solid "+(inThisSession?C.b:C.g)+"50",background:inThisSession?C.bS:C.gS,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,color:inThisSession?C.b:C.g}}>{inThisSession?"Déjà dans cette séance — sera ajouté en double":"✓ Présent dans : "+otherSessions.map(s=>s.short).join(", ")+" → progression liée"}</span>
              </div>);
            })()}
            {showExDropdown&&(()=>{const matches=exoDB.filter(e=>e.name.toLowerCase().includes((exSearch||"").toLowerCase()));const exact=matches.some(e=>e.name.toLowerCase()===(exSearch||"").toLowerCase());return(<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:20,background:C.s1,border:"1px solid "+C.brdL,borderRadius:4,maxHeight:200,overflowY:"auto",marginTop:2}}>
              {matches.slice(0,10).map(e=>{const mc=getMC(e.target||"Pecs");const normE=normalizeExName(e.name).toLowerCase();const inThisSess=exList.some(x=>normalizeExName(x.name).toLowerCase()===normE);const usedIn=safeSessions.filter(s=>(exos[s.id]||[]).some(x=>normalizeExName(x.name).toLowerCase()===normE)).map(s=>s.short);return(<div key={e.name} onClick={()=>{pickExFromDB(e);}} style={{padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,opacity:1,borderBottom:"1px solid "+C.brd}}>
                <span style={{width:3,height:16,borderRadius:2,background:mc,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:12}}>{e.name}</span>
                  {usedIn.length>0&&<div style={{fontSize:8,color:C.g,marginTop:1}}>↔ {usedIn.join(", ")}</div>}
                </div>
                {inThisSess&&<span style={{fontSize:9,color:C.b}}>+1</span>}
                <span style={{fontSize:9,color:mc}}>{mL(e.target||"Pecs")}</span>
                {e.fromDB&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:C.b+"30",color:C.b,fontWeight:700,flexShrink:0}}>DB</span>}
              </div>);})}
              {exSearch.trim()&&!exact&&(()=>{
                const normTyped=normalizeExName(exSearch.trim()).toLowerCase();
                const similar=exoDB.filter(e=>normalizeExName(e.name).toLowerCase()===normTyped&&e.name.toLowerCase()!==exSearch.trim().toLowerCase());
                return(<>
                  {similar.length>0&&<div style={{padding:"6px 12px",background:C.oS,borderBottom:"1px solid "+C.brd}}>
                    <div style={{fontSize:10,color:C.o}}>Variante existante : {similar.map(s=>s.name).join(", ")}</div>
                    <div style={{fontSize:9,color:C.tx3}}>Les stats seront fusionnées automatiquement</div>
                  </div>}
                  <div onClick={()=>{setNewEx(p=>({...p,name:exSearch.trim()}));setShowExDropdown(false);}} style={{padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,background:C.gS}}>
                    <span style={{fontSize:12,color:C.g,fontWeight:600}}>+ Créer "{exSearch.trim()}"</span>
                  </div>
                </>);
              })()}
              {!exSearch.trim()&&matches.length===0&&<div style={{padding:"8px 12px",fontSize:11,color:C.tx3}}>Aucun exercice</div>}
            </div>);})()}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5}}>Type d'exercice</div>
            <div style={{display:"flex",gap:4}}>{[{k:"muscu",l:"Musculation",c:C.tx2},{k:"halterophilie",l:"Haltérophilie",c:"#8b5cf6"},{k:"plio",l:"Pliométrie",c:C.o},{k:"mobilite",l:"Mobilité",c:C.b}].map(({k,l,c})=>{const on=(newEx.exType||"muscu")===k;return(<button key={k} onClick={()=>setNewEx(p=>({...p,exType:k}))} style={{flex:1,padding:"7px 4px",borderRadius:7,border:"1px solid "+(on?c:C.brdL),background:on?c+"20":"transparent",color:on?c:C.tx3,fontSize:10,fontWeight:on?700:400,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>);})}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:!["muscu","halterophilie"].includes(newEx.exType||"muscu")?"1fr":"1fr 1fr",gap:8,marginBottom:12}}>
            <div>
              <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5}}>Bloc</div>
              <select value={newEx.bloc||""} onChange={e=>setNewEx(p=>({...p,bloc:e.target.value||null}))} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+(sessBlocs.find(b=>b.id===newEx.bloc)?.color||C.brdL),background:C.s2,color:sessBlocs.find(b=>b.id===newEx.bloc)?.color||C.tx,fontSize:12,fontFamily:"inherit"}}>
                <option value="">— Aucun —</option>
                {sessBlocs.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            {["muscu","halterophilie"].includes(newEx.exType||"muscu")&&<div>
              <div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",marginBottom:5}}>Muscle cible</div>
              <select value={newEx.target} onChange={e=>setNewEx(p=>({...p,target:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit"}}>
                {ALL_MIDS.filter(m=>!MTREE.find(g=>g.id===m&&g.s.length>0)).map(m=><option key={m} value={m}>{mL(m)}</option>)}
              </select>
            </div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setAddForm(false);setNewEx({name:"",bloc:sessBlocs[0]?.id||null,target:"Pecs",exType:"muscu"});setExSearch("");setShowExDropdown(false);}} style={{flex:1,padding:"9px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
            <button onClick={addExercise} style={{flex:2,padding:"9px 0",borderRadius:4,border:"none",background:C.g,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ajouter</button>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>)}
  {videoEx&&(<div onClick={()=>setVideoEx(null)} style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.92)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
    <div style={{width:'100%',maxWidth:480}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{videoEx.name}</div>
        <button onClick={()=>setVideoEx(null)} style={{background:'none',border:'none',color:C.tx2,fontSize:24,cursor:'pointer',fontFamily:'inherit',lineHeight:1}}>×</button>
      </div>
      {videoEx.youtube_id?(<div style={{position:'relative',paddingBottom:'56.25%',background:'#000',borderRadius:6,overflow:'hidden'}}>
        <iframe src={'https://www.youtube.com/embed/'+videoEx.youtube_id+'?autoplay=1'} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}} allow="autoplay; encrypted-media" allowFullScreen/>
      </div>):videoEx.image_url?(
        <img src={videoEx.image_url} style={{width:'100%',borderRadius:6,display:'block'}} alt={videoEx.name}/>
      ):null}
      <button onClick={()=>setVideoEx(null)} style={{width:'100%',marginTop:14,padding:'11px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx3,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Fermer</button>
    </div>
  </div>)}
  {methodPickerEx&&(<Suspense fallback={null}><MethodPickerDialog
    setsCount={methodPickerEx.sets}
    onAttach={(attachment, method)=>{
      const exId=methodPickerEx.id;
      const exSid=methodPickerEx.sid;
      const weeklyConfigs=method.config?.weekly_configs;
      setExos(prev=>({...prev,[exSid]:(prev[exSid]||[]).map(e=>{
        if(e.id!==exId)return e;
        if(weeklyConfigs&&weeklyConfigs.length>0){
          // Multi-week method: fill each week from weekly_configs, carry-forward last derived for unconfigured weeks
          const newWeeks={...e.weeks};
          let lastDerived={};
          weeksArr.forEach(w=>{
            const wc=weeklyConfigs.find(x=>x.week===w);
            if(wc){
              lastDerived=methodConfigToWeekFields(wc.config);
              newWeeks[w]={...(newWeeks[w]||{}),...lastDerived,method_attachment:attachment};
            } else {
              // Carry-forward last configured week's derived fields
              newWeeks[w]={...(newWeeks[w]||{}),...lastDerived,method_attachment:attachment};
            }
          });
          return {...e,weeks:newWeeks};
        }
        // Single-config method: apply derived to ALL weeks so S+1, S+2 are pre-filled
        const derived=methodConfigToWeekFields(method.config);
        const newWeeks={...e.weeks};
        weeksArr.forEach(w=>{newWeeks[w]={...(newWeeks[w]||{}),...derived,method_attachment:attachment};});
        return {...e,weeks:newWeeks};
      })}));
      setMethodPickerEx(null);
    }}
    onClose={()=>setMethodPickerEx(null)}
  /></Suspense>)}
  </div>);
}


function CoachExoParams({exMeta,setExMeta,exos,setExos,blockConfig}){
  const[search,setSearch]=useState("");const[open,setOpen]=useState(null);
  const[addMode,setAddMode]=useState(false);const[newName,setNewName]=useState("");const[newTarget,setNewTarget]=useState(["Pecs"]);
  const[editName,setEditName]=useState(null);const[editVal,setEditVal]=useState("");
  const[confirmDel,setConfirmDel]=useState(null);
  const tierCfg=blockConfig?.tierConfig||DEF_TIER_CONFIG;
  const allU=(()=>{const seen=new Set();const res=[];
    const addIfNew=(e)=>{const norm=normalizeExName(e.name).toLowerCase();if(!seen.has(norm)){seen.add(norm);res.push({...e,name:normalizeExName(e.name)||e.name});}};
    Object.values(exos||{}).flat().forEach(addIfNew);
    Object.keys(exMeta||{}).forEach(name=>{const norm=normalizeExName(name).toLowerCase();if(!seen.has(norm)){seen.add(norm);const pr=normPrimary(exMeta[name]?.primary);res.push({id:"meta_"+name,name:normalizeExName(name)||name,bloc:"ESTH",target:pr[0]||"Pecs",weeks:{},exType:exMeta[name]?.exType||"muscu"});}});
    return res;
  })();
  const usageCount=(name)=>{const norm=normalizeExName(name).toLowerCase();return Object.values(exos||{}).flat().filter(e=>normalizeExName(e.name).toLowerCase()===norm).length;};
  const filt=allU.filter(e=>e.name.toLowerCase().includes(search.toLowerCase()));
  const upd=(name,f,v)=>setExMeta(p=>({...p,[name]:{...(p[name]||{}),[f]:v}}));
  const togSec=(name,m,curMeta)=>{const base=curMeta||exMeta[name]||{};const pr=normPrimary(base.primary);if(pr.includes(m))return;const c=base.secondary||[];setExMeta({...exMeta,[name]:{...base,secondary:c.includes(m)?c.filter(x=>x!==m):[...c,m]}});};
  const updTierForEx=(exName,newTier)=>{
    const norm=normalizeExName(exName).toLowerCase();
    const newExos={};Object.keys(exos||{}).forEach(sid=>{newExos[sid]=(exos[sid]||[]).map(e=>normalizeExName(e.name).toLowerCase()===norm?{...e,tier:newTier}:e);});
    setExos(newExos);
    setExMeta({...exMeta,[exName]:{...(exMeta[exName]||{}),tier:newTier}});
  };
  const updExTypeForEx=(exName,newType)=>{
    const norm=normalizeExName(exName).toLowerCase();
    const newExos={};Object.keys(exos||{}).forEach(sid=>{newExos[sid]=(exos[sid]||[]).map(e=>normalizeExName(e.name).toLowerCase()===norm?{...e,exType:newType,isFlexibility:newType!=="muscu"&&newType!=="halterophilie"}:e);});
    setExos(newExos);
    setExMeta({...exMeta,[exName]:{...(exMeta[exName]||{}),exType:newType}});
  };
  const getExTierFromExos=(exName)=>{
    const norm=normalizeExName(exName).toLowerCase();
    for(const sid of Object.keys(exos||{})){const found=(exos[sid]||[]).find(e=>normalizeExName(e.name).toLowerCase()===norm);if(found&&found.tier)return found.tier;}
    if(exMeta[exName]?.tier)return exMeta[exName].tier;
    return EX_TIER[exName]||3;
  };
  const addExo=()=>{
    const n=newName.trim();if(!n)return;
    if(allU.some(e=>e.name.toLowerCase()===n.toLowerCase()))return;
    setExMeta(p=>({...p,[n]:{primary:newTarget,secondary:[],tier:3}}));
    setNewName("");setAddMode(false);setNewTarget(["Pecs"]);
  };
  const renameExo=(oldName,newN)=>{
    const trimmed=newN.trim();if(!trimmed||trimmed===oldName)return setEditName(null);
    if(allU.some(e=>e.name.toLowerCase()===trimmed.toLowerCase()&&e.name!==oldName))return;
    const normOld=normalizeExName(oldName).toLowerCase();
    setExos(prev=>{const n={...prev};Object.keys(n).forEach(sid=>{n[sid]=n[sid].map(e=>normalizeExName(e.name).toLowerCase()===normOld?{...e,name:trimmed}:e);});return n;});
    setExMeta(p=>{const n={...p};if(n[oldName]){n[trimmed]=n[oldName];delete n[oldName];}return n;});
    setEditName(null);
  };
  const deleteExo=(name)=>{
    setExos(prev=>{const n={...prev};Object.keys(n).forEach(sid=>{n[sid]=n[sid].filter(e=>e.name!==name);});return n;});
    setExMeta(p=>{const n={...p};delete n[name];return n;});
    setConfirmDel(null);setOpen(null);
  };
  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." style={{flex:1,padding:"10px 14px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
      <button onClick={()=>setAddMode(!addMode)} style={{padding:"8px 14px",borderRadius:4,border:"1px solid "+C.g+"50",background:addMode?C.gS:"transparent",color:C.g,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{addMode?"✕":"+ Exo"}</button>
    </div>
    {addMode&&(<div style={{background:C.s1,borderRadius:6,padding:14,border:"1px solid "+C.g+"40",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.g,marginBottom:8}}>Nouvel exercice</div>
      <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nom de l'exercice..." onKeyDown={e=>e.key==="Enter"&&addExo()} style={{width:"100%",padding:"8px 12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
      <div style={{fontSize:10,fontWeight:600,color:C.tx3,marginBottom:6}}>Muscles principaux <span style={{fontWeight:400}}>(max 4)</span></div>
      <MuscleSelector value={newTarget} onChange={v=>{const arr=normPrimary(v);if(arr.length<=4)setNewTarget(arr);}} multi/>
      <button onClick={addExo} disabled={!newName.trim()} style={{width:"100%",padding:"8px",borderRadius:4,border:"none",background:C.g,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:newName.trim()?1:0.4}}>Ajouter</button>
    </div>)}
    {filt.map(ex=>{const bt=BT[ex.bloc]||{c:C.tx3,l:"?"};const isOpen=open===(ex.id||ex.name);const meta=exMeta[ex.name]||{primary:ex.target,secondary:[]};const primaries=normPrimary(meta.primary);const pc=primaries.length>0?getMC(primaries[0]):getMC(ex.target);const curTier=getExTierFromExos(ex.name);const curTc=tierCfg[curTier]||tierCfg[3];const usage=usageCount(ex.name);const isEditing=editName===ex.name;const eType=ex.exType||(ex.isFlexibility?"mobilite":"muscu");const isMuscu=eType==="muscu"||eType==="halterophilie";
      return(<div key={ex.id||ex.name} style={{background:C.s1,borderRadius:6,marginBottom:6,border:"1px solid "+(confirmDel===ex.name?C.r+"60":C.brd),overflow:"hidden"}}>
        <div onClick={()=>{if(!isEditing&&confirmDel!==ex.name)setOpen(isOpen?null:(ex.id||ex.name));}} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer",gap:10}}>
          <div style={{width:3,height:28,borderRadius:2,background:bt.c,flexShrink:0}}/>
          <div style={{flex:1}}>
            {isEditing?(<input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={()=>renameExo(ex.name,editVal)} onKeyDown={e=>{if(e.key==="Enter")renameExo(ex.name,editVal);if(e.key==="Escape")setEditName(null);}} onClick={e=>e.stopPropagation()} style={{fontSize:13,fontWeight:600,background:C.s2,border:"1px solid "+C.acS,borderRadius:6,padding:"4px 8px",color:C.tx,fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>):(
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:13,fontWeight:600}}>{ex.name}</span>{usage>0&&<span style={{fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:5,background:C.acS,color:C.ac}}>{usage} séance{usage>1?"s":""}</span>}{usage===0&&<span style={{fontSize:8,padding:"2px 6px",borderRadius:5,background:C.s2,color:C.tx3}}>non utilisé</span>}</div>)}
            <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>{isMuscu&&primaries.map(m=>{const mc=getMC(m);return <span key={m} style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5,background:mc+"20",color:mc}}>{mL(m)}</span>;})}{isMuscu&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:5,background:curTc.c+"20",color:curTc.c}}>T{curTier}</span>}{!isMuscu&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:5,background:eType==="plio"?C.o+"20":C.b+"20",color:eType==="plio"?C.o:C.b}}>{eType==="plio"?"Plio":"Mobilité"}</span>}{isMuscu&&(meta.secondary||[]).slice(0,3).map(m=><span key={m} style={{fontSize:9,padding:"2px 6px",borderRadius:5,background:getMC(m)+"15",color:getMC(m)}}>{mL(m)}</span>)}</div>
          </div>
          <span style={{fontSize:12,color:C.tx3}}>{isOpen?"^":"v"}</span>
        </div>
        {confirmDel===ex.name&&(<div style={{padding:"10px 14px",background:C.rS,borderTop:"1px solid "+C.r+"30",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:C.r,fontWeight:600}}>Supprimer {ex.name} ?{usage>0?` (${usage} séance${usage>1?"s":""})`:""}</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setConfirmDel(null)} style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Non</button>
            <button onClick={()=>deleteExo(ex.name)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:C.r,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Oui</button>
          </div>
        </div>)}
        {isOpen&&(<div style={{padding:"0 14px 16px",borderTop:"1px solid "+C.brd}}><div style={{paddingTop:12}}>
          {/* Edit / Delete buttons */}
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <button onClick={(e)=>{e.stopPropagation();setEditName(ex.name);setEditVal(ex.name);}} style={{flex:1,padding:"6px",borderRadius:7,border:"1px solid "+C.ac+"40",background:C.acS,color:C.ac,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Renommer</button>
            <button onClick={(e)=>{e.stopPropagation();setConfirmDel(ex.name);}} style={{flex:1,padding:"6px",borderRadius:7,border:"1px solid "+C.r+"40",background:C.rS,color:C.r,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Supprimer</button>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:6}}>Type d'exercice</div>
            <div style={{display:"flex",gap:4}}>{[{v:"muscu",l:"Muscu"},{v:"halterophilie",l:"Halté."},{v:"plio",l:"Plio"},{v:"mobilite",l:"Mobilité"}].map(({v,l})=>(<button key={v} onClick={()=>updExTypeForEx(ex.name,v)} style={{flex:1,padding:"6px 4px",borderRadius:7,border:"1px solid "+(eType===v?C.ac:C.brdL),background:eType===v?C.acS:"transparent",color:eType===v?C.ac:C.tx3,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>))}</div>
          </div>
          {isMuscu&&<><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:8}}>Muscles principaux <span style={{fontWeight:400,textTransform:"none"}}>(max 4)</span></div><MuscleSelector value={primaries} onChange={v=>{const arr=normPrimary(v);if(arr.length<=4){const sec=(meta.secondary||[]).filter(m=>!arr.includes(m));setExMeta(p=>({...p,[ex.name]:{...(p[ex.name]||{}),primary:arr,secondary:sec}}));}}} multi/><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",margin:"12px 0 8px"}}>Muscles secondaires <span style={{fontWeight:400,textTransform:"none"}}>(comptent 50% du volume)</span></div><MuscleSelector value={meta.secondary||[]} onChange={v=>{const arr=normPrimary(v).filter(m=>!primaries.includes(m));setExMeta({...exMeta,[ex.name]:{...meta,secondary:arr}});}} multi/></>}</div></div>)}
      </div>);
    })}
    <div style={{fontSize:10,color:C.tx3,textAlign:"center",padding:"12px 0"}}>{filt.length} exercice{filt.length>1?"s":""} dans la base</div>
  </div>);
}

export { CoachProgramEditor, CoachExoParams };
