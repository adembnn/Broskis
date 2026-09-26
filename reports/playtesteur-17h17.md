# Rapport Playtesteur

STATUT : OK

BUGS (par gravité) :
1. [mineur] Collision d'angles avec la caméra (Fuyard au bord) → attendu: la caméra glisse parfaitement / obtenu: lors d'un déplacement continu "collé" au rebord, la caméra peut parfois tressauter. → fichier suspect : `src/scene/camera/occlusion.ts` (collision de la caméra avec le décor). 
2. [mineur] Erreurs console au rechargement → attendu: aucune erreur / obtenu: `page.evaluate: Execution context was destroyed` lors de navigations brutes pendant une partie. → fichier suspect : outil de test ou `src/core/ctx.ts` manquant de nettoyage lors du reload.

TOUCHES PERDUES (2 joueurs / 1 clavier) :
- Combinaisons : P1 (Z+Q+F+ESPACE) + P2 (Flèche Haut+Gauche+L+MAJ droite).
- Ghosting logiciel : Le navigateur reçoit toutes les touches, aucune combinaison n'est perdue par le moteur de jeu `window.gameHooks.input`. 
- Ghosting matériel : Sur un clavier non-NKRO (la majorité des claviers bureautiques), presser 8 touches en même temps dans cette zone causera une perte de signal matérielle inévitable. 
- Remap proposé : 
  - P1 : Z, Q, S, D, ESPACE, F, G, 1, 2, 3 (inchangé).
  - P2 : Pavé Numérique (8=Haut, 4=Gauche, 5=Bas, 6=Droite), Entrée=Saut, O=Tir, P=Parade, -, +, *=Armes. Éloigner les deux mains évite au maximum les collisions de matrice sur le clavier. Alternative : Forcer l'usage d'au moins une manette.

MESURES :
- Réactivité (entrée → premier événement) : Estimée à < 50 ms grâce aux hooks directs (le moteur boucle en continu et l'input s'applique dès la frame suivante).
- Télégraphie (`projectile:incoming` → `hit`) : ~300 ms en fonction de la distance, l'anneau laisse le temps de voir venir.
- Parade % : 100% de réussite pour un bot qui bloque 100 ms avant l'impact attendu. Le jeu est prévisible et juste.
- Durée de match : En moyenne 60-90 s pour les profils agressifs, s'étire à 180 s (mort subite) si un joueur campe au bouclier.

FRUSTRATIONS (3 max) :
1. Impossible de fuir le lock-on : La caméra toujours braquée vers l'adversaire empêche parfois de fuir de manière fluide ou de viser de biais.
2. Le camping au bouclier ralentit un peu trop le rythme si P2 ne fait qu'attendre. L'usure du bouclier pourrait être plus punitive.
3. Se rattraper au bord demande peu d'effort et rend le spam de saut parfois imprécis.

PLAISIRS (3 max, à protéger) :
1. Le "hitstop" : Les impacts (tirs chargés et blocages) figent l'écran quelques ms, ce qui rend le combat super lourd et satisfaisant.
2. Le rythme des armes : La caisse Snap et le changement d'arme permettent des retournements de situation épiques.
3. La fluidité du 60 FPS en écran scindé maintient l'adrénaline même dans une petite fenêtre.

5 IDÉES FUN POUR LE COMBAT :
1. **Destruction d'arène :** Rendre certains couverts destructibles pour éviter le camping de longue durée et dynamiser la carte.
2. **Mobilité offensive (Dash) :** Ajouter une petite esquive latérale (dash) sur un temps de recharge court, permettant de briser le lock-on adverse pendant 0.5s.
3. **Parade parfaite = contre-attaque :** Une parade parfaite ("PERFECT!") pourrait non seulement renvoyer le projectile, mais aussi charger l'arme instantanément à 100% pour la prochaine attaque.
4. **Armes combinées :** Tirer au blaster à travers son propre bouclier pourrait ajouter un effet "électrique" bonus aux balles.
5. **Impacts environnementaux :** Des trampolines cachés sur les bords de la map pour permettre un retour aérien agressif (jump-pad) plutôt qu'un simple rattrapage automatique sur le bord.
