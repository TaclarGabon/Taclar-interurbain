
const taclarFee=2000;
const collectionName='taclar_interurbain';
const axes=['Libreville → Oyem → Bitam','Libreville → Lambaréné','Libreville → Mitzic'];
const axisPrices={'Libreville → Oyem → Bitam':25000,'Libreville → Lambaréné':18000,'Libreville → Mitzic':22000};
const departureTimes=['05h00','05h30','06h00','06h30','07h00','07h30','08h00','08h30','09h00','09h30','10h00','10h30','12h00','14h00','15h00','16h00','18h00'];
const taclarWhatsApp='241000000000';
let db=null,docs=[],ready=false,selectedOfferId=null,clientSessionIds=[];
function $(id){return document.getElementById(id)}
function money(n){return Number(n||0).toLocaleString('fr-FR')+' FCFA'}
function timeMinutes(t){const m=String(t||'').match(/^(\d{1,2})h(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function nowLabel(){return new Date().toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}
function makeDriverCode(){return 'CH-'+Math.floor(10000+Math.random()*90000)}
function makePin(){return String(Math.floor(1000+Math.random()*9000))}
function normalizeDriverCode(value){
  const raw=String(value||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!raw)return '';
  if(raw.startsWith('CH-'))return raw;
  if(raw.startsWith('CH'))return 'CH-'+raw.slice(2).replace(/^-+/,'');
  if(/^\d+$/.test(raw))return 'CH-'+raw;
  return raw;
}
function getDriverSession(){try{return JSON.parse(localStorage.getItem('taclar_driver_session')||'null')}catch{return null}}
function setDriverSession(id,pin,allowActive=false){localStorage.setItem('taclar_driver_session',JSON.stringify({id,pin,allowActive}))}
function clearDriverSession(){localStorage.removeItem('taclar_driver_session')}
function getClientSessionIds(){
  try{
    const sessionIds=JSON.parse(sessionStorage.getItem('taclar_client_request_ids')||'[]');
    if(sessionIds.length)return sessionIds;
    const saved=JSON.parse(localStorage.getItem('taclar_client_active_request_ids')||'null');
    if(saved&&Date.now()-Number(saved.ts||0)<6*60*60*1000)return saved.ids||[];
  }catch(e){}
  return clientSessionIds;
}
function addClientSessionId(id){const ids=getClientSessionIds().filter(x=>x!==id);ids.push(id);clientSessionIds=ids;sessionStorage.setItem('taclar_client_request_ids',JSON.stringify(ids));localStorage.setItem('taclar_client_active_request_ids',JSON.stringify({ids,ts:Date.now()}))}
function clearClientSession(){clientSessionIds=[];sessionStorage.removeItem('taclar_client_request_ids');localStorage.removeItem('taclar_client_active_request_ids')}
function byType(t){return docs.filter(d=>d.type===t).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function apps(){return byType('driverApplication')}
function activeApps(){return apps().filter(a=>a.active)}
function offers(){return byType('offer')}
function requests(){return byType('request')}
function reqsForOffer(id){return requests().filter(r=>r.offerId===id)}
function liveReqsForOffer(id){return reqsForOffer(id).filter(r=>!['refused','deleted'].includes(r.status))}
function paidReqsForOffer(id){return reqsForOffer(id).filter(r=>r.status==='paid')}
function seatsTaken(offer){return liveReqsForOffer(offer.id).reduce((s,r)=>s+Number(r.seats||1),0)}
function paidSeats(offer){return paidReqsForOffer(offer.id).reduce((s,r)=>s+Number(r.seats||1),0)}
function freeSeats(offer){return Math.max(0,Number(offer.seats||0)-Number(offer.booked||0)-seatsTaken(offer))}
function offerClosedStatus(offer){if(!offer)return '';if(offer.status&&offer.status!=='Disponible')return offer.status;if(freeSeats(offer)<=0)return 'Complet';return ''}
function refusalClosure(reason){
  if(reason==='Véhicule déjà complet')return {status:'Complet',booked:true,message:'Le véhicule va passer en Complet dans Booking.'};
  if(reason==='Départ annulé')return {status:'Annulé',booked:false,message:'Le départ va passer en Annulé dans Booking.'};
  if(reason==='Horaire modifié')return {status:'Indisponible',booked:false,message:"La disponibilité va passer en Indisponible jusqu'à nouvelle publication."};
  if(reason==='Autre motif')return {status:'Indisponible',booked:false,message:"La disponibilité va passer en Indisponible dans Booking."};
  return null;
}
function phoneMask(p){p=String(p||'');return p.length>5?p.slice(0,7)+' ** ** '+p.slice(-2):'masqué'}
function whatsappLink(phone,text){const digits=String(phone||'').replace(/\D/g,'');return `https://wa.me/${digits||taclarWhatsApp}?text=${encodeURIComponent(text)}`}
function clientReserveLink(o){return `taclar_client.html?axis=${encodeURIComponent(o.axis||'')}&day=${encodeURIComponent(o.day||'')}&offer=${encodeURIComponent(o.id||'')}`}
function statusText(s){return {submitted:'Documents en cours de traitement',docs_validated:'Documents approuvés - caution à déposer',deposit_paid:'Caution déposée - vérification TACLAR',deposit_validated:'Caution reçue - autorisation en attente',active:'Autorisé à publier',pending:'Demande envoyée',confirmed:'Confirmée chauffeur - frais TACLAR à payer',payment_declared:'Paiement déclaré - validation TACLAR',paid:'Commission TACLAR payée',refused:'Refusée',deleted:'Supprimée'}[s]||s||'-'}
function fillAxisSelect(sel,empty='-- Choisir un axe --'){if(!sel)return;const v=sel.value;sel.innerHTML=`<option value="">${empty}</option>`+axes.map(a=>`<option value="${a}">${a}</option>`).join('');if(axes.includes(v))sel.value=v}
function fillTimeSelect(sel,empty='-- Choisir --'){if(!sel)return;const v=sel.value;sel.innerHTML=`<option value="">${empty}</option>`+departureTimes.map(t=>`<option value="${t}">${t}</option>`).join('');if(departureTimes.includes(v))sel.value=v}
function dateFromISO(value){const p=String(value||'').split('-').map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2]):null}
function dateToISO(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function addMonths(date,count){const d=new Date(date);d.setMonth(d.getMonth()+count);return d}
function generateDepartureDates(startISO,mode,weekdays,months){
  const start=dateFromISO(startISO);
  if(!start)return [];
  if(mode==='single')return [startISO];
  const end=addMonths(start,Math.max(1,Math.min(2,Number(months||1))));
  const selected=mode==='weekly'?[start.getDay()]:weekdays.map(Number);
  const dates=[];
  for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){
    if(selected.includes(d.getDay()))dates.push(dateToISO(d));
  }
  return dates.slice(0,40);
}
async function addDoc(data){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).add({...data,createdAt:Date.now(),updatedAt:Date.now()})}
async function updateDoc(id,data){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).doc(id).set({...data,updatedAt:Date.now()},{merge:true})}
async function deleteDocHard(id){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).doc(id).delete()}
async function resetTestData(){
  if(!db)throw new Error('Firebase non connecté');
  if(!confirm('Réinitialiser la base de test TACLAR Interurbain ? Tous les chauffeurs, trajets et demandes de test seront supprimés.'))return;
  const snap=await db.collection(collectionName).get();
  const batch=db.batch();
  snap.docs.forEach(doc=>batch.delete(doc.ref));
  await batch.commit();
  clearDriverSession();
  selectedOfferId=null;
  alert('Base de test réinitialisée. Tu peux créer un vrai chauffeur et un vrai client.');
}
function initFirebase(){const cfg=window.TACLAR_FIREBASE_CONFIG;if(!cfg||String(cfg.apiKey||'').includes('COLLER_')){showLoad('Firebase non configuré');return}firebase.initializeApp(cfg);db=firebase.firestore();showLoad('Connexion Firebase...');db.collection(collectionName).onSnapshot(snap=>{docs=snap.docs.map(d=>({id:d.id,...d.data()}));ready=true;showLoad('Synchronisé');setTimeout(()=>showLoad(''),900);renderPage();},err=>{showLoad('Erreur Firebase: '+err.message)})}
function showLoad(txt){let el=$('syncStatus');if(!el){el=document.createElement('div');el.id='syncStatus';el.className='loading';document.body.appendChild(el)}el.textContent=txt;el.style.display=txt?'block':'none'}
function header(active){
  const pageTitles={
    new:'Accès chauffeur',
    validation:'Validation TACLAR',
    publish:'Publier un trajet',
    booking:'Disponibilités chauffeur',
    client:'Réservation client',
    portal:'Mise en relation client-chauffeur'
  };
  return `<header class="hero"><div class="hero-inner"><div class="brand"><div class="logo">TACLAR</div><div><h1>${pageTitles[active]||'TACLAR Interurbain'}</h1></div></div></div></header>`
}
function setShell(active,main){$('app').innerHTML=header(active)+main}
function renderPage(){const page=document.body.dataset.page;if(page==='new')renderNewDriver();else if(page==='validation')renderValidation();else if(page==='publish')renderPublish();else if(page==='booking')renderBooking();else if(page==='client')renderClient();else renderPortal()}
function renderPortal(){setShell('portal',`<div class="card"><h2>Accès TACLAR Interurbain</h2><p>Chaque rôle dispose maintenant de sa propre page.</p><div class="portal-grid"><a href="taclar_nouveau_chauffeur.html"><strong>Espace chauffeur</strong><p>Inscription, connexion par PIN et suivi personnel du dossier.</p></a><a href="taclar_validation.html"><strong>Validation TACLAR</strong><p>Validation interne des documents, de la caution et de l'autorisation.</p></a><a href="taclar_publier_trajet.html"><strong>Publier trajet</strong><p>Un chauffeur autorisé publie une disponibilité.</p></a><a href="taclar_booking.html"><strong>Booking / Disponibilités</strong><p>Le chauffeur traite les demandes clients.</p></a><a href="taclar_client.html"><strong>Client</strong><p>Le client cherche un axe et réserve une ou plusieurs places.</p></a></div></div>`)}
function renderNewDriver(){
  const session=getDriverSession();
  const current=session?apps().find(a=>a.id===session.id&&String(a.pin||'')===String(session.pin||'')):null;
  if(current&&current.active&&current.mustRelogin&&!session.allowActive){clearDriverSession();renderNewDriver();return}
  if(current){renderDriverDashboard(current);return}
  if(session)clearDriverSession();
  setShell('new',`<div class="grid two"><div class="card"><h2>Nouveau chauffeur - rejoindre TACLAR</h2><p>Crée ton dossier une seule fois. Tu recevras ensuite un numéro de dossier et un code PIN pour suivre son traitement.</p><div class="field-grid"><div><label>Nom et prénom chauffeur</label><input id="signupName" placeholder="Ex : Serge Ndong"></div><div><label>Téléphone chauffeur</label><input id="signupPhone" placeholder="Ex : +241 77 45 90 12"></div><div><label>Véhicule</label><input id="signupVehicle" placeholder="Ex : Toyota Noah"></div><div><label>Plaque</label><input id="signupPlate" placeholder="Ex : GA-421-LB"></div><div><label>Axe souhaité</label><select id="signupAxis"></select></div><div><label>Prix transport / place</label><input id="signupPrice" disabled></div><div><label>Nombre de places</label><input id="signupSeats" type="number" min="1" step="1" placeholder="Ex : 6"></div><div><label>Dépôt garantie calculé</label><input id="signupDeposit" value="0 FCFA" disabled></div><div><label>Permis de conduire</label><input id="signupLicense" type="file"></div><div><label>Pièce d'identité</label><input id="signupIdCard" type="file"></div></div><div class="notice warning"><strong>Étape 1 :</strong> soumettre le dossier chauffeur. Les fichiers sont simulés par leur nom dans cette démo.</div><div class="actions"><button id="submitDriver">Soumettre le dossier chauffeur</button><button class="secondary" id="clearDriver">Vider le formulaire</button></div></div><div class="card"><h2>Déjà inscrit ?</h2><p>Entre ton numéro de dossier et ton code PIN pour consulter uniquement ton propre dossier.</p><div><label>Numéro de dossier</label><input id="loginDriverCode" placeholder="Ex : CH-12345"></div><div style="margin-top:12px"><label>Code PIN</label><input id="loginDriverPin" inputmode="numeric" maxlength="4" placeholder="4 chiffres"></div><div class="actions"><button id="loginDriver">Ouvrir mon dossier</button><button class="ghost" id="forgotDriverCode">Code oublié ?</button></div><div id="loginMsg" class="notice danger hidden"></div></div></div>`);
  fillAxisSelect($('signupAxis'));
  $('signupAxis').onchange=()=>{const axis=$('signupAxis').value;$('signupPrice').value=axis?money(axisPrices[axis]):''};
  $('signupSeats').oninput=()=>{$('signupDeposit').value=money(Math.max(0,Number($('signupSeats').value||0))*taclarFee)};
  $('submitDriver').onclick=submitDriver;
  $('clearDriver').onclick=()=>renderNewDriver();
  $('loginDriver').onclick=loginDriver;
  $('forgotDriverCode').onclick=forgotDriverCode;
}
async function submitDriver(){
  const name=$('signupName').value.trim(),phone=$('signupPhone').value.trim(),vehicle=$('signupVehicle').value.trim(),plate=$('signupPlate').value.trim(),axis=$('signupAxis').value,seats=Number($('signupSeats').value||0);
  if(!name||!phone||!vehicle||!plate||!axis||seats<1){alert('Remplis le nom, le téléphone, le véhicule, la plaque, l’axe et le nombre de places.');return}
  const driverCode=makeDriverCode(),pin=makePin();
  const ref=await addDoc({type:'driverApplication',driverCode,pin,name,phone,vehicle,plate,axis,seats,price:axisPrices[axis]||0,deposit:seats*taclarFee,licenseName:$('signupLicense').files[0]?.name||'Non joint',idCardName:$('signupIdCard').files[0]?.name||'Non joint',status:'submitted',docsValidated:false,depositPaid:false,depositValidated:false,active:false});
  setDriverSession(ref.id,pin,false);
  alert(`Dossier envoyé.\nNuméro : ${driverCode}\nCode PIN : ${pin}\nNote-les pour retrouver ton dossier.`);
  renderPage();
}
function loginDriver(){
  const code=normalizeDriverCode($('loginDriverCode').value),pin=$('loginDriverPin').value.trim();
  const app=apps().find(a=>normalizeDriverCode(a.driverCode)===code&&String(a.pin||'')===pin);
  if(!app){$('loginMsg').classList.remove('hidden');$('loginMsg').textContent='Numéro de dossier ou code PIN incorrect.';return}
  setDriverSession(app.id,pin,true);
  renderPage();
}
function forgotDriverCode(){
  const msg='Bonjour TACLAR, j’ai oublié mon numéro de dossier ou mon code PIN chauffeur. Merci de me le renvoyer. Nom : ... Téléphone : ...';
  window.open(whatsappLink(taclarWhatsApp,msg),'_blank');
}
function renderDriverDashboard(a){
  const steps=[{done:true,label:'Dossier envoyé'},{done:!!a.docsValidated,label:'Documents approuvés'},{done:!!a.depositPaid,label:'Caution déposée'},{done:!!a.depositValidated,label:'Caution reçue'},{done:!!a.active,label:'Autorisé à publier'}];
  let message='Tes documents ont été reçus et sont en cours de traitement.';
  if(a.docsValidated&&!a.depositPaid)message=`Tes documents sont approuvés. Dépose maintenant la caution de ${money(a.deposit)}.`;
  else if(a.depositPaid&&!a.depositValidated)message='Ta caution est déclarée payée. TACLAR vérifie maintenant sa réception.';
  else if(a.depositValidated&&!a.active)message='Ta caution est reçue. TACLAR doit encore autoriser la publication.';
  else if(a.active)message='Ton dossier est complet. Tu peux publier un trajet depuis ton espace chauffeur.';
  const requestCount=driverRequestCount(a.id);
  setShell('new',`<div class="card driver-space"><div class="item-top"><div><h2>Espace chauffeur</h2><p class="muted">Bienvenue, <strong>${a.name}</strong>.</p></div><span class="badge ${a.active?'ok':'warn'}">${statusText(a.status)}</span></div><details class="driver-section status-${a.status}" open><summary>Suivi de mon dossier</summary><div class="credentials"><div><small>Numéro de dossier</small><strong>${a.driverCode||'Ancien dossier'}</strong></div><div><small>Code PIN personnel</small><strong>${a.pin||'Non défini'}</strong></div></div><div class="notice warning"><strong>À conserver :</strong> note ton numéro de dossier et ton code PIN pour te reconnecter depuis un autre téléphone.</div><div class="timeline">${steps.map(s=>`<div class="${s.done?'done':''}"><span>${s.done?'✓':'○'}</span><strong>${s.label}</strong></div>`).join('')}</div><div class="notice ${a.active?'success':''}">${message}</div><div class="facts"><div class="fact"><small>Nom</small><strong>${a.name}</strong></div><div class="fact"><small>Téléphone</small><strong>${a.phone}</strong></div><div class="fact"><small>Véhicule</small><strong>${a.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${a.plate}</strong></div><div class="fact"><small>Axe souhaité</small><strong>${a.axis}</strong></div><div class="fact"><small>Places déclarées</small><strong>${a.seats}</strong></div><div class="fact"><small>Caution</small><strong>${money(a.deposit)}</strong></div><div class="fact"><small>Statut</small><strong>${statusText(a.status)}</strong></div></div>${a.docsValidated&&!a.depositPaid?`<div class="actions"><button class="orange" onclick="driverPayDeposit('${a.id}')">Déposer la caution</button></div>`:''}</details>${a.active?`<details class="driver-section is-active"><summary>Publier mon trajet</summary>${driverPublishPanel(a)}</details><details class="driver-section ${requestCount?'has-work':''}" ${requestCount?'open':''}><summary>Demandes de courses (${requestCount})</summary>${driverRequestsPanel(a)}</details>`:''}<div class="actions driver-logout"><button class="secondary" onclick="logoutDriver()">Se déconnecter</button></div></div>`);
  if(a.active){fillTimeSelect($('driverPublishCheckin'),'-- Heure enregistrement --');fillTimeSelect($('driverPublishTime'),'-- Heure départ --');syncDriverRecurrenceFields()}
}
function driverPublishPanel(a){
  return `<section class="driver-publish-panel"><p>Complète uniquement les informations de départ. Les informations chauffeur sont déjà reprises depuis ton dossier validé.</p><div class="field-grid"><div><label>Axe</label><input value="${a.axis}" disabled></div><div><label>Véhicule</label><input value="${a.vehicle}" disabled></div><div><label>Plaque</label><input value="${a.plate}" disabled></div><div><label>Prix transport / place</label><input value="${money(a.price)}" disabled></div><div><label>Places disponibles</label><input id="driverPublishSeats" type="number" min="1" max="${a.seats}" value="${a.seats}"></div><div><label>Date de départ / début</label><input id="driverPublishDay" type="date" onchange="syncDriverRecurrenceFields()"></div><div><label>Type de départ</label><select id="driverPublishMode" onchange="syncDriverRecurrenceFields()"><option value="single">Départ unique</option><option value="weekly">Une fois par semaine</option><option value="multi">Plusieurs jours par semaine</option></select></div><div id="driverPublishPeriodWrap" class="hidden"><label>Période de publication</label><select id="driverPublishPeriod" onchange="syncDriverRecurrenceFields()"><option value="1">1 mois</option><option value="2">2 mois maximum</option></select></div><div id="driverPublishWeekdaysWrap" class="full hidden"><label>Jours de départ</label><div class="weekday-grid">${[['1','Lundi'],['2','Mardi'],['3','Mercredi'],['4','Jeudi'],['5','Vendredi'],['6','Samedi'],['0','Dimanche']].map(([v,l])=>`<label><input type="checkbox" class="driverWeekday" value="${v}" onchange="syncDriverRecurrenceFields()"> ${l}</label>`).join('')}</div></div><div><label>Heure d'enregistrement</label><select id="driverPublishCheckin"></select></div><div><label>Heure de départ</label><select id="driverPublishTime"></select></div><div class="full"><label>Point d'embarquement</label><input id="driverPublishBoarding" placeholder="Ex : Gare routière"></div></div><div id="driverPublishPreview" class="notice">Départ unique : une disponibilité sera créée.</div><div class="actions"><button onclick="publishDriverTrip('${a.id}')">Publier le trajet</button></div><div id="driverPublishMsg" class="notice hidden"></div></section>`
}
function syncDriverRecurrenceFields(){
  const mode=$('driverPublishMode')?.value||'single';
  const start=$('driverPublishDay')?.value||'';
  $('driverPublishPeriodWrap')?.classList.toggle('hidden',mode==='single');
  $('driverPublishWeekdaysWrap')?.classList.toggle('hidden',mode!=='multi');
  const weekdays=[...document.querySelectorAll('.driverWeekday:checked')].map(i=>i.value);
  const period=$('driverPublishPeriod')?.value||1;
  const dates=generateDepartureDates(start,mode,weekdays,period);
  const preview=$('driverPublishPreview');
  if(!preview)return;
  if(mode==='single')preview.textContent='Départ unique : une disponibilité sera créée.';
  else if(!start)preview.textContent='Choisis la date de début pour calculer les départs.';
  else if(mode==='multi'&&!weekdays.length)preview.textContent='Choisis au moins un jour de départ.';
  else preview.textContent=`${dates.length} disponibilité(s) seront créées entre le ${start} et ${dates[dates.length-1]||start}.`;
}
function driverRequestsPanel(a){
  const myOffers=offers().filter(o=>o.driverAppId===a.id);
  const activeStatuses=['pending','confirmed','payment_declared'];
  const myRequests=requests().filter(r=>myOffers.some(o=>o.id===r.offerId)&&r.status!=='deleted').sort((x,y)=>{const score=r=>r.status==='pending'?4:r.status==='confirmed'?3:r.status==='payment_declared'?2:r.status==='paid'?1:0;return score(y)-score(x)||(y.createdAt||0)-(x.createdAt||0)});
  const offerSummary=myOffers.length?`<div class="list">${myOffers.map(o=>{const taken=seatsTaken(o),paid=paidSeats(o),free=freeSeats(o),pending=reqsForOffer(o.id).filter(r=>activeStatuses.includes(r.status)).reduce((s,r)=>s+Number(r.seats||1),0),closed=offerClosedStatus(o),isClosed=!!closed,isFull=closed==='Complet'||free<=0,cls=isFull?'booking-complete':isClosed?'booking-cancelled':'booking-free';return `<div class="item ${cls}"><div class="item-top"><div><strong>${o.day} · ${o.axis}</strong><div class="muted">${o.checkinTime} enregistrement · ${o.time} départ · ${o.boarding}</div></div><span class="badge ${isFull?'full':isClosed?'warn':'ok'}">${closed||free+' libre(s)'}</span></div>${isClosed&&closed!=='Complet'?`<div class="notice danger"><strong>Disponibilité ${closed.toLowerCase()}.</strong> Motif : ${o.closedReason||closed}.</div>`:''}<div class="facts"><div class="fact"><small>Places totales</small><strong>${o.seats}</strong></div><div class="fact"><small>Places occupées</small><strong>${taken}</strong></div><div class="fact"><small>Places payées</small><strong>${paid}</strong></div><div class="fact"><small>Demandes en cours</small><strong>${pending}</strong></div><div class="fact"><small>Reste disponible</small><strong>${isClosed?0:free}</strong></div></div></div>`}).join('')}</div>`:'<div class="notice">Aucune disponibilité publiée pour le moment.</div>';
  const requestsHtml=myRequests.length?myRequests.map(r=>{const o=myOffers.find(x=>x.id===r.offerId)||{};return renderDriverRequest(r,o)}).join(''):'<div class="notice">Aucune demande client à traiter.</div>';
  return `<section class="driver-requests-panel"><h3>Mes disponibilités publiées</h3>${offerSummary}<h3 style="margin-top:16px">Demandes reçues</h3><div class="list">${requestsHtml}</div></section>`
}
function driverRequestCount(appId){
  const myOffers=offers().filter(o=>o.driverAppId===appId);
  return requests().filter(r=>myOffers.some(o=>o.id===r.offerId)&&['pending','confirmed','payment_declared'].includes(r.status)).length;
}
function renderDriverRequest(r,o){
  const passengerList=(r.passengerNames||[r.clientName]).join(', ');
  const reasonId='driver-reason-'+r.id;
  return `<div class="item"><div class="item-top"><div><strong>${r.groupLeader||r.clientName}</strong><div class="muted">${o.axis||'-'} · ${r.seats} place(s) · ${r.requestCode||''}</div><div>${passengerList}</div></div><span class="badge ${r.status==='paid'?'ok':r.status==='pending'?'warn':r.status==='refused'?'full':'warn'}">${statusText(r.status)}</span></div>${r.status==='paid'?`<div class="notice success">Commission TACLAR payée. Rendez-vous le ${o.day||'-'} à ${o.checkinTime||'-'} au point d'embarquement : ${o.boarding||'-'}. Départ prévu : ${o.time||'-'}.</div>`:''}${r.status==='payment_declared'?'<div class="notice warning">Le client a déclaré le paiement. En attente de validation TACLAR.</div>':''}${r.status==='refused'?`<div class="notice danger">Demande refusée. Motif : ${r.refusalReason||'Non précisé'}.</div>`:''}<div class="actions"><button onclick="updateDoc('${r.id}',{status:'confirmed',confirmedAt:Date.now()})" ${r.status!=='pending'?'disabled':''}>Confirmer place</button><select id="${reasonId}" ${r.status!=='pending'?'disabled':''}><option value="Véhicule déjà complet">Véhicule déjà complet</option><option value="Départ annulé">Départ annulé</option><option value="Horaire modifié">Horaire modifié</option><option value="Client à rappeler">Client à rappeler</option><option value="Autre motif">Autre motif</option></select><button class="ghost" onclick="refuseRequest('${r.id}','${reasonId}')" ${r.status!=='pending'?'disabled':''}>Refuser</button></div></div>`
}
async function publishDriverTrip(appId){
  const a=apps().find(x=>x.id===appId&&x.active);
  if(!a){alert('Dossier chauffeur non autorisé à publier.');return}
  const day=$('driverPublishDay').value,checkinTime=$('driverPublishCheckin').value,time=$('driverPublishTime').value,boarding=$('driverPublishBoarding').value.trim(),seats=Number($('driverPublishSeats').value||0),mode=$('driverPublishMode')?.value||'single',period=$('driverPublishPeriod')?.value||1,weekdays=[...document.querySelectorAll('.driverWeekday:checked')].map(i=>i.value);
  if(!day||!checkinTime||!time||!boarding||seats<1){alert('Complète date, heures, point d’embarquement et places.');return}
  if(mode==='multi'&&!weekdays.length){alert('Choisis au moins un jour de départ pour une publication répétée.');return}
  if(timeMinutes(checkinTime)>=timeMinutes(time)){alert("Erreur d'heure : l'heure d'enregistrement doit être avant l'heure de départ.");return}
  const dates=generateDepartureDates(day,mode,weekdays,period);
  if(!dates.length){alert('Aucune date de départ générée. Vérifie la date et les jours choisis.');return}
  if(dates.length>12&&!confirm(`${dates.length} disponibilités vont être créées. Continuer ?`))return;
  for(const d of dates){
    await addDoc({type:'offer',driverAppId:a.id,driver:a.name,phone:a.phone,vehicle:a.vehicle,plate:a.plate,axis:a.axis,seats,booked:0,price:a.price,day:d,checkinTime,time,boarding,status:'Disponible',source:'driver-space',recurrenceMode:mode,recurrenceStart:day,recurrenceMonths:Number(period||1)});
  }
  $('driverPublishMsg').className='notice success';
  $('driverPublishMsg').textContent=dates.length===1?'Trajet publié. Il apparaît maintenant dans les disponibilités et côté client.':`${dates.length} disponibilités publiées. Elles apparaissent maintenant dans Booking et côté client.`;
  $('driverPublishDay').value='';$('driverPublishCheckin').value='';$('driverPublishTime').value='';$('driverPublishBoarding').value='';
  document.querySelectorAll('.driverWeekday').forEach(i=>i.checked=false);
  $('driverPublishMode').value='single';
  syncDriverRecurrenceFields();
}
async function driverPayDeposit(id){if(!confirm('Confirmer que la caution a été envoyée à TACLAR ?'))return;await updateDoc(id,{status:'deposit_paid',depositPaid:true,depositPaidAt:Date.now()})}
function logoutDriver(){clearDriverSession();renderPage()}
function renderValidation(){setShell('validation',`<div class="card"><div class="item-top"><div><h2>Validation TACLAR</h2><p>Interface interne : valide les dossiers chauffeurs et les paiements clients déclarés.</p></div><button class="red" onclick="resetTestData()">Réinitialiser test</button></div><div class="notice warning"><strong>Important :</strong> le chauffeur déclare sa caution depuis son espace. Le client déclare sa commission TACLAR depuis son suivi. TACLAR confirme seulement après réception réelle.</div><div id="applicationsList" class="list" style="margin-top:14px"></div></div>`);renderApplicationsList()}
function renderApplicationsList(){
  const box=$('applicationsList');if(!box)return;
  const all=apps().filter(a=>a.driverCode);
  const active=all.filter(a=>!a.active).sort((a,b)=>validationPriority(b)-validationPriority(a)||(b.createdAt||0)-(a.createdAt||0));
  const authorized=all.filter(a=>a.active).sort((a,b)=>(b.authorizedAt||b.updatedAt||0)-(a.authorizedAt||a.updatedAt||0));
  if(!all.length){box.innerHTML='<div class="notice">Aucun dossier chauffeur reçu pour le moment.</div>';return}
  const clientPayments=requests().filter(r=>r.status==='payment_declared').sort((a,b)=>(b.paymentDeclaredAt||0)-(a.paymentDeclaredAt||0));
  box.innerHTML=`<h3>Dossiers chauffeurs à traiter</h3>${active.length?active.map(renderValidationApplication).join(''):'<div class="notice">Aucun dossier chauffeur actif à traiter.</div>'}<h3 style="margin-top:18px">Paiements clients à confirmer</h3>${clientPayments.length?clientPayments.map(renderClientPaymentValidation).join(''):'<div class="notice">Aucun paiement client déclaré pour le moment.</div>'}<h3 style="margin-top:18px">Dossiers autorisés à publier</h3>${authorized.length?authorized.map(renderAuthorizedApplication).join(''):'<div class="notice">Aucun chauffeur autorisé pour le moment.</div>'}`
}
function validationPriority(a){
  if(a.depositPaid&&!a.depositValidated)return 4;
  if(a.depositValidated&&!a.active)return 3;
  if(a.docsValidated&&!a.depositPaid)return 2;
  return 1;
}
function renderValidationApplication(a){
  return `<details class="item compact-item status-${a.status}" ${validationPriority(a)>=3?'open':''}><summary><strong>${a.name}</strong> | Axe : ${a.axis} | Places : ${a.seats} | Statut : ${statusText(a.status)}</summary><div class="facts"><div class="fact"><small>Dossier</small><strong>${a.driverCode}</strong></div><div class="fact"><small>PIN</small><strong>${a.pin||'-'}</strong></div><div class="fact"><small>Téléphone</small><strong>${a.phone}</strong></div><div class="fact"><small>Véhicule</small><strong>${a.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${a.plate}</strong></div><div class="fact"><small>Prix axe</small><strong>${money(a.price)}</strong></div><div class="fact"><small>Caution attendue</small><strong>${money(a.deposit)}</strong></div><div class="fact"><small>Permis</small><strong>${a.licenseName||'-'}</strong></div><div class="fact"><small>Identité</small><strong>${a.idCardName||'-'}</strong></div></div><div class="actions"><button onclick="validateDriverDocuments('${a.id}')" ${a.docsValidated?'disabled':''}>Valider les documents</button><button onclick="validateDriverDeposit('${a.id}')" ${!a.depositPaid||a.depositValidated?'disabled':''}>Confirmer caution reçue</button><button class="blue" onclick="authorizeDriver('${a.id}')" ${!a.depositValidated||a.active?'disabled':''}>Autoriser à publier</button></div>${a.docsValidated&&!a.depositPaid?'<div class="notice">Notification simulée : documents approuvés. Le chauffeur doit se reconnecter pour déposer la caution.</div>':''}${a.depositPaid&&!a.depositValidated?'<div class="notice warning">Le chauffeur déclare avoir payé. Vérifie la réception avant de confirmer.</div>':''}${a.depositValidated&&!a.active?'<div class="notice success">Caution reçue. Tu peux autoriser ce chauffeur à publier.</div>':''}</details>`
}
function renderAuthorizedApplication(a){
  return `<details class="item compact-item status-active"><summary><strong>${a.name}</strong> | Axe : ${a.axis} | Places : ${a.seats} | Statut : autorisé à publier</summary><div class="facts"><div class="fact"><small>Dossier</small><strong>${a.driverCode}</strong></div><div class="fact"><small>PIN</small><strong>${a.pin||'-'}</strong></div><div class="fact"><small>Téléphone</small><strong>${a.phone}</strong></div><div class="fact"><small>Véhicule</small><strong>${a.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${a.plate}</strong></div></div></details>`
}
function renderClientPaymentValidation(r){
  const o=offers().find(x=>x.id===r.offerId)||{};
  return `<details class="item compact-item status-payment_declared" open><summary><strong>${r.groupLeader||r.clientName}</strong> | Chauffeur : ${o.driver||'-'} | ${r.seats} place(s) | Statut : paiement déclaré</summary><div class="facts"><div class="fact"><small>Client</small><strong>${r.groupLeader||r.clientName}</strong></div><div class="fact"><small>Téléphone client</small><strong>${r.clientPhone||'-'}</strong></div><div class="fact"><small>Chauffeur</small><strong>${o.driver||'-'}</strong></div><div class="fact"><small>Axe</small><strong>${o.axis||'-'}</strong></div><div class="fact"><small>Places</small><strong>${r.seats}</strong></div><div class="fact"><small>Montant TACLAR</small><strong>${money(Number(r.seats||1)*taclarFee)}</strong></div><div class="fact"><small>Code demande</small><strong>${r.requestCode||'-'}</strong></div></div><div class="actions"><button class="blue" onclick="confirmClientPayment('${r.id}')">Confirmer paiement reçu</button></div><div class="notice warning">Le client a déclaré le paiement. Confirme uniquement après réception réelle.</div></details>`
}
async function validateDriverDocuments(id){await updateDoc(id,{status:'docs_validated',docsValidated:true,docsValidatedAt:Date.now()})}
async function validateDriverDeposit(id){await updateDoc(id,{status:'deposit_validated',depositValidated:true,depositValidatedAt:Date.now()})}
async function authorizeDriver(id){await updateDoc(id,{status:'active',active:true,mustRelogin:true,authorizedAt:Date.now(),lastNotification:'Autorisation de publier le trajet'});clearDriverSession()}
async function confirmClientPayment(id){await updateDoc(id,{status:'paid',paidAt:Date.now(),paymentValidatedAt:Date.now()})}
function renderPublish(){setShell('publish',`<div class="grid two"><div class="card"><h2>Publier un trajet</h2><p>Outil interne de test. Dans le vrai parcours, le chauffeur publie directement depuis son espace chauffeur connecté.</p><div class="field-grid"><div><label>Chauffeur validé</label><select id="publishDriver"></select></div><div><label>Axe</label><input id="publishAxis" disabled></div><div><label>Véhicule</label><input id="publishVehicle" disabled></div><div><label>Plaque</label><input id="publishPlate" disabled></div><div><label>Places disponibles</label><input id="publishSeats" type="number" min="1"></div><div><label>Prix transport / place</label><input id="publishPrice" disabled></div><div><label>Date de départ</label><input id="publishDay" type="date"></div><div><label>Heure d'enregistrement</label><select id="publishCheckin"></select></div><div><label>Heure de départ</label><select id="publishTime"></select></div><div><label>Point d'embarquement</label><input id="publishBoarding" placeholder="Ex : Gare routière"></div></div><div class="actions"><button id="publishBtn">Publier le trajet</button></div><div id="publishMsg" class="notice hidden"></div></div><div class="card"><h2>Règle</h2><div class="notice success">Un chauffeur peut publier seulement si son dossier et sa caution sont validés.</div></div></div>`);const drivers=activeApps();$('publishDriver').innerHTML='<option value="">-- Choisir chauffeur --</option>'+drivers.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');fillTimeSelect($('publishCheckin'),'-- Heure enregistrement --');fillTimeSelect($('publishTime'),'-- Heure départ --');$('publishDriver').onchange=syncPublishDriver;$('publishBtn').onclick=publishOffer;syncPublishDriver()}
function syncPublishDriver(){const a=activeApps().find(x=>x.id===$('publishDriver').value);['publishAxis','publishVehicle','publishPlate','publishPrice','publishSeats'].forEach(id=>$(id).value='');if(!a)return;$('publishAxis').value=a.axis;$('publishVehicle').value=a.vehicle;$('publishPlate').value=a.plate;$('publishPrice').value=money(a.price);$('publishSeats').value=a.seats}
async function publishOffer(){const a=activeApps().find(x=>x.id===$('publishDriver').value);if(!a){alert('Choisissez un chauffeur validé.');return}const day=$('publishDay').value,checkinTime=$('publishCheckin').value,time=$('publishTime').value,boarding=$('publishBoarding').value.trim(),seats=Number($('publishSeats').value||0);if(!day||!checkinTime||!time||!boarding||seats<1){alert('Complétez date, heures, embarquement et places.');return}if(timeMinutes(checkinTime)>=timeMinutes(time)){alert("Erreur d'heure : l'heure d'enregistrement doit être avant l'heure de départ.");return}await addDoc({type:'offer',driverAppId:a.id,driver:a.name,phone:a.phone,vehicle:a.vehicle,plate:a.plate,axis:a.axis,seats,booked:0,price:a.price,day,checkinTime,time,boarding,status:'Disponible',source:'v30'});$('publishMsg').className='notice success';$('publishMsg').textContent='Trajet publié. Il apparaît maintenant côté client et booking.';$('publishDay').value='';$('publishCheckin').value='';$('publishTime').value='';$('publishBoarding').value=''}
function renderActiveDrivers(){const box=$('activeDriversBox');if(!box)return;const list=activeApps();box.innerHTML=list.length?list.map(a=>`<div class="item"><strong>${a.name}</strong><br>${a.axis}<br>${a.vehicle} - ${a.plate}</div>`).join(''):'<div class="notice">Aucun chauffeur actif pour le moment.</div>'}
function renderBooking(){const params=new URLSearchParams(location.search);const axis=params.get('axis')||'';const day=params.get('day')||'';const all=offers().filter(o=>(!axis||o.axis===axis)&&(!day||o.day===day));const scope=axis||day?`<div class="notice">Résultats pour ${axis||'tous les axes'}${day?' · '+day:''}. <a href="taclar_booking.html">Voir toutes les disponibilités</a></div>`:'';setShell('booking',`<div class="card"><h2>Disponibilités</h2><p>Liste complète des chauffeurs publiés. Le client peut choisir un chauffeur puis passer à la réservation.</p>${scope}<div id="bookingList" class="list"></div></div>`);const box=$('bookingList');if(!all.length){box.innerHTML='<div class="notice">Aucune disponibilité publiée pour cette sélection.</div>';return}const sorted=[...all].sort((a,b)=>{const score=o=>{const closed=offerClosedStatus(o);if(closed&&closed!=='Complet')return 0;if(closed==='Complet')return 1;if(reqsForOffer(o.id).some(r=>r.status==='pending'||r.status==='payment_declared'))return 3;return 2};return score(b)-score(a)||(b.createdAt||0)-(a.createdAt||0)});box.innerHTML=sorted.map(renderBookingOffer).join('')}
function renderBookingOffer(o){const pending=reqsForOffer(o.id).filter(r=>r.status==='pending').reduce((s,r)=>s+Number(r.seats||1),0);const declared=reqsForOffer(o.id).filter(r=>r.status==='payment_declared').reduce((s,r)=>s+Number(r.seats||1),0);const confirmed=reqsForOffer(o.id).filter(r=>['confirmed','paid'].includes(r.status)).reduce((s,r)=>s+Number(r.seats||1),0);const free=freeSeats(o);const closed=offerClosedStatus(o);const canReserve=!closed&&free>0&&o.status==='Disponible';const state=closed||pending||declared?closed||`${pending+declared} demande(s) à traiter`:`${free} place(s) libres`;const cls=closed==='Complet'?'booking-complete':closed?'booking-cancelled':pending||declared?'booking-pending':'booking-free';const closeNote=closed&&closed!=='Complet'?`<div class="notice danger"><strong>Disponibilité ${closed.toLowerCase()}.</strong> Motif : ${o.closedReason||closed}.</div>`:'';const reserveAction=canReserve?`<a class="button-link blue" href="${clientReserveLink(o)}">Réserver</a>`:'';return `<details class="item compact-item ${cls}" open><summary><strong>${o.driver}</strong> | ${o.axis} | ${o.day} | ${state}</summary>${closeNote}<div class="booking-offer-head"><div><div class="name">${o.driver}</div><div class="muted">${o.axis} · ${o.day} · Enregistrement ${o.checkinTime} · Départ ${o.time}</div><span class="badge ${closed?'warn':'ok'}">${state}</span></div><div class="booking-offer-price">${money(o.price)}<br>${reserveAction}</div></div><div class="facts booking-facts"><div class="fact"><small>Jour</small><strong>${o.day}</strong></div><div class="fact"><small>Enregistrement</small><strong>${o.checkinTime}</strong></div><div class="fact"><small>Départ</small><strong>${o.time}</strong></div><div class="fact"><small>Véhicule</small><strong>${o.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${o.plate}</strong></div><div class="fact"><small>Places libres</small><strong>${free}</strong></div><div class="fact"><small>Demandes en attente</small><strong>${pending}</strong></div><div class="fact"><small>Paiements à valider</small><strong>${declared}</strong></div><div class="fact"><small>Places confirmées</small><strong>${confirmed}</strong></div><div class="fact"><small>Embarquement</small><strong>${o.boarding}</strong></div></div></details>`}
function renderBookingRequest(r,o){const passengerList=(r.passengerNames||[r.clientName]).join(', ');const reasonId='reason-'+r.id;return `<div class="item"><div class="item-top"><div><strong>${r.groupLeader||r.clientName}</strong><div class="muted">${r.clientPhone} · ${r.seats} place(s) · ${r.requestCode||''} · ${r.createdLabel||''}</div><div>${passengerList}</div></div><span class="badge ${r.status==='paid'?'ok':r.status==='pending'?'warn':'full'}">${statusText(r.status)}</span></div>${r.status==='paid'?`<div class="notice success">Commission TACLAR payée. Rendez-vous le ${o.day} à ${o.checkinTime} au point d'embarquement : ${o.boarding}. Départ prévu : ${o.time}.</div>`:''}${r.status==='refused'?`<div class="notice danger"><strong>Demande refusée.</strong> Motif : ${r.refusalReason||'Non précisé'}.</div>`:''}<div class="actions"><button onclick="updateDoc('${r.id}',{status:'confirmed'})" ${r.status!=='pending'?'disabled':''}>Confirmer place</button><select id="${reasonId}" ${r.status!=='pending'?'disabled':''}><option value="Véhicule déjà complet">Véhicule déjà complet</option><option value="Départ annulé">Départ annulé</option><option value="Horaire modifié">Horaire modifié</option><option value="Client à rappeler">Client à rappeler</option><option value="Autre motif">Autre motif</option></select><button class="ghost" onclick="refuseRequest('${r.id}','${reasonId}')" ${r.status!=='pending'?'disabled':''}>Refuser</button><button class="red" onclick="deleteDocHard('${r.id}')" ${r.status==='paid'?'disabled':''}>Supprimer erreur</button></div></div>`}
async function refuseRequest(id,reasonId){
  const select=$(reasonId);
  const reason=select?select.value:'Motif non précisé';
  const req=requests().find(r=>r.id===id);
  const offer=req?offers().find(o=>o.id===req.offerId):null;
  const closure=refusalClosure(reason);
  if(closure){
    if(!offer){alert('Disponibilité introuvable.');return}
    if(!confirm(`${closure.message} Le refus sera aussi envoyé au client. Continuer ?`))return;
    const offerUpdate={status:closure.status,closedReason:reason,closedAt:Date.now()};
    if(closure.booked)offerUpdate.booked=Number(offer.seats||0);
    await updateDoc(offer.id,offerUpdate);
  }else{
    if(!confirm('Refuser cette demande et envoyer le motif au client ?'))return;
  }
  await updateDoc(id,{status:'refused',refusalReason:reason,refusedAt:Date.now(),clientMessage:`Demande non acceptée : ${reason}`});
}
function renderClient(){setShell('client',`<div class="grid two"><div class="card"><h2>Réservation client</h2><p>Le client choisit un axe et une date, puis sélectionne un chauffeur disponible.</p><div class="field-grid"><div><label>Axe recherché</label><select id="clientAxis"></select></div><div><label>Date souhaitée</label><input id="clientDay" type="date"></div><div><label>Mode de paiement TACLAR</label><select id="paymentMode"><option value="single">Individuel - une place</option><option value="group">Groupe/famille - plusieurs places</option></select></div><div><label>Nom du client / responsable</label><input id="clientName" placeholder="Ex : Arielle Mba"></div><div><label>Téléphone responsable</label><input id="clientPhone" placeholder="Ex : +241 66 12 34 56"></div><div id="groupSeatsWrap" class="hidden"><label>Nombre de places à réserver</label><input id="groupSeats" type="text" inputmode="numeric" pattern="[0-9]*" value="2"></div></div><div id="groupNamesWrap" class="hidden"><label>Noms des passagers du groupe</label><div id="groupNames"></div></div><div id="clientOffers" class="list" style="margin-top:12px"></div></div><div class="card"><h2>Suivi client</h2><div class="notice"><div class="row"><span>Frais TACLAR</span><strong>${money(taclarFee)} / place</strong></div><div class="row"><span>Transport</span><strong>Payé au chauffeur</strong></div><div class="row"><span>Infos complètes</span><strong>Après paiement TACLAR</strong></div></div><div id="toPayBox" class="list"></div><h3 style="margin-top:14px">Mes réservations payées</h3><div id="paidBox" class="list"></div></div></div>`);fillAxisSelect($('clientAxis'));const params=new URLSearchParams(location.search);const presetAxis=params.get('axis')||'';const presetDay=params.get('day')||'';const presetOffer=params.get('offer')||'';const presetSeats=Number(params.get('seats')||1);if(presetAxis&&axes.includes(presetAxis))$('clientAxis').value=presetAxis;if(presetDay)$('clientDay').value=presetDay;if(presetOffer)selectedOfferId=presetOffer;if(presetSeats>1){$('paymentMode').value='group';$('groupSeats').value=Math.min(6,presetSeats)}const resetClient=()=>{clearClientSession();renderPayments()};$('clientAxis').onchange=()=>{resetClient();renderClientOffers()};$('clientDay').onchange=()=>{resetClient();renderClientOffers()};$('clientName').oninput=resetClient;$('clientPhone').oninput=resetClient;$('paymentMode').onchange=()=>{syncGroupFields();renderClientOffers()};$('groupSeats').oninput=renderGroupNameInputs;syncGroupFields();renderClientOffers();renderPayments()}
function syncGroupFields(){const group=$('paymentMode').value==='group';$('groupSeatsWrap').classList.toggle('hidden',!group);$('groupNamesWrap').classList.toggle('hidden',!group);if(group)renderGroupNameInputs()}
function renderGroupNameInputs(){const input=$('groupSeats');const raw=String(input.value||'').replace(/\D/g,'');if(input.value!==raw)input.value=raw;if(raw===''){$('groupNames').innerHTML='';return}const count=Math.min(6,Math.max(2,Number(raw)));if(Number(raw)!==count)input.value=count;const existing=[...document.querySelectorAll('.groupName')].map(i=>i.value);$('groupNames').innerHTML=Array.from({length:count},(_,i)=>`<input class="groupName" placeholder="Nom passager ${i+1}" value="${existing[i]||''}" style="margin-bottom:8px">`).join('')}
function renderClientOffers(){const axis=$('clientAxis').value,day=$('clientDay').value,box=$('clientOffers');if(!axis||!day){box.innerHTML='<div class="notice">Choisissez un axe et une date pour afficher les chauffeurs disponibles.</div>';return}const list=offers().filter(o=>o.axis===axis&&o.day===day&&o.status==='Disponible').sort((a,b)=>(a.checkinTime||'').localeCompare(b.checkinTime||'')||(b.createdAt||0)-(a.createdAt||0));if(!list.length){box.innerHTML='<div class="notice warning">Aucun chauffeur disponible pour cet axe à cette date.</div>';return}box.innerHTML=list.map(o=>{const selected=selectedOfferId===o.id;const free=freeSeats(o);const isFull=free<=0;return `<div class="item ${selected&&!isFull?'selected':''} ${isFull?'client-offer-complete':''}"><div class="item-top"><div><div class="name">${o.driver}</div><div class="axis-name">${o.axis} · ${o.day}</div></div><span class="badge ${isFull?'full':'ok'}">${isFull?'Complet':free+' place(s)'}</span></div>${isFull?`<div class="notice warning">Ce véhicule est complet. Les détails passagers restent privés.</div>`:selected?`<div class="facts"><div class="fact"><small>Date</small><strong>${o.day}</strong></div><div class="fact"><small>Enregistrement</small><strong>${o.checkinTime}</strong></div><div class="fact"><small>Départ</small><strong>${o.time}</strong></div><div class="fact"><small>Voiture</small><strong>${o.vehicle}</strong></div><div class="fact"><small>Prix / place</small><strong>${money(o.price)}</strong></div></div><div class="notice"><strong>Avant paiement TACLAR :</strong> téléphone masqué (${phoneMask(o.phone)}), point d'embarquement général : ${o.boarding}.</div>`:`<div class="notice">Disponible le ${o.day}. Cliquez sur Voir les détails pour afficher l'heure, le véhicule, le prix et le point d'embarquement.</div>`}<div class="actions"><button class="ghost" onclick="selectedOfferId='${selected?'':o.id}';renderClientOffers()" ${isFull?'disabled':''}>${selected&&!isFull?'Masquer les détails':'Voir les détails'}</button><button onclick="requestPlaces('${o.id}')" ${isFull?'disabled':''}>${$('paymentMode').value==='group'?'Demander les places':'Demander une place'}</button></div></div>`}).join('')}
async function requestPlaces(offerId){const o=offers().find(x=>x.id===offerId);const mode=$('paymentMode').value,name=$('clientName').value.trim(),phone=$('clientPhone').value.trim();if(!name||!phone){alert('Remplissez le nom du responsable et son téléphone.');return}let passengerNames=[name],seats=1;if(mode==='group'){seats=Math.max(2,Number($('groupSeats').value||2));passengerNames=[...document.querySelectorAll('.groupName')].map(i=>i.value.trim()).filter(Boolean);if(passengerNames.length!==seats){alert('Remplissez les noms des '+seats+' passagers du groupe.');return}}if(seats>freeSeats(o)){alert('Il ne reste pas assez de places dans ce véhicule.');return}const ref=await addDoc({type:'request',offerId:o.id,clientName:name,clientPhone:phone,groupLeader:name,paymentMode:mode,seats,passengerNames,status:'pending',requestCode:'REQ-'+Math.floor(1000+Math.random()*9000),createdLabel:nowLabel()});addClientSessionId(ref.id);alert('Demande envoyée au chauffeur pour confirmation.');$('clientName').value='';$('clientPhone').value='';if(mode==='group')renderGroupNameInputs();renderPayments()}
function renderPayments(){const activeIds=getClientSessionIds();const scoped=activeIds.length?requests().filter(r=>activeIds.includes(r.id)):[];const toPay=scoped.filter(r=>['confirmed','payment_declared'].includes(r.status));const refused=scoped.filter(r=>r.status==='refused').sort((a,b)=>(b.refusedAt||0)-(a.refusedAt||0));$('toPayBox').innerHTML=(toPay.length?toPay.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};const declared=r.status==='payment_declared';return `<div class="item status-${r.status}"><strong>${r.groupLeader||r.clientName}</strong><div>${r.seats} place(s) confirmée(s) avec ${o.driver||'-'}</div><div class="row"><span>Total frais TACLAR</span><strong>${money(Number(r.seats||1)*taclarFee)}</strong></div>${declared?'<div class="notice warning">Paiement déclaré. En attente de validation TACLAR avant affichage des informations complètes.</div>':`<button class="orange" onclick="declareClientPayment('${r.id}')">Déclarer commission TACLAR payée</button>`}</div>`}).join(''):'<div class="notice">Aucune place confirmée en attente de paiement.</div>')+(refused.length?`<h3 style="margin-top:14px">Demandes refusées</h3>${refused.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};return `<div class="item status-refused"><strong>${r.groupLeader||r.clientName}</strong><div>${o.driver||'Chauffeur'} - ${o.axis||'-'}</div><div class="notice danger"><strong>Demande non acceptée.</strong><br>Motif : ${r.refusalReason||'Non précisé'}.</div></div>`}).join('')}`:'');const paid=scoped.filter(r=>r.status==='paid').sort((a,b)=>(b.paidAt||0)-(a.paidAt||0));$('paidBox').innerHTML=paid.length?paid.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};const rid='receipt-'+r.id;return `<div class="item receipt-card status-paid" id="${rid}"><strong>Reçu ${r.paymentMode==='group'?'groupe':'individuel'}</strong><div class="row"><span>Responsable</span><strong>${r.groupLeader||r.clientName}</strong></div><div class="row"><span>Passagers</span><strong>${(r.passengerNames||[]).join(', ')}</strong></div><div class="row"><span>Axe</span><strong>${o.axis||'-'}</strong></div><div class="row"><span>Chauffeur</span><strong>${o.driver||'-'}</strong></div><div class="row"><span>Téléphone chauffeur</span><strong>${o.phone||'-'}</strong></div><div class="row"><span>Date de départ</span><strong>${o.day||'-'}</strong></div><div class="row"><span>Enregistrement</span><strong>${o.checkinTime||'-'}</strong></div><div class="row"><span>Départ</span><strong>${o.time||'-'}</strong></div><div class="row"><span>Embarquement</span><strong>${o.boarding||'-'}</strong></div><div class="row"><span>Total frais TACLAR</span><strong>${money(Number(r.seats||1)*taclarFee)}</strong></div><button class="blue" onclick="printReceipt('${rid}')">Télécharger / imprimer le reçu</button></div>`}).join(''):'<div class="notice">Les informations complètes du chauffeur apparaissent ici après validation TACLAR du paiement.</div>'}
function printReceipt(id){const el=$(id);if(!el)return;const copy=el.cloneNode(true);copy.querySelectorAll('button').forEach(b=>b.remove());const css=`body{font-family:Arial,sans-serif;margin:24px;color:#00133a}.receipt{max-width:520px;margin:auto;border:1px solid #d8e2ef;border-radius:14px;padding:18px}.row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #e5edf6;padding:8px 0}.row strong{text-align:right}.brand{font-weight:900;margin-bottom:12px;color:#008b8b}@media print{body{margin:0}.receipt{border:0;max-width:none}}`;const win=window.open('','_blank','width=700,height=800');if(!win){document.querySelectorAll('.print-target').forEach(x=>x.classList.remove('print-target'));el.classList.add('print-target');document.body.classList.add('printing-receipt');window.print();setTimeout(()=>{document.body.classList.remove('printing-receipt');el.classList.remove('print-target')},500);return}win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu TACLAR</title><style>${css}</style></head><body><div class="receipt"><div class="brand">TACLAR - Reçu client</div>${copy.innerHTML}</div><script>window.onload=function(){window.print()};<\/script></body></html>`);win.document.close()}
async function declareClientPayment(id){await updateDoc(id,{status:'payment_declared',paymentDeclaredAt:Date.now()})}

document.addEventListener('DOMContentLoaded',initFirebase);
