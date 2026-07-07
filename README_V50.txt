TACLAR Interurbain V50 - Patch module existant

Cette version ne remplace pas le design TACLAR existant. Elle charge le vrai module actuel depuis GitHub puis ajoute un patch V50.

Fichiers à mettre dans le même dossier GitHub que les pages TACLAR :
- taclar_v50_patch.js
- taclar_v50_patch.css

Les pages HTML fournies sont déjà prêtes et chargent :
- taclar_v29.css original
- firebase-config.js original
- taclar_v29.js original
- taclar_v50_patch.js nouveau

Nouveautés V50 :
- Blocage temporaire des places avec minuteur 15 minutes.
- Les statuts pending / confirmed / payment_declared bloquent les places seulement avant expiration.
- Bouton Paiement non reçu dans Validation TACLAR.
- Expiration automatique et remise des places disponibles.
- Bouton Expirer / libérer côté chauffeur/booking.
- Historique dans chaque demande.
- Export CSV dans Validation TACLAR.
