import { RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  EntryLogBoard,
  Interactable,
  SpawnPoint,
  TagBoard,
  useInstanceState,
  useTeleport,
  useUsers,
  type PlayerMovement,
  type User,
} from '@xrift/world-components'
import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface WorldProps {
  position?: [number, number, number]
  scale?: number
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'idle'
type GameMode = 'lobby' | 'playing' | 'result'

type Cell = {
  col: number
  row: number
}

type CherryState = {
  active: boolean
  collected: boolean
  cell: Cell
}

type XState = {
  mode: GameMode
  roundStartedAt: number | null
  roundDurationSec: number
  pacControllerId: string | null
  monsterIds: string[]
  pacCell: Cell
  pacDirection: Direction
  pellets: Record<string, boolean>
  cherry: CherryState
  score: number
  catches: number
  lastCaughtAt: number | null
  winner: 'eater' | 'guards' | null
}

const LOCAL_DEV_USER: User = {
  id: 'local-dev-player',
  displayName: 'Local Player',
  avatarUrl: null,
  isGuest: true,
}

const CELL_SIZE = 1.8
const WALL_HEIGHT = 2.4
const WALL_THICKNESS = 1.72
const FLOOR_HEIGHT = 0.18
const DECK_Y = 7.2
const ROUND_DURATION_SEC = 120
const PAC_STEP_MS = 260
const CATCH_RADIUS = 1.15
const CATCH_COOLDOWN_MS = 2200
const START_CELL: Cell = { col: 1, row: 1 }
const CHERRY_CELL: Cell = { col: 17, row: 1 }
const MONSTER_SPAWN_CELL: Cell = { col: 10, row: 5 }
const LOBBY_SPAWN: [number, number, number] = [0, 1.6, 18]
const DECK_SPAWN: [number, number, number] = [0, DECK_Y + 1.6, 7.6]

const MAZE_ROWS = [
  '#####################',
  '#P....#.....#....C..#',
  '#.###.#.###.#.###.#.#',
  '#...#...#...#...#...#',
  '###.#.###.#.###.#.###',
  '#...#.....H.....#...#',
  '#.#.#####.#.#####.#.#',
  '#.#.......#.......#.#',
  '#.###.###.#.###.###.#',
  '#.....#...#...#.....#',
  '#.###.#.#####.#.###.#',
  '#C....#.......#....M#',
  '#####################',
] as const

const GRID_ROWS = MAZE_ROWS.length
const GRID_COLS = MAZE_ROWS[0].length
const MAZE_WIDTH = GRID_COLS * CELL_SIZE
const MAZE_DEPTH = GRID_ROWS * CELL_SIZE
const FLOOR_WIDTH = MAZE_WIDTH + 8
const FLOOR_DEPTH = MAZE_DEPTH + 18

function keyForCell(cell: Cell) {
  return `${cell.col}:${cell.row}`
}

function cellToWorld(cell: Cell): [number, number, number] {
  const x = (cell.col - (GRID_COLS - 1) / 2) * CELL_SIZE
  const z = (cell.row - (GRID_ROWS - 1) / 2) * CELL_SIZE
  return [x, 0, z]
}

function isWall(cell: Cell) {
  if (cell.row < 0 || cell.row >= GRID_ROWS || cell.col < 0 || cell.col >= GRID_COLS) {
    return true
  }
  return MAZE_ROWS[cell.row][cell.col] === '#'
}

function isWalkable(cell: Cell) {
  return !isWall(cell)
}

function directionToDelta(direction: Direction): Cell {
  switch (direction) {
    case 'up':
      return { col: 0, row: -1 }
    case 'down':
      return { col: 0, row: 1 }
    case 'left':
      return { col: -1, row: 0 }
    case 'right':
      return { col: 1, row: 0 }
    default:
      return { col: 0, row: 0 }
  }
}

function getPelletCells() {
  const cells: Cell[] = []

  MAZE_ROWS.forEach((row, rowIndex) => {
    Array.from(row).forEach((tile, colIndex) => {
      if (tile === '.' || tile === 'P' || tile === 'M') {
        cells.push({ col: colIndex, row: rowIndex })
      }
    })
  })

  return cells
}

const PELLET_CELLS = getPelletCells()
const PELLET_COUNT = PELLET_CELLS.length

function createInitialState(): XState {
  return {
    mode: 'lobby',
    roundStartedAt: null,
    roundDurationSec: ROUND_DURATION_SEC,
    pacControllerId: null,
    monsterIds: [],
    pacCell: START_CELL,
    pacDirection: 'idle',
    pellets: {},
    cherry: {
      active: true,
      collected: false,
      cell: CHERRY_CELL,
    },
    score: 0,
    catches: 0,
    lastCaughtAt: null,
    winner: null,
  }
}

function getDisplayName(user: User | null | undefined, fallback: string) {
  return user?.displayName || fallback
}

function distance2D(a: [number, number, number], b: PlayerMovement['position']) {
  return Math.hypot(a[0] - b.x, a[2] - b.z)
}

function moveCell(cell: Cell, direction: Direction) {
  const delta = directionToDelta(direction)
  const next = {
    col: cell.col + delta.col,
    row: cell.row + delta.row,
  }
  return isWalkable(next) ? next : cell
}

function countCollectedPellets(pellets: Record<string, boolean>) {
  return Object.values(pellets).filter(Boolean).length
}

function SkyDome() {
  return (
    <group>
      <mesh position={[0, 34, 0]}>
        <sphereGeometry args={[120, 32, 16]} />
        <meshBasicMaterial color="#1f2a55" side={1} />
      </mesh>
      <mesh position={[0, 10, -58]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[14, 26, 64]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

function WallCell({ cell }: { cell: Cell }) {
  const [x, , z] = cellToWorld(cell)

  return (
    <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={1}>
      <mesh position={[x, WALL_HEIGHT / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#233269" roughness={0.72} metalness={0.05} />
      </mesh>
    </RigidBody>
  )
}

function Pellet({ cell, collected }: { cell: Cell; collected: boolean }) {
  if (collected) return null
  const [x, , z] = cellToWorld(cell)

  return (
    <mesh position={[x, 0.28, z]}>
      <sphereGeometry args={[0.12, 10, 10]} />
      <meshStandardMaterial color="#fff4b8" emissive="#ffe58a" emissiveIntensity={0.75} />
    </mesh>
  )
}

function Cherry({ state }: { state: CherryState }) {
  if (!state.active || state.collected) return null
  const [x, , z] = cellToWorld(state.cell)

  return (
    <group position={[x, 0.58, z]}>
      <mesh>
        <sphereGeometry args={[0.42, 24, 18]} />
        <meshStandardMaterial color="#ef233c" emissive="#ff6b6b" emissiveIntensity={0.62} />
      </mesh>
      <mesh position={[0.16, 0.28, 0]} rotation={[0.3, 0, -0.5]}>
        <cylinderGeometry args={[0.025, 0.025, 0.55, 8]} />
        <meshStandardMaterial color="#2f9e44" />
      </mesh>
    </group>
  )
}

function EaterPiece({ cell, direction }: { cell: Cell; direction: Direction }) {
  const [x, , z] = cellToWorld(cell)
  const mouthRotation = direction === 'left'
    ? Math.PI
    : direction === 'up'
      ? Math.PI / 2
      : direction === 'down'
        ? -Math.PI / 2
        : 0

  return (
    <group position={[x, 0.62, z]} rotation={[0, mouthRotation, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.58, 32, 22, 0.28, Math.PI * 1.75]} />
        <meshStandardMaterial color="#ffd60a" emissive="#ffb703" emissiveIntensity={0.42} roughness={0.45} />
      </mesh>
      <mesh position={[0.16, 0.28, -0.34]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  )
}

function ControlButton({
  id,
  label,
  position,
  color,
  onInteract,
}: {
  id: string
  label: string
  position: [number, number, number]
  color: string
  onInteract: () => void
}) {
  return (
    <Interactable id={id} interactionText={label} onInteract={onInteract} type="button">
      <group position={position}>
        <mesh castShadow>
          <boxGeometry args={[1.4, 0.32, 1.0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
        </mesh>
        <Text position={[0, 0.24, 0.02]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.24} color="#ffffff" anchorX="center">
          {label}
        </Text>
      </group>
    </Interactable>
  )
}

function RoleBoard({
  state,
  localUserId,
  localName,
  pacName,
  monsterNames,
  onSelectPac,
  onJoinMonster,
  onStart,
  onReset,
}: {
  state: XState
  localUserId: string
  localName: string
  pacName: string
  monsterNames: string[]
  onSelectPac: () => void
  onJoinMonster: () => void
  onStart: () => void
  onReset: () => void
}) {
  const localRole = state.pacControllerId === localUserId
    ? 'イーター操縦者'
    : state.monsterIds.includes(localUserId)
      ? 'ガード'
      : '未選択'

  return (
    <group position={[0, 2.2, 16.3]} rotation={[0, Math.PI, 0]}>
      <mesh>
        <boxGeometry args={[9.5, 4.2, 0.28]} />
        <meshStandardMaterial color="#111827" emissive="#1e293b" emissiveIntensity={0.3} />
      </mesh>
      <Text position={[0, 1.55, -0.2]} fontSize={0.42} color="#f8fafc" anchorX="center">
        X-Eater Game / 役割選択
      </Text>
      <Text position={[0, 1.0, -0.2]} fontSize={0.2} color="#c7d2fe" anchorX="center">
        上部デッキで黄色い駒を操作。迷路内の参加者はガードとして追跡します。
      </Text>
      <Text position={[0, 0.56, -0.2]} fontSize={0.19} color="#fef3c7" anchorX="center">
        {`あなた: ${localName} / 役割: ${localRole}`}
      </Text>
      <Text position={[0, 0.18, -0.2]} fontSize={0.18} color="#bbf7d0" anchorX="center">
        {`操縦者: ${pacName} / ガード: ${monsterNames.length ? monsterNames.join(', ') : '未参加'}`}
      </Text>
      <ControlButton id="select-eater" label="操縦者になる" position={[-2.8, -0.8, -0.36]} color="#f59e0b" onInteract={onSelectPac} />
      <ControlButton id="select-guard" label="ガードになる" position={[0, -0.8, -0.36]} color="#2563eb" onInteract={onJoinMonster} />
      <ControlButton id="start-round" label="開始" position={[2.8, -0.8, -0.36]} color="#16a34a" onInteract={onStart} />
      <ControlButton id="reset-round" label="リセット" position={[0, -1.5, -0.36]} color="#64748b" onInteract={onReset} />
    </group>
  )
}

function PilotDeck({
  state,
  isPacController,
  onDirection,
}: {
  state: XState
  isPacController: boolean
  onDirection: (direction: Direction) => void
}) {
  const enabledText = isPacController ? '操作中: ボタンまたはWASD' : '観戦席: 操縦者だけ操作できます'

  return (
    <group position={[0, DECK_Y, 0]}>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={1}>
        <mesh receiveShadow>
          <boxGeometry args={[11.5, 0.24, 7.2]} />
          <meshStandardMaterial color="#0f172a" transparent opacity={0.92} />
        </mesh>
      </RigidBody>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[10.5, 0.04, 6.2]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.22} transparent opacity={0.28} />
      </mesh>
      <Text position={[0, 1.0, -2.6]} fontSize={0.34} color="#e0f2fe" anchorX="center">
        上部操作デッキ
      </Text>
      <Text position={[0, 0.62, -2.6]} fontSize={0.18} color="#f8fafc" anchorX="center">
        {enabledText}
      </Text>
      <Text position={[0, 0.28, -2.6]} fontSize={0.18} color="#fde68a" anchorX="center">
        {`方向: ${state.pacDirection} / スコア: ${state.score}`}
      </Text>
      <ControlButton id="pac-up" label="上" position={[0, 0.35, -0.9]} color="#f59e0b" onInteract={() => onDirection('up')} />
      <ControlButton id="pac-left" label="左" position={[-1.65, 0.35, 0.4]} color="#f59e0b" onInteract={() => onDirection('left')} />
      <ControlButton id="pac-right" label="右" position={[1.65, 0.35, 0.4]} color="#f59e0b" onInteract={() => onDirection('right')} />
      <ControlButton id="pac-down" label="下" position={[0, 0.35, 1.7]} color="#f59e0b" onInteract={() => onDirection('down')} />
    </group>
  )
}

function Scoreboard({
  state,
  remainingSec,
  collectedPellets,
}: {
  state: XState
  remainingSec: number
  collectedPellets: number
}) {
  const status = state.mode === 'playing'
    ? 'PLAYING'
    : state.mode === 'result'
      ? state.winner === 'eater'
        ? 'EATER CLEAR'
        : 'GUARDS WIN'
      : 'LOBBY'

  return (
    <group position={[0, 5.2, -15.2]}>
      <mesh>
        <boxGeometry args={[13.5, 2.8, 0.35]} />
        <meshStandardMaterial color="#020617" emissive="#0f172a" emissiveIntensity={0.44} />
      </mesh>
      <Text position={[0, 0.86, -0.24]} fontSize={0.38} color="#f8fafc" anchorX="center">
        {`X-EATER SCORE / ${status}`}
      </Text>
      <Text position={[0, 0.22, -0.24]} fontSize={0.28} color="#fde047" anchorX="center">
        {`SCORE ${state.score}  TIME ${remainingSec}s  PELLETS ${collectedPellets}/${PELLET_COUNT}`}
      </Text>
      <Text position={[0, -0.42, -0.24]} fontSize={0.24} color="#fca5a5" anchorX="center">
        {`CATCH ${state.catches}  CHERRY ${state.cherry.collected ? 'GET' : 'LIVE'}  GUARDS ${state.monsterIds.length}`}
      </Text>
    </group>
  )
}

function Legend() {
  return (
    <group position={[-14.8, 1.5, 15.9]} rotation={[0, Math.PI, 0]}>
      <mesh>
        <boxGeometry args={[5.6, 2.1, 0.2]} />
        <meshStandardMaterial color="#172554" emissive="#1d4ed8" emissiveIntensity={0.18} />
      </mesh>
      <Text position={[0, 0.66, -0.16]} fontSize={0.22} color="#ffffff" anchorX="center">
        v0 ルール
      </Text>
      <Text position={[0, 0.18, -0.16]} fontSize={0.15} color="#dbeafe" anchorX="center">
        小粒 +10 / 赤い大粒 +200
      </Text>
      <Text position={[0, -0.18, -0.16]} fontSize={0.15} color="#dbeafe" anchorX="center">
        ガードが黄色い駒へ接近すると捕獲
      </Text>
      <Text position={[0, -0.54, -0.16]} fontSize={0.15} color="#dbeafe" anchorX="center">
        120秒制。役割はいつでも交代可能
      </Text>
    </group>
  )
}

function MazeFloor() {
  return (
    <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={1}>
      <mesh position={[0, -FLOOR_HEIGHT / 2, 2.8]} receiveShadow>
        <boxGeometry args={[FLOOR_WIDTH, FLOOR_HEIGHT, FLOOR_DEPTH]} />
        <meshStandardMaterial color="#07111f" roughness={0.8} />
      </mesh>
    </RigidBody>
  )
}

function GridGlow() {
  const lines = []

  for (let col = 0; col <= GRID_COLS; col += 1) {
    const x = (col - GRID_COLS / 2) * CELL_SIZE
    lines.push(
      <mesh key={`v-${col}`} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.035, MAZE_DEPTH]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.13} />
      </mesh>,
    )
  }

  for (let row = 0; row <= GRID_ROWS; row += 1) {
    const z = (row - GRID_ROWS / 2) * CELL_SIZE
    lines.push(
      <mesh key={`h-${row}`} position={[0, 0.014, z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.035, MAZE_WIDTH]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.13} />
      </mesh>,
    )
  }

  return <group>{lines}</group>
}

function ThumbnailCamera() {
  const camera = useThree((state) => state.camera)
  const enabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('thumbnail') === '1'

  useFrame(() => {
    if (!enabled) return
    camera.position.set(0, 27, 25)
    camera.rotation.set(-0.86, 0, 0)
    camera.updateProjectionMatrix()
  })

  return null
}

export function World({ position = [0, 0, 0], scale = 1 }: WorldProps) {
  const { localUser, remoteUsers, getLocalMovement, getMovement } = useUsers()
  const { teleport } = useTeleport()
  const [state, setState] = useInstanceState<XState>('x-eater-game-state-v1', createInitialState())
  const localEffectiveUser = localUser ?? LOCAL_DEV_USER
  const localUserId = localEffectiveUser.id
  const lastStepAtRef = useRef(0)
  const lastCatchCheckAtRef = useRef(0)
  const isPacController = state.pacControllerId === localUserId
  const collectedPellets = countCollectedPellets(state.pellets)
  const now = Date.now()
  const remainingSec = state.mode === 'playing' && state.roundStartedAt
    ? Math.max(0, Math.ceil((state.roundStartedAt + state.roundDurationSec * 1000 - now) / 1000))
    : state.roundDurationSec

  const users = useMemo(() => [localEffectiveUser, ...remoteUsers], [localEffectiveUser, remoteUsers])
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const pacName = state.pacControllerId
    ? getDisplayName(userById.get(state.pacControllerId), '操縦者')
    : '未選択'
  const monsterNames = state.monsterIds.map((id) => getDisplayName(userById.get(id), 'ガード'))

  const setDirection = useCallback(
    (direction: Direction) => {
      if (!isPacController) return
      setState((current) => ({
        ...current,
        pacDirection: direction,
      }))
    },
    [isPacController, setState],
  )

  const resetRound = useCallback(() => {
    setState((current) => ({
      ...createInitialState(),
      pacControllerId: current.pacControllerId,
      monsterIds: current.monsterIds,
    }))
  }, [setState])

  const selectPac = useCallback(() => {
    setState((current) => ({
      ...current,
      pacControllerId: localUserId,
      monsterIds: current.monsterIds.filter((id) => id !== localUserId),
    }))
    teleport({ position: DECK_SPAWN, yaw: 180 })
  }, [localUserId, setState, teleport])

  const joinMonster = useCallback(() => {
    const [spawnX, , spawnZ] = cellToWorld(MONSTER_SPAWN_CELL)
    setState((current) => ({
      ...current,
      pacControllerId: current.pacControllerId === localUserId ? null : current.pacControllerId,
      monsterIds: current.monsterIds.includes(localUserId)
        ? current.monsterIds
        : [...current.monsterIds, localUserId],
    }))
    teleport({ position: [spawnX, 1.6, spawnZ], yaw: 0 })
  }, [localUserId, setState, teleport])

  const startRound = useCallback(() => {
    setState((current) => ({
      ...current,
      mode: 'playing',
      roundStartedAt: Date.now(),
      roundDurationSec: ROUND_DURATION_SEC,
      pacControllerId: current.pacControllerId ?? localUserId,
      pacCell: START_CELL,
      pacDirection: 'right',
      pellets: {},
      cherry: {
        active: true,
        collected: false,
        cell: CHERRY_CELL,
      },
      score: 0,
      catches: 0,
      lastCaughtAt: null,
      winner: null,
    }))
  }, [localUserId, setState])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isPacController) return

      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') setDirection('up')
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') setDirection('down')
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') setDirection('left')
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') setDirection('right')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPacController, setDirection])

  useFrame(() => {
    const currentTime = Date.now()

    if (state.mode === 'playing' && isPacController && currentTime - lastStepAtRef.current >= PAC_STEP_MS) {
      lastStepAtRef.current = currentTime
      setState((current) => {
        if (current.mode !== 'playing') return current

        const nextCell = moveCell(current.pacCell, current.pacDirection)
        const pelletKey = keyForCell(nextCell)
        const pelletCollected = current.pellets[pelletKey]
        const hasPellet = PELLET_CELLS.some((cell) => cell.col === nextCell.col && cell.row === nextCell.row)
        const cherryCollected = !current.cherry.collected
          && nextCell.col === current.cherry.cell.col
          && nextCell.row === current.cherry.cell.row
        const nextPellets = hasPellet && !pelletCollected
          ? { ...current.pellets, [pelletKey]: true }
          : current.pellets
        const nextCollectedCount = countCollectedPellets(nextPellets)
        const allPelletsCollected = nextCollectedCount >= PELLET_COUNT
        const timeExpired = current.roundStartedAt !== null
          && currentTime >= current.roundStartedAt + current.roundDurationSec * 1000

        return {
          ...current,
          mode: allPelletsCollected || timeExpired ? 'result' : current.mode,
          pacCell: nextCell,
          pellets: nextPellets,
          cherry: cherryCollected ? { ...current.cherry, collected: true } : current.cherry,
          score: current.score + (hasPellet && !pelletCollected ? 10 : 0) + (cherryCollected ? 200 : 0),
          winner: allPelletsCollected ? 'eater' : timeExpired ? 'guards' : current.winner,
        }
      })
    }

    if (state.mode === 'playing' && currentTime - lastCatchCheckAtRef.current >= 300) {
      lastCatchCheckAtRef.current = currentTime
      const pacWorld = cellToWorld(state.pacCell)
      const localMovement = getLocalMovement?.()
      const localIsMonster = state.monsterIds.includes(localUserId)
      const localCanCatch = localIsMonster
        && localMovement
        && distance2D(pacWorld, localMovement.position) <= CATCH_RADIUS
      const remoteCanCatch = remoteUsers.some((user) => {
        if (!state.monsterIds.includes(user.id)) return false
        const movement = getMovement(user.id)
        return movement ? distance2D(pacWorld, movement.position) <= CATCH_RADIUS : false
      })

      if (localCanCatch || remoteCanCatch) {
        setState((current) => {
          if (current.mode !== 'playing') return current
          if (current.lastCaughtAt && currentTime - current.lastCaughtAt < CATCH_COOLDOWN_MS) return current

          return {
            ...current,
            pacCell: START_CELL,
            pacDirection: 'idle',
            score: Math.max(0, current.score - 100),
            catches: current.catches + 1,
            lastCaughtAt: currentTime,
          }
        })
      }
    }
  })

  const wallCells = useMemo(() => {
    const cells: Cell[] = []
    MAZE_ROWS.forEach((row, rowIndex) => {
      Array.from(row).forEach((tile, colIndex) => {
        if (tile === '#') cells.push({ col: colIndex, row: rowIndex })
      })
    })
    return cells
  }, [])

  return (
    <group position={position} scale={scale}>
      <ThumbnailCamera />
      <SpawnPoint position={LOBBY_SPAWN} yaw={180} />
      <SkyDome />
      <ambientLight intensity={0.72} />
      <directionalLight position={[12, 24, 10]} intensity={2.2} castShadow />
      <pointLight position={[0, 8, 0]} intensity={8.5} distance={36} color="#38bdf8" />
      <MazeFloor />
      <GridGlow />
      {wallCells.map((cell) => <WallCell key={`wall-${cell.col}-${cell.row}`} cell={cell} />)}
      {PELLET_CELLS.map((cell) => (
        <Pellet
          key={`pellet-${cell.col}-${cell.row}`}
          cell={cell}
          collected={Boolean(state.pellets[keyForCell(cell)])}
        />
      ))}
      <Cherry state={state.cherry} />
      <EaterPiece cell={state.pacCell} direction={state.pacDirection} />
      <PilotDeck state={state} isPacController={isPacController} onDirection={setDirection} />
      <Scoreboard state={state} remainingSec={remainingSec} collectedPellets={collectedPellets} />
      <RoleBoard
        state={state}
        localUserId={localUserId}
        localName={getDisplayName(localEffectiveUser, 'あなた')}
        pacName={pacName}
        monsterNames={monsterNames}
        onSelectPac={selectPac}
        onJoinMonster={joinMonster}
        onStart={startRound}
        onReset={resetRound}
      />
      <Legend />
      <TagBoard
        instanceStateKey="x-eater-role-tags"
        title="観戦コメント / 役割タグ"
        position={[14.5, 1.8, 16.0]}
        rotation={[0, Math.PI, 0]}
        scale={0.82}
      />
      <EntryLogBoard
        stateNamespace="x-eater-entry-log"
        position={[14.8, 1.7, -14.4]}
        rotation={[0, -Math.PI / 5, 0]}
        scale={0.72}
        maxEntries={6}
      />
    </group>
  )
}
