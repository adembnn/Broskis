---
name: threejs-game-ui-designer
description: "Design premium Three.js game UI: HUDs (including split-screen 1v1 real-time HUDs), menus, overlays, pause/win/lose screens, settings, icon controls, typography, responsive layout, safe areas, text fit, and UI/world cohesion."
---

# Three.js Game UI Designer

Make game UI intentional, readable, responsive, and specific to the genre.

Preserve the user's requested scope and style. For a narrow HUD fix, retain the existing design and check the changed state and target viewports. For a complete UI pass, use the full workflow below.

## Reference

`references/ui-patterns.md` — hierarchy and required states, HUD zones, menus, responsive constraints, style cohesion, and state wiring. For BROSKIS, also read `plan/recherche/ui-ux-temps-reel.md` (split-screen HUD mockup and grading grid) and `plan/PIVOT-TEMPS-REEL.md` (rules, keys, events).

## BROSKIS split-screen HUD (real-time 1v1, projected demo)

- Two half-views, vertical split: P1 left, P2 right. Mirror layout: lives + damage % at the outer top corner, the 3 weapon icons at the outer bottom, charge/block gauge under the weapons shown only while charging or blocking.
- Weapon icons are the real scanned stickers, each with a radial cooldown ring (fed by `PlayerState.cooldowns`), a pulse on `weapon:ready`, a bounce on `weapon:pick` (Snap crate). No "1.2s" text.
- Incoming threat: ring around the fighter plus an edge marker on the side of the shooter, from `projectile:incoming` (400 ms before impact).
- Projector legibility: % and banners ≥ 30 pt at 1080p, other text ≥ 24 pt, contrast ≥ 4.5:1, P1/P2 distinguishable in colour-blind simulation (shape or symbol backup). Neutral 2-4 px divider.
- Full-width banners only for READY? / GO! / GAME!; PERFECT! and KO stay in the concerned half-view. ≤ 8 HUD elements per half-view in combat.
- Performance: DOM overlay above the single canvas, updated once per frame for both players; animate only `transform` and `opacity`; write `textContent` only when the value changes; never read layout (`getBoundingClientRect`) in the frame loop.
- All in-game text in English. Colours, sizes and durations come from `src/art/tokens.js`.

## Workflow

1. Capture what exists, including a split-screen fight (`gameHooks.startMatch({ split: true })`, inputs via `gameHooks.input`) during impacts, block and KO, not just a static frame.
2. Inventory the UI states: countdown, fight, respawn, sudden death, pause, settings (key remapping), game over.
3. Set the hierarchy: survival and status, then incoming threats, then weapon readiness, then flavor.
4. Replace utility stat cards with authored clusters, meters, badges, icons, alerts, and modal states.
5. Use stable dimensions, safe-area padding, text-fit constraints, and hover/pressed/focus/disabled states.
6. Wire UI to game state and bus events rather than duplicating game rules inside UI code.
7. Check text fit and overlap with the longest likely values (999 %, long object names) in both half-views.

## What goes wrong

A generic dashboard of stat cards · UI covering a fighter or the incoming projectile · asymmetric P1/P2 layouts · generic weapon pictograms instead of the scanned object · HUD rewritten with `innerHTML` every frame · text that is readable on a laptop and invisible on a projector.

## Report

UI intent and states covered, files changed, split-screen screenshots in action, text-fit and overlap findings, symmetry and legibility measures, remaining risks.
