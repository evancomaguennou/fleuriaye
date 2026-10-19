function init(D){
const FORMS=[{k:'GMP',lab:'GMP',c:'--gmp'},{k:'GI',lab:'GEII',c:'--gei'},{k:'SG',lab:'SGM',c:'--sgm'},{k:'MT2E',lab:'MT2E',c:'--mt2e'},{k:'QLIO',lab:'QLIO',c:'--qlio'},{k:'ITI',lab:'Master ITI',c:'--iti'}];
const cohF=D.coh.map(c=>FORMS.findIndex(f=>c.replace(/\d$/,'')===f.k));
const formN=FORMS.map((_,i)=>D.N.reduce((a,n,j)=>a+(cohF[j]===i?n:0),0));
const TOTAL=D.N.reduce((a,b)=>a+b,0);
const BASE=Date.UTC(2026,7,31);
const DAYMS=864e5, START=450, END=1170, STEP=5;
const byDay=new Map();
D.ev.forEach(e=>{if(!byDay.has(e[0]))byDay.set(e[0],[]);byDay.get(e[0]).push(e)});
const fRooms=D.rooms.map((r,i)=>[r,i]).filter(([r])=>r.startsWith('F-'));
const $=id=>document.getElementById(id);
const css=v=>`var(${v})`;
const fmtT=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const dayDate=d=>new Date(BASE+d*DAYMS);
const DOW=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const fmtDay=(d,long)=>dayDate(d).toLocaleDateString('fr-FR',{timeZone:'UTC',weekday:long?'long':'short',day:'numeric',month:'short'});
function isoWeek(d){const t=dayDate(d);const day=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-day+3);const f=new Date(Date.UTC(t.getUTCFullYear(),0,4));return 1+Math.round(((t-f)/DAYMS-3+((f.getUTCDay()+6)%7))/7)}

function at(day,m){
  const per=new Array(D.coh.length).fill(0), act=[];
  for(const e of byDay.get(day)||[]){ if(e[1]<=m&&m<e[2]){act.push(e);for(let i=0;i<e[6].length;i+=2)per[e[6][i]]+=e[6][i+1];}}
  const form=new Array(FORMS.length).fill(0);
  per.forEach((v,j)=>form[cohF[j]]+=Math.min(v,D.N[j]));
  return {form,total:form.reduce((a,b)=>a+b,0),act};
}
const serCache=new Map();
function series(day){
  if(serCache.has(day))return serCache.get(day);
  const pts=[];for(let m=START;m<=END;m+=STEP){const a=at(day,m);pts.push({m,form:a.form,total:a.total})}
  serCache.set(day,pts);return pts;
}
// Note du jour : rang de la fréquentation moyenne 8h-18h parmi tous les jours de cours de l'année
const SCORE=new Map();
(function(){
  const avgs=[];
  for(const d of byDay.keys()){const wd=dayDate(d).getUTCDay();if(wd===0||wd===6)continue;
    const pts=series(d).filter(p=>p.m>=480&&p.m<1080);const a=pts.reduce((x,p)=>x+p.total,0)/pts.length;if(a>0)avgs.push([d,a]);}
  const sorted=avgs.map(x=>x[1]).sort((a,b)=>a-b);
  avgs.forEach(([d,a])=>{let n=0;while(n<sorted.length&&sorted[n]<=a)n++;const note=Math.max(1,Math.ceil(n/sorted.length*10));SCORE.set(d,{note,avg:Math.round(a)})});
})();
const noteLab=n=>n>=9?'très chargée':n>=7?'chargée':n>=4?'normale':'calme';
const noteCls=n=>n>=9?'n4':n>=7?'n3':n>=4?'n2':'n1';
function nowParis(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  const day=Math.round((Date.UTC(+p.year,+p.month-1,+p.day)-BASE)/DAYMS);
  return {day,m:+p.hour*60+ +p.minute};
}
let NOW=nowParis();
let week=Math.max(0,Math.floor(NOW.day/7));
let pin=null;
const moment=()=>pin||NOW;

function renderTop(){
  const mo=moment(), a=at(mo.day,mo.m);
  $('clock').textContent=`${fmtDay(NOW.day,true)} · ${fmtT(NOW.m)}`;
  $('dot').classList.toggle('off',!!pin);
  $('mode').innerHTML=pin?`<span class="pill">Moment choisi · ${fmtDay(mo.day)} ${fmtT(mo.m)}</span><button type="button" id="live">Revenir au direct</button>`:`<span class="pill live">En direct</span>`;
  if(pin)$('live').onclick=()=>{pin=null;week=Math.max(0,Math.floor(NOW.day/7));renderAll()};
  $('bigN').textContent=a.total.toLocaleString('fr-FR');
  $('bigU').textContent=a.total?`étudiants estimés sur le site, sur ≈ ${TOTAL.toLocaleString('fr-FR')} inscrits`:(pin?'aucun cours à ce moment':'aucun cours en ce moment sur le site');
  $('stack').innerHTML=a.form.map((v,i)=>`<i style="width:${v/TOTAL*100}%;background:${css(FORMS[i].c)}"></i>`).join('');
  $('legend').innerHTML=FORMS.map((f,i)=>`<div><span class="sw" style="background:${css(f.c)}"></span><b>${f.lab}</b><span class="v mono">${a.form[i]} <span style="color:var(--muted)">/ ${formN[i]}</span></span></div>`).join('');
  const occ=new Set(a.act.map(e=>D.rooms[e[3]]).filter(r=>r.startsWith('F-')));
  $('kRooms').textContent=occ.size;$('kRoomsS').textContent=`sur ${fRooms.length} salles utilisées dans l'année`;
  $('kSess').textContent=a.act.length;$('kSessS').textContent=a.act.length?`${new Set(a.act.flatMap(e=>e[6].filter((_,i)=>i%2==0))).size} promos concernées`:'aucune';
  const s=series(mo.day);let pk=s[0];s.forEach(p=>{if(p.total>pk.total)pk=p});
  const sc=SCORE.get(mo.day);
  $('kNote').innerHTML=sc?`${sc.note}<span style="font-size:.55em;color:var(--muted)">/10</span>`:'–';
  $('kNoteS').textContent=sc?`journée ${noteLab(sc.note)}, ≈ ${sc.avg} présents en moyenne`:'pas de cours ce jour';
  $('kNoteBox').className='kpi note '+(sc?noteCls(sc.note):'');
  $('kPeak').textContent=pk.total;$('kPeakS').textContent=pk.total?`à ${fmtT(pk.m)}, ${fmtDay(mo.day)}`:'pas de cours ce jour';
  const lab=`${fmtDay(mo.day)} · ${fmtT(mo.m)}`;$('momentA').textContent=lab;$('momentB').textContent=lab;
  renderRooms(a);renderList(a);
}

function renderRooms(a){
  const occ=new Map();
  a.act.forEach(e=>{const r=D.rooms[e[3]];let best=-1,bv=-1,tot=0;for(let i=0;i<e[6].length;i+=2){tot+=e[6][i+1];if(e[6][i+1]>bv){bv=e[6][i+1];best=cohF[e[6][i]]}}const o=occ.get(r);if(!o||tot>o.tot)occ.set(r,{f:best,tot,e})});
  const B=new Map();fRooms.forEach(([r])=>{const b=r[2];if(!B.has(b))B.set(b,[]);B.get(b).push(r)});
  $('blds').innerHTML=[...B.keys()].sort().map(b=>{const rs=B.get(b).sort((x,y)=>x.localeCompare(y,'fr',{numeric:true}));const n=rs.filter(r=>occ.has(r)).length;
    return `<div class="bld"><header><b>Bât. ${b}</b><span>${n}/${rs.length}</span></header><div class="rooms">${rs.map(r=>{const o=occ.get(r);const lab=r.slice(3);
      return o?`<button type="button" class="room on" style="background:${css(FORMS[o.f].c)}" data-tip="${r} · ${esc(D.titles[o.e[5]])} · ≈ ${o.tot} étud. · ${fmtT(o.e[1])}–${fmtT(o.e[2])}">${lab}</button>`:`<span class="room" title="${r} libre">${lab}</span>`}).join('')}</div></div>`}).join('');
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function cohLabel(e){const out=[];for(let i=0;i<e[6].length;i+=2){const c=D.coh[e[6][i]];out.push(c.replace(/^GI/,'GEII').replace(/^SG/,'SGM'))}return out.join(', ')}
function renderList(a){
  const rows=a.act.map(e=>{let t=0,f=-1,bv=-1;for(let i=0;i<e[6].length;i+=2){t+=e[6][i+1];if(e[6][i+1]>bv){bv=e[6][i+1];f=cohF[e[6][i]]}}return{e,t,f}}).sort((x,y)=>y.t-x.t);
  $('list').innerHTML=rows.length?rows.map(({e,t,f})=>`<div class="row"><span class="r">${esc(D.rooms[e[3]]?D.rooms[e[3]].replace(/^F-/,''):'—')}</span><div class="t"><div title="${esc(D.titles[e[5]])}">${esc(D.titles[e[5]])}</div><small>${esc(D.types[e[4]])} · ${cohLabel(e)} · ${fmtT(e[1])}–${fmtT(e[2])}</small></div><span class="c"><span class="sw" style="background:${css(FORMS[f].c)}"></span>${t}</span></div>`).join(''):`<div class="empty">Aucune séance à ce moment.</div>`;
}

function renderWeek(){
  const d0=week*7, days=[0,1,2,3,4].map(i=>d0+i);
  if((byDay.get(d0+5)||[]).length)days.push(d0+5);
  $('wk').innerHTML=`Semaine ${isoWeek(d0)}<small>${fmtDay(d0)} – ${fmtDay(days[days.length-1])}</small>`;
  const W=1100,L=86,R=10,T=22,RH=66,G=12,H=T+days.length*(RH+G);
  const x=m=>L+(m-START)/(END-START)*(W-L-R);
  let max=0;days.forEach(d=>series(d).forEach(p=>max=Math.max(max,p.total)));
  const ymax=Math.max(200,Math.ceil(max/100)*100);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:640px" role="img" aria-label="Fréquentation estimée par jour, semaine ${isoWeek(d0)}">`;
  for(let h=8;h<=19;h++){s+=`<line class="gridl" x1="${x(h*60)}" x2="${x(h*60)}" y1="${T-4}" y2="${H-G}"/><text class="tick" x="${x(h*60)}" y="${T-8}" text-anchor="middle">${h}h</text>`}
  days.forEach((d,r)=>{
    const y0=T+r*(RH+G), base=y0+RH, sc=v=>v/ymax*RH, pts=series(d);
    s+=`<line class="gridl" x1="${L}" x2="${W-R}" y1="${base}" y2="${base}"/>`;
    const cum=pts.map(()=>0);
    FORMS.forEach((f,i)=>{
      const top=pts.map((p,k)=>cum[k]+p.form[i]);
      if(top.every((v,k)=>v===cum[k]))return;
      let dp=`M${x(pts[0].m)},${base-sc(top[0])}`;pts.forEach((p,k)=>{dp+=`L${x(p.m)},${base-sc(top[k])}`});
      for(let k=pts.length-1;k>=0;k--)dp+=`L${x(pts[k].m)},${base-sc(cum[k])}`;
      s+=`<path d="${dp}Z" fill="${css(f.c)}" fill-opacity=".88"/>`;top.forEach((v,k)=>cum[k]=v);
    });
    let pk=0,pm=0;pts.forEach(p=>{if(p.total>pk){pk=p.total;pm=p.m}});
    const ds=SCORE.get(d);
    s+=`<text class="daylab" x="0" y="${y0+18}">${DOW[dayDate(d).getUTCDay()]} ${dayDate(d).getUTCDate()}</text>`;
    if(ds){s+=`<rect class="nb ${noteCls(ds.note)}" x="0" y="${y0+25}" width="44" height="19" rx="4"/><text class="nt" x="22" y="${y0+39}" text-anchor="middle">${ds.note}/10</text><text class="daysub" x="0" y="${y0+58}">${noteLab(ds.note)}</text>`}
    else s+=`<text class="daysub" x="0" y="${y0+36}">pas de cours</text>`;
    if(d===NOW.day&&NOW.m>=START&&NOW.m<=END)s+=`<line class="nowl" x1="${x(NOW.m)}" x2="${x(NOW.m)}" y1="${y0-2}" y2="${base}"/>`;
    if(pin&&pin.day===d)s+=`<line class="cur" x1="${x(pin.m)}" x2="${x(pin.m)}" y1="${y0-2}" y2="${base}"/>`;
    s+=`<rect data-day="${d}" x="${L}" y="${y0}" width="${W-L-R}" height="${RH}" fill="transparent" style="cursor:crosshair"/>`;
  });
  s+=`<text class="tick" x="${W-R}" y="${H-1}" text-anchor="end">échelle : ${ymax} étudiants par bande</text></svg>`;
  $('chart').innerHTML=s;
  const svg=$('chart').querySelector('svg');
  const toM=(ev,rect)=>{const b=svg.getBoundingClientRect(),sx=W/b.width;const vx=(ev.clientX-b.left)*sx;let m=START+(vx-L)/(W-L-R)*(END-START);m=Math.round(m/STEP)*STEP;return Math.min(END,Math.max(START,m))};
  svg.querySelectorAll('rect[data-day]').forEach(rc=>{
    rc.addEventListener('click',ev=>{pin={day:+rc.dataset.day,m:toM(ev)};renderAll()});
    rc.addEventListener('pointermove',ev=>{const m=toM(ev),d=+rc.dataset.day,a=at(d,m);showTip(ev,`${fmtDay(d)} ${fmtT(m)} · ≈ ${a.total} étudiants`+(SCORE.get(d)?` · journée ${SCORE.get(d).note}/10 (moy. ${SCORE.get(d).avg})`:''))});
    rc.addEventListener('pointerleave',hideTip);
  });
}
const tip=$('tip');
function showTip(ev,t){tip.textContent=t;tip.hidden=false;const w=tip.offsetWidth;tip.style.left=Math.min(innerWidth-w-8,ev.clientX+12)+'px';tip.style.top=(ev.clientY+14)+'px'}
function hideTip(){tip.hidden=true}
document.addEventListener('pointerover',ev=>{const t=ev.target.closest&&ev.target.closest('[data-tip]');if(t)showTip(ev,t.dataset.tip)});
document.addEventListener('pointerout',ev=>{if(ev.target.closest&&ev.target.closest('[data-tip]'))hideTip()});
document.addEventListener('focusin',ev=>{const t=ev.target.closest('[data-tip]');if(t){const b=t.getBoundingClientRect();showTip({clientX:b.left,clientY:b.bottom},t.dataset.tip)}});
document.addEventListener('focusout',hideTip);

$('prev').onclick=()=>{week=Math.max(0,week-1);renderWeek()};
$('next').onclick=()=>{week=Math.min(Math.floor(Math.max(...byDay.keys())/7),week+1);renderWeek()};
$('today').onclick=()=>{week=Math.max(0,Math.floor(NOW.day/7));renderWeek()};

$('foot').innerHTML=`<span class="label">Méthode</span>
<span>Emplois du temps CELCAT de l'IUT de Nantes publiés le ${D.published} : ${D.ev.length.toLocaleString('fr-FR')} séances des promos GMP, GEII, SGM, MT2E, QLIO et Master ITI, en salles F- (Fleuriaye). Les périodes en entreprise, les jours fériés et le distanciel sont exclus.</span>
<span>Effectifs estimés : 1re année = places Parcoursup ; 2e et 3e année = 86 % de la 1re année (calé sur GMP3 = 89) ; Master ITI = 33 en M1 et en M2. Chaque groupe reçoit une part de sa promo selon sa place dans l'arborescence des groupes (FI et alternance supposés à parts égales), plafonnée à l'effectif de la promo.</span>
<span>Note du jour : la fréquentation moyenne entre 8h et 18h est classée parmi les ${SCORE.size} jours de cours de l'année. 1/10 = parmi les 10 % de jours les plus calmes, 10/10 = parmi les 10 % les plus chargés.</span>
<span>Données régénérées chaque nuit depuis l'EDT en ligne (dernière mise à jour : ${new Date(D.generated).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'})}).${D.missing&&D.missing.length?` Groupes non récupérés : ${D.missing.length}.`:''} L'heure est celle de Paris et avance en direct.</span>`;

function renderAll(){renderTop();renderWeek()}
renderAll();
setInterval(()=>{const n=nowParis();if(n.m!==NOW.m||n.day!==NOW.day){NOW=n;renderAll()}},20000);

}

async function boot(){
  try{
    const r=await fetch('data.json',{cache:'no-cache'});
    if(!r.ok)throw new Error(r.status);
    init(await r.json());
  }catch(e){
    document.getElementById('bigN').textContent='–';
    document.getElementById('bigU').textContent="Impossible de charger les données. Vérifie ta connexion puis rouvre l'appli.";
  }
}
boot();
if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
