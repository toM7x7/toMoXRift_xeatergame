# X-Eater Game

XRift world for a multiplayer dot-chase maze.

One participant controls a yellow eater piece from an overhead pilot deck. Other participants enter the maze as guards and try to catch the eater before it collects pellets and a large red cherry.

## v0 Loop

- Spawn in the lobby.
- Select either `イーター操縦者` or `ガード`.
- The eater controller is teleported to the overhead deck.
- Guards are teleported into the maze.
- Start a 120 second round.
- The eater collects small pellets and the large red cherry.
- Guards catch the eater by moving close to the yellow piece.
- The overhead scoreboard shows time, score, collected pellets, catches, and result.

## Geometry

- Maze grid: `21 x 13`
- Cell size: `1.8m`
- Maze footprint: `37.8m x 23.4m`
- Floor footprint: `45.8m x 41.4m`
- Wall height: `2.4m`
- Wall block width/depth: `1.72m`
- Pilot deck height: `7.2m`

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Release

Use the workspace XRift release routine:

```bash
npx @xrift/cli@latest whoami
npx @xrift/cli@latest upload world
```
