# 8 objets physiques de démo

Objets réels à avoir sous la main pendant la démo (table à côté de la webcam), choisis pour être :
- **fiables à scanner** : silhouette simple, une seule couleur dominante ou motif net, pas de
  surface trop réfléchissante/transparente (le verre et le métal poli perturbent Gemini vision et
  le détourage Nano Banana) ;
  taille de poche à taille d'objet de bureau (tient dans le cadre webcam à ~40 cm) ;
- **drôles** : le nom d'arme et la réplique générée doivent faire sourire le jury ;
- **couvrant les 4 catégories** d'armes du jeu (`blaster` / `grenade` / `throwable` / `shield`), pour
  montrer que le mapping objet → catégorie n'est pas câblé en dur objet par objet.

| # | Objet | Catégorie visée | Pourquoi ce mapping (le trait/l'IA improvise, ceci est l'intention) | Fiabilité de scan |
|---|---|---|---|---|
| 1 | Mug de café (Coffee Mug) | blaster | Jet de café brûlant en rafale continue | Silhouette simple, anse reconnaissable, mat |
| 2 | Banane (Banana) | throwable | Lancer lourd et glissant (trait `slippery`) qui fait déraper l'adversaire | Forme et couleur jaune très distinctives |
| 3 | Smartphone (éteint, écran noir) | grenade | « Notification explosive » qui vibre puis éclate en zone | Rectangle net, mais éviter un écran allumé (reflets) |
| 4 | Peluche (Plush toy) | shield | Doudou-bouclier réconfortant, trait `healing` | Textures douces, silhouette ronde, très reconnaissable |
| 5 | Bouteille d'eau (souple, non transparente ou à moitié pleine) | grenade | Éclaboussure en zone à l'impact | Préférer une bouteille mate/colorée à une bouteille en verre transparent |
| 6 | Basket / chaussure de sport (Sneaker) | throwable | Lancer classique « jet de chaussure », fort recul | Forme complexe mais très contrastée, bon test de robustesse |
| 7 | Livre à couverture rigide (Book) | shield | Se pose à plat comme un mur-sticker | Rectangle plat, motif de couverture = bon test de détourage |
| 8 | Casque audio (Headphones) | blaster | « Sound blast », rafale sonore, trait `loud` | Forme arrondie symétrique, contraste net sur fond de table |

## Utilisation

- Objets 1, 4 et 8 sont les priorités absolues : armes de départ pré-cachées (Adem et les 2 autres
  armes de Titouan) ; peluche et casque en solution de repli si l'objet du juré rate le scan.
- L'objet du juré (scanné en direct à 0:26–0:42, pendant l'arsenal, voir `demo/SCRIPT.md`) est
  volontairement inconnu à l'avance : c'est la preuve live que ça marche sur n'importe quoi. Depuis le
  pivot temps réel, la Caisse Snap ne scanne plus en direct : elle donne une arme déjà scannée.
- Pré-générer le cache IA (catégorie/stats/trait/répliques + sticker) pour les objets 1 à 8 fait
  partie du lot LI (pipeline IA) — coordination avec Adem, cache attendu dans
  `public/demo-cache/` (utilisé automatiquement en mode `?demo=1`).
