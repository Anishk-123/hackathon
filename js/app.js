/* ResQNet frontend – plain JS. DEMO MODE: the "server" is this browser's localStorage.
   Everything marked "delivered" here is only delivered to that local demo store. */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
const LS=(k,v)=>{if(v===undefined){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}localStorage.setItem(k,JSON.stringify(v))};
let lang=LS('rq_lang')||'en';
const t=k=>(I18N[lang]&&I18N[lang][k])||I18N.en[k]||k;
const TYPES=['Flood','Landslide','Cyclone','Earthquake','Fire','Medical','Other'];
const STATUS=['Received','Verified','Assigned','Accepted','Travelling','Arrived','In progress','Completed','Unable to access'];
const PRIS=['RED','ORANGE','YELLOW','GREEN'];
const PLABEL={RED:'Critical',ORANGE:'High',YELLOW:'Moderate',GREEN:'Low'};
const PCOL={RED:'#d32f2f',ORANGE:'#ef6c00',YELLOW:'#f9a825',GREEN:'#2e7d32'};

/* ---------- demo database ---------- */
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
let db=LS('rq_db');
async function seed(){
  if(db)return;
  const h=await sha('demo123');
  db={users:[
   {id:'u1',name:'Demo Citizen',email:'citizen@demo',pw:h,role:'citizen'},
   {id:'u2',name:'Demo Control Room',email:'authority@demo',pw:h,role:'authority'},
   {id:'u3',name:'Demo Rescue Member',email:'rescue@demo',pw:h,role:'rescue',teamId:'t1'}],
   incidents:[],teams:[{id:'t1',name:'Demo Team Alpha',skills:'Boat rescue, first aid',status:'Available'}],
   hazards:[],zones:[],alerts:[],notifs:[],audit:[]};
  save();
}
const save=()=>LS('rq_db',db);
const audit=(who,what)=>{db.audit.unshift({at:Date.now(),who,what});db.audit=db.audit.slice(0,200)};
const notify=(to,text)=>{db.notifs.unshift({id:uid(),to,text,at:Date.now(),read:false})};
let me=LS('rq_session'),tab=null,toastT;
const toast=m=>{const e=$('#toast');e.textContent=m;e.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>e.style.display='none',3500)};
const ago=ts=>{const m=Math.round((Date.now()-ts)/60000);return m<1?'just now':m<60?m+' min ago':Math.round(m/60)+' h ago'};

/* ---------- AI-assisted triage (rule-based fallback; optional model needs a backend) ---------- */
function triage(i){
  const txt=(i.desc||'').toLowerCase(),why=[];let s=0;
  const K={5:['not breathing','unconscious','drowning','heavy bleeding','trapped','collapsed','heart attack','cardiac'],
           3:['injur','bleeding','stuck','water rising','rising water','fracture','pregnan','fire','landslide'],
           1:['need','help','damage','food','water','medicine','road blocked']};
  for(const w in K){const f=K[w].filter(k=>txt.includes(k));if(f.length){s+=Math.min(+w+f.length-1,6);why.push('keywords: '+f.join(', '))}}
  if(i.people>=10){s+=2;why.push(i.people+' people affected')}else if(i.people>=4){s+=1;why.push(i.people+' people affected')}
  if(i.injury){s+=3;why.push('injury/medical reported')}
  if(i.vulnerable){s+=2;why.push('children/elderly/disabled need help')}
  if(['Earthquake','Fire','Medical'].includes(i.type)){s+=1;why.push('high-risk type: '+i.type)}
  const p=s>=7?'RED':s>=4?'ORANGE':s>=1?'YELLOW':'GREEN';
  return{priority:p,reason:(why.join('; ')||'No urgent indicators found')+'. Rule-based suggestion only – not medically validated; a human operator decides.',method:'keyword-fallback',confidence:null,score:s};
}

/* ---------- SOS delivery / offline queue ---------- */
const queue=()=>LS('rq_queue')||[];
function deliver(inc){
  if(db.incidents.some(x=>x.key===inc.key))return false; // idempotency: no duplicates
  const tr=triage(inc);
  inc.priority=tr.priority;inc.triage=tr;inc.status='Received';inc.notes=[];inc.history=[{at:Date.now(),s:'Received'}];inc.priHistory=[];inc.deliveredAt=Date.now();
  db.incidents.unshift(inc);
  notify('role:authority','New SOS '+inc.id+' ('+inc.type+') suggested '+tr.priority);
  notify('user:'+inc.userId,'Your SOS '+inc.id+' was received by the control room (demo store).');
  audit('system','Incident '+inc.id+' created, AI/rules suggested '+tr.priority);
  save();return true;
}
function syncQueue(){
  db=LS('rq_db')||db;
  const q=queue();if(!q.length||!navigator.onLine)return;
  let n=0;q.forEach(i=>{if(deliver(i))n++});LS('rq_queue',[]);
  if(n){toast(n+' saved report(s) delivered');render()}
}
function updateNet(){const b=$('#netbar');const on=navigator.onLine;b.className=on?'':'off';b.textContent=on?'● '+t('online'):'● '+t('offline')}
addEventListener('online',()=>{updateNet();syncQueue()});addEventListener('offline',updateNet);

/* ---------- helpers ---------- */
const tabsFor={citizen:['home','mine','hazards','map','alerts','satellite','notifs','settings'],
 authority:['dash','incidents','teams','hazards','map','alerts','satellite','notifs','settings'],
 rescue:['assign','hazards','map','notifs','settings']};
const myNotifs=()=>db.notifs.filter(n=>n.to==='user:'+me.id||n.to==='role:'+me.role||(me.teamId&&n.to==='team:'+me.teamId));
const badge=p=>`<span class="badge ${p}">${p} · ${PLABEL[p]}</span>`;
const opts=(a,s)=>a.map(x=>`<option ${x===s?'selected':''}>${esc(x)}</option>`).join('');
function getGPS(cb){
  if(!navigator.geolocation)return cb(null,'GPS not supported');
  navigator.geolocation.getCurrentPosition(p=>cb({lat:p.coords.latitude,lng:p.coords.longitude}),e=>cb(null,e.message),{timeout:10000});
}
function speak(text){
  if(!('speechSynthesis' in window))return toast('Text-to-speech not supported – please read the text.');
  const u=new SpeechSynthesisUtterance(text);u.lang=LANGCODE[lang];speechSynthesis.cancel();speechSynthesis.speak(u);
}
function listen(targetId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return toast('Voice input not supported in this browser – please type.');
  const r=new SR();r.lang=LANGCODE[lang];r.onresult=e=>{$('#'+targetId).value+=' '+e.results[0][0].transcript;toast('Check and edit the text before sending')};
  r.onerror=()=>toast('Voice input failed (needs internet in most browsers). Please type.');r.start();toast('Listening…');
}

/* ---------- map ---------- */
let map;
function drawMap(id,showIncidents){
  const el=document.getElementById(id);if(!el)return;
  if(typeof L==='undefined'){el.innerHTML='<div class="warn">Map library could not load (needs internet the first time).</div>';return}
  if(map){map.remove();map=null}
  map=L.map(id).setView([13.63,74.69],9); // Kundapura area as default view only
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  const pts=[];
  if(showIncidents){
    visibleIncidents().filter(i=>i.lat!=null).forEach(i=>{
      L.circleMarker([i.lat,i.lng],{radius:9,color:'#222',weight:1,fillColor:PCOL[i.priority],fillOpacity:.9}).addTo(map)
       .bindPopup(`<b>${esc(i.id)}</b><br>${esc(i.type)} – ${i.priority}<br>${esc(i.status)}<br><i>${i.verified?'Verified':'UNVERIFIED'}</i>`);pts.push([i.lat,i.lng])});
  }
  db.hazards.filter(h=>h.lat!=null&&h.status!=='Rejected').forEach(h=>{
    L.marker([h.lat,h.lng]).addTo(map).bindPopup(`<b>Hazard: ${esc(h.cat)}</b><br>${esc(h.desc)}<br><i>${esc(h.status)}</i>`);pts.push([h.lat,h.lng])});
  db.zones.forEach(z=>{L.circle([z.lat,z.lng],{radius:300,color:'#2e7d32',fillOpacity:.25}).addTo(map).bindPopup(`<b>${esc(z.kind)}: ${esc(z.name)}</b><br>${esc(z.info)}<br><i>Added by authority</i>`);pts.push([z.lat,z.lng])});
  if(pts.length)map.fitBounds(pts,{maxZoom:13,padding:[30,30]});
}
function visibleIncidents(){
  if(me.role==='authority')return db.incidents;
  if(me.role==='rescue')return db.incidents.filter(i=>i.teamId===me.teamId);
  return db.incidents.filter(i=>i.userId===me.id);
}

/* ---------- views ---------- */
const V={};
V.home=()=>`<div class="card"><h2>${t('sosTitle')}</h2>
<div class="warn">If you are in immediate danger, also call your local emergency number (112 in India). This app may not reach responders without a working connection.</div>
<form id="sosForm">
<label>${t('type')}</label><select id="stype">${opts(TYPES)}</select>
<label>${t('desc')}</label><textarea id="sdesc" required></textarea>
<button type="button" class="btn sec" data-act="voice" data-arg="sdesc">🎤 ${t('voice')}</button>
<div class="row"><div><label>${t('people')}</label><input id="spl" type="number" min="1" value="1"></div></div>
<label><input type="checkbox" id="sinj" style="width:auto"> Injury / medical emergency</label>
<label><input type="checkbox" id="svul" style="width:auto"> Children, elderly or disabled people need help</label>
<label>${t('manual')}</label><input id="sloc" placeholder="Village, landmark, district">
<button type="button" class="btn sec" data-act="gps">📍 ${t('gps')}</button><span id="gpsout" class="mut"></span>
<label><input type="checkbox" id="scons" style="width:auto" required> ${t('consent')}</label>
<p class="mut">Photo/video upload needs the backend (Cloud Storage) and is not included in this frontend-only demo.</p>
<button class="sos" type="submit">${t('sos')}</button></form><div id="sosStatus"></div></div>`;
V.mine=()=>{
  const q=queue().filter(x=>x.userId===me.id),d=db.incidents.filter(i=>i.userId===me.id);
  return `<h2>${t('mine')}</h2>`+(q.length+d.length?'':'<div class="card">No requests yet.</div>')+
  q.map(i=>`<div class="card"><b>${i.id}</b> ${esc(i.type)} <span class="badge gray">${t('saved')}</span><p>${esc(i.desc)}</p></div>`).join('')+
  d.map(i=>`<div class="card"><b>${i.id}</b> ${esc(i.type)} ${badge(i.priority)} <span class="badge gray">${esc(i.status)}</span><p>${esc(i.desc)}</p>
  <p class="mut">${t('delivered')} · ${ago(i.deliveredAt)}</p></div>`).join('');
};
V.hazards=()=>`<h2>${t('hazards')}</h2><div class="card"><form id="hzForm">
<div class="row"><div><label>Category</label><select id="hcat">${opts(['Flooded road','Fallen tree','Landslide','Damaged bridge','Blocked road','Damaged building','Unsafe area','Other'])}</select></div>
<div><label>Location (text)</label><input id="hloc" placeholder="Landmark"></div></div>
<label>Description</label><textarea id="hdesc" required></textarea>
<button type="button" class="btn sec" data-act="hgps">📍 ${t('gps')}</button><span id="hgpsout" class="mut"></span><br>
<button class="btn" type="submit">Submit hazard report</button></form></div>
<div class="card"><h3>Reports</h3><div class="tablewrap"><table><tr><th>Category</th><th>Description</th><th>Status</th><th>When</th>${me.role==='authority'?'<th>Action</th>':''}</tr>
${db.hazards.map(h=>`<tr><td>${esc(h.cat)}</td><td>${esc(h.desc)}<br><span class="mut">${esc(h.loc)}</span></td>
<td><span class="badge ${h.status==='Verified'?'GREEN':h.status==='Rejected'?'RED':'gray'}">${h.status==='Pending'?'UNVERIFIED':esc(h.status)}</span></td><td>${ago(h.at)}</td>
${me.role==='authority'?`<td><button class="btn grn" data-act="hz" data-arg="${h.id}|Verified">Verify</button><button class="btn red" data-act="hz" data-arg="${h.id}|Rejected">Reject</button><button class="btn sec" data-act="hz" data-arg="${h.id}|Resolved">Resolve</button></td>`:''}</tr>`).join('')||'<tr><td colspan=5>No reports.</td></tr>'}</table></div></div>`;
V.map=()=>`<h2>${t('map')}</h2><div id="mapbox" class="map"></div>
<div class="warn">Markers show only reports in this demo. Unverified items are labelled. No route is ever described as safe unless an authority verifies it. Safe zones and shelters are listed only if an authority adds them.</div>
${me.role==='authority'?`<div class="card"><h3>Add safe zone / shelter / hospital</h3><form id="zoneForm"><div class="row">
<input id="zname" placeholder="Name" required><select id="zkind">${opts(['Safe zone','Evacuation centre','Hospital','Fire station','Police station'])}</select></div>
<div class="row"><input id="zlat" type="number" step="any" placeholder="Latitude" required><input id="zlng" type="number" step="any" placeholder="Longitude" required></div>
<input id="zinfo" placeholder="Info (capacity, contact…)"><button class="btn">Add</button></form></div>`:''}
<div class="card"><h3>Directions</h3><p class="mut">Opens OpenStreetMap routing in a new tab. Routes are NOT verified as safe.</p>
<input id="dfrom" placeholder="From (place)"><input id="dto" placeholder="To (place)" style="margin-top:6px"><button class="btn" data-act="route">Open directions</button></div>`;
V.alerts=()=>`<h2>${t('alerts')}</h2>
<div class="card"><h3>Public alerts</h3>${db.alerts.map(a=>`<div class="warn"><b>${esc(a.sev)}</b> – ${esc(a.text)}<br><span class="mut">Source: ${esc(a.src)} · ${new Date(a.at).toLocaleString()}</span></div>`).join('')||'<p>No alerts issued.</p>'}
${me.role==='authority'?`<form id="alertForm"><div class="row"><select id="asev">${opts(['Advisory','Watch','Warning','Evacuate'])}</select></div><textarea id="atext" required placeholder="Public alert text (no private info)"></textarea><button class="btn red">Send public alert</button></form>`:''}</div>
<div class="card"><h3>Weather / hazard feeds</h3><div class="sim"><b>DEMONSTRATION DATA – not a live warning.</b> No external warning API is configured in this frontend. Connect IMD/NDMA/USGS feeds via a backend to show real alerts.</div>
<table><tr><th>Source</th><th>Type</th><th>Severity</th><th>Coverage</th><th>Status</th></tr><tr><td>Demo</td><td>Heavy rainfall</td><td>Watch</td><td>Sample district</td><td>Unverified demo</td></tr></table></div>
<div class="card"><h3>${t('instr')}</h3><p>${t('instrText')}</p><button class="btn sec" data-act="tts">🔊 ${t('speak')}</button></div>`;
V.notifs=()=>`<h2>${t('notifs')}</h2><button class="btn sec" data-act="readall">Mark all read</button>
${myNotifs().map(n=>`<div class="card" ${n.read?'style="opacity:.6"':''}>${esc(n.text)}<div class="mut">${ago(n.at)}</div></div>`).join('')||'<div class="card">No notifications.</div>'}
<p class="mut">In-app only. Push notifications (Firebase Cloud Messaging) need the backend.</p>`;
V.settings=()=>`<h2>${t('settings')}</h2><div class="card"><label>${t('lang')}</label><select id="langSel">${['en','kn','hi'].map(l=>`<option value="${l}" ${l===lang?'selected':''}>${{en:'English',kn:'ಕನ್ನಡ',hi:'हिन्दी'}[l]}</option>`).join('')}</select>
<h3>Notification preferences</h3><label><input type="checkbox" id="pn1" style="width:auto" checked> Incident updates</label><label><input type="checkbox" id="pn2" style="width:auto" checked> Public alerts</label>
<h3>Account</h3><button class="btn red" data-act="delme">Delete my data from this device</button></div>
<div class="card"><h3>${t('privacy')}</h3><p class="mut">This demo stores all data only in your browser (localStorage). Location is collected only with your consent and used only to send help. Precise locations are visible to the control room and the assigned rescue team, never publicly. Real deployments need a secure backend, retention rules and deletion controls.</p></div>`;
V.satellite=()=>{
  const open=(Math.floor(Date.now()/1000)%120)<30,msgs=LS('rq_sat')||[];
  return `<h2>${t('satellite')}</h2><div class="sim"><b>SIMULATION ONLY.</b> No real satellite, radio or hardware is used. This only demonstrates store-and-forward behaviour.</div>
<div class="card"><p>Simulated satellite window: <span class="badge ${open?'GREEN':'RED'}">${open?'OPEN':'CLOSED'}</span> <span class="mut">(opens 30 s out of every 2 min)</span></p>
<textarea id="satmsg" placeholder="Short message to queue"></textarea><button class="btn" data-act="satq">Queue message</button></div>
<div class="card"><h3>Message queue</h3>${msgs.map(m=>`<p>${esc(m.text)} – <span class="badge ${m.st==='Delivered (simulated)'?'GREEN':'gray'}">${m.st}</span></p>`).join('')||'<p>Empty.</p>'}</div>`;
};
V.dash=()=>{
  const I=db.incidents,act=I.filter(i=>i.status!=='Completed'),cnt=p=>I.filter(i=>i.priority===p).length,mx=Math.max(1,...PRIS.map(cnt));
  return `<h2>${t('dash')}</h2><div class="grid">
<div class="stat"><b>${I.length}</b>Total incidents</div><div class="stat"><b>${act.length}</b>Active</div>
<div class="stat"><b>${I.filter(i=>i.priority==='RED'&&i.status!=='Completed').length}</b>Critical active</div>
<div class="stat"><b>${I.filter(i=>i.status==='Received').length}</b>Pending SOS</div>
<div class="stat"><b>${db.teams.filter(x=>x.status==='Available').length}</b>Teams available</div>
<div class="stat"><b>${db.teams.filter(x=>x.status==='Deployed').length}</b>Teams deployed</div>
<div class="stat"><b>${I.filter(i=>i.status==='Completed').length}</b>Completed</div></div><br>
<div class="card"><h3>Priority distribution</h3>${PRIS.map(p=>`<div>${p} (${cnt(p)})<div class="bar" style="width:${cnt(p)/mx*100}%;background:${PCOL[p]};min-width:4px"></div></div>`).join('')}</div>
<div id="mapbox" class="map"></div>
<div class="card"><h3>Latest reports</h3>${I.slice(0,5).map(i=>`<p>${badge(i.priority)} <b>${i.id}</b> ${esc(i.type)} – ${esc(i.status)} · ${ago(i.deliveredAt)}</p>`).join('')||'None yet.'}</div>`;
};
let fil={q:'',type:'',pri:'',loc:''},openId=null;
V.incidents=()=>{
  if(openId)return incDetail(db.incidents.find(i=>i.id===openId));
  const L=db.incidents.filter(i=>(!fil.q||i.id.toLowerCase().includes(fil.q.toLowerCase()))&&(!fil.type||i.type===fil.type)&&(!fil.pri||i.priority===fil.pri)&&(!fil.loc||(i.locText||'').toLowerCase().includes(fil.loc.toLowerCase())));
  return `<h2>${t('incidents')}</h2><div class="card"><div class="row">
<input id="fq" placeholder="Search ID" value="${esc(fil.q)}"><select id="ftype"><option value="">All types</option>${opts(TYPES,fil.type)}</select>
<select id="fpri"><option value="">All priorities</option>${opts(PRIS,fil.pri)}</select><input id="floc" placeholder="District / place" value="${esc(fil.loc)}">
<button class="btn" data-act="filter">Filter</button><button class="btn sec" data-act="csv">Export CSV</button></div></div>
<div class="card tablewrap"><table><tr><th>ID</th><th>Type</th><th>Priority</th><th>Status</th><th>Age</th><th></th></tr>
${L.map(i=>`<tr><td>${i.id}</td><td>${esc(i.type)}</td><td>${badge(i.priority)}</td><td>${esc(i.status)}</td><td>${ago(i.deliveredAt)}</td><td><button class="btn sec" data-act="open" data-arg="${i.id}">Open</button></td></tr>`).join('')||'<tr><td colspan=6>No incidents.</td></tr>'}</table></div>`;
};
function incDetail(i){
  if(!i)return'';
  return `<button class="btn sec" data-act="open" data-arg="">← Back</button><div class="card"><h2>${i.id} ${badge(i.priority)}</h2>
<p><b>${esc(i.type)}</b> · ${i.people} people · ${esc(i.status)} · ${i.verified?'Verified':'<b>UNVERIFIED</b>'}</p><p>${esc(i.desc)}</p>
<p class="mut">Location: ${i.lat!=null?i.lat.toFixed(4)+', '+i.lng.toFixed(4):'no GPS'} ${esc(i.locText)}</p>
<h3>AI/rule-based triage suggestion</h3><p>Suggested <b>${i.triage.priority}</b> (${i.triage.method}, confidence: ${i.triage.confidence??'n/a'}). ${esc(i.triage.reason)}</p>
<div class="row"><select id="newpri">${opts(PRIS,i.priority)}</select><input id="prireason" placeholder="Reason for override"><button class="btn org" data-act="pri" data-arg="${i.id}">Override priority</button></div>
<div class="row"><select id="newst">${opts(STATUS,i.status)}</select><button class="btn" data-act="st" data-arg="${i.id}">Update status</button><button class="btn grn" data-act="verify" data-arg="${i.id}">Mark verified</button></div>
<div class="row"><select id="team">${db.teams.map(x=>`<option value="${x.id}" ${x.id===i.teamId?'selected':''}>${esc(x.name)} (${x.status})</option>`).join('')}</select><button class="btn" data-act="assignTeam" data-arg="${i.id}">Assign team</button></div>
<div class="row"><input id="note" placeholder="Internal note"><button class="btn sec" data-act="note" data-arg="${i.id}">Add note</button></div>
<h4>Notes</h4>${i.notes.map(n=>`<p>• ${esc(n.text)} <span class="mut">${ago(n.at)}</span></p>`).join('')||'<p class="mut">None</p>'}
<h4>Audit trail</h4>${[...i.priHistory.map(p=>`Priority ${p.from} → ${p.to} by ${p.by} (${esc(p.why)})`),...i.history.map(h=>`Status: ${h.s}`)].map(x=>`<p class="mut">${x}</p>`).join('')}</div>`;
}
V.teams=()=>`<h2>${t('teams')}</h2><div class="card"><form id="teamForm"><div class="row"><input id="tname" placeholder="Team name" required><input id="tskill" placeholder="Capabilities"></div><button class="btn">Create team</button></form></div>
<div class="card tablewrap"><table><tr><th>Team</th><th>Capabilities</th><th>Status</th></tr>${db.teams.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.skills)}</td><td>${x.status}</td></tr>`).join('')}</table></div>
<p class="mut">Rescue members: register with role “Rescue team”; demo member is linked to Demo Team Alpha.</p>`;
V.assign=()=>{
  const L=db.incidents.filter(i=>i.teamId===me.teamId);
  return `<h2>${t('assign')}</h2>${L.map(i=>`<div class="card"><b>${i.id}</b> ${badge(i.priority)} ${esc(i.type)} · ${i.people} people<p>${esc(i.desc)}</p>
<p class="mut">Location: ${i.lat!=null?i.lat.toFixed(4)+', '+i.lng.toFixed(4):'no GPS'} ${esc(i.locText)}</p><p>Status: <b>${esc(i.status)}</b></p>
${i.status==='Assigned'?`<button class="btn grn" data-act="rst" data-arg="${i.id}|Accepted">Accept</button><button class="btn red" data-act="rst" data-arg="${i.id}|Received">Reject</button>`:
 i.status==='Completed'?'':`<select id="rs-${i.id}">${opts(['Travelling','Arrived','In progress','Completed','Unable to access'],'')}</select><button class="btn" data-act="rstSel" data-arg="${i.id}">Update progress</button>`}</div>`).join('')||'<div class="card">No assignments.</div>'}`;
};

/* ---------- actions ---------- */
const A={
 voice:id=>listen(id),
 gps:()=>getGPS((p,e)=>{if(p){window._gps=p;$('#gpsout').textContent=' Location captured';}else{$('#gpsout').textContent=' GPS unavailable ('+e+') – type your location instead'}}),
 hgps:()=>getGPS((p,e)=>{if(p){window._hgps=p;$('#hgpsout').textContent=' Captured'}else $('#hgpsout').textContent=' GPS unavailable – type location'}),
 tts:()=>speak(t('instrText')),
 readall:()=>{myNotifs().forEach(n=>n.read=true);save();render()},
 hz:a=>{const[id,s]=a.split('|');const h=db.hazards.find(x=>x.id===id);h.status=s;audit(me.name,'Hazard '+id+' '+s);save();render()},
 route:()=>{const f=$('#dfrom').value,to=$('#dto').value;if(!f||!to)return toast('Enter both places');
   window.open('https://www.openstreetmap.org/directions?from='+encodeURIComponent(f)+'&to='+encodeURIComponent(to),'_blank')},
 satq:()=>{const x=$('#satmsg').value.trim();if(!x)return;const m=LS('rq_sat')||[];m.unshift({text:x,st:'Queued – waiting for window'});LS('rq_sat',m);render()},
 filter:()=>{fil={q:$('#fq').value,type:$('#ftype').value,pri:$('#fpri').value,loc:$('#floc').value};render()},
 open:id=>{openId=id||null;render()},
 csv:()=>{const r=[['id','type','priority','status','people','created']].concat(db.incidents.map(i=>[i.id,i.type,i.priority,i.status,i.people,new Date(i.deliveredAt).toISOString()]));
   const b=new Blob([r.map(x=>x.join(',')).join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='resqnet-incidents.csv';a.click()},
 pri:id=>{const i=db.incidents.find(x=>x.id===id),to=$('#newpri').value,why=$('#prireason').value.trim();if(!why)return toast('Please enter a reason');
   i.priHistory.push({from:i.priority,to,by:me.name,why,at:Date.now()});audit(me.name,'Priority '+id+' '+i.priority+'→'+to+': '+why);i.priority=to;save();render()},
 st:id=>setStatus(id,$('#newst').value),
 verify:id=>{const i=db.incidents.find(x=>x.id===id);i.verified=true;if(i.status==='Received')i.status='Verified',i.history.push({at:Date.now(),s:'Verified'});audit(me.name,'Verified '+id);save();render()},
 assignTeam:id=>{const i=db.incidents.find(x=>x.id===id),tm=db.teams.find(x=>x.id===$('#team').value);if(!tm)return;i.teamId=tm.id;tm.status='Deployed';
   notify('team:'+tm.id,'New assignment: '+id+' ('+i.type+')');notify('user:'+i.userId,'A rescue team has been assigned to '+id);setStatus(id,'Assigned')},
 note:id=>{const v=$('#note').value.trim();if(!v)return;db.incidents.find(x=>x.id===id).notes.push({text:v,at:Date.now(),by:me.name});save();render()},
 rst:a=>{const[id,s]=a.split('|');if(s==='Received'){const i=db.incidents.find(x=>x.id===id);const tm=db.teams.find(x=>x.id===i.teamId);if(tm)tm.status='Available';i.teamId=null;}setStatus(id,s)},
 rstSel:id=>setStatus(id,$('#rs-'+id).value),
 delme:()=>{if(!confirm('Delete all ResQNet data stored on this device?'))return;localStorage.clear();location.reload()},
 logout:()=>{LS('rq_session',null);me=null;render()},
};
function setStatus(id,s){
  const i=db.incidents.find(x=>x.id===id);i.status=s;i.history.push({at:Date.now(),s});audit(me.name,id+' → '+s);
  if(s==='Completed'||s==='Unable to access'){const tm=db.teams.find(x=>x.id===i.teamId);if(tm)tm.status='Available'}
  notify('user:'+i.userId,'Update on '+id+': '+s);notify('role:authority',id+' → '+s+' (by '+me.name+')');save();render();
}

/* ---------- forms ---------- */
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target.id;
  if(f==='loginForm'){
    const em0=$('#em').value.trim().toLowerCase(),h0=await sha($('#pw').value);const u=db.users.find(x=>x.email===em0&&x.pw===h0);
    if(!u)return toast('Wrong email or password');me=u;LS('rq_session',u);tab=tabsFor[u.role][0];render();
  }
  if(f==='regForm'){
    const em=$('#rem').value.trim().toLowerCase();if(db.users.some(x=>x.email===em))return toast('Email already registered');
    if($('#rpw').value.length<6)return toast('Password must be at least 6 characters');
    const role=$('#rrole').value,u={id:uid(),name:$('#rname').value.trim(),email:em,pw:await sha($('#rpw').value),role};
    if(role==='rescue')u.teamId=db.teams[0]?.id;
    db.users.push(u);save();toast('Registered. Please log in.');authMode='login';render();
  }
  if(f==='sosForm'){
    const gps=window._gps,loc=$('#sloc').value.trim();
    if(!gps&&!loc)return toast('Share GPS or type your location');
    const inc={id:'RQ-'+new Date().toISOString().slice(2,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,6).toUpperCase(),key:uid(),userId:me.id,
      type:$('#stype').value,desc:$('#sdesc').value.trim(),people:+$('#spl').value||1,injury:$('#sinj').checked,vulnerable:$('#svul').checked,
      lat:gps?gps.lat:null,lng:gps?gps.lng:null,locText:loc,verified:false,createdAt:Date.now(),teamId:null};
    window._gps=null;
    if(navigator.onLine){db=LS('rq_db');deliver(inc);$('#sosStatus').innerHTML=`<div class="warn" style="background:#e8f5e9;border-color:#2e7d32"><b>${inc.id}</b> – ${t('delivered')}. Suggested priority ${badge(inc.priority)}<br><span class="mut">Demo store only (this browser).</span></div>`}
    else{const q=queue();q.push(inc);LS('rq_queue',q);$('#sosStatus').innerHTML=`<div class="warn"><b>${inc.id}</b> – ${t('saved')}. It will be sent automatically when you are back online. <b>Call 112 if you can.</b></div>`}
    e.target.reset();
  }
  if(f==='hzForm'){
    const g=window._hgps;db.hazards.unshift({id:uid(),cat:$('#hcat').value,desc:$('#hdesc').value,loc:$('#hloc').value,lat:g?.lat??null,lng:g?.lng??null,status:'Pending',at:Date.now(),by:me.id});
    window._hgps=null;notify('role:authority','New hazard report: '+$('#hcat').value);save();render();toast('Hazard submitted – unverified until an authority reviews it');
  }
  if(f==='zoneForm'){db.zones.push({name:$('#zname').value,kind:$('#zkind').value,lat:+$('#zlat').value,lng:+$('#zlng').value,info:$('#zinfo').value});audit(me.name,'Added zone');save();render()}
  if(f==='alertForm'){db.alerts.unshift({sev:$('#asev').value,text:$('#atext').value,src:'Control room ('+me.name+')',at:Date.now()});notify('role:citizen','Public alert: '+$('#atext').value.slice(0,80));save();render()}
  if(f==='teamForm'){db.teams.push({id:uid(),name:$('#tname').value,skills:$('#tskill').value,status:'Available'});save();render()}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act],[data-tab],[data-auth]');if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;openId=null;render();return}
  if(b.dataset.auth){authMode=b.dataset.auth;render();return}
  A[b.dataset.act]&&A[b.dataset.act](b.dataset.arg);
});
document.addEventListener('change',e=>{if(e.target.id==='langSel'){lang=e.target.value;LS('rq_lang',lang);document.documentElement.lang=lang;updateNet();render()}});

/* ---------- render ---------- */
let authMode='login';
function render(){
  db=LS('rq_db')||db;updateNet();const app=$('#app');
  if(!me){
    app.innerHTML=`<div class="auth"><div class="card"><h1>🛟 ${t('app')}</h1><p class="mut">Disaster response & coordination (demo, frontend only)</p>
    <select id="loginLang" onchange="lang=this.value;LS('rq_lang',lang);render()">${['en','kn','hi'].map(l=>`<option value="${l}" ${l===lang?'selected':''}>${{en:'English',kn:'ಕನ್ನಡ',hi:'हिन्दी'}[l]}</option>`).join('')}</select>
    ${authMode==='login'?`<form id="loginForm"><label>${t('email')}</label><input id="em" required><label>${t('password')}</label><input id="pw" type="password" required><button class="btn">${t('login')}</button>
    <button type="button" class="btn sec" data-auth="reg">${t('register')}</button></form>
    <div class="warn">Demo logins (password <b>demo123</b>):<br>citizen@demo · authority@demo · rescue@demo</div>`:
    `<form id="regForm"><label>${t('name')}</label><input id="rname" required><label>${t('email')}</label><input id="rem" required><label>${t('password')}</label><input id="rpw" type="password" required>
    <label>${t('role')}</label><select id="rrole"><option value="citizen">Citizen</option><option value="rescue">Rescue team / NGO</option><option value="authority">Authority (demo only)</option></select>
    <p class="mut">In a real system authority/rescue accounts must be approved by an administrator.</p><button class="btn">${t('register')}</button><button type="button" class="btn sec" data-auth="login">${t('login')}</button></form>`}
    </div></div>`;return;
  }
  const tabs=tabsFor[me.role],unread=myNotifs().filter(n=>!n.read).length;
  app.innerHTML=`<div class="layout"><nav class="side"><h2>🛟 ${t('app')}</h2><small class="who">${esc(me.name)} · ${me.role}</small><br>
  ${tabs.map(k=>`<button data-tab="${k}" class="${k===tab?'on':''}">${t(k)}${k==='notifs'&&unread?' ('+unread+')':''}</button>`).join('')}
  <button data-act="logout">${t('logout')}</button></nav><main>${V[tab]()}</main></div>`;
  if(tab==='map')drawMap('mapbox',true);if(tab==='dash')drawMap('mapbox',true);
}
(async()=>{
  await seed();db=LS('rq_db');document.documentElement.lang=lang;
  if(me&&!db.users.find(u=>u.id===me.id))me=null;
  if(me)tab=tabsFor[me.role][0];
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
  render();syncQueue();
  // live-ish updates: poll shared store, and tick satellite simulation
  setInterval(()=>{
    const open=(Math.floor(Date.now()/1000)%120)<30,m=LS('rq_sat')||[];let ch=false;
    if(open)m.forEach(x=>{if(x.st.startsWith('Queued')){x.st='Delivered (simulated)';ch=true}});if(ch)LS('rq_sat',m);
    const typing=document.activeElement&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(me&&!typing&&['dash','incidents','assign','notifs','mine','satellite'].includes(tab))render();
  },5000);
})();
