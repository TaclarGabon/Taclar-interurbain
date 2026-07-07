
/* TACLAR Interurbain V50 - patch sécurité réservation
   Ajouts: minuteur, expiration, paiement non reçu, remise automatique des places, export CSV.
   Ce fichier garde le module existant et surcharge uniquement les fonctions nécessaires. */
(function(){
  const HOLD_MINUTES_DEFAULT = 15;
  const HOLD_MS = HOLD_MINUTES_DEFAULT * 60 * 1000;
  const HOLD_STATUSES = ['pending','confirmed','payment_declared'];
  const FINAL_STATUSES = ['paid','refused','deleted','expired'];
  const original = {};

  function getNow(){ return Date.now(); }
  function expireAt(minutes=HOLD_MINUTES_DEFAULT){ return getNow() + minutes * 60 * 1000; }
  function fmtTimeLeft(ms){
    ms = Math.max(0, Number(ms||0));
    const m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function isHoldStatus(r){ return r && HOLD_STATUSES.includes(r.status); }
  function holdExpired(r){ return isHoldStatus(r) && Number(r.holdExpiresAt||0) > 0 && Number(r.holdExpiresAt) <= getNow(); }
  function holdRemaining(r){ return Math.max(0, Number(r.holdExpiresAt||0) - getNow()); }
  function holdLabel(r){ return r && r.holdExpiresAt ? fmtTimeLeft(holdRemaining(r)) : '—'; }
  function safeMoney(n){ try{return money(n)}catch(e){return Number(n||0).toLocaleString('fr-FR')+' FCFA'} }
  function pushHistory(r, action, detail){
    const arr = Array.isArray(r.history) ? r.history.slice(-40) : [];
    arr.push({at:getNow(), action, detail: detail || ''});
    return arr;
  }
  function activeRequest(r){ return r && !FINAL_STATUSES.includes(r.status) && !holdExpired(r); }
  function v50RequestsForOffer(id){ try{return requests().filter(r=>r.offerId===id)}catch(e){return []} }

  original.liveReqsForOffer = window.liveReqsForOffer;
  window.liveReqsForOffer = function(id){ return v50RequestsForOffer(id).filter(activeRequest); };
  window.seatsTaken = function(offer){ return window.liveReqsForOffer(offer.id).reduce((s,r)=>s+Number(r.seats||1),0); };
  window.freeSeats = function(offer){ return Math.max(0, Number(offer.seats||0)-Number(offer.booked||0)-window.seatsTaken(offer)); };
  window.statusText = function(s){
    const map={submitted:'Documents en cours de traitement',docs_validated:'Documents approuvés - caution à déposer',deposit_paid:'Caution déposée - vérification TACLAR',deposit_validated:'Caution reçue - autorisation en attente',active:'Autorisé à publier',pending:'Demande envoyée - places bloquées temporairement',confirmed:'Places confirmées - paiement requis',payment_declared:'Paiement déclaré - validation TACLAR',paid:'Commission TACLAR payée',refused:'Refusée / annulée',deleted:'Supprimée',expired:'Réservation expirée',payment_not_received:'Paiement non reçu'};
    return map[s]||s||'-';
  };

  async function expireOne(r){
    if(!holdExpired(r))return false;
    await updateDoc(r.id,{status:'expired',expiredAt:getNow(),refusalReason:'Délai de paiement/validation expiré - places remises disponibles',holdReleasedAt:getNow(),history:pushHistory(r,'expiration','Places libérées automatiquement par le minuteur V50')});
    return true;
  }
  window.cleanupExpiredRequests = async function(){
    if(!window.db || !Array.isArray(window.docs))return;
    const expired = requests().filter(holdExpired);
    for(const r of expired){ try{ await expireOne(r); }catch(e){ console.warn('Expiration V50 non appliquée', e); } }
  };

  original.renderPage = window.renderPage;
  window.renderPage = function(){
    try{ cleanupExpiredRequests(); }catch(e){}
    return original.renderPage ? original.renderPage() : undefined;
  };

  window.confirmPlaces = async function(id){
    const r=requests().find(x=>x.id===id);
    if(!r)return alert('Demande introuvable.');
    if(holdExpired(r)){ await expireOne(r); alert('Cette demande a expiré. Les places sont remises disponibles.'); return; }
    await updateDoc(id,{status:'confirmed',confirmedAt:getNow(),holdStartedAt:getNow(),holdExpiresAt:expireAt(),holdMinutes:HOLD_MINUTES_DEFAULT,history:pushHistory(r,'confirmation_chauffeur',`Places confirmées. Paiement attendu avant ${new Date(expireAt()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`)});
  };

  window.declareClientPayment = async function(id){
    const r=requests().find(x=>x.id===id);
    if(!r)return alert('Demande introuvable.');
    if(holdExpired(r)){ await expireOne(r); alert('Le délai est expiré. Les places ont été libérées. Recommence la demande.'); return; }
    await updateDoc(id,{status:'payment_declared',paymentDeclaredAt:getNow(),holdExpiresAt:expireAt(),holdMinutes:HOLD_MINUTES_DEFAULT,history:pushHistory(r,'paiement_declare','Client déclare la commission payée. En attente validation TACLAR.')});
  };

  window.confirmClientPayment = async function(id){
    const r=requests().find(x=>x.id===id);
    if(!r)return alert('Demande introuvable.');
    if(holdExpired(r)){ await expireOne(r); alert('Le délai est expiré. Les places ont été libérées.'); return; }
    await updateDoc(id,{status:'paid',paidAt:getNow(),paymentValidatedAt:getNow(),holdReleasedAt:null,history:pushHistory(r,'paiement_confirme','Paiement reçu et validé par TACLAR.')});
  };

  window.paymentNotReceived = async function(id){
    const r=requests().find(x=>x.id===id);
    if(!r)return alert('Demande introuvable.');
    if(!confirm('Confirmer que la commission TACLAR n’a pas été reçue ? Les places seront remises disponibles.'))return;
    await updateDoc(id,{status:'refused',refusedAt:getNow(),paymentRejectedAt:getNow(),holdReleasedAt:getNow(),refusalReason:'Paiement non reçu par TACLAR - places remises disponibles',history:pushHistory(r,'paiement_non_recu','TACLAR a cliqué Paiement non reçu. Demande annulée et places libérées.')});
  };

  window.expireRequestNow = async function(id){
    const r=requests().find(x=>x.id===id);
    if(!r)return alert('Demande introuvable.');
    await updateDoc(id,{status:'expired',expiredAt:getNow(),holdReleasedAt:getNow(),refusalReason:'Réservation expirée manuellement - places remises disponibles',history:pushHistory(r,'expiration_manuelle','Expiration déclenchée par TACLAR.')});
  };

  original.renderDriverRequest = window.renderDriverRequest;
  window.renderDriverRequest = function(r,o){
    const passengerList=(r.passengerNames||[r.clientName]).join(', ');
    const reasonId='driver-reason-'+r.id;
    const remaining = isHoldStatus(r) ? `<div class="notice warning v50-timer">⏳ Minuteur V50 : ${holdLabel(r)} restant. Passé ce délai, les places reviennent disponibles.</div>` : '';
    return `<div class="item"><div class="item-top"><div><strong>${r.groupLeader||r.clientName}</strong><div class="muted">${o.axis||'-'} · ${r.seats} place(s) · ${r.requestCode||''}</div><div>${passengerList}</div></div><span class="badge ${r.status==='paid'?'ok':r.status==='pending'?'warn':r.status==='refused'||r.status==='expired'?'full':'warn'}">${statusText(r.status)}</span></div>${remaining}${r.status==='paid'?`<div class="notice success">Commission TACLAR payée. Rendez-vous le ${o.day||'-'} à ${o.checkinTime||'-'} au point d'embarquement : ${o.boarding||'-'}. Départ prévu : ${o.time||'-'}.</div>`:''}${r.status==='payment_declared'?'<div class="notice warning">Le client a déclaré le paiement. En attente de validation TACLAR.</div>':''}${r.status==='refused'||r.status==='expired'?`<div class="notice danger">Demande annulée. Motif : ${r.refusalReason||'Non précisé'}.</div>`:''}<div class="actions"><button onclick="confirmPlaces('${r.id}')" ${r.status!=='pending'?'disabled':''}>Confirmer place</button><select id="${reasonId}" ${r.status!=='pending'?'disabled':''}><option value="Véhicule déjà complet">Véhicule déjà complet</option><option value="Départ annulé">Départ annulé</option><option value="Horaire modifié">Horaire modifié</option><option value="Client à rappeler">Client à rappeler</option><option value="Autre motif">Autre motif</option></select><button class="ghost" onclick="refuseRequest('${r.id}','${reasonId}')" ${r.status!=='pending'?'disabled':''}>Refuser</button><button class="red" onclick="expireRequestNow('${r.id}')" ${!isHoldStatus(r)?'disabled':''}>Expirer / libérer</button></div></div>`;
  };

  window.renderBookingOffer = function(o){
    const all=v50RequestsForOffer(o.id);
    const pending=all.filter(r=>r.status==='pending'&&!holdExpired(r)).reduce((s,r)=>s+Number(r.seats||1),0);
    const declared=all.filter(r=>r.status==='payment_declared'&&!holdExpired(r)).reduce((s,r)=>s+Number(r.seats||1),0);
    const confirmed=all.filter(r=>['confirmed','paid'].includes(r.status)&&!holdExpired(r)).reduce((s,r)=>s+Number(r.seats||1),0);
    const free=freeSeats(o), closed=offerClosedStatus(o), canReserve=!closed&&free>0&&o.status==='Disponible';
    const state=closed||pending||declared?closed||`${pending+declared} place(s) en attente`:`${free} place(s) libres`;
    const cls=closed==='Complet'?'booking-complete':closed?'booking-cancelled':pending||declared?'booking-pending':'booking-free';
    if(closed){return `<div class="item compact-item ${cls} locked-offer"><strong>${o.driver}</strong> | ${o.axis} | ${o.day} | ${state}</div>`}
    const reserveAction=canReserve?`<a class="button-link blue" href="${clientReserveLink(o)}">Réserver</a>`:'';
    return `<details class="item compact-item ${cls}" open><summary><strong>${o.driver}</strong> | ${o.axis} | ${o.day} | ${state}</summary><div class="booking-offer-head"><div><div class="name">${o.driver}</div><div class="muted">${o.axis} · ${o.day} · Enregistrement ${o.checkinTime} · Départ ${o.time}</div><span class="badge ok">${state}</span></div><div class="booking-offer-price">${safeMoney(o.price)}<br>${reserveAction}</div></div><div class="facts booking-facts"><div class="fact"><small>Jour</small><strong>${o.day}</strong></div><div class="fact"><small>Enregistrement</small><strong>${o.checkinTime}</strong></div><div class="fact"><small>Départ</small><strong>${o.time}</strong></div><div class="fact"><small>Véhicule</small><strong>${o.vehicle}</strong></div><div class="fact"><small>Plaque</small><strong>${o.plate}</strong></div><div class="fact"><small>Places véhicule</small><strong>${Number(o.seats||0)} place(s)</strong></div><div class="fact free-left"><small>Places libres restantes</small><strong>${free} place(s)</strong></div><div class="fact"><small>Places confirmées/payées</small><strong>${confirmed}</strong></div><div class="fact"><small>Places en attente</small><strong>${pending+declared}</strong></div><div class="fact"><small>Embarquement</small><strong>${o.boarding}</strong></div></div><div class="notice warning">V50 : les places en attente sont bloquées temporairement. Si le paiement n’est pas validé dans le délai, elles redeviennent disponibles.</div></details>`;
  };

  window.renderBookingRequest = function(r,o){
    const passengerList=(r.passengerNames||[r.clientName]).join(', '), reasonId='reason-'+r.id;
    const remaining = isHoldStatus(r) ? `<div class="notice warning v50-timer">⏳ Minuteur V50 : ${holdLabel(r)} restant.</div>` : '';
    return `<div class="item"><div class="item-top"><div><strong>${r.groupLeader||r.clientName}</strong><div class="muted">${r.clientPhone} · ${r.seats} place(s) · ${r.requestCode||''} · ${r.createdLabel||''}</div><div>${passengerList}</div></div><span class="badge ${r.status==='paid'?'ok':r.status==='pending'?'warn':'full'}">${statusText(r.status)}</span></div>${remaining}${r.status==='paid'?`<div class="notice success">Commission TACLAR payée. Rendez-vous le ${o.day} à ${o.checkinTime} au point d'embarquement : ${o.boarding}. Départ prévu : ${o.time}.</div>`:''}${r.status==='refused'||r.status==='expired'?`<div class="notice danger"><strong>Demande annulée.</strong> Motif : ${r.refusalReason||'Non précisé'}.</div>`:''}<div class="actions"><button onclick="confirmPlaces('${r.id}')" ${r.status!=='pending'?'disabled':''}>Confirmer place</button><select id="${reasonId}" ${r.status!=='pending'?'disabled':''}><option value="Véhicule déjà complet">Véhicule déjà complet</option><option value="Départ annulé">Départ annulé</option><option value="Horaire modifié">Horaire modifié</option><option value="Client à rappeler">Client à rappeler</option><option value="Autre motif">Autre motif</option></select><button class="ghost" onclick="refuseRequest('${r.id}','${reasonId}')" ${r.status!=='pending'?'disabled':''}>Refuser</button><button class="red" onclick="deleteDocHard('${r.id}')" ${r.status==='paid'?'disabled':''}>Supprimer erreur</button></div></div>`;
  };

  window.renderClientPaymentValidation = function(r){
    const o=offers().find(x=>x.id===r.offerId)||{};
    return `<details class="item compact-item status-payment_declared" open><summary><strong>${r.groupLeader||r.clientName}</strong> | Chauffeur : ${o.driver||'-'} | ${r.seats} place(s) | Statut : paiement déclaré</summary><div class="facts"><div class="fact"><small>Client</small><strong>${r.groupLeader||r.clientName}</strong></div><div class="fact"><small>Téléphone client</small><strong>${r.clientPhone||'-'}</strong></div><div class="fact"><small>Chauffeur</small><strong>${o.driver||'-'}</strong></div><div class="fact"><small>Axe</small><strong>${o.axis||'-'}</strong></div><div class="fact"><small>Places</small><strong>${r.seats}</strong></div><div class="fact"><small>Montant TACLAR</small><strong>${safeMoney(Number(r.seats||1)*taclarFee)}</strong></div><div class="fact"><small>Code demande</small><strong>${r.requestCode||'-'}</strong></div><div class="fact"><small>Minuteur</small><strong>${holdLabel(r)}</strong></div></div><div class="actions"><button class="blue" onclick="confirmClientPayment('${r.id}')">Confirmer paiement reçu</button><button class="red" onclick="paymentNotReceived('${r.id}')">Paiement non reçu</button></div><div class="notice warning">V50 : si le paiement n’est pas reçu, clique “Paiement non reçu”. La demande sera annulée et les places redeviendront disponibles.</div></details>`;
  };

  original.requestPlaces = window.requestPlaces;
  window.requestPlaces = async function(offerId){
    const o=offers().find(x=>x.id===offerId);
    const mode=$('paymentMode').value,name=$('clientName').value.trim(),phone=$('clientPhone').value.trim();
    if(!name||!phone){alert('Remplissez le nom du responsable et son téléphone.');return}
    let passengerNames=[name],seats=1;
    if(mode==='group'){
      seats=Math.max(1,Number($('groupSeats').value||1));
      passengerNames=[...document.querySelectorAll('.groupName')].map(i=>i.value.trim()).filter(Boolean);
      if(passengerNames.length!==seats){alert('Remplissez les noms des '+seats+' passagers du groupe.');return}
    }
    const free=freeSeats(o);
    if(seats>free){alert(`Il ne reste que ${free} place(s) libre(s) dans ce véhicule.`);return}
    const requestCode=makeClientCode(phone);
    const ref=await addDoc({type:'request',offerId:o.id,clientName:name,clientPhone:phone,groupLeader:name,paymentMode:mode,seats,passengerNames,status:'pending',requestCode,createdLabel:nowLabel(),holdStartedAt:getNow(),holdExpiresAt:expireAt(),holdMinutes:HOLD_MINUTES_DEFAULT,history:[{at:getNow(),action:'demande_client',detail:'Places bloquées temporairement en attente de confirmation chauffeur.'}]});
    addClientSessionId(ref.id);
    alert(`Demande envoyée au chauffeur pour confirmation.\nRéférence TACLAR : ${requestCode}\nLes places sont bloquées temporairement pendant ${HOLD_MINUTES_DEFAULT} minutes.`);
    $('clientName').value='';$('clientPhone').value='';if(mode==='group')renderGroupNameInputs();renderPayments();
  };

  original.renderPayments = window.renderPayments;
  window.renderPayments = function(){
    if(original.renderPayments) original.renderPayments();
    const box=$('toPayBox'); if(!box)return;
    const activeIds=getClientSessionIds();
    const scoped=activeIds.length?requests().filter(r=>activeIds.includes(r.id)):[];
    const expired=scoped.filter(r=>['expired'].includes(r.status)).sort((a,b)=>(b.expiredAt||0)-(a.expiredAt||0));
    if(expired.length){
      box.innerHTML += `<h3 style="margin-top:14px">Demandes expirées</h3>` + expired.map(r=>{const o=offers().find(x=>x.id===r.offerId)||{};return `<div class="item status-expired"><strong>${r.groupLeader||r.clientName}</strong><div>${o.driver||'Chauffeur'} - ${o.axis||'-'}</div><div class="notice danger"><strong>Délai expiré.</strong><br>Les places ont été remises disponibles.</div></div>`}).join('');
    }
    box.querySelectorAll('.status-confirmed,.status-payment_declared').forEach(card=>{
      if(!card.querySelector('.v50-client-note')) card.insertAdjacentHTML('beforeend','<div class="notice warning v50-client-note">V50 : les places sont bloquées temporairement. Le paiement doit être validé avant expiration.</div>');
    });
  };

  window.exportV50CSV = function(){
    const rows=[['Date creation','Code','Statut','Client','Telephone client','Chauffeur','Axe','Places','Montant commission','Expiration','Motif']];
    requests().forEach(r=>{const o=offers().find(x=>x.id===r.offerId)||{};rows.push([new Date(r.createdAt||Date.now()).toLocaleString('fr-FR'),r.requestCode||'',statusText(r.status),r.groupLeader||r.clientName||'',r.clientPhone||'',o.driver||'',o.axis||'',r.seats||1,Number(r.seats||1)*taclarFee,r.holdExpiresAt?new Date(r.holdExpiresAt).toLocaleString('fr-FR'):'',r.refusalReason||'']);});
    const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='taclar_interurbain_v50_historique.csv'; a.click(); URL.revokeObjectURL(url);
  };

  original.renderValidation = window.renderValidation;
  window.renderValidation = function(){
    if(original.renderValidation) original.renderValidation();
    setTimeout(()=>{const app=$('app'); if(app && !document.getElementById('v50ExportBtn')){app.insertAdjacentHTML('beforeend','<div class="card v50-card"><h2>Historique V50</h2><p>Exporter les demandes, statuts, montants, chauffeurs et clients pour le suivi administratif.</p><button id="v50ExportBtn" class="blue" onclick="exportV50CSV()">Exporter historique CSV</button></div>');}},50);
  };

  setInterval(()=>{ try{ cleanupExpiredRequests(); if(typeof renderPage==='function') renderPage(); }catch(e){} }, 30000);
})();
