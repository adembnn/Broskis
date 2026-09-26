import type { FighterDef } from '../../core/types';

/**
 * Charge une vedette 3D générée (lot LP2).
 * Le modèle GLB contient l'armature KayKit et sera animé par le même contrôleur.
 */
export function loadVedette(nom: string): FighterDef {
  return {
    id: `vedette_${nom}`,
    name: nom.charAt(0).toUpperCase() + nom.slice(1),
    model: 'custom',
    hpMax: 100,
    power: 3,
    agility: 3,
    glbUrl: `/assets/vedettes/${nom}.glb`
  };
}
