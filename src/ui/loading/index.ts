// Lot LLOAD — composants de chargement réutilisables (direction « Vinyle »). Aucun n'a besoin d'être « installé » :
// chacun injecte sa feuille de style au premier usage. API :
//
//   coverMatchStart(ctx, () => ctx.hooks.startMatch(opts), mapId)
//       Rideau P1/P2 + logo entre le choix de la map et « READY? » : lance le match derrière, attend une scène prête
//       (fichiers, meshes, shaders compilés), gèle le temps de jeu pendant ce temps, émet 'transition:open' en ouvrant.
//   getCurtain()                      le rideau seul : close() / open() / setProgress(done, total)
//   mountForgeView({ photoUrl, label })  forge d'une arme en cours de génération ; brancher `update` sur
//       scanObject(blob, { onProgress: forge.update }) : faisceau de lecture, étincelles, nom qui s'écrit à l'arrivée
//       des données, sticker qui claque à son arrivée. forge.root à poser où l'on veut.
//   typewriter(el).set(texteConnuJusquIci)   texte qui s'écrit au fil de l'eau (flux : continue au lieu de recommencer)
//   mountTips(el) / nextTip()         astuces de jeu en anglais qui tournent pendant une attente
//   mountHeadForge({ photoUrl, player })   (lot LWAIT) attente du snap de la tête dans l'encart du joueur : étapes
//       réelles (traits → text → sheet → head), perso 3D qui se construit, tampon Ready!, échec avec boutons.
//   mountHeadPreview(fighter, player)      perso 3D seul ; `ready` = grosse tête posée ET dessinée.
export { coverMatchStart } from './match';
export { mountHeadForge, type HeadForge } from './headForge';
export { mountHeadPreview, type HeadPreview } from './headPreview';
export { getCurtain, type Curtain } from './curtain';
export { mountForgeView, type ForgeView } from './forge';
export { typewriter, type Typewriter } from './typewriter';
export { mountTips, nextTip, TIPS } from './tips';
