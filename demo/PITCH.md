# Le pitch oral — devant le jury, autour de la démo live de 20h

> Discours à dire à voix haute, avant / après la démo de 2 minutes (`demo/SCRIPT.md`). Pas un
> script figé mot à mot : à répéter jusqu'à ce que ça sorte naturellement, pas récité.
> Contexte qui change la fin du pitch (`plan/NOUVELLES.md`, 16h10) : **les jurés testeront le jeu
> eux-mêmes sur leur PC après notre passage** (hébergement itch.io, mode solo vs IA `RTBOT` pour un
> juré seul) — le pitch doit préparer ce moment-là, pas juste conclure sur le silence après le KO.

## Le fil : pourquoi ce jeu, dans cet ordre

1. **Accroche universelle** : tout le monde a déjà transformé un objet du quotidien en arme en
   jouant, enfant (un coussin, un magazine roulé, une télécommande). C'est un souvenir partagé,
   immédiat, pas besoin d'expliquer les règles d'un jeu vidéo pour que ça parle.
2. **Le twist** : on l'a rendu réel, en 3D, en quelques secondes, avec de vrais objets — et
   maintenant en temps réel, à deux amis, écran scindé, chacun devenu SOI-MÊME dans le jeu.
3. **Pourquoi c'est impossible sans IA** (le critère DeepMind) : rien n'est pré-fabriqué. Pas de
   bibliothèque d'assets, pas de liste d'objets reconnus à l'avance. Gemini regarde un visage, un
   mug, une banane, et invente à chaque fois — catégorie, stats, réplique, voix, sticker 3D. Deux
   parties ne se ressemblent jamais parce que deux tables ne se ressemblent jamais.
4. **Pourquoi c'est addictif** (le critère Voodoo) : boucle courte, un ami à côté de soi, aucune
   configuration mentale — on comprend en regardant, pas en lisant un tutoriel.
5. **La suite après le silence du KO** : contrairement à une démo qu'on regarde passivement, celle-ci
   se rejoue — dans quelques minutes, ce sera le tour du jury, sur leurs propres machines, seuls
   s'il le faut (l'IA jouera l'adversaire).

## Version courte (≈ 30 s, avant la démo)

> « Everyone here has turned a pillow into a shield or a rolled-up magazine into a sword at some
> point. We built that — for real. This is BROSKIS: you snap a photo, you become your own fighter in
> the game. You snap any object around you, it becomes your weapon — stats, voice, 3D model, all
> invented on the spot by Gemini. No asset library, no pre-made list: it works on literally anything.
> Two friends, one keyboard, split screen, real time. Let's show you. »

*(→ démo de 2 minutes)*

## Clôture (≈ 20 s, juste après le KO / l'écran de fin)

> « Everything you just saw become a weapon was generated live — nothing was pre-made for this
> demo. And you don't have to take our word for it: in a few minutes it'll be on your own laptops.
> If you're alone, our AI opponent will fight you. Grab something off your desk — it's your weapon
> now. »

## Version longue (≈ 55–60 s, si on a le temps ou en aparté après)

> « Think about the last time you play-fought with a friend using whatever was lying around — that
> instinct is universal, and it's the whole idea behind BROSKIS.
>
> Here's what makes it only possible right now, with this kind of AI: when you snap a photo of
> yourself, Gemini doesn't pick from a list of pre-made characters — it looks at YOUR face and
> builds a fighter around it, in seconds. When you snap an object — a mug, a banana, a shoe — Gemini
> decides what kind of weapon it becomes, gives it stats, a personality, even a shouted voice line,
> and our pipeline turns the photo itself into a 3D sticker weapon you hold in your hand. Nothing is
> pre-made. There's no database of "known objects" — it works on whatever is actually on the table,
> which means every match, every room, every pair of friends gets a genuinely different game.
>
> It's real-time now, third-person, split screen, two friends on one keyboard — because the fastest
> way to know a game is fun is to watch two people who don't know the rules yet start laughing
> within ten seconds. That's the Voodoo bar we're aiming for: understood instantly, replayed
> immediately.
>
> And this isn't just a demo you watch — in a few minutes it'll be running on your own laptop. Play
> it yourself, alone if you want, our AI will fight you. Grab whatever's on your desk. It's your
> weapon now. »

## Notes de répétition

- **Chronométrer les 3 versions séparément** avec `demo/SCRIPT.md` (3 répétitions minimum avant
  19h30, comme prévu). La version courte doit vraiment tenir sous 30 s à l'oral, pas seulement à la
  lecture silencieuse.
- Garder la toute première phrase **courte et dite lentement** : c'est elle qui capte l'attention
  du jury avant même la première image du jeu (règle du `CLAUDE.md` : compris en 3 secondes).
- Le passage sur l'auto-hébergement itch.io / le fait que le jury va jouer lui-même n'a de sens
  QUE si `npm run demo`/l'export itch.io est prêt à ce moment-là (lot en cours côté Adem, voir
  `plan/NOUVELLES.md` 16h10) — sinon couper cette phrase de la clôture et finir simplement sur
  « Grab something. It's your weapon now. » sans la promesse concrète du « sur vos machines ».
- Qui dit quoi entre Titouan et Adem : à décider ensemble à la répétition, pas figé ici — mais
  éviter qu'une seule personne parle 60 s d'affilée sans que l'autre intervienne, ça casse le
  rythme du live.
