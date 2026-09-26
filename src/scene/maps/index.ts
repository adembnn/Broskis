// Lot LM : maps et décor dynamique. Remplace le stub L0 — voir plan/lots/LM-maps.md.
// Ce fichier ne fait qu'assembler : toute la logique vit dans engine.ts (moteur commun) + archipel/galion/
// cuisine.ts (données) ; api.ts expose les lectures pour les autres lots ; map-events/ pilote les tours.
import { install as installEngine } from './engine';
import type { Install } from '../../core/types';

export const install: Install = installEngine;
