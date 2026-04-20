# X-Eater Game World Spec

## Intent

Build a legally distinct, XRift-native dot-chase game inspired by classic maze chase play. Do not use official character names, logos, audio, or maze layouts from existing IP.

## Player Roles

- Eater Controller: stays on the elevated pilot deck and controls the yellow eater piece.
- Guards: enter the maze in first person and physically chase the eater piece.
- Spectators: can stay in the lobby or pilot deck and use social boards.

## Round Rules

- Round duration: 120 seconds.
- Small pellet: 10 points.
- Large red cherry: 200 points.
- Guard catch radius: 1.15m.
- Catch penalty: -100 points and eater resets to start.
- Eater wins by collecting every pellet before time expires.
- Guards win if time expires first.

## v0 Acceptance Criteria

- Spawn is safe and faces the role board.
- Role selection can move the local player to deck or maze.
- Eater piece moves across walkable cells only.
- Pellet and cherry collection update shared score.
- Guard proximity can catch the eater.
- Overhead scoreboard is readable from both the deck and maze.
- Social surface exists via TagBoard and EntryLogBoard.

## Future Extensions

- Multi-eater mode.
- Power-pellet reversal phase.
- Guard abilities with cooldowns.
- Replay logs for best scores.
- Procedural maze variants after the fixed v0 layout is stable.
