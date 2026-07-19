TACLAR V47.5 - Correction espace client

Sur GitHub :
1. Remplacer taclar_client.html
2. Ajouter taclar_v47_5.js
3. Conserver taclar_v47_4.js temporairement jusqu'a validation, puis il pourra etre supprime.

Correction : a chaque nouvelle ouverture ou actualisation de la page Client, le suivi local repart vierge. Les anciennes reservations restent dans Firebase et peuvent etre retrouvees uniquement avec la reference TACLAR et le telephone.
