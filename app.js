/* Jan Hisaab Nashik — app logic (Supabase backend) */
(function(){
"use strict";
const CFG = window.JH_CONFIG || {};
const SITE = (CFG.SITE_URL || location.origin).replace(/\/$/,"");
const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase);
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"implicit"}
}) : null;

/* ---------- text helpers ---------- */
const T = window.T, CATS = window.CATS, ROUTE = window.ROUTE, KEYWORDS = window.KEYWORDS;
let lang = "en"; try{const l=localStorage.getItem("jh_lang");if(T[l])lang=l}catch(e){}
const t = k => (T[lang][k] ?? T.en[k] ?? k);
const L = o => o ? (typeof o==="string" ? o : (o[lang]||o.en||"")) : "";
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const locale = () => lang==="en"?"en-IN":lang==="mr"?"mr-IN":"hi-IN";
const num = n => Number(n||0).toLocaleString(locale());
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayStr = () => ymd(new Date());
const dayNum = s => {const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||"");return m?Date.UTC(+m[1],+m[2]-1,+m[3])/864e5:NaN};
const daysBetween = (a,b) => Math.max(0,Math.round(dayNum(b)-dayNum(a)))||0;
const fmtDate = d => new Date(d+"T00:00:00").toLocaleDateString(locale(),{day:"numeric",month:"short",year:"numeric"});
const crore = n => typeof n==="number" ? "₹"+(n/1e7).toLocaleString("en-IN",{maximumFractionDigits:2})+" cr" : "—";
const initials = n => String(n||"").replace(/^(Dr\.|Adv\.)\s*/,"").replace(/\(.*?\)/g,"").split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase();
function ago(iso){
  const s=(Date.now()-new Date(iso).getTime())/1000; const rtf=new Intl.RelativeTimeFormat(locale(),{numeric:"auto",style:"short"});
  if(s<60)return rtf.format(0,"second"); if(s<3600)return rtf.format(-Math.floor(s/60),"minute");
  if(s<86400)return rtf.format(-Math.floor(s/3600),"hour"); if(s<86400*30)return rtf.format(-Math.floor(s/86400),"day");
  return new Date(iso).toLocaleDateString(locale(),{day:"numeric",month:"short",year:"numeric"});
}
const isLink = u => typeof u==="string" && u.length<=500 && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(u);
function linkLabel(u){try{const h=new URL(u).hostname.replace(/^www\./,"");if(/(^|\.)(drive|docs)\.google\.com$/.test(h))return t("drive_file");if(/photos\.(google\.com|app\.goo\.gl)$/.test(h))return t("gphotos");return h}catch(_){return"link"}}
const STATUSES = ["open","seen","work","done"];
const CITY_AREAS = ["mla-nashik-central","mla-nashik-east","mla-nashik-west","mla-deolali"], MALEGAON_AREAS = ["mla-malegaon-central"];
const ICON = {
  heart:'<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  reply:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  share:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>',
  more:'<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>',
  person:'<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.5"/><path d="M5.5 19c1.4-3 3.8-4.5 6.5-4.5s5.1 1.5 6.5 4.5"/></svg>',
  img:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>',
  vid:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>'
};

/* ---------- state ---------- */
const S = {
  route:{name:"feed",id:null}, user:null, isAdmin:false,
  reps:null, events:null, bodies:null, meta:null, failed:false,
  posts:null, counts:{}, mySup:new Set(), thread:null, replies:null,
  wf:{status:"all",body:"",area:"",sort:"new"}, repFilter:"all",
  area:"", menuFor:null, shareFor:null, delArm:null, linkDraft:{}, replyDraft:"",
  auth:{mode:"up",email:"",password:"",err:"",busy:false,age:false}, afterSignIn:null, newPw:"", accDelArm:false, reported:new Set()
};
try{S.area=localStorage.getItem("jh_area")||""}catch(e){}
let C = null; // composer state

/* ---------- derived ---------- */
const bodyById = id => (S.bodies||[]).find(b=>b.id===id);
const repById = id => (S.reps||[]).find(r=>r.id===id);
const mlas = () => (S.reps||[]).filter(r=>r.role==="mla").sort((a,b)=>a.constituency.localeCompare(b.constituency));
const whereFor = a => CITY_AREAS.includes(a)?"city":MALEGAON_AREAS.includes(a)?"malegaon":a?"rural":"";
function suggest(cat,where){const r=ROUTE[cat];if(!r)return[];return ((where&&r[where])||r.all||[]).filter(id=>bodyById(id))}
const createdDay = p => ymd(new Date(p.created_at));
function waitOf(p){return p.status==="done"?daysBetween(createdDay(p),p.fixed_on||todayStr()):daysBetween(createdDay(p),todayStr())}
const visiblePosts = () => (S.posts||[]);
const counted = () => (S.posts||[]).filter(p=>!p.hidden);
function statsOf(list){
  const done=list.filter(i=>i.status==="done"),pend=list.filter(i=>i.status!=="done");
  const fx=done.map(waitOf),w=pend.map(waitOf);
  return{total:list.length,done:done.length,pend:pend.length,waitSum:w.reduce((a,b)=>a+b,0),oldest:w.length?Math.max(...w):0,
    avgFix:fx.length?Math.round(fx.reduce((a,b)=>a+b,0)/fx.length):null,rate:list.length?Math.round(done.length/list.length*100):0};
}
const mediaUrl = path => sb ? sb.storage.from("media").getPublicUrl(path).data.publicUrl : "";
const shareUrl = id => SITE + "/?p=" + encodeURIComponent(id);
function handleFor(x){
  if(x.kind==="body") return "@"+(L(x.b.short)&&x.b.short.en?x.b.short.en:x.b.name.en).replace(/[^A-Za-z0-9]/g,"");
  const words=x.r.name.replace(/^(Dr\.|Adv\.)\s*/,"").replace(/\(.*?\)/g,"").split(/\s+/).filter(Boolean);
  return "@"+(words[0]||"")+(words.length>1?words[words.length-1]:"");
}
function mentionables(){
  const out=[];
  (S.bodies||[]).forEach(b=>out.push({id:b.id,kind:"body",b,label:L(b.name),sub:L(b.does),search:[b.name.en,b.name.mr,b.name.hi,b.short&&b.short.en,b.short&&b.short.mr,b.short&&b.short.hi].join(" ").toLowerCase()}));
  (S.reps||[]).forEach(r=>out.push({id:r.id,kind:r.role,r,label:r.name,sub:t(r.role)+" · "+r.constituency,search:(r.name+" "+r.constituency+" "+t(r.role)+" "+r.role).toLowerCase()}));
  out.forEach(x=>x.handle=handleFor(x));
  return out;
}
function tagLabel(id){const b=bodyById(id);if(b)return L(b.short)||L(b.name);const r=repById(id);if(r)return t(r.role)+" "+r.name.replace(/\(.*?\)/g,"").replace(/\s+/g," ").trim();return id}

/* ---------- data ---------- */
async function loadRef(){
  const tables=["reps","events","bodies","meta"];
  const res=await Promise.all(tables.map(n=>sb.from(n).select("id,data")));
  if(res.some(r=>r.error))throw res.find(r=>r.error).error;
  const [reps,events,bodies,meta]=res.map(r=>r.data.map(x=>({id:x.id,...x.data})));
  S.reps=reps; S.bodies=bodies.sort((a,b)=>(a.order||99)-(b.order||99)); S.meta=(meta.find(m=>m.id==="info")||null);
  const today=todayStr();
  S.events=events.filter(e=>!e.date||e.date>=today).sort((a,b)=>(a.date||a.sortDate||"9999").localeCompare(b.date||b.sortDate||"9999"));
}
const POST_COLS="id,user_id,parent_id,caption,cat,area,place,body_id,mentions,links,media_path,media_type,status,fixed_on,hidden,created_at";
async function loadCounts(ids){
  for(let i=0;i<ids.length;i+=150){
    const {data,error}=await sb.rpc("post_counts",{ids:ids.slice(i,i+150)});
    if(!error)data.forEach(c=>S.counts[c.id]=c);
  }
}
async function loadPosts(){
  const {data,error}=await sb.from("posts").select(POST_COLS).is("parent_id",null).order("created_at",{ascending:false}).limit(1000);
  if(error)throw error;
  S.posts=data; await loadCounts(data.map(p=>p.id));
}
async function loadMine(){
  S.mySup=new Set();
  if(!S.user)return;
  const {data}=await sb.from("supports").select("post_id").eq("user_id",S.user.id);
  (data||[]).forEach(r=>S.mySup.add(r.post_id));
}
async function loadThread(id){
  S.thread=null;S.replies=null;
  const [p,r]=await Promise.all([
    sb.from("posts").select(POST_COLS).eq("id",id).maybeSingle(),
    sb.from("posts").select(POST_COLS).eq("parent_id",id).order("created_at",{ascending:true}).limit(300)
  ]);
  if(p.error||r.error)throw (p.error||r.error);
  S.thread=p.data||false; S.replies=r.data||[];
  await loadCounts([id,...S.replies.map(x=>x.id)]);
}
async function refreshAll(){
  try{await loadPosts();await loadMine();S.failed=false}catch(e){S.failed=true}
  renderSoon();
}

/* ---------- small renderers ---------- */
const view = document.getElementById("view");
const status = () => !configured?`<p class="na">${t("not_configured")}</p>`:S.failed?`<p class="na">${t("offline")}</p>`:`<p class="na">${t("loading")}</p>`;
const opt = (v,label,sel) => `<option value="${esc(v)}" ${v===sel?"selected":""}>${esc(label)}</option>`;
function repItem(r){return `<a class="item" href="#rep/${esc(r.id)}" style="text-decoration:none"><div class="av">${esc(initials(r.name))}</div><div class="m"><div class="n">${esc(r.name)}</div><div class="s">${t(r.role)} · ${esc(r.constituency)}</div></div><span class="chev">›</span></a>`}
function evItem(e){const has=!!e.date;const d=has?new Date(e.date+"T00:00:00"):null;
 return `<div class="ev"><div class="cal ${has?"":"q"}"><b>${has?d.toLocaleDateString("en-IN",{month:"short"}).toUpperCase():esc(e.month||"TBC")}</b><span>${has?d.getDate():"?"}</span></div>
 <div><div class="t">${esc(e.title)}</div><div class="d">${esc(e.place||"")}${e.place?" · ":""}${has?fmtDate(e.date):esc(e.dateText||t("tbc"))}</div>
 <div style="margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${e.status==="expected"?"warn":""}">${t(e.status==="expected"?"expected":"confirmed")}</span>${e.sourceUrl?`<a class="note" style="color:var(--ink)" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">${esc(e.source||t("sources"))}</a>`:""}</div></div></div>`}
function capHtml(s){return esc(s).replace(/@[\p{L}\p{N}_.]+/gu,m=>`<span class="mn">${m}</span>`)}
function waitBlock(p){
  const d=waitOf(p);
  if(p.status==="done")return `<span class="big good-t">${num(d)}</span><span>${t(d===1?"fixed_in1":"fixed_in")}</span>`;
  if(d===0)return `<span class="tag plain">${t("today_t")}</span>`;
  const cls=d>30?"late-t":d>7?"warn-t":"";
  return `<span class="big ${cls}">${num(d)}</span><span class="${cls}">${t(d===1?"wait1":"wait")}</span>${d>30?`<span class="tag late">${t("vlate")}</span>`:d>7?`<span class="tag warn">${t("late")}</span>`:""}`;
}
function mediaHtml(p){
  if(!p.media_path)return"";const u=esc(mediaUrl(p.media_path));
  return p.media_type==="video"?`<div class="media"><video src="${u}" controls playsinline muted loop preload="metadata"></video></div>`
    :`<div class="media"><img src="${u}" alt="" loading="lazy"></div>`;
}
function shareMenu(p){
  const url=shareUrl(p.id), b=bodyById(p.body_id);
  const txt=(p.caption.length>160?p.caption.slice(0,157)+"…":p.caption)+(b?` (${L(b.short)||L(b.name)})`:"")+" #JanHisaabNashik";
  const e=encodeURIComponent;
  return `<div class="menu">
   ${navigator.share?`<button class="btn sm" data-nshare="${esc(p.id)}">${t("share")}…</button>`:""}
   <a class="btn sm ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${e(txt+" "+url)}">WhatsApp</a>
   <a class="btn sm ghost" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${e(txt)}&url=${e(url)}">X</a>
   <a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${e(url)}">Facebook</a>
   <button class="btn sm ghost" data-copy="${esc(url)}">${t("copy_link")}</button></div>`;
}
function moreMenu(p){
  const mine=S.user&&p.user_id===S.user.id;let h="";
  if(!mine)h+=`<button class="btn sm ghost" data-report="${esc(p.id)}">${t("report")}</button>`;
  if(S.isAdmin)h+=`<button class="btn sm ghost" data-hide="${esc(p.id)}">${p.hidden?t("unhide"):t("hide")}</button>`;
  if(mine||S.isAdmin)h+=`<button class="btn sm danger" data-del="${esc(p.id)}">${S.delArm===p.id?t("del2"):t("del")}</button>`;
  return h?`<div class="menu">${h}</div>`:"";
}
function postCard(p,opts={}){
  const isReply=!!p.parent_id, mine=S.user&&p.user_id===S.user.id, c=S.counts[p.id]||{};
  const mla=repById(p.area), place=[p.place,mla&&mla.constituency].filter(Boolean).join(" · ");
  const tags=(p.mentions&&p.mentions.length?p.mentions:[p.body_id]).filter(Boolean);
  const supN=c.supports||0, repN=c.replies||0, supped=S.mySup.has(p.id);
  const catIcon=isReply?ICON.person:`<span>${esc((L(CATS[p.cat])||"?").slice(0,1))}</span>`;
  const head=`<div class="hd"><b>${mine?t("you"):t("citizen")}</b>${!isReply&&p.cat?`<span class="tag">${esc(L(CATS[p.cat]))}</span>`:""}${p.hidden?`<span class="tag late">${t("hidden_tag")}</span>`:""}<span class="t">${esc(ago(p.created_at))}</span></div>`;
  const tagsHtml=!isReply&&tags.length?`<div class="chips">${tags.map((id,ix)=>{const b=bodyById(id);return b?`<button class="chip ${ix===0&&id===p.body_id?"prim":""}" data-fbody="${esc(id)}">@${esc(L(b.short)||L(b.name))}</button>`:repById(id)?`<a class="chip" href="#rep/${esc(id)}">@${esc(tagLabel(id))}</a>`:""}).join("")}</div>`:"";
  const linksHtml=p.links&&p.links.length?`<div class="links"><span class="note">${t("evidence")}:</span>${p.links.filter(isLink).map(u=>`<a class="lk" href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(linkLabel(u))}</a>`).join("")}</div>`:"";
  const clock=!isReply?`<div class="clockline">${waitBlock(p)}<span class="note">· ${t("assigned")} <b style="color:var(--fg)">${esc(tagLabel(p.body_id))}</b></span></div>`:"";
  const acts=`<div class="acts">
    ${!isReply?`<button class="ib" data-sup="${esc(p.id)}" aria-pressed="${supped}" aria-label="${t("metoo")}">${ICON.heart}<span>${t("metoo")}${supN?" · "+num(supN):""}</span></button>`:""}
    ${!isReply?`<a class="ib" href="#post/${esc(p.id)}" aria-label="${t("reply")}">${ICON.reply}<span>${repN?num(repN):t("reply")}</span></a>`:""}
    ${!isReply?`<button class="ib" data-sharet="${esc(p.id)}" aria-label="${t("share")}">${ICON.share}</button>`:""}
    <button class="ib" data-more="${esc(p.id)}" aria-label="More">${ICON.more}</button></div>`;
  const body=opts.link&&!isReply?`<a href="#post/${esc(p.id)}" style="color:inherit;text-decoration:none;display:block"><p class="cap">${capHtml(p.caption)}</p></a>`:`<p class="cap">${capHtml(p.caption)}</p>`;
  return `<article class="th ${opts.line?"has-line":""} ${opts.open?"open":""}">
   <div class="rail"><div class="av">${catIcon}</div>${opts.line?'<div class="line"></div>':""}</div>
   <div class="main">${head}${body}${mediaHtml(p)}${place?`<div class="note" style="margin-top:6px">${esc(place)}</div>`:""}${tagsHtml}${linksHtml}${clock}
    ${opts.open&&!isReply?stepsHtml(p)+ownerBox(p):""}
    ${acts}${S.shareFor===p.id?shareMenu(p):""}${S.menuFor===p.id?moreMenu(p):""}</div></article>`;
}
function stepsHtml(p){const si=STATUSES.indexOf(p.status);return `<div class="steps">${STATUSES.map((s,ix)=>`<div class="${ix<=si?"on":""} ${s==="done"&&ix<=si?"fin":""}">${t("st_"+s)}</div>`).join("")}</div>`}
function ownerBox(p){
  const mine=S.user&&p.user_id===S.user.id;
  if(!mine)return `<p class="note" style="margin:8px 0 0">${t("only_citizen")} · ${t("boss_line")}</p>`;
  const links=p.links||[];
  return `<div class="owner">
    <label class="note" for="st-${esc(p.id)}" style="margin:0">${t("update")}</label>
    <select id="st-${esc(p.id)}" data-st="${esc(p.id)}">${STATUSES.map(s=>opt(s,t("st_"+s),p.status)).join("")}</select>
    <label class="note" for="rb-${esc(p.id)}" style="margin:0">${t("reassign")}</label>
    <select id="rb-${esc(p.id)}" data-rb="${esc(p.id)}">${(S.bodies||[]).map(b=>opt(b.id,L(b.short)||L(b.name),p.body_id)).join("")}</select>
    ${links.length<3?`<input id="al-${esc(p.id)}" type="url" inputmode="url" placeholder="https://drive.google.com/…" aria-label="${t("add_link")}" value="${esc(S.linkDraft[p.id]||"")}"><button class="btn sm ghost" data-addlink="${esc(p.id)}">${t("add_link")}</button>`:""}
  </div>`;
}

/* ---------- screens ---------- */
const screens = {
 feed(){
  const all=counted(),st=statsOf(all);
  const banner=`<section class="boss"><h1>${t("wall_h")}</h1><p>${t("wall_p")}</p>
   <div class="nums"><div><b>${num(st.pend)}</b><span>${t("k_pending")}</span></div><div><b>${num(st.waitSum)}</b><span>${t("k_days")}</span></div><div><b>${num(st.done)}</b><span>${t("k_fixed")}</span></div></div>
   <button class="btn" data-compose style="background:var(--bg);color:var(--ink);margin-top:12px">${t("post")}</button></section>`;
  if(!S.posts)return banner+status();
  let list=visiblePosts().slice();const F=S.wf;
  if(F.status==="pending")list=list.filter(i=>i.status!=="done");else if(F.status==="fixed")list=list.filter(i=>i.status==="done");
  if(F.body)list=list.filter(i=>i.body_id===F.body||(i.mentions||[]).includes(F.body));
  if(F.area)list=list.filter(i=>i.area===F.area);
  const sc=p=>(S.counts[p.id]||{}).supports||0;
  list.sort(F.sort==="wait"?(a,b)=>(b.status!=="done")-(a.status!=="done")||waitOf(b)-waitOf(a):F.sort==="sup"?(a,b)=>sc(b)-sc(a)||b.created_at.localeCompare(a.created_at):(a,b)=>b.created_at.localeCompare(a.created_at));
  const filters=S.posts.length?`<div class="filters">
   <div class="seg" role="group">${[["all","f_status_all"],["pending","f_pending"],["fixed","f_fixedf"]].map(([v,k])=>`<button data-wf="status:${v}" aria-pressed="${F.status===v}">${t(k)}</button>`).join("")}</div>
   <div class="two"><select id="wf-body" aria-label="${t("any_body")}"><option value="">${t("any_body")}</option>${(S.bodies||[]).map(b=>opt(b.id,L(b.short)||L(b.name),F.body)).join("")}</select>
   <select id="wf-area" aria-label="${t("any_area")}"><option value="">${t("any_area")}</option>${mlas().map(r=>opt(r.id,r.constituency,F.area)).join("")}</select></div>
   <div class="seg" role="group">${[["new","sort_new"],["wait","sort_wait"],["sup","sort_sup"]].map(([v,k])=>`<button data-wf="sort:${v}" aria-pressed="${F.sort===v}">${t(k)}</button>`).join("")}</div></div>`:"";
  const body=!S.posts.length?`<p class="na" style="margin-top:16px">${t("empty_wall")}</p>`:list.length?list.map(p=>postCard(p,{link:true})).join(""):`<p class="na" style="margin-top:16px">${t("no_match")}</p>`;
  return banner+filters+body;
 },
 post(){
  const back=`<a class="back" href="#feed" style="display:inline-block;text-decoration:none">${t("back")}</a>`;
  if(S.thread===null)return back+status();
  if(S.thread===false)return back+`<p class="na" style="margin-top:12px">${t("no_match")}</p>`;
  const p=S.thread, reps=S.replies||[];
  let h=back+`<h2>${t("thread")}</h2>`+postCard(p,{open:true,line:reps.length>0});
  h+=reps.map((r,ix)=>postCard(r,{line:ix<reps.length-1})).join("");
  if(!reps.length)h+=`<p class="note">${t("no_replies")}</p>`;
  if(S.user)h+=`<div class="reply-box"><div class="av">${ICON.person}</div><div class="stack" style="gap:8px">
     <textarea id="reply-text" rows="2" maxlength="1000" placeholder="${esc(t("reply_ph"))}">${esc(S.replyDraft)}</textarea>
     <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-compose-reply="${esc(p.id)}">${ICON.img} ${t("add_photo")}</button><button class="btn sm" data-sendreply="${esc(p.id)}">${t("reply")}</button></div></div></div>`;
  else h+=`<div class="reply-box"><div></div><a class="btn ghost" href="#me" data-after="post/${esc(p.id)}">${t("sign_h")}</a></div>`;
  return h;
 },
 board(){
  if(!S.posts||!S.bodies)return `<h1>${t("b_h")}</h1>`+status();
  const all=counted(),st=statsOf(all);
  let h=`<h1>${t("b_h")}</h1><p class="lead">${t("b_p")}</p>
   <div class="facts"><div class="fact"><div class="k">${t("k_total")}</div><div class="v">${num(st.total)}</div></div>
   <div class="fact late"><div class="k">${t("k_pending")}</div><div class="v">${num(st.pend)}</div></div>
   <div class="fact good"><div class="k">${t("k_fixed")}</div><div class="v">${num(st.done)}</div></div>
   <div class="fact"><div class="k">${t("k_avg")}</div><div class="v">${st.avgFix==null?"—":num(st.avgFix)}</div></div></div>`;
  const rows=S.bodies.map(b=>({b,s:statsOf(all.filter(i=>i.body_id===b.id))}));
  const active=rows.filter(r=>r.s.total).sort((x,y)=>y.s.pend-x.s.pend||y.s.oldest-x.s.oldest||x.s.rate-y.s.rate), idle=rows.filter(r=>!r.s.total);
  const line=s=>`<div class="ln"><span><b class="${s.pend?"late-t":""}">${num(s.pend)}</b> ${t("pend_n")}</span><span><b class="good-t">${num(s.done)}</b> ${t("fixed_n")}</span>${s.pend?`<span>${t("oldest")} <b class="${s.oldest>30?"late-t":s.oldest>7?"warn-t":""}">${num(s.oldest)}</b> ${t("days")}</span>`:""}${s.avgFix!=null?`<span>${t("avgfix")} <b>${num(s.avgFix)}</b> ${t("days")}</span>`:""}<span>${t("fixrate")} <b>${s.rate}%</b></span></div><div class="bar"><i style="width:${s.rate}%"></i></div>`;
  h+=`<h2>${t("b_offices")}</h2>`+(active.length?active.map((r,ix)=>`<div class="rank"><div class="no">${ix+1}</div><div><button class="back" style="padding:0;color:var(--fg);font-size:16px;font-weight:700;text-align:left" data-fbody="${esc(r.b.id)}">${esc(L(r.b.name))}</button>${line(r.s)}</div></div>`).join(""):`<p class="na">${t("no_board")}</p>`)
    +(idle.length&&active.length?`<p class="note">${t("no_data")} ${idle.map(r=>esc(L(r.b.short)||L(r.b.name))).join(", ")}</p>`:"");
  if(S.reps&&all.length){
   const rr=S.reps.map(r=>{const list=r.role==="mla"?all.filter(i=>i.area===r.id):all.filter(i=>{const m=repById(i.area);return m&&m.mp===r.id});return{r,s:statsOf(list)}}).filter(x=>x.s.total).sort((x,y)=>y.s.pend-x.s.pend||y.s.oldest-x.s.oldest);
   h+=`<h2>${t("b_leaders")}</h2>`+rr.map((x,ix)=>`<div class="rank"><div class="no">${ix+1}</div><div><a href="#rep/${esc(x.r.id)}" style="color:var(--fg);font-weight:700;text-decoration:none">${esc(x.r.name)}</a><div class="note">${t(x.r.role)} · ${esc(x.r.constituency)}</div>${line(x.s)}</div></div>`).join("");
   const cc={};all.forEach(i=>cc[i.cat]=(cc[i.cat]||0)+1);const arr=Object.entries(cc).sort((a,b)=>b[1]-a[1]);const mx=arr[0][1];
   h+=`<h2>${t("b_cats")}</h2>`+arr.map(([c,n])=>`<div class="hbar"><span>${esc(L(CATS[c]))}</span><div class="tr"><i style="width:${Math.round(n/mx*100)}%"></i></div><b>${num(n)}</b></div>`).join("");
   const old=all.filter(i=>i.status!=="done").sort((a,b)=>waitOf(b)-waitOf(a)).slice(0,5);
   if(old.length)h+=`<h2>${t("b_oldest")}</h2>`+old.map(p=>postCard(p,{link:true})).join("");
  }
  h+=`<h2>${t("esc_h")}</h2><ol class="ladder">${T[lang].esc.map(s=>`<li><span>${esc(s)}</span></li>`).join("")}</ol>
   <p class="note"><a href="https://grievances.maharashtra.gov.in/en" target="_blank" rel="noopener">Aaple Sarkar</a> · <a href="https://pgportal.gov.in" target="_blank" rel="noopener">CPGRAMS</a> · <a href="https://rtionline.maharashtra.gov.in" target="_blank" rel="noopener">RTI Maharashtra</a> · <a href="https://rtionline.gov.in" target="_blank" rel="noopener">RTI (central)</a></p>
   <h2>${t("who_h")}</h2><p class="note" style="margin-top:0">${t("who_p")}</p>
   <div class="cols"><div class="fact"><div class="k" style="color:var(--good);font-weight:700">${t("elected")}</div><ul>${T[lang].el_list.map(s=>`<li>${esc(s)}</li>`).join("")}</ul></div>
   <div class="fact"><div class="k" style="color:var(--ink);font-weight:700">${t("appointed")}</div><ul>${T[lang].ap_list.map(s=>`<li>${esc(s)}</li>`).join("")}</ul></div></div>
   <h2>${t("offices_h")}</h2>${S.bodies.map(b=>{const c=b.channel||{};return `<details class="office"><summary><span>${esc(L(b.name))}</span></summary><dl>
    <dt>${t("handles")}</dt><dd>${esc(L(b.does))}</dd><dt>${t("head")}</dt><dd>${esc(L(b.head))}</dd><dt>${t("chosen")}</dt><dd>${esc(L(b.chosen))}</dd>
    <dt>${t("complain")}</dt><dd>${c.phone?`<b>${esc(c.phone)}</b> · `:""}${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label||c.url)}</a>`:esc(c.label||"")}</dd></dl></details>`}).join("")}<p class="note">${t("general")}</p>`;
  return h;
 },
 reps(){
  if(!S.reps)return `<h1>${t("reps_h")}</h1>`+status();
  const ml=mlas(),mla=ml.find(r=>r.id===S.area),mp=mla&&repById(mla.mp);
  const order={mp:0,mla:1};const list=S.reps.filter(r=>S.repFilter==="all"||r.role===S.repFilter).sort((a,b)=>order[a.role]-order[b.role]||a.constituency.localeCompare(b.constituency));
  return `<h1>${t("home_h")}</h1><p class="lead">${t("home_p")}</p>
   <label for="area">${t("constit")}</label><select id="area"><option value="">${t("choose")}</option>${ml.map(r=>opt(r.id,r.constituency,S.area)).join("")}</select>
   ${mla?`<h2>${t("your")}</h2><div class="list">${mp?repItem(mp):""}${repItem(mla)}</div>`:""}
   <h2>${t("reps_h")}</h2><p class="note" style="margin-top:0">${t("reps_p")}</p>
   <div class="seg" style="margin-bottom:10px">${["all","mp","mla"].map(f=>`<button data-rf="${f}" aria-pressed="${S.repFilter===f}">${t(f)}</button>`).join("")}</div>
   <div class="list">${list.map(repItem).join("")}</div>
   <p class="note" style="margin-top:16px">${t("soon_p")}</p>`;
 },
 rep(){
  const back=`<a class="back" href="#reps" style="display:inline-block;text-decoration:none">${t("back")}</a>`;
  if(!S.reps)return back+status();
  const r=repById(S.route.id);if(!r)return back+`<p class="na">${t("no_match")}</p>`;
  const fact=(k,v,c)=>`<div class="fact"><div class="k">${t(k)}</div><div class="v">${v}</div>${c?`<div class="c">${c}</div>`:""}</div>`;
  const all=counted();const mine=r.role==="mla"?all.filter(i=>i.area===r.id):all.filter(i=>{const m=repById(i.area);return m&&m.mp===r.id});const s=statsOf(mine);
  const house=r.role==="mp"?`<h2>${t("inhouse")}</h2><div class="facts">${fact("attendance",esc(r.attendance)+"%",`${t("avg")} ${esc(r.attendanceAvg)}%`)}${fact("questions",esc(r.questions),`${t("avg")} ${esc(r.questionsAvg)}`)}${fact("debates",esc(r.debates),`${t("avg")} ${esc(r.debatesAvg)}`)}${fact("bills",esc(r.bills),`${t("avg")} ${esc(r.billsAvg)}`)}</div>`
   :`<h2>${t("inassembly")}</h2><div class="na">${t("mla_na")}</div>`;
  return back+`<div style="display:flex;gap:14px;align-items:center;margin-top:14px"><div class="av" style="width:58px;height:58px;font-size:19px">${esc(initials(r.name))}</div>
   <div style="min-width:0"><h1 style="margin:0">${esc(r.name)}</h1><div class="note">${t(r.role)} · ${esc(r.constituency)}</div></div></div>
   <div style="margin-top:14px"><div class="row"><span>${t("party")}</span><span>${esc(r.party)}</span></div></div>
   <h2>${t("b_leaders")}</h2><div class="facts">${fact("k_pending",num(s.pend),s.pend?`${t("oldest")} ${num(s.oldest)} ${t("days")}`:"")}${fact("k_fixed",num(s.done),s.total?`${t("fixrate")} ${s.rate}%`:"")}</div>
   ${house}
   <h2>${t("affidavit")} ${r.affidavitYear?"("+esc(r.affidavitYear)+")":""}</h2>
   <div><div class="row"><span>${t("assets")}</span><span>${crore(r.assets)}</span></div><div class="row"><span>${t("cases")}</span><span>${esc(r.cases)}</span></div></div>
   <p class="src">${t("sources")}: ${(r.sources||[]).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(" · ")}${r.checked?` · ${fmtDate(r.checked)}`:""}</p>
   ${mine.length?`<h2>${t("t_wall")}</h2>`+mine.slice(0,20).map(p=>postCard(p,{link:true})).join(""):""}`;
 },
 events(){
  if(!S.events)return `<h1>${t("ev_h")}</h1>`+status();
  return `<h1>${t("ev_h")}</h1><p class="lead">${t("ev_p")}</p><div>${S.events.map(evItem).join("")}</div>${S.meta&&S.meta.checked?`<p class="updated">${t("updated")}: ${fmtDate(S.meta.checked)}</p>`:""}`;
 },
 me(){
  if(!configured)return `<h1>${t("t_acc")}</h1>`+status();
  if(!S.user){
   const A=S.auth, up=A.mode==="up";
   return `<h1>${up?t("sign_up_h"):t("sign_in_h")}</h1><p class="lead">${up?t("sign_p_up"):t("sign_p_in")}</p>
    <form id="auth-form" class="stack" novalidate>
     <div><label for="email">${t("email")}</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(A.email)}"></div>
     <div><label for="password">${t("password")}</label><input id="password" type="password" autocomplete="${up?"new-password":"current-password"}" placeholder="••••••••" value="${esc(A.password)}">${up?`<p class="note" style="margin:4px 0 0">${t("pw_hint")}</p>`:""}</div>
     ${up?`<label class="check"><input type="checkbox" id="age" ${A.age?"checked":""}><span>${t("age_ok")} <a href="privacy.html" target="_blank">${t("privacy_link")}</a></span></label>
     <p class="rules" style="margin:0">${t("rules")}</p>`:""}
     <div class="err" id="auth-err">${esc(A.err)}</div>
     <button class="btn" type="submit" ${A.busy?"disabled":""}>${A.busy?t("sending"):(up?t("create_btn"):t("signin_btn"))}</button>
     <button class="btn ghost" type="button" id="auth-switch">${up?t("to_signin"):t("to_signup")}</button>
     ${up?"":`<button type="button" class="back" id="forgot" style="padding:0;text-align:left">${t("forgot")}</button>`}
    </form>`;
  }
  const mine=(S.posts||[]).filter(p=>p.user_id===S.user.id);
  let h=`<h1>${t("t_acc")}</h1><div class="row"><span>${t("signed_as")}</span><span>${esc(S.user.email||"")}</span></div><p class="note">${t("private_note")}</p>
   <label for="area" style="margin-top:12px">${t("my_area")}</label><select id="area"><option value="">${t("choose")}</option>${mlas().map(r=>opt(r.id,r.constituency,S.area)).join("")}</select>
   <h2>${t("my_posts")}</h2>${mine.length?mine.map(p=>postCard(p,{link:true})).join(""):`<p class="note">${t("no_my_posts")}</p>`}`;
  if(S.isAdmin){
   const mod=(S.posts||[]).filter(p=>p.hidden||((S.counts[p.id]||{}).reports>0));
   h+=`<h2>${t("mod_h")}</h2><p class="note" style="margin-top:0">${t("mod_p")}</p>`+(mod.length?mod.map(p=>`<div class="note"><b>${num((S.counts[p.id]||{}).reports||0)}</b> ${t("reports_n")}</div>`+postCard(p,{link:true})).join(""):`<p class="note">${t("no_mod")}</p>`);
  }
  h+=`<h2>${t("new_pw")}</h2><form id="pw-form" class="stack" novalidate style="gap:8px">
     <input id="new-pw" type="password" autocomplete="new-password" placeholder="${esc(t("pw_hint"))}" value="${esc(S.newPw||"")}">
     <button class="btn ghost" type="submit" style="width:auto;align-self:flex-start;padding:8px 16px">${t("save_pw")}</button></form>`;
  h+=`<div class="stack" style="margin-top:24px"><button class="btn ghost" id="signout">${t("sign_out")}</button><button class="btn danger" id="del-acc">${S.accDelArm?t("delete_acc2"):t("delete_acc")}</button><a class="note" href="privacy.html">${t("privacy_link")}</a></div>`;
  return h;
 }
};

/* ---------- composer ---------- */
function openComposer(mode,parentId){
  if(!S.user){S.afterSignIn=mode==="reply"?"post/"+parentId:"compose";toast(t("signin_needed"));location.hash="#me";return}
  const area=S.area||"";
  C={mode,parentId:parentId||null,caption:mode==="reply"?S.replyDraft:"",cat:"",catManual:false,area,where:whereFor(area),body:"",bodyManual:false,extra:[],dropMla:false,dropMp:false,place:"",links:["","",""],file:null,ftype:null,preview:null,err:"",busy:false,ml:null};
  renderComposer();
  setTimeout(()=>{const ta=document.getElementById("c-cap");if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)}},30);
}
function closeComposer(){if(C&&C.preview)URL.revokeObjectURL(C.preview);C=null;document.getElementById("sheet-root").innerHTML="";document.body.style.overflow=""}
function detect(){
  if(!C||C.mode!=="post")return;
  if(!C.catManual){
    const txt=C.caption.toLowerCase();let best="",score=0;
    for(const [cat,words] of Object.entries(KEYWORDS)){let s=0;for(const w of words){if(txt.includes(w.toLowerCase()))s+=w.length>3?2:1}if(s>score){score=s;best=cat}}
    if(best)C.cat=best;
  }
  if(!C.bodyManual)C.body=suggest(C.cat,C.where)[0]||"";
}
function tagsOf(){
  const mla=repById(C.area),mp=mla&&repById(mla.mp);
  const ids=[C.body,...C.extra,(!C.dropMla&&mla)?mla.id:"",(!C.dropMp&&mp)?mp.id:""].filter(Boolean);
  return [...new Set(ids)].slice(0,8);
}
function tagboxHtml(){
  if(C.mode!=="post")return"";
  const tags=tagsOf();const sug=suggest(C.cat,C.where);
  return `<div class="tagbox"><div class="note" style="font-weight:600;color:var(--fg)">${t("tagged")}</div>
   <div class="chips">${tags.map(id=>`<span class="chip ${id===C.body?"prim":""}">@${esc(tagLabel(id))}${id===C.body?"":`<button type="button" class="x" data-untag="${esc(id)}" aria-label="${t("remove")}">×</button>`}</span>`).join("")||`<span class="note">—</span>`}</div>
   <label for="c-body" style="margin-top:10px">${t("responsible")}</label>
   ${sug.length>1?`<div class="chips" style="margin-bottom:6px">${sug.map(id=>`<button type="button" class="chip ${id===C.body?"prim":""}" data-pickbody="${esc(id)}">${esc(tagLabel(id))}</button>`).join("")}</div>`:""}
   <select id="c-body"><option value="">${t("choose")}</option>${(S.bodies||[]).map(b=>opt(b.id,L(b.name),C.body)).join("")}</select>
   <p class="note" style="margin:6px 0 0">${t("auto_tag")}</p></div>`;
}
function catrowHtml(){
  if(C.mode!=="post")return"";
  return `<div><div class="note" style="font-weight:600;color:var(--fg);margin-bottom:4px">${t("f_cat")}${C.cat&&!C.catManual?` · <span style="color:var(--ink)">${t("detected")}: ${esc(L(CATS[C.cat]))}</span>`:""}</div>
   <div class="catrow">${Object.keys(CATS).map(c=>`<button type="button" class="chip" data-cat="${c}" aria-pressed="${C.cat===c}">${esc(L(CATS[c]))}</button>`).join("")}</div></div>`;
}
function mediaPickHtml(){
  if(C.preview)return `<div class="preview">${C.ftype==="video"?`<video src="${C.preview}" controls playsinline muted></video>`:`<img src="${C.preview}" alt="">`}<button type="button" class="btn sm danger" id="c-unmedia">${t("remove")}</button></div>`;
  return `<div class="pickrow"><label class="btn sm ghost" style="margin:0">${ICON.img} ${t("add_photo")}<input type="file" id="c-img" accept="image/*" hidden></label>
   <label class="btn sm ghost" style="margin:0">${ICON.vid} ${t("add_video")}<input type="file" id="c-vid" accept="video/mp4,video/webm,video/quicktime" hidden></label></div>`;
}
function renderComposer(){
  const root=document.getElementById("sheet-root");if(!C){root.innerHTML="";return}
  document.body.style.overflow="hidden";
  const post=C.mode==="post";
  root.innerHTML=`<div class="sheet-bg" id="c-bg"><form class="sheet stack" id="c-form" novalidate role="dialog" aria-modal="true" aria-label="${post?t("post"):t("reply")}">
   <div class="top"><button type="button" class="btn sm ghost" id="c-cancel">${t("cancel")}</button><b>${post?t("post"):t("reply")}</b><button type="submit" class="btn sm" id="c-submit" ${C.busy?"disabled":""}>${C.busy?t("posting"):t("publish")}</button></div>
   <div class="cap-wrap"><textarea id="c-cap" maxlength="1000" placeholder="${esc(post?t("caption_ph"):t("reply_ph"))}">${esc(C.caption)}</textarea><div id="c-ml"></div></div>
   <div id="c-media">${mediaPickHtml()}</div>
   ${post?`<div id="c-cat">${catrowHtml()}</div>
   <div class="two"><div><label for="c-area">${t("constit")}</label><select id="c-area"><option value="">${t("choose")}</option>${mlas().map(r=>opt(r.id,r.constituency,C.area)).join("")}</select></div>
    <div><label for="c-where">${t("f_where")}</label><select id="c-where"><option value="">${t("choose")}</option>${["city","malegaon","rural"].map(w=>opt(w,t("w_"+w),C.where)).join("")}</select></div></div>
   <div><label for="c-place">${t("f_place")}</label><input id="c-place" maxlength="120" placeholder="${esc(t("f_place_ph"))}" value="${esc(C.place)}"></div>
   <div id="c-tags">${tagboxHtml()}</div>
   <details class="more"><summary>${t("f_links")}</summary><div class="stack" style="gap:6px;margin-top:8px">${[0,1,2].map(n=>`<input id="c-link${n}" type="url" inputmode="url" maxlength="500" placeholder="https://drive.google.com/…" value="${esc(C.links[n])}">`).join("")}<p class="note" style="margin:0">${t("f_links_hint")}</p></div></details>
   <p class="rules" style="margin:0">${t("rules")}</p>`:""}
   <div class="err" id="c-err">${esc(C.err)}</div></form></div>`;
}
function refreshComposerParts(){
  if(!C)return;
  const a=document.getElementById("c-cat");if(a)a.innerHTML=catrowHtml();
  const b=document.getElementById("c-tags");if(b)b.innerHTML=tagboxHtml();
  const m=document.getElementById("c-media");if(m)m.innerHTML=mediaPickHtml();
  const e=document.getElementById("c-err");if(e)e.textContent=C.err;
  const s=document.getElementById("c-submit");if(s){s.disabled=C.busy;s.textContent=C.busy?t("posting"):t("publish")}
}
function updateMentionList(ta){
  const box=document.getElementById("c-ml");if(!box)return;
  const pos=ta.selectionStart, before=ta.value.slice(0,pos), m=/(^|\s)@([\p{L}\p{N}_.]*)$/u.exec(before);
  if(!m){C.ml=null;box.innerHTML="";return}
  const q=m[2].toLowerCase();
  let items=mentionables();
  // put this area's leaders and the suggested offices first
  const mla=repById(C.area),pri=new Set([C.body,...suggest(C.cat,C.where),mla&&mla.id,mla&&mla.mp].filter(Boolean));
  items=items.filter(x=>!q||x.search.includes(q)||x.handle.toLowerCase().includes(q)).map(x=>({x,s:(q&&x.handle.toLowerCase().startsWith("@"+q)?4:0)+(q&&x.search.split(/\s+/).some(w=>w.startsWith(q))?2:0)+(pri.has(x.id)?1:0)})).sort((a,b)=>b.s-a.s).map(o=>o.x).slice(0,8);
  C.ml={start:pos-m[2].length-1,end:pos,items,idx:0};
  box.innerHTML=items.length?`<div class="mlist" role="listbox">${items.map((x,i)=>`<button type="button" role="option" class="${i===0?"on":""}" data-mention="${esc(x.id)}"><span><b>${esc(x.handle)}</b> · ${esc(x.label)}</span><small>${esc(x.sub)}</small></button>`).join("")}</div>`:"";
}
function insertMention(id){
  const ta=document.getElementById("c-cap");if(!ta||!C.ml)return;
  const x=C.ml.items.find(i=>i.id===id);if(!x)return;
  const v=ta.value, ins=x.handle+" ";
  ta.value=v.slice(0,C.ml.start)+ins+v.slice(C.ml.end);C.caption=ta.value;
  const p=C.ml.start+ins.length;ta.focus();ta.setSelectionRange(p,p);
  if(x.kind==="body"){if(!C.body||!C.bodyManual&&C.body!==id&&!C.extra.length){C.body=id;C.bodyManual=true}else if(C.body!==id&&!C.extra.includes(id))C.extra.push(id)}
  else{const mla=repById(C.area);if(x.kind==="mla"&&!C.area){C.area=id;C.where=C.where||whereFor(id);const sel=document.getElementById("c-area");if(sel)sel.value=id;const w=document.getElementById("c-where");if(w)w.value=C.where}
       else if(!(mla&&(mla.id===id||mla.mp===id))&&!C.extra.includes(id))C.extra.push(id);
       if(mla&&mla.id===id)C.dropMla=false;if(mla&&mla.mp===id)C.dropMp=false}
  C.ml=null;document.getElementById("c-ml").innerHTML="";detect();refreshComposerParts();
}
async function pickFile(file,kind){
  C.err="";
  if(!file)return;
  if(file.size>15*1024*1024){C.err=t("file_big");refreshComposerParts();return}
  if(kind==="video"){
    if(!/^video\/(mp4|webm|quicktime)$/.test(file.type)){C.err=t("file_type");refreshComposerParts();return}
    const url=URL.createObjectURL(file);
    const dur=await new Promise(res=>{const v=document.createElement("video");v.preload="metadata";v.onloadedmetadata=()=>res(v.duration);v.onerror=()=>res(NaN);v.src=url});
    if(!(dur>0)){URL.revokeObjectURL(url);C.err=t("file_type");refreshComposerParts();return}
    if(dur>10.5){URL.revokeObjectURL(url);C.err=t("vid_long");refreshComposerParts();return}
    C.file=file;C.ftype="video";C.preview=url;
  }else{
    try{
      const blob=await shrinkImage(file);
      C.file=blob;C.ftype="image";C.preview=URL.createObjectURL(blob);
    }catch(e){C.err=t("file_type")}
  }
  refreshComposerParts();
}
async function shrinkImage(file){
  // Re-encode to JPEG (max 1600px). This also strips GPS/EXIF data from phone photos.
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const max=1600,sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.round(img.naturalWidth*sc),h=Math.round(img.naturalHeight*sc);
    const cv=document.createElement("canvas");cv.width=w;cv.height=h;cv.getContext("2d").drawImage(img,0,0,w,h);
    const blob=await new Promise(res=>cv.toBlob(res,"image/jpeg",.82));
    if(!blob)throw new Error("encode");return blob;
  }finally{URL.revokeObjectURL(url)}
}
function uuid(){return (crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))}
async function uploadMedia(){
  if(!C.file)return{path:null,type:null};
  const ext=C.ftype==="image"?"jpg":({"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"}[C.file.type]||"mp4");
  const path=`${S.user.id}/${uuid()}.${ext}`;
  const {error}=await sb.storage.from("media").upload(path,C.file,{contentType:C.ftype==="image"?"image/jpeg":C.file.type,cacheControl:"31536000",upsert:false});
  if(error)throw error;
  return{path,type:C.ftype};
}
async function submitComposer(){
  if(!C||C.busy)return;
  const cap=C.caption.trim();
  if(C.mode==="post"){
    if(cap.length<10){C.err=t("need_title");refreshComposerParts();return}
    if(!C.cat||!C.area||!C.body){C.err=t("need_fields");refreshComposerParts();return}
  }else if(cap.length<2){C.err=t("need_reply");refreshComposerParts();return}
  const links=[];
  if(C.mode==="post")for(const raw of C.links){const u=raw.trim();if(!u)continue;if(!isLink(u)){C.err=t("bad_link");refreshComposerParts();return}if(!links.includes(u))links.push(u)}
  C.busy=true;C.err="";refreshComposerParts();
  let media={path:null,type:null};
  try{
    media=await uploadMedia();
    const row=C.mode==="post"
      ?{caption:cap,cat:C.cat,area:C.area,place:C.place.trim()||null,body_id:C.body,mentions:tagsOf(),links,media_path:media.path,media_type:media.type}
      :{caption:cap,parent_id:C.parentId,media_path:media.path,media_type:media.type};
    const {data,error}=await sb.from("posts").insert(row).select(POST_COLS).single();
    if(error)throw error;
    const mode=C.mode;closeComposer();
    if(mode==="post"){S.posts=[data,...(S.posts||[])];S.counts[data.id]={supports:0,replies:0,reports:0};toast(t("posted"));if(S.route.name!=="feed")location.hash="#feed";else render()}
    else{S.replyDraft="";S.replies=[...(S.replies||[]),data];const c=S.counts[data.parent_id];if(c)c.replies=(c.replies||0)+1;render()}
  }catch(e){
    if(media.path)sb.storage.from("media").remove([media.path]).catch(()=>{});
    if(C){C.busy=false;C.err=/Daily limit/i.test(e&&e.message||"")?t("limit_hit"):t("save_fail");refreshComposerParts()}
  }
}
async function sendQuickReply(id){
  const ta=document.getElementById("reply-text");const cap=(ta?ta.value:"").trim();
  if(cap.length<2){toast(t("need_reply"));return}
  const {data,error}=await sb.from("posts").insert({caption:cap,parent_id:id}).select(POST_COLS).single();
  if(error){toast(/Daily limit/i.test(error.message||"")?t("limit_hit"):t("save_fail"));return}
  S.replyDraft="";S.replies=[...(S.replies||[]),data];const c=S.counts[id];if(c)c.replies=(c.replies||0)+1;render();
}

/* ---------- actions ---------- */
function findPost(id){return (S.posts||[]).find(p=>p.id===id)||(S.thread&&S.thread.id===id?S.thread:null)||(S.replies||[]).find(p=>p.id===id)}
function patchLocal(id,patch){[S.posts,S.replies].forEach(arr=>(arr||[]).forEach(p=>{if(p.id===id)Object.assign(p,patch)}));if(S.thread&&S.thread.id===id)Object.assign(S.thread,patch)}
async function updatePost(id,patch){
  const before={...findPost(id)};patchLocal(id,patch);render();
  const {data,error}=await sb.from("posts").update(patch).eq("id",id).select(POST_COLS).single();
  if(error){patchLocal(id,before);toast(t("save_fail"))}else patchLocal(id,data);
  render();
}
async function toggleSupport(id){
  if(!S.user){S.afterSignIn=null;toast(t("signin_needed"));location.hash="#me";return}
  const on=!S.mySup.has(id);const c=S.counts[id]||(S.counts[id]={supports:0});
  if(on){S.mySup.add(id);c.supports=(c.supports||0)+1}else{S.mySup.delete(id);c.supports=Math.max(0,(c.supports||0)-1)}
  render();
  const r=on?await sb.from("supports").insert({post_id:id}):await sb.from("supports").delete().eq("post_id",id).eq("user_id",S.user.id);
  if(r.error&&r.error.code!=="23505"){if(on){S.mySup.delete(id);c.supports--}else{S.mySup.add(id);c.supports++}toast(t("save_fail"));render()}
}
async function deletePost(id){
  const p=findPost(id);if(!p)return;
  const {error}=await sb.from("posts").delete().eq("id",id);
  if(error){toast(t("save_fail"));return}
  if(p.media_path&&S.user&&p.user_id===S.user.id)sb.storage.from("media").remove([p.media_path]).catch(()=>{});
  S.posts=(S.posts||[]).filter(x=>x.id!==id);S.replies=(S.replies||[]).filter(x=>x.id!==id);
  if(S.thread&&S.thread.id===id){location.hash="#feed";return}
  if(p.parent_id){const c=S.counts[p.parent_id];if(c)c.replies=Math.max(0,(c.replies||0)-1)}
  render();
}
async function reportPost(id){
  if(!S.user){toast(t("signin_needed"));location.hash="#me";return}
  const {error}=await sb.from("reports").insert({post_id:id});
  toast(error?(error.code==="23505"?t("already_reported"):t("save_fail")):t("reported"));
}
async function deleteAccount(){
  try{
    const {data}=await sb.storage.from("media").list(S.user.id,{limit:1000});
    if(data&&data.length)await sb.storage.from("media").remove(data.map(f=>S.user.id+"/"+f.name));
    const {error}=await sb.rpc("delete_my_account");if(error)throw error;
    await sb.auth.signOut();toast(t("deleted"));S.accDelArm=false;refreshAll();
  }catch(e){toast(t("save_fail"))}
}

/* ---------- routing & render ---------- */
function parseRoute(){
  const h=decodeURIComponent(location.hash.replace(/^#\/?/,""));
  const [name,id]=h.split("/");
  if(["feed","board","reps","events","me"].includes(name))return{name,id:null};
  if(name==="post"&&id)return{name:"post",id};
  if(name==="rep"&&id)return{name:"rep",id};
  return{name:"feed",id:null};
}
let deferred=false;
function render(){
  deferred=false;
  document.querySelectorAll("[data-t]").forEach(el=>el.textContent=t(el.dataset.t));
  document.documentElement.lang=lang;
  document.querySelectorAll("header .seg button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.l===lang));
  const tab={post:"feed",rep:"reps"}[S.route.name]||S.route.name;
  document.querySelectorAll("nav button").forEach(b=>b.dataset.tab===tab?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
  document.getElementById("fab").hidden=!(configured&&(S.route.name==="feed"||S.route.name==="board"));
  view.innerHTML=screens[S.route.name]();
}
function renderSoon(){const a=document.activeElement;if(a&&view.contains(a)&&/^(INPUT|TEXTAREA)$/.test(a.tagName)){deferred=true;return}render()}
document.addEventListener("focusout",()=>setTimeout(()=>{if(deferred)renderSoon()},0));
async function onRoute(){
  S.route=parseRoute();S.menuFor=null;S.shareFor=null;S.delArm=null;
  window.scrollTo(0,0);render();
  if(S.route.name==="post"&&configured){try{await loadThread(S.route.id)}catch(e){S.failed=true}render()}
}
window.addEventListener("hashchange",onRoute);
function toast(m){const d=document.createElement("div");d.className="toast";d.setAttribute("role","status");d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),2800)}

/* ---------- events ---------- */
document.addEventListener("click",async e=>{
  const el=e.target.closest("button,a");if(!el)return;
  const d=el.dataset;
  if(d.l){lang=d.l;try{localStorage.setItem("jh_lang",lang)}catch(_){}render();if(C)renderComposer();return}
  if(d.tab){location.hash="#"+d.tab;return}
  if(d.after){S.afterSignIn=d.after;return}
  if(el.id==="fab"||el.hasAttribute("data-compose")){openComposer("post");return}
  if(d.composeReply){S.replyDraft=(document.getElementById("reply-text")||{}).value||"";openComposer("reply",d.composeReply);return}
  if(d.sendreply){sendQuickReply(d.sendreply);return}
  if(d.wf){const[k,v]=d.wf.split(":");S.wf[k]=v;render();return}
  if(d.rf){S.repFilter=d.rf;render();return}
  if(d.fbody){S.wf={status:"all",body:d.fbody,area:"",sort:"wait"};if(S.route.name!=="feed")location.hash="#feed";else render();return}
  if(d.sup){toggleSupport(d.sup);return}
  if(d.sharet){S.shareFor=S.shareFor===d.sharet?null:d.sharet;S.menuFor=null;render();return}
  if(d.more){S.menuFor=S.menuFor===d.more?null:d.more;S.shareFor=null;S.delArm=null;render();return}
  if(d.nshare){const p=findPost(d.nshare);try{await navigator.share({title:"Jan Hisaab Nashik",text:p?p.caption.slice(0,200):"",url:shareUrl(d.nshare)})}catch(_){}return}
  if(d.copy){try{await navigator.clipboard.writeText(d.copy);toast(t("copied"))}catch(_){toast(d.copy)}return}
  if(d.report){reportPost(d.report);S.menuFor=null;render();return}
  if(d.hide){const p=findPost(d.hide);if(p)updatePost(d.hide,{hidden:!p.hidden});return}
  if(d.del){if(S.delArm!==d.del){S.delArm=d.del;render()}else{S.delArm=null;deletePost(d.del)}return}
  if(d.addlink){const p=findPost(d.addlink);const u=String(S.linkDraft[d.addlink]||"").trim();
    if(!p||!u)return;if(!isLink(u)){toast(t("bad_link"));return}if((p.links||[]).length>=3){toast(t("max_links"));return}
    delete S.linkDraft[d.addlink];updatePost(d.addlink,{links:[...(p.links||[]).filter(x=>x!==u),u]});return}
  // composer
  if(el.id==="c-cancel"){closeComposer();return}
  if(el.id==="c-unmedia"){if(C.preview)URL.revokeObjectURL(C.preview);C.file=null;C.preview=null;C.ftype=null;refreshComposerParts();return}
  if(d.cat&&C){C.cat=d.cat;C.catManual=true;if(!C.bodyManual)C.body=suggest(C.cat,C.where)[0]||"";refreshComposerParts();return}
  if(d.pickbody&&C){C.body=d.pickbody;C.bodyManual=true;C.extra=C.extra.filter(x=>x!==d.pickbody);refreshComposerParts();return}
  if(d.untag&&C){const id=d.untag,mla=repById(C.area);if(mla&&id===mla.id)C.dropMla=true;else if(mla&&id===mla.mp)C.dropMp=true;else C.extra=C.extra.filter(x=>x!==id);refreshComposerParts();return}
  if(d.mention&&C){e.preventDefault();insertMention(d.mention);return}
  // account
  if(el.id==="signout"){await sb.auth.signOut();return}
  if(el.id==="del-acc"){if(!S.accDelArm){S.accDelArm=true;render()}else deleteAccount();return}
  if(el.id==="auth-switch"){S.auth.mode=S.auth.mode==="up"?"in":"up";S.auth.err="";render();return}
  if(el.id==="forgot"){doReset();return}
});
document.addEventListener("mousedown",e=>{if(e.target.closest("[data-mention]"))e.preventDefault()});
document.addEventListener("click",e=>{if(e.target.id==="c-bg")closeComposer()});
document.addEventListener("change",e=>{
  const id=e.target.id,v=e.target.value,d=e.target.dataset;
  if(id==="area"){S.area=v;try{localStorage.setItem("jh_area",v)}catch(_){}render();return}
  if(id==="wf-body"){S.wf.body=v;render();return}
  if(id==="wf-area"){S.wf.area=v;render();return}
  if(id==="age"){S.auth.age=e.target.checked;return}
  if(d.st&&STATUSES.includes(v)){updatePost(d.st,{status:v});return}
  if(d.rb&&bodyById(v)){updatePost(d.rb,{body_id:v});return}
  if(!C)return;
  if(id==="c-area"){C.area=v;C.where=whereFor(v)||C.where;C.dropMla=false;C.dropMp=false;const w=document.getElementById("c-where");if(w)w.value=C.where;detect();refreshComposerParts();return}
  if(id==="c-where"){C.where=v;detect();refreshComposerParts();return}
  if(id==="c-body"){C.body=v;C.bodyManual=!!v;C.extra=C.extra.filter(x=>x!==v);refreshComposerParts();return}
  if(id==="c-img"){pickFile(e.target.files[0],"image");return}
  if(id==="c-vid"){pickFile(e.target.files[0],"video");return}
});
document.addEventListener("input",e=>{
  const id=e.target.id;
  if(id==="reply-text"){S.replyDraft=e.target.value;return}
  if(id&&id.startsWith("al-")){S.linkDraft[id.slice(3)]=e.target.value;return}
  if(id==="email"){S.auth.email=e.target.value;return}
  if(id==="password"){S.auth.password=e.target.value;return}
  if(id==="new-pw"){S.newPw=e.target.value;return}
  if(!C)return;
  if(id==="c-cap"){C.caption=e.target.value;updateMentionList(e.target);const prev=C.cat+"|"+C.body;detect();if(prev!==C.cat+"|"+C.body){const a=document.getElementById("c-cat");if(a)a.innerHTML=catrowHtml();const b=document.getElementById("c-tags");if(b)b.innerHTML=tagboxHtml()}return}
  if(id==="c-place"){C.place=e.target.value;return}
  const lm=id&&id.match(/^c-link(\d)$/);if(lm){C.links[+lm[1]]=e.target.value}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&C){if(C.ml){C.ml=null;document.getElementById("c-ml").innerHTML=""}else closeComposer();return}
  if(C&&C.ml&&e.target.id==="c-cap"&&C.ml.items.length){
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();C.ml.idx=(C.ml.idx+(e.key==="ArrowDown"?1:-1)+C.ml.items.length)%C.ml.items.length;
      document.querySelectorAll("#c-ml button").forEach((b,i)=>b.classList.toggle("on",i===C.ml.idx))}
    else if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();insertMention(C.ml.items[C.ml.idx].id)}
  }
});
document.addEventListener("submit",e=>{
  e.preventDefault();const f=e.target;
  if(f.id==="c-form"){submitComposer();return}
  if(f.id==="auth-form"){doAuth();return}
  if(f.id==="pw-form"){changePassword();return}
});

/* ---------- auth ---------- */
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function doAuth(){
  const A=S.auth, email=A.email.trim(), pw=A.password;
  if(!EMAIL_RE.test(email)){A.err=t("bad_email");render();return}
  if(pw.length<8){A.err=t("bad_pw");render();return}
  if(A.mode==="up"&&!A.age){A.err=t("need_age");render();return}
  A.busy=true;A.err="";render();
  let error=null;
  if(A.mode==="up"){
    const r=await sb.auth.signUp({email,password:pw});
    error=r.error;
    if(!error&&!(r.data&&r.data.session)){A.busy=false;A.mode="in";A.password="";A.err=t("confirm_on");render();return}
  }else{
    const r=await sb.auth.signInWithPassword({email,password:pw});
    error=r.error;
  }
  A.busy=false;
  if(!error)return;
  const m=(error.message||"").toLowerCase();
  if(m.includes("already registered")||m.includes("already exists")||error.code==="user_already_exists"){A.mode="in";A.err=t("email_taken")}
  else if(m.includes("invalid login")||m.includes("invalid credentials")){A.err=t("wrong_login")}
  else if(error.status===429){A.err=t("too_many")}
  else A.err=error.message||t("save_fail");
  render();
}
async function doReset(){
  const email=S.auth.email.trim();
  if(!EMAIL_RE.test(email)){S.auth.err=t("bad_email");render();return}
  S.auth.busy=true;S.auth.err="";render();
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:SITE+"/#me"});
  S.auth.busy=false;render();
  toast(error?t("reset_fail"):t("reset_sent"));
}
async function changePassword(){
  const pw=S.newPw||"";
  if(pw.length<8){toast(t("bad_pw"));return}
  const {error}=await sb.auth.updateUser({password:pw});
  S.newPw="";render();
  toast(error?(error.status===429?t("too_many"):t("save_fail")):t("pw_changed"));
}
async function onAuth(session){
  const prev=S.user&&S.user.id;S.user=session?session.user:null;
  if((S.user&&S.user.id)===prev)return;
  S.isAdmin=false;
  if(S.user){const {data}=await sb.rpc("is_admin");S.isAdmin=!!data;S.auth={mode:"up",email:"",password:"",err:"",busy:false,age:false}}
  await loadMine();
  if(S.isAdmin)await refreshAll();
  if(S.user&&S.afterSignIn){const a=S.afterSignIn;S.afterSignIn=null;if(a==="compose"){location.hash="#feed";setTimeout(()=>openComposer("post"),50)}else location.hash="#"+a}
  render();
}

/* ---------- start ---------- */
(async function start(){
  const qp=new URLSearchParams(location.search).get("p");
  if(qp){history.replaceState(null,"",location.pathname+"#post/"+encodeURIComponent(qp))}
  S.route=parseRoute();render();
  if(!configured){render();return}
  sb.auth.onAuthStateChange((_ev,session)=>{setTimeout(()=>onAuth(session),0)});
  const {data}=await sb.auth.getSession();await onAuth(data.session);
  try{await loadRef();await loadPosts();await loadMine()}catch(e){S.failed=true}
  render();
  if(S.route.name==="post"){try{await loadThread(S.route.id)}catch(e){S.failed=true}render()}
  setInterval(()=>{if(document.visibilityState==="visible"&&!C&&["feed","board"].includes(S.route.name))refreshAll()},60000);
})();
})();
