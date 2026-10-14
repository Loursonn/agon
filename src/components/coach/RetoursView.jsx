import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
function RetoursView(){
  const{user,profile}=useAuth();
  const isAdmin=profile?.is_admin===true;
  const[retours,setRetours]=useState([]);
  const[votes,setVotes]=useState({});
  const[profiles,setProfiles]=useState({});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);
  const[newContent,setNewContent]=useState('');
  const[showAdd,setShowAdd]=useState(false);
  const[submitting,setSubmitting]=useState(false);
  const[submitErr,setSubmitErr]=useState(null);
  const[confirmDel,setConfirmDel]=useState(null);

  const load=async()=>{
    setLoading(true);setError(null);
    const{data:rData,error:rErr}=await supabase.from('retours').select('*').order('created_at',{ascending:false});
    if(rErr){setError(rErr.code==='42P01'?'Les tables ne sont pas encore créées. Applique la migration SQL dans Supabase.':rErr.message);setLoading(false);return;}
    const{data:vData}=await supabase.from('retours_votes').select('*');
    // Fetch profiles for authors
    const ids=[...new Set((rData||[]).map(r=>r.athlete_id))];
    let profMap={};
    if(ids.length>0){
      const{data:pData}=await supabase.from('profiles').select('id,full_name,first_name,last_name').in('id',ids);
      (pData||[]).forEach(p=>{profMap[p.id]=p;});
    }
    setRetours(rData||[]);
    setProfiles(profMap);
    if(vData){
      const v={};
      vData.forEach(vote=>{
        if(!v[vote.retour_id])v[vote.retour_id]={likes:0,dislikes:0,myVote:null};
        if(vote.vote==='like')v[vote.retour_id].likes++;
        else v[vote.retour_id].dislikes++;
        if(vote.user_id===user?.id)v[vote.retour_id].myVote=vote.vote;
      });
      setVotes(v);
    }
    setLoading(false);
  };

  useEffect(()=>{load();},[]);

  const addRetour=async()=>{
    if(!newContent.trim()||!user)return;
    setSubmitting(true);setSubmitErr(null);
    const{error:err}=await supabase.from('retours').insert({athlete_id:user.id,content:newContent.trim()});
    if(err){setSubmitErr(err.code==='42P01'?'Table manquante — applique la migration SQL dans Supabase.':err.message);setSubmitting(false);return;}
    setNewContent('');setShowAdd(false);setSubmitting(false);load();
  };

  const doVote=async(retourId,voteType)=>{
    if(!user)return;
    const current=votes[retourId]?.myVote;
    if(current===voteType){
      await supabase.from('retours_votes').delete().match({retour_id:retourId,user_id:user.id});
    }else{
      await supabase.from('retours_votes').upsert({retour_id:retourId,user_id:user.id,vote:voteType},{onConflict:'retour_id,user_id'});
    }
    load();
  };

  const deleteRetour=async(id)=>{
    await supabase.from('retours').delete().eq('id',id);
    setConfirmDel(null);load();
  };

  const getName=athleteId=>{
    if(athleteId===user?.id)return profile?([profile.first_name,profile.last_name].filter(Boolean).join(' ')||profile.full_name||'Moi'):'Moi';
    const p=profiles[athleteId];
    return p?([p.first_name,p.last_name].filter(Boolean).join(' ')||p.full_name||'Athlète'):'Athlète';
  };

  const fmtDate=dt=>{const d=new Date(dt);const now=new Date();const diff=Math.floor((now-d)/60000);if(diff<1)return"à l'instant";if(diff<60)return diff+'min';if(diff<1440)return Math.floor(diff/60)+'h';return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});};

  return(<div style={{padding:'16px 16px 80px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
      <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.5px'}}>Retours</div>
      <button onClick={()=>{setShowAdd(v=>!v);setSubmitErr(null);}} style={{padding:'7px 14px',borderRadius:4,border:'none',background:C.ac,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Ajouter</button>
    </div>
    <div style={{fontSize:12,color:C.tx3,marginBottom:20}}>Remarques & suggestions de la communauté</div>

    {showAdd&&(<div style={{background:C.s1,borderRadius:6,padding:16,border:'1px solid '+C.brdL,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,color:C.tx2,marginBottom:8}}>Nouvelle remarque</div>
      <textarea value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="Partage une réflexion, une suggestion, un retour sur l'app..." rows={4} style={{width:'100%',padding:'10px 12px',borderRadius:4,border:'1px solid '+C.brdL,background:C.s2,color:C.tx,fontSize:13,fontFamily:'inherit',resize:'none',boxSizing:'border-box',outline:'none',lineHeight:1.5}}/>
      {submitErr&&<div style={{marginTop:8,padding:'8px 12px',borderRadius:4,background:C.rS,border:'1px solid '+C.r+'40',fontSize:12,color:C.r}}>{submitErr}</div>}
      <div style={{display:'flex',gap:8,marginTop:10}}>
        <button onClick={()=>{setShowAdd(false);setSubmitErr(null);}} style={{flex:1,padding:'10px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx3,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Annuler</button>
        <button onClick={addRetour} disabled={!newContent.trim()||submitting} style={{flex:2,padding:'10px 0',borderRadius:4,border:'none',background:newContent.trim()&&!submitting?C.ac:'#333',color:newContent.trim()&&!submitting?'#fff':C.tx3,fontSize:13,fontWeight:700,cursor:newContent.trim()&&!submitting?'pointer':'default',fontFamily:'inherit'}}>{submitting?'Envoi...':'Publier'}</button>
      </div>
    </div>)}

    {loading?<div style={{textAlign:'center',padding:'40px 0',color:C.tx3,fontSize:13}}>Chargement...</div>:
     error?(<div style={{padding:'16px',borderRadius:6,background:C.rS,border:'1px solid '+C.r+'40',marginTop:8}}>
      <div style={{fontSize:13,fontWeight:700,color:C.r,marginBottom:4}}>Erreur</div>
      <div style={{fontSize:12,color:C.r,lineHeight:1.5}}>{error}</div>
      {error.includes('migration')&&<div style={{marginTop:10,padding:'10px 12px',borderRadius:4,background:'rgba(0,0,0,0.2)',fontSize:11,color:C.tx3,fontFamily:'monospace',lineHeight:1.7}}>Supabase → SQL Editor → colle le contenu de :<br/>supabase/migrations/20260412_retours.sql</div>}
     </div>):(
      retours.length===0?(<div style={{textAlign:'center',padding:'40px 0'}}>
        <div style={{fontSize:16,marginBottom:12,color:C.tx3,fontWeight:700}}>Retours</div>
        <div style={{fontSize:14,color:C.tx3}}>Aucun retour pour l'instant. Sois le premier !</div>
      </div>):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {retours.map(r=>{
            const v=votes[r.id]||{likes:0,dislikes:0,myVote:null};
            const name=getName(r.athlete_id);
            const isOwn=r.athlete_id===user?.id;
            return(<div key={r.id} style={{background:C.s1,borderRadius:6,padding:'14px 16px',border:'1px solid '+C.brd}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:C.acS,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:C.ac,flexShrink:0}}>{name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{name}{isOwn&&<span style={{fontSize:9,color:C.tx3,fontWeight:400,marginLeft:4}}>(moi)</span>}</div>
                    <div style={{fontSize:10,color:C.tx3}}>{fmtDate(r.created_at)}</div>
                  </div>
                </div>
                {(isOwn||isAdmin)&&<button onClick={()=>setConfirmDel(r.id)} style={{background:'none',border:'none',color:C.tx3,fontSize:14,cursor:'pointer',fontFamily:'inherit',padding:'0 4px'}}>✕</button>}
              </div>
              <div style={{fontSize:13,color:C.tx,lineHeight:1.6,marginBottom:12}}>{r.content}</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>doVote(r.id,'like')} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:4,border:'1.5px solid '+(v.myVote==='like'?C.g:C.brdL),background:v.myVote==='like'?C.gS:'transparent',color:v.myVote==='like'?C.g:C.tx3,fontSize:12,fontWeight:v.myVote==='like'?700:400,cursor:'pointer',fontFamily:'inherit'}}>
                  + <span>{v.likes}</span>
                </button>
                <button onClick={()=>doVote(r.id,'dislike')} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:4,border:'1.5px solid '+(v.myVote==='dislike'?C.r:C.brdL),background:v.myVote==='dislike'?C.rS:'transparent',color:v.myVote==='dislike'?C.r:C.tx3,fontSize:12,fontWeight:v.myVote==='dislike'?700:400,cursor:'pointer',fontFamily:'inherit'}}>
                  - <span>{v.dislikes}</span>
                </button>
              </div>
            </div>);
          })}
        </div>
      )
    )}

    {confirmDel&&(<div onClick={()=>setConfirmDel(null)} style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.s1,borderRadius:6,padding:24,width:'100%',maxWidth:320}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Supprimer ce retour ?</div>
        <div style={{fontSize:13,color:C.tx3,marginBottom:20}}>Cette action est irréversible.</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setConfirmDel(null)} style={{flex:1,padding:'10px 0',borderRadius:4,border:'1px solid '+C.brdL,background:'transparent',color:C.tx3,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Annuler</button>
          <button onClick={()=>deleteRetour(confirmDel)} style={{flex:1,padding:'10px 0',borderRadius:4,border:'none',background:C.r,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Supprimer</button>
        </div>
      </div>
    </div>)}
  </div>);
}


export default RetoursView;
