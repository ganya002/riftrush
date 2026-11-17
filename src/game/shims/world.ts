import { makeRng } from '../../core/rng';
import { rollFloorModifier } from './events';

export type Biome = 'rift' | 'ash' | 'abyss';
export type RoomKind = 'start' | 'combat' | 'treasure' | 'shop' | 'event' | 'elite' | 'boss';
export type DoorDir = 'n' | 's' | 'e' | 'w';

export interface DoorDef {
  dir: DoorDir;
  targetId: string;
}

export interface RoomDef {
  id: string;
  gridX: number;
  gridY: number;
  kind: RoomKind;
  doors: DoorDef[];
  width: number;
  height: number;
}

export interface FloorDef {
  seed: string;
  floor: number;
  biome: Biome;
  rooms: RoomDef[];
  startId: string;
  modifier: string | null;
}

const BIOMES: readonly Biome[] = ['rift', 'ash', 'abyss'];

const SIZE: Record<RoomKind, readonly [number, number]> = {
  start: [320, 224],
  combat: [384, 256],
  elite: [416, 288],
  boss: [480, 320],
  treasure: [288, 224],
  shop: [320, 224],
  event: [384, 256],
};

const OPP: Record<DoorDir, DoorDir> = { n: 's', s: 'n', e: 'w', w: 'e' };

const DIRS: readonly { dir: DoorDir; dx: number; dy: number }[] = [
  { dir: 'n', dx: 0, dy: -1 },
  { dir: 's', dx: 0, dy: 1 },
  { dir: 'e', dx: 1, dy: 0 },
  { dir: 'w', dx: -1, dy: 0 },
];

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy;
}

function link(a: RoomDef, b: RoomDef, dir: DoorDir): void {
  if (!a.doors.some((door) => door.dir === dir)) a.doors.push({ dir, targetId: b.id });
  const back = OPP[dir];
  if (!b.doors.some((door) => door.dir === back)) b.doors.push({ dir: back, targetId: a.id });
}

function applySize(room: RoomDef): void {
  const size = SIZE[room.kind];
  room.width = size[0];
  room.height = size[1];
}

export function biomeForFloor(floor: number): Biome {
  const index = Math.floor((Math.max(1, floor) - 1) / 3) % BIOMES.length;
  return BIOMES[index] ?? 'rift';
}

export function generateFloor(seed: string, floor: number): FloorDef {
  const safeFloor = Math.max(1, Math.floor(floor));
  const rng = makeRng(`${seed}|layout|${safeFloor}`);
  const isBoss = safeFloor % 5 === 0;
  const start: RoomDef = {
    id: 'start',
    gridX: 0,
    gridY: 0,
    kind: 'start',
    doors: [],
    width: SIZE.start[0],
    height: SIZE.start[1],
  };
  const rooms: RoomDef[] = [start];
  const occupied = new Map<string, RoomDef>([['0,0', start]]);
  const extra = isBoss ? 4 : 3 + (rng() < 0.55 ? 1 : 0);

  let guard = 0;
  while (rooms.length < 1 + extra && guard < 80) {
    guard += 1;
    const origin = rooms[Math.floor(rng() * rooms.length)] ?? start;
    let placed = false;
    for (const dir of shuffle(DIRS, rng)) {
      const nx = origin.gridX + dir.dx;
      const ny = origin.gridY + dir.dy;
      const key = `${nx},${ny}`;
      if (occupied.has(key)) continue;
      const room: RoomDef = {
        id: `r${rooms.length}`,
        gridX: nx,
        gridY: ny,
        kind: 'combat',
        doors: [],
        width: SIZE.combat[0],
        height: SIZE.combat[1],
      };
      link(origin, room, dir.dir);
      rooms.push(room);
      occupied.set(key, room);
      placed = true;
      break;
    }
    if (!placed && rooms.length < 1 + extra) {
      const eastKey = `${start.gridX + rooms.length},${start.gridY}`;
      if (!occupied.has(eastKey)) {
        const room: RoomDef = {
          id: `r${rooms.length}`,
          gridX: start.gridX + rooms.length,
          gridY: start.gridY,
          kind: 'combat',
          doors: [],
          width: SIZE.combat[0],
          height: SIZE.combat[1],
        };
        const left = occupied.get(`${room.gridX - 1},${room.gridY}`) ?? start;
        link(left, room, 'e');
        rooms.push(room);
        occupied.set(eastKey, room);
      }
    }
  }

  const rest = rooms.filter((room) => room.kind !== 'start');
  const byFar = [...rest].sort(
    (a, b) => Math.abs(b.gridX) + Math.abs(b.gridY) - (Math.abs(a.gridX) + Math.abs(a.gridY)),
  );
  if (isBoss && byFar[0]) byFar[0].kind = 'boss';

  const specials: RoomKind[] = ['treasure', 'shop', 'event'];
  const specialKind = specials[Math.floor(rng() * specials.length)] ?? 'treasure';
  const specialHost =
    rest.find((room) => room.kind === 'combat' && room.doors.length === 1) ??
    rest.find((room) => room.kind === 'combat');
  if (specialHost) specialHost.kind = specialKind;

  const eliteHost = [...byFar].find((room) => room.kind === 'combat');
  if (eliteHost && safeFloor > 1 && (isBoss || rng() < 0.75)) eliteHost.kind = 'elite';

  if (
    !rest.some((room) => room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss')
  ) {
    const fallback = rest[0];
    if (fallback) fallback.kind = isBoss ? 'boss' : 'combat';
  }

  for (const room of rooms) applySize(room);

  const modifier = rollFloorModifier(makeRng(`${seed}|mod|${safeFloor}`), safeFloor);

  return {
    seed,
    floor: safeFloor,
    biome: biomeForFloor(safeFloor),
    rooms,
    startId: start.id,
    modifier: modifier?.id ?? null,
  };
}
