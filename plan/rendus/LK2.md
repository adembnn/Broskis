# Rendu Lot LK2 - Parade Visuels

## Fait
- **3D (parry-fx)** (`src/scene/parry-fx/index.ts`, branché dans `src/scene/index.ts`) : création de l'anneau d'approche (3x la cible -> 1x la cible), de la bande dorée statique de la fenêtre PERFECT, du reflet en étoile + liseré rouge au tir, et de l'explosion d'étincelles au PERFECT. Un zoom (`camera.zoom`) et une désaturation via filtre CSS sur le canevas accompagnent le projectile sans nécessiter de modification sur le pipeline PostFX.
- **HUD (parry-hud)** (`src/ui/parry-hud/index.ts`, branché dans `src/ui/index.ts`) : jauges BRO latérales avec l'alerte "SUPER READY!", textes flottants projetés en 3D (ex: "!!", "PRESS SPACE") selon la touche de chaque défenseur, et textes stylisés façon sticker ("TOO EARLY", "PERFECT! x2") qui intègrent une règle d'aide contextuelle s'adaptant au niveau du joueur (s'efface à 5 réussites, revient à 2 ratés).
- **Sons (parry-cues)** (`src/audio/parry-cues/index.ts`, branché dans `src/audio/index.ts`) : tics temporels programmés sur WebAudio, clang montant d'un demi-ton par niveau de combo (streak), et filtre passe-bas appliqué sur le bus musical de l'AudioEngine.
- **Attaquant (aim.ts)** (`src/gameplay/aim.ts`) : implémentation du système de charge rythmique (400ms). Émission de feintes pour chaque pulsation et lancer forcé une fois le quota de feintes franchi (via la table `PARRY_WINDOWS`). Un relâchement précis à ±100ms d'une pulsation déclenche un tir `attack:nice`.

## Pas fait
- Rien, toutes les demandes de la spécification ont été traitées.

## Décisions prises seul
- Le bonus de +25% de dégâts lié au `attack:nice` est réalisé en multipliant temporairement la propriété `weapon.stats.a` par 1,25 juste avant le tir, avec une restauration planifiée sur l'événement `turn:end`. Cela permet de contourner avec souplesse l'interdiction stricte de toucher au module central `damage.ts`.
- L'effet de désaturation a été implémenté via une règle CSS sur le canvas 3D (`canvas.style.filter`) pour respecter la limite du budget des passes de post-traitement de la scène et éviter de modifier un chemin interdit (`postfx.ts`).
- Le zoom utilise la propriété `camera.zoom` plutôt que la propriété `fov`, cette dernière étant écrasée à chaque image par le `CameraDirector`.

## Frictions
- Attribuer un bonus de dégâts purement via `aim.ts` a demandé de l'ingéniosité (muter l'arme) afin d'éviter de briser la limitation d'édition de chemins.
- Les timings asynchrones partagés entre ThreeJS, l'audio et l'interface HTML sont particulièrement délicats à synchroniser sur le temps de `performance.now()`.