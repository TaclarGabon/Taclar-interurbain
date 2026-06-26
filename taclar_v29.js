
const taclarFee=2000;
const collectionName='taclar_interurbain';
const axes=['Libreville → Oyem → Bitam','Libreville → Lambaréné','Libreville → Mitzic'];
const axisPrices={'Libreville → Oyem → Bitam':25000,'Libreville → Lambaréné':18000,'Libreville → Mitzic':22000};
const departureTimes=['05h00','05h30','06h00','06h30','07h00','07h30','08h00','08h30','09h00','09h30','10h00','10h30','12h00','14h00','15h00','16h00','18h00'];
let db=null,docs=[],ready=false,selectedOfferId=null,seedingDemo=false;
function $(id){return document.getElementById(id)}
function money(n){return Number(n||0).toLocaleString('fr-FR')+' FCFA'}
function nowLabel(){return new Date().toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}
function makeDriverCode(){return 'CH-'+Math.floor(10000+Math.random()*90000)}
function makePin(){return String(Math.floor(1000+Math.random()*9000))}
function getDriverSession(){try{return JSON.parse(localStorage.getItem('taclar_driver_session')||'null')}catch{return null}}
function setDriverSession(id,pin){localStorage.setItem('taclar_driver_session',JSON.stringify({id,pin}))}
function clearDriverSession(){localStorage.removeItem('taclar_driver_session')}
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
function phoneMask(p){p=String(p||'');return p.length>5?p.slice(0,7)+' ** ** '+p.slice(-2):'masqué'}
function statusText(s){return {submitted:'Documents en cours de traitement',docs_validated:'Documents approuvés - frais d’enregistrement à payer',deposit_paid:'Frais d’enregistrement déclarés payés - vérification TACLAR',deposit_validated:'Frais d’enregistrement reçus - autorisation en attente',active:'Autorisé à publier',pending:'Demande envoyée',confirmed:'Places confirmées - frais TACLAR à payer',payment_pending:'Paiement déclaré - confirmation TACLAR en attente',paid:'Paiement TACLAR confirmé',refused:'Refusée',deleted:'Supprimée'}[s]||s||'-'}
function formatDateFr(value){if(!value)return '-';return new Date(value+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})}
function fillAxisSelect(sel,empty='-- Choisir un axe --'){if(!sel)return;const v=sel.value;sel.innerHTML=`<option value="">${empty}</option>`+axes.map(a=>`<option value="${a}">${a}</option>`).join('');if(axes.includes(v))sel.value=v}
function fillTimeSelect(sel,empty='-- Choisir --'){if(!sel)return;const v=sel.value;sel.innerHTML=`<option value="">${empty}</option>`+departureTimes.map(t=>`<option value="${t}">${t}</option>`).join('');if(departureTimes.includes(v))sel.value=v}
async function addDoc(data){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).add({...data,createdAt:Date.now(),updatedAt:Date.now()})}
async function updateDoc(id,data){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).doc(id).set({...data,updatedAt:Date.now()},{merge:true})}
async function deleteDocHard(id){if(!db)throw new Error('Firebase non connecté');return db.collection(collectionName).doc(id).delete()}
function demoDriverTemplates(){
  return [
    {id:'bitam_1',name:'Jérôme Ndong',phone:'+241 75 40 90 12',vehicle:'Ford Edge',plate:'GA-284-WN',axis:axes[0],seats:5,price:25000,checkinTime:'05h30',time:'06h30',boarding:'PK8 - gare routière'},
    {id:'bitam_2',name:'Patrick Mba',phone:'+241 66 70 12 29',vehicle:'Toyota Prado',plate:'GA-532-WN',axis:axes[0],seats:4,price:25000,checkinTime:'07h00',time:'08h00',boarding:'Charbonnages'},
    {id:'bitam_3',name:'Daniel Mengue',phone:'+241 77 18 62 40',vehicle:'Mitsubishi Pajero',plate:'GA-913-WN',axis:axes[0],seats:6,price:25000,checkinTime:'09h00',time:'10h00',boarding:'Gare routière'},
    {id:'lambarene_1',name:'Marcel Nguema',phone:'+241 77 45 90 12',vehicle:'Toyota Noah',plate:'GA-421-LB',axis:axes[1],seats:4,price:18000,checkinTime:'06h00',time:'07h00',boarding:'Gare routière'},
    {id:'lambarene_2',name:'Alain Moussavou',phone:'+241 66 28 17 44',vehicle:'Hyundai Staria',plate:'GA-308-LB',axis:axes[1],seats:6,price:18000,checkinTime:'08h00',time:'09h00',boarding:'PK8 - station'},
    {id:'lambarene_3',name:'Serge Mba',phone:'+241 74 55 31 08',vehicle:'Kia Carnival',plate:'GA-126-LB',axis:axes[1],seats:5,price:18000,checkinTime:'10h00',time:'11h00',boarding:'Gare d’Owendo'},
    {id:'mitzic_1',name:'Franck Medza',phone:'+241 74 91 17 67',vehicle:'Hyundai H1',plate:'GA-615-MI',axis:axes[2],seats:6,price:22000,checkinTime:'05h00',time:'05h45',boarding:'Charbonnages - rond-point'},
    {id:'mitzic_2',name:'Blaise Bekale',phone:'+241 62 33 18 05',vehicle:'Toyota Hiace',plate:'GA-744-MI',axis:axes[2],seats:5,price:22000,checkinTime:'07h00',time:'08h00',boarding:'Gare d’Owendo'},
    {id:'mitzic_3',name:'Mario Obame',phone:'+241 66 91 04 37',vehicle:'Opel Zafira',plate:'GA-587-MI',axis:axes[2],seats:4,price:22000,checkinTime:'09h00',time:'10h00',boarding:'Charbonnages'}
  ]
}
async function seedDemoData(force=false){
  if(!db||seedingDemo||(!force&&docs.some(d=>d.id==='demo_seed_v31')))return;
  seedingDemo=true;
  try{
    const batch=db.batch(),drivers=demoDriverTemplates(),dates=['2026-07-15','2026-07-16','2026-07-17','2026-07-18','2026-07-19','2026-07-20'];
    drivers.forEach((d,index)=>{
      batch.set(db.collection(collectionName).doc('demo_driver_'+d.id),{type:'driverApplication',driverCode:'DEMO-'+String(index+1).padStart(2,'0'),pin:'1234',name:d.name,phone:d.phone,vehicle:d.vehicle,plate:d.plate,axis:d.axis,seats:d.seats,price:d.price,deposit:d.seats*taclarFee,status:'active',docsValidated:true,depositPaid:true,depositValidated:true,active:true,demo:true,createdAt:Date.now()+index,updatedAt:Date.now()});
      dates.forEach((day,dateIndex)=>{
        batch.set(db.collection(collectionName).doc(`demo_offer_${day.replaceAll('-','')}_${d.id}`),{type:'offer',driverAppId:'demo_driver_'+d.id,driver:d.name,phone:d.phone,vehicle:d.vehicle,plate:d.plate,axis:d.axis,seats:d.seats,booked:0,price:d.price,day,checkinTime:d.checkinTime,time:d.time,boarding:d.boarding,status:'Disponible',source:'v31_demo',demo:true,createdAt:Date.now()+(dateIndex*100)+index,updatedAt:Date.now()});
      });
    });
    batch.set(db.collection(collectionName).doc('demo_seed_v31'),{type:'meta',version:'V31',createdAt:Date.now(),updatedAt:Date.now()});
    await batch.commit();
  }finally{seedingDemo=false}
}
async function prepareV31Data(){
  if(!db||seedingDemo||docs.some(d=>d.id==='demo_seed_v31'))return;
  seedingDemo=true;
  try{
    const snap=await db.collection(collectionName).get(),batch=db.batch();
    snap.docs.forEach(doc=>batch.delete(doc.ref));
    if(!snap.empty)await batch.commit();
  }finally{seedingDemo=false}
  docs=[];
  await seedDemoData(true);
}
async function resetV31Data(){
  if(!confirm('Effacer les essais, les réservations et les chauffeurs ajoutés, puis remettre les chauffeurs fictifs de départ ?'))return;
  showLoad('Réinitialisation...');
  const snap=await db.collection(collectionName).get(),batch=db.batch();
  snap.docs.forEach(doc=>batch.delete(doc.ref));
  await batch.commit();
  docs=[];selectedOfferId=null;clearDriverSession();
  await seedDemoData(true);
  showLoad('Réinitialisé');
}
function initFirebase(){const cfg=window.TACLAR_FIREBASE_CONFIG;if(!cfg||String(cfg.apiKey||'').includes('COLLER_')){showLoad('Firebase non configuré');return}firebase.initializeApp(cfg);db=firebase.firestore();showLoad('Connexion Firebase...');db.collection(collectionName).onSnapshot(snap=>{docs=snap.docs.map(d=>({id:d.id,...d.data()}));ready=true;showLoad('Synchronisé');setTimeout(()=>showLoad(''),900);renderPage();prepareV31Data();},err=>{showLoad('Erreur Firebase: '+err.message)})}
function showLoad(txt){let el=$('syncStatus');if(!el){el=document.createElement('div');el.id='syncStatus';el.className='loading';document.body.appendChild(el)}el.textContent=txt;el.style.display=txt?'block':'none'}
function header(active){
  const pageTitles={
    new:'Espace chauffeur',
    validation:'Validation TACLAR',
    publish:'Publier un trajet',
    booking:'Booking / Disponibilités chauffeur',
    client:'Espace client',
    portal:'Mise en relation client-chauffeur'
  };
  return `<header class="hero"><div class="hero-inner"><div class="brand"><div class="logo">TACLAR</div><div><div class="axis-name">TACLAR Interurbain</div><h1>${pageTitles[active]||'TACLAR Interurbain'}</h1><p>Page séparée par rôle · synchronisation Firebase.</p></div></div></div></header>`
}
function setShell(active,main){$('app').innerHTML=header(active)+main}
function renderPage(){const page=document.body.dataset.page;if(page==='new')renderNewDriver();else if(page==='validation')renderValidation();else if(page==='publish')renderPublish();else if(page==='booking')renderBooking();else if(page==='client')renderClient();else renderPortal()}
function renderPortal(){setShell('portal',`<div class="card"><h2>Accès TACLAR Interurbain</h2><p>Chaque rôle dispose maintenant de sa propre page.</p><div class="portal-grid"><a href="taclar_nouveau_chauffeur.html"><strong>Espace chauffeur</strong><p>Inscription, connexion par PIN et suivi personnel du dossier.</p></a><a href="taclar_validation.html"><strong>Validation TACLAR</strong><p>Validation interne des documents, des frais d’enregistrement et de l'autorisation.</p></a><a href="taclar_publier_trajet.html"><strong>Publier trajet</strong><p>Un chauffeur autorisé publie une disponibilité.</p></a><a href="taclar_booking.html"><strong>Booking / Disponibilités</strong><p>Le chauffeur traite les demandes clients.</p></a><a href="taclar_client.html"><strong>Client</strong><p>Le client cherche un axe et réserve une ou plusieurs places.</p></a></div></div>`)}
function renderNewDriver(){
  const session=getDriverSession();
  const current=session?apps().find(a=>a.id===session.id&&String(a.pin||'')===String(session.pin||'')):null;
  if(current){renderDriverDashboard(current);return}
  if(session)clearDriverSession();
  setShell('new',`<div class="grid two"><div class="card"><h2>Nouveau chauffeur - rejoindre TACLAR</h2><p>Crée ton dossier une seule fois. Tu recevras ensuite un numéro de dossier et un code PIN pour suivre son traitement.</p><div class="field-grid"><div><label>Nom et prénom chauffeur</label><input id="signupName" placeholder="Ex : Serge Ndong"></div><div><label>Téléphone chauffeur</label><input id="signupPhone" placeholder="Ex : +241 77 45 90 12"></div><div><label>Véhicule</label><input id="signupVehicle" placeholder="Ex : Toyota Noah"></div><div><label>Plaque</label><input id="signupPlate" placeholder="Ex : GA-421-LB"></div><div><label>Axe souhaité</label><select id="signupAxis"></select></div><div><label>Prix transport / place</label><input id="signupPrice" disabled></div><div><label>Nombre de places</label><input id="signupSeats" type="number" min="1" step="1" placeholder="Ex : 6"></div><div><label>Frais d’enregistrement calculés</label><input id="signupDeposit" value="0 FCFA" disabled></div><div><label>Permis de conduire</label><input id="signupLicense" type="file"></div><div><label>Pièce d'identité</label><input id="signupIdCard" type="file"></div></div><div class="notice warning"><strong>Étape 1 :</strong> soumettre le dossier chauffeur. Les fichiers sont simulés par leur nom dans cette démo.</div><div class="actions"><button id="submitDriver">Soumettre le dossier chauffeur</button><button class="secondary" id="clearDriver">Vider le formulaire</button></div></div><div class="card"><h2>Déjà inscrit ?</h2><p>Entre ton numéro de dossier et ton code PIN pour consulter uniquement ton propre dossier.</p><div><label>Numéro de dossier</label><input id="loginDriverCode" placeholder="Ex : CH-12345"></div><div style="margin-top:12px"><label>Code PIN</label><input id="loginDriverPin" inputmode="numeric" maxlength="4" placeholder="4 chiffres"></div><div class="actions"><button id="loginDriver">Ouvrir mon dossier</button></div><div id="loginMsg" class="notice danger hidden"></div></div></div>`);
  fillAxisSelect($('signupAxis'));
  $('signupAxis').onchange=()=>{const axis=$('signupAxis').value;$('signupPrice').value=axis?money(axisPrices[axis]):''};
  $('signupSeats').oninput=()=>{$('signupDeposit').value=money(Math.max(0,Number($('signupSeats').value||0))*taclarFee)};
  $('submitDriver').onclick=submitDriver;
  $('clearDriver').onclick=()=>renderNewDriver();
  $('loginDriver').onclick=loginDriver;
}
async function submitDriver(){
  const name=$('signupName').value.trim(),phone=$('signupPhone').value.trim(),vehicle=$('signupVehicle').value.trim(),plate=$('signupPlate').value.trim(),axis=$('signupAxis').value,seats=Number($('signupSeats').value||0);
  if(!name||!phone||!vehicle||!plate||!axis||seats<1){alert('Remplis le nom, le téléphone, le véhicule, la plaque, l’axe et le nombre de places.');return}
  const driverCode=makeDriverCode(),pin=makePin();
  const ref=await addDoc({type:'driverApplication',driverCode,pin,name,phone,vehicle,plate,axis,seats,price:axisPrices[axis]||0,deposit:seats*taclarFee,licenseName:$('signupLicense').files[0]?.name||'Non joint',idCardName:$('signupIdCard').files[0]?.name||'Non joint',status:'submitted',docsValidated:false,depositPaid:false,depositValidated:false,active:false});
  setDriverSession(ref.id,pin);
  alert(`Dossier envoyé.\nNuméro : ${driverCode}\nCode PIN : ${pin}\nNote-les pour retrouver ton dossier.`);
  renderPage();
}
function loginDriver(){
  const code=$('loginDriverCode').value.trim().toUpperCase(),pin=$('loginDriverPin').value.trim();
  const app=apps().find(a=>String(a.driverCode||'').toUpperCase()===code&&String(a.pin||'')===pin);
  if(!app){$('loginMsg').classList.remove('hidden');$('loginMsg').textContent='Numéro de dossier ou code PIN incorrect.';return}
  setDriverSession(app.id,pin);
  renderPage();
}
function renderDriverDashboard(a){
  const steps=[{done:true,label:'Dossier envoyé'},{done:!!a.docsValidated,label:'Documents approuvés'},{done:!!a.depositPaid,label:'Frais d’enregistrement payés'},{done:!!a.depositValidated,label:'Frais d’enregistrement reçu'},{done:!!a.active,label:'Autorisé à publier'}];
  let message='Tes documents ont été reçus et sont en cours de traitement.';
  if(a.docsValidated&&!a.depositPaid)message=`Tes documents sont approuvés. Paie maintenant les frais d’enregistrement de ${money(a.deposit)}.`;
  else if(a.depositPaid&&!a.depositValidated)message='Tes frais d’enregistrement sont déclarés payés. TACLAR vérifie maintenant leur réception.';
  else if(a.depositValidated&&!a.active)message='Tes frais d’enregistrement sont reçus. TACLAR doit encore autoriser la publication.';
  else if(a.active)message='Ton dossier est complet. Tu peux maintenant publier un trajet.';
  setShell('new',`<div class="card driver-space"><div class="item-top"><div><h2>Suivi de mon dossier chauffeur</h2><p class="muted">Bienvenue, <strong>${a.name}</strong>.</p></div><span class="badge ${a.active?'ok':'warn'}">${statusText(a.status)}</span></div><div class="credentials"><div><small>Numéro de dossier</small><strong>${a.driverCode||'Ancien dossier'}</strong></div><div><small>Code PIN personnel</small><strong>${a.pin||'Non défini'}</strong></div></div><div class="notice warning"><strong>À conserver :</strong> note ton numéro de dossier et ton code PIN pour te reconnecter depuis un autre téléphone.</div><div class="timeline">${steps.map(s=>`<div class="${s.done?'done':''}"><span>${s.done?'✓':'○'}</span><strong>${s.label}</strong></div>`).join('')}</div><div class="notice ${a.active?'success':''}">${message}</div><div class="facts"><div class="fact"><small>Nom</small><strong>${a.name}</strong></div><div class="fact"><small>Téléphone</small><strong>${a.phone}</strong></div><div class="fact"><small>Véhicule</small><strong>${a.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${a.plate}</strong></div><div class="fact"><small>Axe souhaité</small><strong>${a.axis}</strong></div><div class="fact"><small>Places déclarées</small><strong>${a.seats}</strong></div><div class="fact"><small>Frais d’enregistrement</small><strong>${money(a.deposit)}</strong></div><div class="fact"><small>Statut</small><strong>${statusText(a.status)}</strong></div></div><div class="actions">${a.docsValidated&&!a.depositPaid?`<button class="orange" onclick="driverPayDeposit('${a.id}')">Déclarer les frais payés</button>`:''}${a.active?`<a class="button-link blue" href="taclar_publier_trajet.html">Publier un trajet</a>`:''}<button class="secondary" onclick="logoutDriver()">Se déconnecter</button></div></div>`);
}
async function driverPayDeposit(id){if(!confirm('Confirmer que les frais d’enregistrement ont été envoyés à TACLAR ?'))return;await updateDoc(id,{status:'deposit_paid',depositPaid:true,depositPaidAt:Date.now()})}
function logoutDriver(){clearDriverSession();renderPage()}

function shortAxisName(axis){
  const txt=String(axis||'').replace('Libreville → ','').replace('Libreville - ','');
  return txt||'-';
}
function validationPriority(a){
  if(!a.docsValidated) return 1;
  if(a.docsValidated&&!a.depositPaid) return 2;
  if(a.depositPaid&&!a.depositValidated) return 1;
  if(a.depositValidated&&!a.active) return 2;
  if(a.active) return 3;
  return 4;
}
function requestPriorityStatus(status){
  return {pending:1,payment_pending:2,confirmed:3,paid:4,refused:5,deleted:9}[status]||6;
}
function offerPriority(o){
  const reqs=reqsForOffer(o.id).filter(r=>r.status!=='deleted');
  if(reqs.some(r=>['pending','payment_pending','confirmed'].includes(r.status))) return 1;
  if(reqs.some(r=>r.status==='paid')) return 2;
  return 3;
}
function topRequestForOffer(o){
  return reqsForOffer(o.id).filter(r=>r.status!=='deleted').sort((a,b)=>requestPriorityStatus(a.status)-requestPriorityStatus(b.status)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0))[0];
}
function activeRequestSummary(o){
  const r=topRequestForOffer(o);
  if(!r) return `${o.driver} — ${shortAxisName(o.axis)} — ${freeSeats(o)} place(s) libres`;
  return `${o.driver} — ${shortAxisName(o.axis)} — ${r.seats||1} place(s) demandée(s) — ${statusText(r.status)}`;
}

function renderValidation(){
  const totalDispos=offers().length;
  const totalRequests=requests().filter(r=>r.status!=='deleted').length;
  const paidPlaces=requests().filter(r=>r.status==='paid').reduce((sum,r)=>sum+Number(r.seats||1),0);
  const taclarTotal=paidPlaces*taclarFee;
  setShell('validation',`<div class="card"><h2>Validation TACLAR / Admin</h2><p>Vue interne TACLAR : validation des chauffeurs, suivi des frais d’enregistrement et vue d’ensemble.</p><div class="kpi admin-kpi"><div><b>${totalDispos}</b><span>disponibilités</span></div><div><b>${totalRequests}</b><span>demandes</span></div><div><b>${paidPlaces}</b><span>places payées</span></div><div><b>${money(taclarTotal)}</b><span>frais TACLAR</span></div></div><div class="notice warning"><strong>Important :</strong> le chauffeur déclare lui-même le paiement des frais d’enregistrement depuis son espace. TACLAR confirme seulement la réception.</div><h3 style="margin-top:16px">Dossiers chauffeurs</h3><div id="applicationsList" class="compact-list" style="margin-top:14px"></div></div>`);
  renderApplicationsList();
}
function renderApplicationsList(){
  const box=$('applicationsList');
  if(!box)return;
  const list=apps().filter(a=>a.driverCode).sort((a,b)=>validationPriority(a)-validationPriority(b)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  if(!list.length){box.innerHTML='<div class="notice">Aucun dossier chauffeur reçu pour le moment.</div>';return}
  box.innerHTML=list.map(a=>`<details class="compact-item"><summary><span><strong>${a.name}</strong> | Axe : ${shortAxisName(a.axis)} | Places : ${a.seats||0}</span><span class="badge ${a.active?'ok':'warn'}">${statusText(a.status)}</span></summary><div class="compact-body"><div class="facts"><div class="fact"><small>Téléphone</small><strong>${a.phone}</strong></div><div class="fact"><small>Véhicule</small><strong>${a.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${a.plate}</strong></div><div class="fact"><small>Axe</small><strong>${a.axis}</strong></div><div class="fact"><small>Places déclarées</small><strong>${a.seats}</strong></div><div class="fact"><small>Prix axe</small><strong>${money(a.price)}</strong></div><div class="fact"><small>Frais attendus</small><strong>${money(a.deposit)}</strong></div><div class="fact"><small>Permis</small><strong>${a.licenseName||'-'}</strong></div><div class="fact"><small>Identité</small><strong>${a.idCardName||'-'}</strong></div></div><div class="actions"><button onclick="validateDriverDocuments('${a.id}')" ${a.docsValidated?'disabled':''}>Valider les documents</button><button onclick="validateDriverDeposit('${a.id}')" ${!a.depositPaid||a.depositValidated?'disabled':''}>Confirmer frais reçus</button><button class="blue" onclick="authorizeDriver('${a.id}')" ${!a.depositValidated||a.active?'disabled':''}>Autoriser à publier</button></div>${a.docsValidated&&!a.depositPaid?'<div class="notice">Documents validés. En attente du paiement des frais d’enregistrement par le chauffeur.</div>':''}${a.depositPaid&&!a.depositValidated?'<div class="notice warning">Le chauffeur déclare avoir payé. Vérifie la réception avant de confirmer.</div>':''}${a.active?'<div class="notice success">Chauffeur autorisé à publier.</div>':''}</div></details>`).join('')
}
async function validateDriverDocuments(id){await updateDoc(id,{status:'docs_validated',docsValidated:true,docsValidatedAt:Date.now()})}
async function validateDriverDeposit(id){await updateDoc(id,{status:'deposit_validated',depositValidated:true,depositValidatedAt:Date.now()})}
async function authorizeDriver(id){await updateDoc(id,{status:'active',active:true,authorizedAt:Date.now()})}
function renderPublish(){setShell('publish',`<div class="grid two"><div class="card"><h2>Publier un trajet</h2><p>Seuls les chauffeurs actifs peuvent publier une disponibilité.</p><div class="field-grid"><div><label>Chauffeur validé</label><select id="publishDriver"></select></div><div><label>Axe</label><input id="publishAxis" disabled></div><div><label>Véhicule</label><input id="publishVehicle" disabled></div><div><label>Plaque</label><input id="publishPlate" disabled></div><div><label>Places disponibles</label><input id="publishSeats" type="number" min="1"></div><div><label>Prix transport / place</label><input id="publishPrice" disabled></div><div><label>Date de départ</label><input id="publishDay" type="date"></div><div><label>Heure d'enregistrement</label><select id="publishCheckin"></select></div><div><label>Heure de départ</label><select id="publishTime"></select></div><div><label>Point d'embarquement</label><input id="publishBoarding" placeholder="Ex : Gare routière"></div></div><div class="actions"><button id="publishBtn">Publier le trajet</button></div><div id="publishMsg" class="notice hidden"></div></div><div class="card"><h2>Règle</h2><div class="notice success">Un chauffeur peut publier seulement si son dossier et ses frais d’enregistrement sont validés.</div><div id="activeDriversBox" class="list"></div></div></div>`);const drivers=activeApps();$('publishDriver').innerHTML='<option value="">-- Choisir chauffeur --</option>'+drivers.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');fillTimeSelect($('publishCheckin'),'-- Heure enregistrement --');fillTimeSelect($('publishTime'),'-- Heure départ --');$('publishDriver').onchange=syncPublishDriver;$('publishBtn').onclick=publishOffer;renderActiveDrivers();syncPublishDriver()}
function syncPublishDriver(){const a=activeApps().find(x=>x.id===$('publishDriver').value);['publishAxis','publishVehicle','publishPlate','publishPrice','publishSeats'].forEach(id=>$(id).value='');if(!a)return;$('publishAxis').value=a.axis;$('publishVehicle').value=a.vehicle;$('publishPlate').value=a.plate;$('publishPrice').value=money(a.price);$('publishSeats').value=a.seats}
async function publishOffer(){const a=activeApps().find(x=>x.id===$('publishDriver').value);if(!a){alert('Choisissez un chauffeur validé.');return}const day=$('publishDay').value,checkinTime=$('publishCheckin').value,time=$('publishTime').value,boarding=$('publishBoarding').value.trim(),seats=Number($('publishSeats').value||0);if(!day||!checkinTime||!time||!boarding||seats<1){alert('Complétez date, heures, embarquement et places.');return}await addDoc({type:'offer',driverAppId:a.id,driver:a.name,phone:a.phone,vehicle:a.vehicle,plate:a.plate,axis:a.axis,seats,booked:0,price:a.price,day,checkinTime,time,boarding,status:'Disponible',source:'v30'});$('publishMsg').className='notice success';$('publishMsg').textContent='Trajet publié. Il apparaît maintenant côté client et booking.';$('publishDay').value='';$('publishCheckin').value='';$('publishTime').value='';$('publishBoarding').value=''}
function renderActiveDrivers(){const box=$('activeDriversBox');if(!box)return;const list=activeApps();box.innerHTML=list.length?list.map(a=>`<div class="item"><strong>${a.name}</strong><br>${a.axis}<br>${a.vehicle} - ${a.plate}</div>`).join(''):'<div class="notice">Aucun chauffeur actif pour le moment.</div>'}
function renderBooking(){
  const all=offers();
  setShell('booking',`<div class="card"><h2>Booking / Disponibilités chauffeur</h2><p>Liste des chauffeurs et des disponibilités publiées. Les demandes à traiter restent en haut.</p><div id="bookingList" class="compact-list"></div></div>`);
  const box=$('bookingList');
  if(!all.length){box.innerHTML='<div class="notice">Aucune disponibilité publiée.</div>';return}
  const sorted=[...all].sort((a,b)=>offerPriority(a)-offerPriority(b)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  box.innerHTML=sorted.map(renderBookingOffer).join('')
}
function renderBookingOffer(o){
  const reqs=reqsForOffer(o.id).filter(r=>r.status!=='deleted').sort((a,b)=>requestPriorityStatus(a.status)-requestPriorityStatus(b.status)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  const passengerCount=reqs.filter(r=>['confirmed','payment_pending','paid'].includes(r.status)).reduce((s,r)=>s+Number(r.seats||1),0);
  const open=reqs.some(r=>['pending','payment_pending','confirmed'].includes(r.status))?' open':'';
  return `<details class="compact-item booking-compact"${open}><summary><span><strong>${activeRequestSummary(o)}</strong><small>${formatDateFr(o.day)} · ${o.checkinTime} → ${o.time}</small></span><span class="badge ${freeSeats(o)<=0?'full':'ok'}">${freeSeats(o)<=0?'Complet':freeSeats(o)+' libre(s)'}</span></summary><div class="compact-body"><div class="facts"><div class="fact"><small>Jour</small><strong>${formatDateFr(o.day)}</strong></div><div class="fact"><small>Enregistrement</small><strong>${o.checkinTime}</strong></div><div class="fact"><small>Départ</small><strong>${o.time}</strong></div><div class="fact"><small>Véhicule</small><strong>${o.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${o.plate}</strong></div><div class="fact"><small>Prix / place</small><strong>${money(o.price)}</strong></div><div class="fact"><small>Passagers confirmés</small><strong>${passengerCount}</strong></div><div class="fact"><small>Embarquement</small><strong>${o.boarding}</strong></div></div><div class="list" style="margin-top:12px">${reqs.length?reqs.map(r=>renderBookingRequest(r,o)).join(''):'<div class="notice">Aucune demande pour cette disponibilité.</div>'}</div></div></details>`
}
function renderBookingRequest(r,o){
  const passengerList=(r.passengerNames&&r.passengerNames.length?r.passengerNames:[r.clientName]).join(', ');
  const statusClass=r.status==='paid'?'ok':(['pending','confirmed','payment_pending'].includes(r.status)?'warn':'full');
  let message='';
  if(r.status==='confirmed') message='<div class="notice success">Places confirmées. Le client doit maintenant payer les frais TACLAR.</div>';
  if(r.status==='payment_pending') message='<div class="notice warning">Le client a déclaré le paiement des frais TACLAR. TACLAR doit confirmer la réception Airtel Money avant de débloquer les informations finales.</div>';
  if(r.status==='paid') message=`<div class="notice success">Paiement TACLAR confirmé. Rendez-vous le ${formatDateFr(o.day)} à ${o.checkinTime} au point d'embarquement : ${o.boarding}. Départ prévu : ${o.time}.</div>`;
  const actions=[];
  if(r.status==='pending'){
    actions.push(`<button onclick="updateDoc('${r.id}',{status:'confirmed',confirmedAt:Date.now()})">Confirmer place</button>`);
    actions.push(`<button class="ghost" onclick="updateDoc('${r.id}',{status:'refused'})">Refuser</button>`);
  }
  if(r.status==='payment_pending') actions.push(`<button class="green" onclick="updateDoc('${r.id}',{status:'paid',paidAt:Date.now(),paymentConfirmedAt:Date.now()})">Confirmer paiement reçu</button>`);
  if(r.status!=='paid') actions.push(`<button class="red" onclick="deleteDocHard('${r.id}')">Supprimer erreur</button>`);
  return `<div class="item booking-request"><div class="item-top"><div><strong>${r.groupLeader||r.clientName}</strong><div class="muted">${r.clientPhone} · ${r.seats} place(s) · ${r.requestCode||''} · ${r.createdLabel||''}</div><div>${passengerList}</div></div><span class="badge ${statusClass}">${statusText(r.status)}</span></div>${message}<div class="actions">${actions.join('')}</div></div>`
}

function vehicleVisual(o){
  if(o.vehiclePhotoUrl){return `<img class="vehicle-photo-img" src="${o.vehiclePhotoUrl}" alt="Photo véhicule">`}
  const label=String(o.vehicle||'Véhicule').split(' ').slice(0,2).join(' ');
  return `<div class="vehicle-photo-placeholder"><span>🚗</span><strong>${label}</strong><small>Photo véhicule optionnelle</small></div>`
}
function renderClient(){
  setShell('client',`<div class="grid two client-layout"><div class="card client-main-card"><h2>Rechercher un trajet</h2><p class="client-intro">Choisis d’abord ton axe et ta date. Les véhicules disponibles apparaissent automatiquement. Tu ne renseignes ton nom et ton téléphone qu’après avoir sélectionné un véhicule.</p><div class="client-step-strip"><div><span>1</span><strong>Rechercher</strong><small>Axe + date</small></div><div><span>2</span><strong>Sélectionner</strong><small>Choisir le véhicule</small></div><div><span>3</span><strong>Demander</strong><small>Nom + téléphone + places</small></div></div><div class="field-grid"><div><label>Axe recherché</label><select id="clientAxis"></select></div><div><label>Date souhaitée</label><input id="clientDate" type="date" min="2026-07-15" max="2026-07-20"></div></div><div class="notice">Sélectionne un axe et une date pour afficher les chauffeurs disponibles.</div><div id="clientOffers" class="list client-offers"></div></div><div class="card client-follow"><h2>Suivi client</h2><div class="notice"><div class="row"><span>Frais TACLAR</span><strong>${money(taclarFee)} / place</strong></div><div class="row"><span>Transport</span><strong>Payé au chauffeur</strong></div><div class="row"><span>Infos complètes</span><strong>Après paiement TACLAR</strong></div></div><div id="toPayBox" class="list"></div><h3 style="margin-top:14px">Mes réservations payées</h3><div id="paidBox" class="list"></div></div></div><div class="card client-test-tools"><h3>Outils de test</h3><div class="notice"><strong>Période d’essai :</strong> du 15 au 20 juillet 2026. Ces commandes restent en bas de page pour nos essais.</div><div class="actions"><button class="secondary" onclick="clearClientForm()">Vider la recherche</button><button class="red" onclick="resetV31Data()">Réinitialiser tous les essais</button></div></div>`);
  fillAxisSelect($('clientAxis'));
  $('clientAxis').onchange=renderClientOffers;
  $('clientDate').onchange=renderClientOffers;
  renderClientOffers();
  renderPayments();
}
function clearClientForm(){
  $('clientAxis').value='';
  $('clientDate').value='';
  selectedOfferId=null;
  renderClientOffers();
}
function clientSeatOptions(max,selected=1){
  const n=Math.max(1,Number(max||1));
  return Array.from({length:n},(_,i)=>{const v=i+1;return `<option value="${v}" ${v===selected?'selected':''}>${v} place${v>1?'s':''}</option>`}).join('')
}
function renderClientOffers(){
  const axis=$('clientAxis').value,date=$('clientDate').value,box=$('clientOffers');
  if(!axis||!date){box.innerHTML='<div class="notice">Étape 1 : sélectionne un axe et une date pour voir les véhicules disponibles.</div>';return}
  const list=offers().filter(o=>o.axis===axis&&o.day===date&&o.status==='Disponible').sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
  if(!list.length){box.innerHTML='<div class="notice warning">Aucun véhicule disponible pour cet axe à cette date.</div>';return}
  box.innerHTML=`<h3 class="client-section-title">Étape 2 — Véhicules disponibles</h3><p class="client-help">Sélectionne le véhicule qui te convient. Ensuite, tu pourras demander la disponibilité des places.</p>`+list.map(o=>{
    const selected=selectedOfferId===o.id,free=freeSeats(o);
    return `<div class="client-offer-card ${selected?'selected':''}"><div class="vehicle-photo">${vehicleVisual(o)}</div><div class="vehicle-content"><div class="vehicle-title-row"><div><strong>${o.vehicle} — ${free} place(s)</strong><small>${o.axis} · ${formatDateFr(o.day)}</small></div><span class="badge ${free>0?'ok':'full'}">${free>0?'Disponible':'Complet'}</span></div><div class="client-mini-facts"><span>Embarquement : <b>${o.checkinTime}</b></span><span>Départ : <b>${o.time}</b></span><span>Prix : <b>${money(o.price)} / place</b></span></div><button class="blue select-btn" onclick="selectedOfferId='${selected?'':o.id}';renderClientOffers()" ${free<=0?'disabled':''}>${selected?'Masquer':'Sélectionner'}</button></div>${selected?`<div class="selected-vehicle-panel"><h3>Vous avez sélectionné ce véhicule</h3><div class="selected-grid"><div class="selected-photo">${vehicleVisual(o)}</div><div class="facts selected-facts"><div class="fact"><small>Chauffeur</small><strong>${o.driver}</strong></div><div class="fact"><small>Véhicule</small><strong>${o.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${o.plate}</strong></div><div class="fact"><small>Point d’embarquement</small><strong>${o.boarding}</strong></div></div></div><div class="client-request-box"><h3>Étape 3 — Demander la disponibilité des places</h3><div class="notice"><strong>Avant de cliquer sur le bouton :</strong> merci de renseigner votre nom, votre numéro de téléphone et le nombre de places souhaitées afin que le chauffeur reçoive correctement votre message.</div><div class="field-grid three"><div><label>Nom du responsable</label><input id="clientName_${o.id}" placeholder="Ex : Arielle Mba"></div><div><label>Téléphone</label><input id="clientPhone_${o.id}" placeholder="Ex : +241 66 12 34 56"></div><div><label>Nombre de places</label><select id="clientSeats_${o.id}">${clientSeatOptions(free,1)}</select></div></div><div class="notice warning"><strong>Important :</strong> à cette étape, le client ne paie pas encore. Il demande seulement au chauffeur si les places sont encore disponibles. Les noms des passagers seront demandés après confirmation.</div><button class="green request-btn" onclick="requestPlaces('${o.id}')" ${free<=0?'disabled':''}>Demander la disponibilité des places</button></div></div>`:''}</div>`
  }).join('')
}
async function requestPlaces(offerId){
  const o=offers().find(x=>x.id===offerId);
  const nameEl=$('clientName_'+offerId),phoneEl=$('clientPhone_'+offerId),seatsEl=$('clientSeats_'+offerId);
  const name=(nameEl?.value||'').trim(),phone=(phoneEl?.value||'').trim();
  const seats=Math.max(1,Number(seatsEl?.value||1));
  if(!name||!phone){alert('Avant de demander les places, renseigne le nom du responsable et son téléphone.');return}
  if(seats>freeSeats(o)){alert('Il ne reste pas assez de places dans ce véhicule.');return}
  await addDoc({type:'request',offerId:o.id,clientName:name,clientPhone:phone,groupLeader:name,paymentMode:seats>1?'group':'single',seats,passengerNames:[],passengerNamesPending:true,status:'pending',requestCode:'REQ-'+Math.floor(1000+Math.random()*9000),createdLabel:nowLabel(),source:'v33_client'});
  alert('Demande envoyée. Elle apparaît maintenant dans Booking / Disponibilités pour confirmation par le chauffeur.');
  selectedOfferId=offerId;
}
function passengerInputsForRequest(r){
  const count=Math.max(1,Number(r.seats||1));
  const existing=r.passengerNames||[];
  return Array.from({length:count},(_,i)=>`<div><label>Passager ${i+1}</label><input id="payPassenger_${r.id}_${i}" placeholder="Nom du passager ${i+1}" value="${existing[i]||''}"></div>`).join('')
}
async function payConfirmedRequest(requestId){
  const r=requests().find(x=>x.id===requestId);
  if(!r)return;
  const count=Math.max(1,Number(r.seats||1));
  const names=Array.from({length:count},(_,i)=>(document.getElementById(`payPassenger_${requestId}_${i}`)?.value||'').trim());
  if(names.some(n=>!n)){alert('Merci de renseigner le nom de chaque passager avant le paiement TACLAR.');return}
  await updateDoc(requestId,{status:'payment_pending',paymentDeclaredAt:Date.now(),passengerNames:names,passengerNamesPending:false});
  alert('Paiement déclaré. TACLAR doit maintenant confirmer la réception du paiement avant de débloquer les informations finales.');
}
function renderPayments(){
  const toPay=requests().filter(r=>r.status==='confirmed');
  const pendingPayment=requests().filter(r=>r.status==='payment_pending').sort((a,b)=>(b.paymentDeclaredAt||0)-(a.paymentDeclaredAt||0));
  $('toPayBox').innerHTML=(toPay.length?toPay.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};return `<div class="item"><strong>${r.groupLeader||r.clientName}</strong><div>${r.seats} place(s) confirmée(s) avec ${o.driver||'-'}</div><div class="notice success">Le chauffeur a confirmé la disponibilité. Complète les noms des passagers avant le paiement des frais TACLAR.</div><div class="field-grid">${passengerInputsForRequest(r)}</div><div class="row"><span>Total frais TACLAR</span><strong>${money(Number(r.seats||1)*taclarFee)}</strong></div><button class="orange" onclick="payConfirmedRequest('${r.id}')">Payer / déclarer les frais TACLAR</button></div>`}).join(''):'<div class="notice">Aucune place confirmée en attente de paiement.</div>')+
  (pendingPayment.length?`<h3 style="margin-top:14px">Paiements déclarés</h3>`+pendingPayment.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};return `<div class="item"><strong>${r.groupLeader||r.clientName}</strong><div>${r.seats} place(s) avec ${o.driver||'-'}</div><div class="notice warning">Paiement déclaré. TACLAR doit confirmer la réception Airtel Money. Les places restent bloquées pendant la vérification.</div></div>`}).join(''):'');
  const paid=requests().filter(r=>r.status==='paid').sort((a,b)=>(b.paidAt||0)-(a.paidAt||0));
  $('paidBox').innerHTML=paid.length?paid.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};return `<div class="item"><strong>Reçu ${r.paymentMode==='group'?'groupe':'individuel'}</strong><div class="row"><span>Responsable</span><strong>${r.groupLeader||r.clientName}</strong></div><div class="row"><span>Passagers</span><strong>${(r.passengerNames||[]).join(', ')}</strong></div><div class="row"><span>Axe</span><strong>${o.axis||'-'}</strong></div><div class="row"><span>Chauffeur</span><strong>${o.driver||'-'}</strong></div><div class="row"><span>Téléphone chauffeur</span><strong>${o.phone||'-'}</strong></div><div class="row"><span>Enregistrement</span><strong>${o.checkinTime||'-'}</strong></div><div class="row"><span>Départ</span><strong>${o.time||'-'}</strong></div><div class="row"><span>Embarquement</span><strong>${o.boarding||'-'}</strong></div><div class="row"><span>Total frais TACLAR</span><strong>${money(Number(r.seats||1)*taclarFee)}</strong></div><button class="blue" onclick="window.print()">Télécharger / imprimer le reçu</button></div>`}).join(''):'<div class="notice">Les informations complètes du chauffeur apparaissent ici après confirmation du paiement par TACLAR.</div>'
}

document.addEventListener('DOMContentLoaded',initFirebase);
