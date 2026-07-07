TACLAR Interurbain V50 - Interface V46 gardee

Cette version conserve la previsualisation officielle avec le monsieur au telephone comme page d'accueil.

Fichiers a remplacer sur GitHub :
1) index.html  -> remet exactement l'interface/previsualisation V46 souhaitee
2) taclar_v29.js -> ajoute la logique V50 : minuteur, paiement non recu, expiration, liberation des places, historique
3) taclar_v29.css -> ajoute seulement les styles V50 necessaires, sans changer l'identite visuelle

Les autres pages HTML sont incluses pour reference, mais elles restent structurellement identiques : elles chargent taclar_v29.css et taclar_v29.js.

Important : ne pas remplacer index.html par une page prototype. Toujours garder cette previsualisation comme portail principal pour V50, V51, V52, etc.
