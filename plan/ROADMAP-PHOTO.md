# Feuille de route · « Je prends une photo, ça arrive dans le jeu » (objets + persos)
La feature n° 1 selon Adem (15h55) : **une chaise n'est pas une canette** ; ce qui vole, c'est CET objet, avec sa physique réelle ; deux amis photographiés se voient se battre en écran scindé.

## Ce qui est déjà là (fusionné)
- Scan d'objet : Gemini 3.8 Flash pour les stats (environ 2-3 s), Nano Banana Pro pour le sticker (environ 15-17 s), forge animée, sticker qui arrive en retard branché en main (LSCAN-OBJ, LUX, LLOAD).
- Objet en main, en vol, à l'impact (LATK1). Perso tiré d'une photo : corps KayKit recoloré + visage en sticker (LP) ; voix du joueur clonée par Gradium (LW2).
- Contrat de physique réelle : `Weapon.physics = { massKg, sizeM, material, shape, bounciness, fragile, liquid }` (commit 8b5881f).

## Étapes et horaire
| Heure | Étape | Qui |
|---|---|---|
| 15h55 → 16h15 | **Recherche des contraintes** : physique depuis une photo (R1), photo → 3D rapide (R2), photo → perso ressemblant (R3). Rendus dans `plan/recherche/`. | 3 agents Sonnet |
| 15h50 → 16h40 | **Physique v1** : Gemini estime la physique, `deriveStats` en déduit dégâts, recul, vitesse, portée et recharge (le code arbitre), physique des 8 armes préréglées, **page labo `/scan-lab.html`** (photo → JSON → stats → sticker → 3D → lancer simulé, comparaison canette / chaise). | LSCAN (Opus) |
| 15h50 → 16h40 | **Physique en jeu** : masse → vitesse, portée, cloche, dégâts, recul, recharge ; rebond ; fragile = éclats ; liquide = sol glissant. | RTCORE (Opus) |
| 15h50 → 16h40 | **Physique visible** : taille réelle (bornée), épaisseur, rotation en vol selon la forme, poids ressenti, impact selon la matière. | LATK1 (Opus) |
| 15h40 → 16h40 | **Perso ressemblant** : grosse tête au portrait cartoon, couleurs de la tenue, prénom, voix clonée, les 2 persos côte à côte. | LFACE (Opus) |
| 16h40 → 17h10 | **Tests avec les photos réelles d'Adem** sur la page labo et en match ; retours d'Adem et Titouan. | Adem, Titouan, Claude |
| 17h10 → 17h50 | **Corrections** + meilleure piste 3D de R2 (profondeur ou vraie 3D rapide, si elle tient) + cache de démo pour les objets de la démo. | agents |
| 18h00 | **Gel** | — |
| 18h → 19h | Répétition avec de vrais objets, vidéo de secours, opt-in à 19h. | équipe |

## Ce qu'il faut d'Adem
1. **Photos de test** (le plus utile) : 10 objets variés (canette, bouteille, chaise, chaussure, banane, livre, tasse, parapluie, peluche, téléphone), pris au téléphone, dans `tools/scan-bench/photos/objets/`. Ce dossier reste local et est ignoré par git. Facultatif, avec l'accord des personnes : 1 photo de face d'Adem et 1 de Titouan dans `tools/scan-bench/photos/personnes/`, gardées en local, jamais publiées.
2. Chrome sur la carte NVIDIA (Windows → Graphiques → Hautes performances).
3. Facultatif : un jeton Hugging Face gratuit, pour la vraie 3D rapide (voir R2).

## Risques et parades
| Risque | Parade |
|---|---|
| Échelle ambiguë sur une photo seule | Tailles et masses typiques par type d'objet (R1), bornes dans le code. |
| Refus de sécurité sur les visages | Consignes testées (R3), perso par défaut en repli. |
| Latence du sticker (15 s) | Stats en 2-3 s ; on joue avec l'arme avant que le sticker arrive. |
| Réseau de la salle | Cache de démo (`?demo=1`). |
| PC du jury | Qualité adaptative (LPERF). |
| Hébergement itch.io statique | L'IA aura besoin d'un petit serveur séparé ou d'une clé restreinte au domaine. À trancher avec Adem. |
