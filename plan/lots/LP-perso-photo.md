# Lot LP · Perso depuis une photo (en direct)
Responsable : Adem (sous-agent Sonnet) · Coût : moyen · Dépend de : LI (serveur `api/`), LS (sticker)

## Tes chemins
`api/scan-fighter.ts`, `src/ia/fighter/**`, `src/scene/fighter-custom/**`

## Sortie attendue (10 à 20 s en tout)
1. **`api/scan-fighter.ts`** : photo d'une personne, vers Gemini vision en JSON.
   - Renvoie `{nickname, hairColor, hairStyle, outfitPrimary, outfitSecondary, accessory:'glasses'|'hat'|'beard'|'headphones'|'cap'|'none', stats:{hpMax,power,agility}, trait, catchphrase}`.
   - **Aucun attribut sensible, aucune photo stockée.** Tout le texte est en anglais.
2. **Nano Banana** : visage cartoon de la personne, fond `#FF00FF`, dans le style du jeu. Il sert de sticker sur la tête et de portrait sur la carte.
3. **`src/scene/fighter-custom/`** :
   - choix du corps KayKit le plus proche ;
   - recoloration avec `applyLook` (repris de `kaykit.js`) ;
   - accessoires fixés aux os (`head`) ;
   - visage sticker collé comme un masque (via LS).
   - Le squelette ne change pas, donc toutes les animations marchent.
4. **`src/ia/fighter/index.ts`** : `scanFighter(img) → FighterDef`, avec secours sur un perso prédéfini si ça échoue.

## Contrôles
`npm run build`. Test avec 3 photos (dont une sans visage) ; capture `--out captures/LP`.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
