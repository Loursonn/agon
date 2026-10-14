import { useState, useRef, useCallback } from "react";
import { C } from "@/lib/theme";
import { BZFRONT, BZBACK, ALL_BZ, INJ_TYPES, INJ_STATUS, stC } from "@/lib/muscles";
import { todayKey } from "@/lib/date";
import { WELL_ITEMS, calcScore, getReco, getAlerts } from "@/lib/wellness";

// ── Legacy zone-based BodyMap (used by InjuryForm) ──────────────────────────
function BodyMap({selected,onToggle,color}){
  const[view,setView]=useState("front");
  const c=color||C.r;
  const zones=view==="front"?BZFRONT:BZBACK;
  const bp=C.brdL;
  return(<div>
    <div style={{display:"flex",gap:6,marginBottom:8}}>
      {["front","back"].map(v=><button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"6px 0",borderRadius:7,border:"1px solid "+(view===v?c:C.brdL),background:view===v?c+"20":"transparent",color:view===v?c:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{v==="front"?"Vue avant":"Vue arriere"}</button>)}
    </div>
    <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
      <svg viewBox="0 0 100 160" style={{width:"42%",height:"auto",flexShrink:0}}>
        <ellipse cx="50" cy="12" rx="10" ry="11" fill="none" stroke={bp} strokeWidth="1.5"/>
        <path d="M34,24 L28,28 L24,74 L76,74 L72,28 L66,24 Q60,21 50,21 Q40,21 34,24 Z" fill="none" stroke={bp} strokeWidth="1.5"/>
        <path d="M28,28 L20,32 L12,56 L9,74 L14,74 L17,56 L23,33" fill="none" stroke={bp} strokeWidth="1.5"/>
        <path d="M72,28 L80,32 L88,56 L91,74 L86,74 L83,56 L77,33" fill="none" stroke={bp} strokeWidth="1.5"/>
        <path d="M40,74 L36,110 L34,148 L41,148 L43,112 L46,74" fill="none" stroke={bp} strokeWidth="1.5"/>
        <path d="M60,74 L64,110 L66,148 L59,148 L57,112 L54,74" fill="none" stroke={bp} strokeWidth="1.5"/>
        {zones.map(z=>{const on=selected.includes(z.id);return(<g key={z.id} onClick={()=>onToggle(z.id)} style={{cursor:"pointer"}}><circle cx={z.cx} cy={z.cy} r={z.r+2} fill={on?c+"30":"transparent"} stroke={on?c:bp} strokeWidth={on?"1.8":"0.8"}/>{on&&<circle cx={z.cx} cy={z.cy} r={z.r*0.45} fill={c}/>}</g>);})}
      </svg>
      <div style={{flex:1}}>
        <div style={{fontSize:9,color:C.tx3,marginBottom:6}}>Zones selectionnees :</div>
        {selected.length===0?<div style={{fontSize:10,color:C.tx3,fontStyle:"italic"}}>Aucune - appuie sur le corps</div>:(
          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
            {selected.map(id=>{const z=ALL_BZ.find(z=>z.id===id);return z?<button key={id} onClick={()=>onToggle(id)} style={{padding:"2px 7px",borderRadius:5,background:c+"20",color:c,fontSize:9,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit"}}>{z.label} x</button>:null;})}
          </div>
        )}
      </div>
    </div>
  </div>);
}

// ── Free-point DOMS BodyMap ─────────────────────────────────────────────────
const DOMS_COLORS = ["#F5A623", "#F07030", "#FF5A33"];
function domsColor(intensity) {
  if (!intensity || intensity <= 3) return DOMS_COLORS[0];
  if (intensity <= 6) return DOMS_COLORS[1];
  return DOMS_COLORS[2];
}

const BODY_OUTLINE = (bp) => (
  <>
    <ellipse cx="50" cy="12" rx="10" ry="11" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M34,24 L28,28 L24,74 L76,74 L72,28 L66,24 Q60,21 50,21 Q40,21 34,24 Z" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M28,28 L20,32 L12,56 L9,74 L14,74 L17,56 L23,33" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M72,28 L80,32 L88,56 L91,74 L86,74 L83,56 L77,33" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M40,74 L36,110 L34,148 L41,148 L43,112 L46,74" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M60,74 L64,110 L66,148 L59,148 L57,112 L54,74" fill="none" stroke={bp} strokeWidth="1.5"/>
  </>
);

function DomsBodyMap({ points, onChange }) {
  const [view, setView] = useState("front");
  const [selected, setSelected] = useState(null); // selected point id for intensity edit
  const [dragging, setDragging] = useState(null);
  const svgRef = useRef(null);
  const bp = C.brdL;

  const getSvgCoords = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 160;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }, []);

  const handleSvgClick = useCallback((e) => {
    if (dragging) return;
    const coords = getSvgCoords(e);
    if (!coords) return;
    // Check if clicking near an existing point (within ~5 SVG units)
    const near = points.find(p => p.side === view && Math.hypot(p.x - coords.x, p.y - coords.y) < 5);
    if (near) {
      setSelected(selected === near.id ? null : near.id);
      return;
    }
    // Add new point
    const np = { id: String(Date.now()), x: coords.x, y: coords.y, side: view };
    onChange([...points, np]);
    setSelected(null);
  }, [points, view, onChange, getSvgCoords, dragging, selected]);

  const handlePointerDown = useCallback((e, id) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(id);
    e.target.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    const coords = getSvgCoords(e);
    if (!coords) return;
    onChange(points.map(p => p.id === dragging ? { ...p, x: coords.x, y: coords.y } : p));
  }, [dragging, points, onChange, getSvgCoords]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const removePoint = useCallback((id) => {
    onChange(points.filter(p => p.id !== id));
    if (selected === id) setSelected(null);
  }, [points, onChange, selected]);

  const setIntensity = useCallback((id, val) => {
    onChange(points.map(p => p.id === id ? { ...p, intensity: val } : p));
  }, [points, onChange]);

  const viewPoints = points.filter(p => p.side === view);
  const selectedPt = selected ? points.find(p => p.id === selected) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["front", "back"].map(v => (
          <button key={v} onClick={() => { setView(v); setSelected(null); }} style={{
            flex: 1, padding: "6px 0", borderRadius: 7,
            border: "1px solid " + (view === v ? C.o : C.brdL),
            background: view === v ? C.o + "20" : "transparent",
            color: view === v ? C.o : C.tx3,
            fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            {v === "front" ? "Vue avant" : "Vue arrière"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 160"
          style={{ width: "55%", height: "auto", flexShrink: 0, touchAction: "none" }}
          onClick={handleSvgClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Clickable background */}
          <rect x="0" y="0" width="100" height="160" fill="transparent" />
          {BODY_OUTLINE(bp)}

          {/* DOMS points */}
          {viewPoints.map(p => {
            const col = domsColor(p.intensity);
            const isSel = selected === p.id;
            return (
              <g key={p.id} style={{ cursor: dragging === p.id ? "grabbing" : "grab" }}>
                {/* Outer glow */}
                <circle cx={p.x} cy={p.y} r={isSel ? 6 : 4.5} fill={col + "30"} stroke={col} strokeWidth={isSel ? 1.5 : 1} />
                {/* Inner dot */}
                <circle cx={p.x} cy={p.y} r={2} fill={col} />
                {/* Drag handle (invisible larger area) */}
                <circle
                  cx={p.x} cy={p.y} r={7} fill="transparent"
                  onPointerDown={(e) => handlePointerDown(e, p.id)}
                  style={{ cursor: "grab" }}
                />
                {/* Intensity label */}
                {p.intensity && (
                  <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: 3.5, fontWeight: 800, fill: "#fff", pointerEvents: "none" }}>
                    {p.intensity}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.tx3, marginBottom: 6 }}>
            {points.length === 0 ? "Touche le corps pour ajouter un point" : `${points.length} point${points.length > 1 ? "s" : ""}`}
          </div>

          {/* Point list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {points.map(p => {
              const col = domsColor(p.intensity);
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 6px", borderRadius: 6,
                  background: selected === p.id ? col + "15" : "transparent",
                  border: "1px solid " + (selected === p.id ? col + "40" : "transparent"),
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: C.tx2, flex: 1 }}>
                    {p.side === "front" ? "Av." : "Ar."}{p.intensity ? ` — ${p.intensity}/10` : ""}
                  </span>
                  <button onClick={() => { setSelected(selected === p.id ? null : p.id); setView(p.side); }} style={{
                    border: "none", background: "none", color: C.tx3, fontSize: 9, cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }}></button>
                  <button onClick={() => removePoint(p.id)} style={{
                    border: "none", background: "none", color: C.r, fontSize: 9, cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }}>✕</button>
                </div>
              );
            })}
          </div>

          {/* Intensity editor for selected point */}
          {selectedPt && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 4, background: C.s1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", marginBottom: 6 }}>Intensité douleur</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                  const sel = selectedPt.intensity === n;
                  const nc = domsColor(n);
                  return (
                    <button key={n} onClick={() => setIntensity(selectedPt.id, n)} style={{
                      width: 24, height: 24, borderRadius: 6,
                      border: "1.5px solid " + (sel ? nc : C.brdL),
                      background: sel ? nc + "30" : "transparent",
                      color: sel ? nc : C.tx3,
                      fontSize: 10, fontWeight: sel ? 800 : 500,
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                    }}>{n}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InjuryForm({onSave,onCancel,existing}){
  const[zones,setZones]=useState(existing?.zones||[]);
  const[intensity,setIntensity]=useState(existing?.intensity||5);
  const[type,setType]=useState(existing?.type||"");
  const[status,setStatus]=useState(existing?.status||"Nouvelle");
  const[notes,setNotes]=useState(existing?.notes||"");
  const tog=id=>setZones(p=>p.includes(id)?p.filter(z=>z!==id):[...p,id]);
  const intC=intensity<=3?C.g:intensity<=6?C.o:C.r;
  return(<div style={{background:C.s1,borderRadius:6,padding:16,border:"1px solid "+C.brd}}>
    <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:8}}>Localisation</div><BodyMap selected={zones} onToggle={tog} color={C.r}/></div>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:8}}>Intensite de la douleur</div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>setIntensity(p=>Math.max(1,p-1))} style={{width:28,height:28,borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>-</button>
        <div style={{flex:1,textAlign:"center"}}><span style={{fontSize:26,fontWeight:800,color:intC}}>{intensity}</span><span style={{fontSize:11,color:C.tx3}}>/10</span></div>
        <button onClick={()=>setIntensity(p=>Math.min(10,p+1))} style={{width:28,height:28,borderRadius:7,border:"1px solid "+C.brdL,background:"transparent",color:C.tx2,cursor:"pointer",fontFamily:"inherit"}}>+</button>
      </div>
      <div style={{height:4,background:C.s2,borderRadius:2,overflow:"hidden",marginTop:6}}><div style={{height:"100%",width:(intensity/10*100)+"%",background:intC,borderRadius:2,transition:"width 0.2s"}}/></div>
    </div>
    <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:8}}>Type</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{INJ_TYPES.map(t=><button key={t} onClick={()=>setType(type===t?"":t)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid "+(type===t?C.r:C.brdL),background:type===t?C.rS:"transparent",color:type===t?C.r:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:type===t?700:400}}>{t}</button>)}</div></div>
    <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:8}}>Statut</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{INJ_STATUS.map(s=>{const sc=stC(s);return(<button key={s} onClick={()=>setStatus(s)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid "+(status===s?sc:C.brdL),background:status===s?sc+"20":"transparent",color:status===s?sc:C.tx3,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:status===s?700:400}}>{s}</button>);})}</div></div>
    <div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:600,color:C.tx3,textTransform:"uppercase",marginBottom:6}}>Notes</div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Description, circonstances, traitements..." rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx,fontSize:12,fontFamily:"inherit",resize:"none",boxSizing:"border-box",lineHeight:1.5}}/></div>
    <div style={{display:"flex",gap:8}}>
      {onCancel&&<button onClick={onCancel} style={{flex:1,padding:"10px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>}
      <button onClick={()=>onSave({id:existing?.id||Date.now(),zones,intensity,type,status,notes,date:existing?.date||todayKey()})} style={{flex:2,padding:"10px 0",borderRadius:4,border:"none",background:C.r,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{existing?"Modifier":"Ajouter"}</button>
    </div>
  </div>);
}

const bSm={width:32,height:32,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,fontSize:16,cursor:"pointer",fontFamily:"inherit"};

function TimePick({label,time,setTime}){
  return(<div style={{background:C.s1,borderRadius:6,padding:"12px 14px",flex:1,textAlign:"center"}}><div style={{fontSize:9,color:C.tx3,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>{label}</div><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><div><button onClick={()=>setTime(t=>({...t,h:(t.h+1)%24}))} style={bSm}>+</button><div style={{fontSize:22,fontWeight:800,color:C.tx,fontFamily:"monospace",margin:"4px 0"}}>{String(time.h).padStart(2,"0")}</div><button onClick={()=>setTime(t=>({...t,h:(t.h-1+24)%24}))} style={bSm}>-</button></div><div style={{fontSize:18,color:C.tx3}}>:</div><div><button onClick={()=>setTime(t=>({...t,m:(t.m+15)%60}))} style={bSm}>+</button><div style={{fontSize:22,fontWeight:800,color:C.tx,fontFamily:"monospace",margin:"4px 0"}}>{String(time.m).padStart(2,"0")}</div><button onClick={()=>setTime(t=>({...t,m:(t.m-15+60)%60}))} style={bSm}>-</button></div></div></div>);
}

function WellnessFlow({existing,onSave,sleepTarget,onAddInjury,weightLog}){
  const tgt=sleepTarget||8;
  const S_DOMS_ZONES=WELL_ITEMS.length; // 5 - shown if doms <= 3 (DOMS significant)
  const S_INJURY=6;const S_SLEEP=7;const S_WEIGHT=8;const S_BILAN=9;
  const[step,setStep]=useState(0);
  const[vals,setVals]=useState({fatigue:existing?.fatigue||3,sommeil:existing?.sommeil||3,stress:existing?.stress||3,energie:existing?.energie||3,doms:existing?.doms||5});
  const[domsZones,setDomsZones]=useState(existing?.domsZones||[]);
  const[domsPoints,setDomsPoints]=useState(existing?.domsPoints||[]);
  const[coucher,setCoucher]=useState(existing?.coucher||{h:23,m:0});
  const[reveil,setReveil]=useState(existing?.reveil||{h:7,m:0});
  const[poids,setPoids]=useState(existing?.poids||"");
  const[sleepInterrupt,setSleepInterrupt]=useState(existing?.sleepInterrupt??null);
  const[sleepInterruptNote,setSleepInterruptNote]=useState(existing?.sleepInterruptNote||"");
  const prevPoids=(()=>{if(!weightLog)return null;const d=new Date();d.setDate(d.getDate()-1);const k=String(d.getFullYear())+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");return weightLog[k]||null;})();
  const[injOui,setInjOui]=useState(null);
  const[injComment,setInjComment]=useState(existing?.injComment||"");
  const score=calcScore(vals);const reco=getReco(score);const alerts=getAlerts(vals);
  const sleepDur=()=>{const rM=reveil.h*60+reveil.m,cM=coucher.h*60+coucher.m;return Math.round((rM<=cM?rM+1440-cM:rM-cM)/60*10)/10;};
  const dur=sleepDur();const diff=Math.round((dur-tgt)*10)/10;const sleepC=Math.abs(diff)<=0.5?C.g:Math.abs(diff)<=1.5?C.o:C.r;
  const togDoms=id=>setDomsZones(p=>p.includes(id)?p.filter(z=>z!==id):[...p,id]);
  const progPct=Math.round((Math.min(step,S_BILAN)/S_BILAN)*100);
  const goBack=()=>{
    if(step===0)return;
    if(step<WELL_ITEMS.length){setStep(step-1);return;}
    if(step===S_DOMS_ZONES){setStep(WELL_ITEMS.length-1);return;}
    if(step===S_INJURY){setStep(vals.doms<=3?S_DOMS_ZONES:WELL_ITEMS.length-1);return;}
    if(step===S_SLEEP){setStep(S_INJURY);return;}
    if(step===S_WEIGHT){setStep(S_SLEEP);return;}
    if(step===S_BILAN){setStep(S_WEIGHT);return;}
  };
  const progBar=(<div style={{marginBottom:24}}>
    {step>0&&<button onClick={goBack} style={{background:'none',border:'none',color:C.tx3,fontSize:20,cursor:'pointer',fontFamily:'inherit',padding:'0 0 10px',display:'flex',alignItems:'center',gap:4,lineHeight:1}}>← <span style={{fontSize:11,color:C.tx3}}>Retour</span></button>}
    <div style={{height:3,background:C.s2,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:progPct+"%",background:C.ac,borderRadius:2,transition:"width 0.3s"}}/></div>
  </div>);

  // 5 wellness questions
  if(step<WELL_ITEMS.length){
    const it=WELL_ITEMS[step];
    const pick=(v)=>{
      const nv={...vals,[it.k]:v};setVals(nv);
      if(step===WELL_ITEMS.length-1){// last q = fraîcheur musculaire
        setStep(nv.doms<=3?S_DOMS_ZONES:S_INJURY); // doms<=3 = douleurs significatives → zones
      } else {setStep(step+1);}
    };
    const BTN_COLORS=["#FF5A33","#F07030","#F5A623","#7BC67E",C.g];
    return(<div style={{padding:"20px 20px 40px"}}>{progBar}
      <div style={{fontSize:13,fontWeight:600,color:C.tx2,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Question {step+1}/5</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",marginBottom:6}}>{it.q}</div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.tx3,marginBottom:20}}><span style={{color:BTN_COLORS[0]}}>{it.lo}</span><span style={{color:BTN_COLORS[4]}}> {it.hi}</span></div>
      <div style={{display:"flex",gap:8}}>{[1,2,3,4,5].map(n=>{const sel=vals[it.k]===n;return(<button key={n} onClick={()=>pick(n)} style={{flex:1,padding:"14px 0",borderRadius:4,border:"2px solid "+(sel?BTN_COLORS[n-1]:C.brdL),background:sel?BTN_COLORS[n-1]+"30":C.s2,color:sel?BTN_COLORS[n-1]:C.tx3,fontSize:18,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{n}</button>);})}</div>
    </div>);
  }

  // DOMS zones (only if fraîcheur <= 3, i.e. douleurs significatives)
  if(step===S_DOMS_ZONES){
    return(<div style={{padding:"20px 20px 40px"}}>{progBar}
      <div style={{fontSize:13,fontWeight:600,color:C.tx2,textTransform:"uppercase",marginBottom:8}}>Zones de courbatures</div>
      <div style={{fontSize:18,fontWeight:800,letterSpacing:"-0.5px",marginBottom:4}}>Où as-tu des DOMS ?</div>
      <div style={{fontSize:11,color:C.tx3,marginBottom:16}}>Touche le corps pour placer un point. Retouche un point pour ajouter l'intensité.</div>
      <DomsBodyMap points={domsPoints} onChange={setDomsPoints}/>
      <button onClick={()=>setStep(S_INJURY)} style={{width:"100%",marginTop:16,padding:"13px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Suivant</button>
    </div>);
  }

  // Injury question — simple Oui/Non + commentaire
  if(step===S_INJURY){
    return(<div style={{padding:"20px 20px 40px"}}>{progBar}
      <div style={{fontSize:13,fontWeight:600,color:C.tx2,textTransform:"uppercase",marginBottom:8}}>Blessure</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",marginBottom:4}}>Es-tu blessé/malade ?</div>
      <div style={{fontSize:12,color:C.tx3,marginBottom:20}}>Douleur, maladie ou gêne différente des courbatures</div>
      <div style={{display:"flex",gap:10,marginBottom:injOui===true?16:0}}>
        <button onClick={()=>setInjOui(true)} style={{flex:1,padding:"16px 0",borderRadius:6,border:"2px solid "+(injOui===true?C.r:C.brdL),background:injOui===true?C.rS:"transparent",color:injOui===true?C.r:C.tx2,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Oui</button>
        <button onClick={()=>{setInjOui(false);setStep(S_SLEEP);}} style={{flex:1,padding:"16px 0",borderRadius:6,border:"2px solid "+(injOui===false?C.g:C.brdL),background:injOui===false?C.gS:"transparent",color:injOui===false?C.g:C.tx2,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Non</button>
      </div>
      {injOui===true&&(<>
        <textarea value={injComment} onChange={e=>setInjComment(e.target.value)} placeholder="Décris la douleur : zone, type, intensité..." rows={4} style={{width:"100%",padding:"12px 14px",borderRadius:6,border:"1px solid "+C.r+"50",background:C.s1,color:C.tx,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:14}}/>
        <button onClick={()=>setStep(S_SLEEP)} disabled={!injComment.trim()} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:injComment.trim()?C.ac:"#333",color:injComment.trim()?"#fff":C.tx3,fontSize:14,fontWeight:700,cursor:injComment.trim()?"pointer":"default",fontFamily:"inherit"}}>Continuer</button>
      </>)}
    </div>);
  }

  // Sleep
  if(step===S_SLEEP){
    return(<div style={{padding:"20px 20px 40px"}}>{progBar}
      <div style={{fontSize:13,fontWeight:600,color:C.tx2,textTransform:"uppercase",marginBottom:8}}>Sommeil</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px",marginBottom:20}}>Heures de sommeil</div>
      <div style={{display:"flex",gap:10,marginBottom:16}}><TimePick label="Coucher" time={coucher} setTime={setCoucher}/><TimePick label="Reveil" time={reveil} setTime={setReveil}/></div>
      <div style={{padding:"12px 14px",borderRadius:4,background:sleepC+"12",border:"1px solid "+sleepC+"40",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:12,color:C.tx2,fontWeight:600}}>Duree estimee</div><div style={{fontSize:10,color:C.tx3}}>Objectif: {tgt}h</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:800,color:sleepC}}>{dur}h</div><div style={{fontSize:11,color:sleepC,fontWeight:600}}>{diff>0?"+":""}{diff}h</div></div>
        </div>
      </div>
      <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid "+C.brd}}>
        <div style={{fontSize:13,fontWeight:700,color:C.tx2,marginBottom:10}}>Avez-vous été réveillé cette nuit ?</div>
        <div style={{display:"flex",gap:10,marginBottom:sleepInterrupt===true?12:0}}>
          <button onClick={()=>setSleepInterrupt(true)} style={{flex:1,padding:"12px 0",borderRadius:4,border:"2px solid "+(sleepInterrupt===true?C.o:C.brdL),background:sleepInterrupt===true?C.oS:"transparent",color:sleepInterrupt===true?C.o:C.tx2,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Oui</button>
          <button onClick={()=>{setSleepInterrupt(false);setSleepInterruptNote("");}} style={{flex:1,padding:"12px 0",borderRadius:4,border:"2px solid "+(sleepInterrupt===false?C.g:C.brdL),background:sleepInterrupt===false?C.gS:"transparent",color:sleepInterrupt===false?C.g:C.tx2,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Non</button>
        </div>
        {sleepInterrupt===true&&(<textarea value={sleepInterruptNote} onChange={e=>setSleepInterruptNote(e.target.value)} placeholder="Durée, raison... (ex: bruit, bébé — ~45 min)" rows={2} style={{width:"100%",padding:"10px 12px",borderRadius:4,border:"1px solid "+C.o+"50",background:C.s1,color:C.tx,fontSize:12,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",marginTop:8}}/>)}
      </div>
      <button onClick={()=>setStep(S_WEIGHT)} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:16}}>Suivant</button>
    </div>);
  }

  // Weight
  if(step===S_WEIGHT){
    return(<div style={{padding:"20px 20px 40px"}}>{progBar}
      <div style={{fontSize:13,fontWeight:600,color:C.tx2,textTransform:"uppercase",marginBottom:8}}>Poids</div>
      <div style={{fontSize:16,fontWeight:700,marginBottom:20}}>A jeun</div>
      <div style={{display:"flex",gap:8,marginBottom:24,alignItems:"center"}}>
        <button onClick={()=>setPoids(p=>Math.max(40,+(+p-0.5).toFixed(1)))} style={{width:48,height:48,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>-</button>
        <input type="number" step="0.1" value={poids} onChange={e=>setPoids(e.target.value)} placeholder={prevPoids?String(prevPoids):"82.5"} style={{flex:1,padding:"12px",borderRadius:4,border:"1px solid "+C.brdL,background:C.s1,color:C.tx,fontSize:24,fontWeight:800,fontFamily:"inherit",textAlign:"center"}}/>
        <span style={{fontSize:14,color:C.tx3}}>kg</span>
        <button onClick={()=>setPoids(p=>+(+p+0.5).toFixed(1))} style={{width:48,height:48,borderRadius:4,border:"1px solid "+C.brdL,background:C.s2,color:C.tx2,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>+</button>
      </div>
      {prevPoids&&!poids&&<div style={{textAlign:"center",fontSize:12,color:C.tx3,marginTop:-16,marginBottom:16}}>Hier : {prevPoids} kg</div>}
      <button onClick={()=>{setPoids("");setStep(S_BILAN);}} style={{width:"100%",padding:"11px 0",borderRadius:4,border:"1px solid "+C.brdL,background:"transparent",color:C.tx3,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>Pas de pesée</button>
      <button onClick={()=>setStep(S_BILAN)} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:C.ac,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Voir mon bilan</button>
    </div>);
  }

  // Bilan
  return(<div style={{padding:"20px 20px 40px"}}>
    <div style={{fontSize:18,fontWeight:800,letterSpacing:"-0.5px",marginBottom:20}}>Bilan du jour</div>
    <div style={{display:"flex",alignItems:"center",gap:16,padding:"16px",borderRadius:6,background:C.s1,border:"1.5px solid "+reco.c+"40",marginBottom:14}}>
      <div style={{position:"relative",width:70,height:70,flexShrink:0}}><svg viewBox="0 0 70 70" style={{width:70,height:70,transform:"rotate(-90deg)"}}><circle cx="35" cy="35" r="28" fill="none" stroke={C.s2} strokeWidth="5"/><circle cx="35" cy="35" r="28" fill="none" stroke={reco.c} strokeWidth="5" strokeDasharray={String(2*Math.PI*28)} strokeDashoffset={String(2*Math.PI*28*(1-score/100))} strokeLinecap="round"/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:reco.c}}>{score}</div></div>
      <div><div style={{fontSize:20,fontWeight:800,color:reco.c}}>{reco.label}</div><div style={{fontSize:13,color:C.tx2,marginTop:4}}>{reco.desc}</div></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
      {WELL_ITEMS.map(it=>{const v=vals[it.k];const vc=it.inv?(v>=4?C.r:v<=2?C.g:C.o):(v>=4?C.g:v<=2?C.r:C.o);return(<div key={it.k} style={{background:C.s1,borderRadius:4,padding:"8px 10px",border:"1px solid "+C.brd}}><div style={{fontSize:8,color:C.tx3,marginBottom:2}}>{it.k}</div><div style={{fontSize:18,fontWeight:800,color:vc}}>{v}<span style={{fontSize:9,color:C.tx3}}>/5</span></div></div>);})}
      <div style={{background:C.s1,borderRadius:4,padding:"8px 10px",border:"1px solid "+sleepC+"40"}}><div style={{fontSize:8,color:C.tx3,marginBottom:2}}>Sommeil</div><div style={{fontSize:16,fontWeight:800,color:sleepC}}>{dur}h</div><div style={{fontSize:8,color:sleepC}}>{diff>0?"+":""}{diff}h</div></div>
      {poids&&<div style={{background:C.s1,borderRadius:4,padding:"8px 10px",border:"1px solid "+C.brd}}><div style={{fontSize:8,color:C.tx3,marginBottom:2}}>Poids</div><div style={{fontSize:16,fontWeight:800,color:C.ac}}>{poids} kg</div></div>}
    </div>
    {domsPoints.length>0&&(<div style={{marginBottom:8,padding:"8px 12px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.o,textTransform:"uppercase",marginBottom:4}}>DOMS — {domsPoints.length} point{domsPoints.length>1?"s":""}</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{domsPoints.map(p=><span key={p.id} style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:domsColor(p.intensity)+"20",color:domsColor(p.intensity)}}>{p.side==="front"?"Avant":"Arrière"}{p.intensity?` ${p.intensity}/10`:""}</span>)}</div></div>)}
    {domsPoints.length===0&&domsZones.length>0&&(<div style={{marginBottom:8,padding:"8px 12px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.o,textTransform:"uppercase",marginBottom:4}}>DOMS</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{domsZones.map(id=>{const z=ALL_BZ.find(z=>z.id===id);return z?<span key={id} style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:C.o+"20",color:C.o}}>{z.label}</span>:null;})}</div></div>)}
    {injOui&&injComment&&(<div style={{marginBottom:8,padding:"8px 12px",borderRadius:4,background:C.r+"10",border:"1px solid "+C.r+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.r,textTransform:"uppercase",marginBottom:4}}>Blessure signalée</div><div style={{fontSize:11,color:C.r,lineHeight:1.5}}>{injComment}</div></div>)}
    {alerts.length>0&&<div style={{marginBottom:12}}>{alerts.map((a,i)=><div key={i} style={{padding:"8px 12px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30",fontSize:11,color:C.o,marginBottom:5}}>{a}</div>)}</div>}
    {sleepInterrupt===true&&sleepInterruptNote&&(<div style={{marginBottom:8,padding:"8px 12px",borderRadius:4,background:C.o+"10",border:"1px solid "+C.o+"30"}}><div style={{fontSize:9,fontWeight:600,color:C.o,textTransform:"uppercase",marginBottom:4}}>Réveil nocturne</div><div style={{fontSize:11,color:C.o,lineHeight:1.5}}>{sleepInterruptNote}</div></div>)}
    <button onClick={()=>onSave({...vals,domsZones,domsPoints,coucher,reveil,sleepDur:dur,poids:+poids||null,score,injComment:injOui?injComment:null,sleepInterrupt:sleepInterrupt??null,sleepInterruptNote:sleepInterrupt?sleepInterruptNote||null:null})} style={{width:"100%",padding:"13px 0",borderRadius:6,border:"none",background:C.g,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Sauvegarder</button>
  </div>);
}

export { BodyMap, DomsBodyMap, InjuryForm, WellnessFlow };
