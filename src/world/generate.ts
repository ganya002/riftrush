import { rngFor, type Rng } from './rng';
import type { Biome, DoorDef, DoorDir, FloorDef, RoomDef, RoomKind } from './types';

/**
 * One deterministic floor.
 *
 * Stream is mulberry32(cyrb128(seed + ':' + floor)[0]). Rooms sit on a grid
 * (no diagonals). The start grows a spanning tree; its first two links are
 * different directions so the start is never a one-door dead end. A few
 * extra orthogonal links break pure trees. Shop, event, and (on boss floors)
 * the boss are placed on that connected graph, so each is reachable.
 */

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const;

const DIR_RANK: Record<DoorDir, number> = { n: 0, e: 1, s: 2, w: 3 };

const MODIFIERS = [
  'hp-merchant',
  'cursed-chest',
  'invert-controls',
  'meteor',
  'darkness',
  'gold-rush',
  'everything-explodes',
] as const;

interface Node {
  id: string;
  x: number;
  y: number;
}

interface Graph {
  nodes: Node[];
  adj: Map<string, Set<string>>;
  at: Map<string, Node>;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function idNum(id: string): number {
  const value = Number(id.slice(1));
  return Number.isFinite(value) ? value : 0;
}

function randInt(rand: Rng, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return Math.floor(rand() * maxExclusive);
}

function shuffle<T>(items: readonly T[], rand: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    const swap = out[i];
    const other = out[j];
    if (swap === undefined || other === undefined) continue;
    out[i] = other;
    out[j] = swap;
  }
  return out;
}

function createGraph(): Graph {
  return { nodes: [], adj: new Map(), at: new Map() };
}

function addNode(graph: Graph, x: number, y: number): Node {
  const node: Node = { id: `r${graph.nodes.length}`, x, y };
  graph.nodes.push(node);
  graph.adj.set(node.id, new Set());
  graph.at.set(cellKey(x, y), node);
  return node;
}

function link(graph: Graph, a: string, b: string): void {
  if (a === b) return;
  graph.adj.get(a)?.add(b);
  graph.adj.get(b)?.add(a);
}

function direction(from: Node, to: Node): DoorDir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 'n';
  if (dx === 0 && dy === 1) return 's';
  if (dx === 1 && dy === 0) return 'e';
  if (dx === -1 && dy === 0) return 'w';
  return null;
}

/** +x east, +y south. About 6 rooms on floor 1, +1 every two floors, cap 14. */
function roomCount(floor: number): number {
  const grown = 6 + Math.floor((floor - 1) / 2);
  // Elite floors need one extra slot so combat still outnumbers every other kind.
  const minimum = floor > 1 && floor % 5 !== 0 ? 7 : 6;
  return Math.min(14, Math.max(grown, minimum));
}

function biomeFor(floor: number): Biome {
  const slot = (floor - 1) % 9;
  if (slot < 3) return 'rift';
  if (slot < 6) return 'ash';
  return 'abyss';
}

function treasureCount(remaining: number): number {
  if (remaining <= 0) return 0;
  if (remaining <= 4) return 1;
  if (remaining <= 8) return 2;
  return 3;
}

function rollModifier(rand: Rng, floor: number): string | null {
  if (floor % 5 === 0) return null;
  // 1 in 8 floors. Boss floors already returned null.
  if (randInt(rand, 8) !== 0) return null;
  return MODIFIERS[randInt(rand, MODIFIERS.length)] ?? null;
}

function rollOdd(rand: Rng, min: number, max: number): number {
  const steps = Math.floor((max - min) / 2) + 1;
  return min + randInt(rand, steps) * 2;
}

function rollSize(rand: Rng, kind: RoomKind): { width: number; height: number } {
  switch (kind) {
    case 'treasure':
      return { width: rollOdd(rand, 15, 17), height: rollOdd(rand, 15, 17) };
    case 'combat':
      return { width: rollOdd(rand, 19, 25), height: rollOdd(rand, 19, 25) };
    case 'elite':
      return { width: rollOdd(rand, 21, 25), height: rollOdd(rand, 21, 25) };
    case 'boss':
      return { width: rollOdd(rand, 23, 25), height: rollOdd(rand, 23, 25) };
    case 'start':
      return { width: rollOdd(rand, 17, 21), height: rollOdd(rand, 17, 21) };
    case 'shop':
    case 'event':
      return { width: rollOdd(rand, 15, 19), height: rollOdd(rand, 15, 19) };
  }
}

/**
 * Fixed orthogonal block used when random growth comes up short.
 * Start is (0,0) and, for three or more rooms, also touches (1,0) and (0,1).
 */
function fallbackGraph(count: number): Graph {
  const graph = createGraph();
  const spots: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const cols = 4;
  for (let y = 0; spots.length < count && y < count + 2; y++) {
    for (let x = 0; spots.length < count && x < cols; x++) {
      if (spots.some((spot) => spot.x === x && spot.y === y)) continue;
      spots.push({ x, y });
    }
  }
  const placed = count < spots.length ? spots.slice(0, count) : spots;
  for (const spot of placed) addNode(graph, spot.x, spot.y);
  for (const node of graph.nodes) {
    for (const dir of DIRS) {
      const neighbor = graph.at.get(cellKey(node.x + dir.dx, node.y + dir.dy));
      if (!neighbor) continue;
      if (idNum(node.id) < idNum(neighbor.id)) link(graph, node.id, neighbor.id);
    }
  }
  return graph;
}

function grow(rand: Rng, count: number): Graph {
  const graph = createGraph();
  const start = addNode(graph, 0, 0);
  const directions = shuffle(DIRS, rand);
  const branchCount = Math.min(2, Math.max(0, count - 1));
  for (let i = 0; i < branchCount; i++) {
    const dir = directions[i];
    if (!dir) break;
    const node = addNode(graph, start.x + dir.dx, start.y + dir.dy);
    link(graph, start.id, node.id);
  }

  const frontier: Array<{ x: number; y: number }> = [];
  const queued = new Set<string>();
  const pushFrontier = (x: number, y: number) => {
    const key = cellKey(x, y);
    if (graph.at.has(key) || queued.has(key)) return;
    queued.add(key);
    frontier.push({ x, y });
  };
  for (const node of graph.nodes) {
    for (const dir of DIRS) pushFrontier(node.x + dir.dx, node.y + dir.dy);
  }

  let guard = count * 16;
  while (graph.nodes.length < count && frontier.length > 0 && guard > 0) {
    guard -= 1;
    const index = randInt(rand, frontier.length);
    const cell = frontier[index];
    if (cell === undefined) break;
    frontier.splice(index, 1);
    queued.delete(cellKey(cell.x, cell.y));
    if (graph.at.has(cellKey(cell.x, cell.y))) continue;

    const parents: Node[] = [];
    for (const dir of DIRS) {
      const neighbor = graph.at.get(cellKey(cell.x + dir.dx, cell.y + dir.dy));
      if (neighbor) parents.push(neighbor);
    }
    if (parents.length === 0) continue;
    const parent = parents[randInt(rand, parents.length)];
    if (!parent) continue;
    const node = addNode(graph, cell.x, cell.y);
    link(graph, parent.id, node.id);
    for (const dir of DIRS) pushFrontier(node.x + dir.dx, node.y + dir.dy);
  }

  return graph;
}

function addLoops(graph: Graph, rand: Rng): void {
  const ordered = graph.nodes.slice().sort((a, b) => idNum(a.id) - idNum(b.id));
  const candidates: Array<{ a: string; b: string }> = [];
  for (const node of ordered) {
    for (const dir of DIRS) {
      const neighbor = graph.at.get(cellKey(node.x + dir.dx, node.y + dir.dy));
      if (!neighbor) continue;
      if (idNum(node.id) >= idNum(neighbor.id)) continue;
      if (graph.adj.get(node.id)?.has(neighbor.id)) continue;
      candidates.push({ a: node.id, b: neighbor.id });
    }
  }
  const maxExtra = graph.nodes.length >= 8 ? 2 : 1;
  let added = 0;
  for (const candidate of candidates) {
    if (added >= maxExtra) break;
    if (rand() < 0.5) {
      link(graph, candidate.a, candidate.b);
      added += 1;
    }
  }
}

function distancesFrom(graph: Graph, startId: string): Map<string, number> {
  const dist = new Map<string, number>();
  if (!graph.adj.has(startId)) return dist;
  const queue = [startId];
  dist.set(startId, 0);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    if (id === undefined) continue;
    const base = dist.get(id) ?? 0;
    for (const next of graph.adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, base + 1);
      queue.push(next);
    }
  }
  return dist;
}

function graphOk(graph: Graph, expectedCount: number): boolean {
  if (graph.nodes.length !== expectedCount) return false;
  if (!graph.at.has(cellKey(0, 0))) return false;
  const start = graph.nodes.find((node) => node.id === 'r0');
  if (!start) return false;
  const seen = distancesFrom(graph, 'r0');
  if (seen.size !== graph.nodes.length) return false;
  if (graph.nodes.length >= 3 && (graph.adj.get('r0')?.size ?? 0) < 2) return false;
  for (const node of graph.nodes) {
    for (const targetId of graph.adj.get(node.id) ?? []) {
      const target = graph.nodes.find((other) => other.id === targetId);
      if (!target) return false;
      if (!graph.adj.get(targetId)?.has(node.id)) return false;
      if (direction(node, target) === null) return false;
    }
  }
  return true;
}

function assignKinds(graph: Graph, rand: Rng, floor: number): Map<string, RoomKind> {
  const kinds = new Map<string, RoomKind>();
  for (const node of graph.nodes) kinds.set(node.id, 'combat');
  kinds.set('r0', 'start');

  const dist = distancesFrom(graph, 'r0');
  const pool = graph.nodes.map((node) => node.id).filter((id) => id !== 'r0');

  const takeFarthest = (): string | null => {
    if (pool.length === 0) return null;
    let max = -1;
    for (const id of pool) max = Math.max(max, dist.get(id) ?? -1);
    const candidates = pool
      .filter((id) => (dist.get(id) ?? -1) === max)
      .sort((a, b) => idNum(a) - idNum(b));
    const pick = candidates[randInt(rand, candidates.length)];
    if (pick === undefined) return null;
    const at = pool.indexOf(pick);
    if (at >= 0) pool.splice(at, 1);
    return pick;
  };

  const takeRandom = (): string | null => {
    if (pool.length === 0) return null;
    const pick = pool[randInt(rand, pool.length)];
    if (pick === undefined) return null;
    const at = pool.indexOf(pick);
    if (at >= 0) pool.splice(at, 1);
    return pick;
  };

  if (floor % 5 === 0) {
    const boss = takeFarthest();
    if (boss) kinds.set(boss, 'boss');
  } else if (floor > 1) {
    const elite = takeFarthest();
    if (elite) kinds.set(elite, 'elite');
  }

  const shop = takeRandom();
  if (shop) kinds.set(shop, 'shop');
  const eventRoom = takeRandom();
  if (eventRoom) kinds.set(eventRoom, 'event');

  const slots = treasureCount(pool.length);
  const rest = shuffle(pool, rand);
  for (let i = 0; i < rest.length; i++) {
    const id = rest[i];
    if (!id) continue;
    kinds.set(id, i < slots ? 'treasure' : 'combat');
  }
  return kinds;
}

function compareDoors(a: DoorDef, b: DoorDef): number {
  const byDir = DIR_RANK[a.dir] - DIR_RANK[b.dir];
  if (byDir !== 0) return byDir;
  if (a.targetId < b.targetId) return -1;
  if (a.targetId > b.targetId) return 1;
  return 0;
}

function doorsFor(graph: Graph, node: Node): DoorDef[] {
  const doors: DoorDef[] = [];
  for (const targetId of graph.adj.get(node.id) ?? []) {
    const target = graph.nodes.find((other) => other.id === targetId);
    if (!target) continue;
    const dir = direction(node, target);
    if (!dir) continue;
    doors.push({ dir, targetId });
  }
  doors.sort(compareDoors);
  return doors;
}

function materialize(
  graph: Graph,
  rand: Rng,
  seed: string,
  floor: number,
  modifier: string | null,
): FloorDef {
  const kinds = assignKinds(graph, rand, floor);
  const ordered = graph.nodes.slice().sort((a, b) => idNum(a.id) - idNum(b.id));
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of ordered) {
    sizes.set(node.id, rollSize(rand, kinds.get(node.id) ?? 'combat'));
  }

  const rooms: RoomDef[] = [];
  for (const node of ordered) {
    const size = sizes.get(node.id) ?? { width: 17, height: 17 };
    rooms.push({
      id: node.id,
      gridX: node.x,
      gridY: node.y,
      kind: kinds.get(node.id) ?? 'combat',
      doors: doorsFor(graph, node),
      width: size.width,
      height: size.height,
    });
  }

  return {
    seed,
    floor,
    biome: biomeFor(floor),
    rooms,
    startId: 'r0',
    modifier,
  };
}

const FIXED_SIZE: Record<RoomKind, { width: number; height: number }> = {
  treasure: { width: 15, height: 15 },
  combat: { width: 21, height: 21 },
  start: { width: 17, height: 17 },
  shop: { width: 17, height: 17 },
  event: { width: 17, height: 17 },
  elite: { width: 23, height: 23 },
  boss: { width: 25, height: 25 },
};

/** Last resort if the rolled layout throws. Still a legal, connected floor. */
function emergencyFloor(seed: string, floor: number): FloorDef {
  const count = roomCount(floor);
  const graph = fallbackGraph(count);
  const dist = distancesFrom(graph, 'r0');
  const kinds = new Map<string, RoomKind>();
  for (const node of graph.nodes) kinds.set(node.id, 'combat');
  kinds.set('r0', 'start');
  const pool = graph.nodes
    .map((node) => node.id)
    .filter((id) => id !== 'r0')
    .sort((a, b) => {
      const delta = (dist.get(b) ?? -1) - (dist.get(a) ?? -1);
      if (delta !== 0) return delta;
      return idNum(a) - idNum(b);
    });
  const take = (): string | undefined => pool.shift();
  if (floor % 5 === 0) {
    const boss = take();
    if (boss) kinds.set(boss, 'boss');
  } else if (floor > 1) {
    const elite = take();
    if (elite) kinds.set(elite, 'elite');
  }
  const shop = take();
  if (shop) kinds.set(shop, 'shop');
  const eventRoom = take();
  if (eventRoom) kinds.set(eventRoom, 'event');
  const slots = treasureCount(pool.length);
  for (let i = 0; i < pool.length; i++) {
    const id = pool[i];
    if (!id) continue;
    kinds.set(id, i < slots ? 'treasure' : 'combat');
  }
  const rooms: RoomDef[] = graph.nodes
    .slice()
    .sort((a, b) => idNum(a.id) - idNum(b.id))
    .map((node) => {
      const kind = kinds.get(node.id) ?? 'combat';
      const size = FIXED_SIZE[kind];
      return {
        id: node.id,
        gridX: node.x,
        gridY: node.y,
        kind,
        doors: doorsFor(graph, node),
        width: size.width,
        height: size.height,
      };
    });
  return {
    seed,
    floor,
    biome: biomeFor(floor),
    rooms,
    startId: 'r0',
    modifier: null,
  };
}

function normalize(seed: string, floor: number): { seed: string; floor: number } {
  let safeSeed = '';
  if (typeof seed === 'string') safeSeed = seed;
  else if (seed != null) {
    try {
      safeSeed = String(seed);
    } catch {
      safeSeed = '';
    }
  }
  let safeFloor = 1;
  if (typeof floor === 'number' && Number.isFinite(floor)) safeFloor = Math.trunc(floor);
  if (safeFloor < 1) safeFloor = 1;
  return { seed: safeSeed, floor: safeFloor };
}

export function generateFloor(seed: string, floor: number): FloorDef {
  const safe = normalize(seed, floor);
  try {
    const rand = rngFor(safe.seed, safe.floor);
    const modifier = rollModifier(rand, safe.floor);
    const count = roomCount(safe.floor);
    let graph = grow(rand, count);
    addLoops(graph, rand);
    if (!graphOk(graph, count)) graph = fallbackGraph(count);
    if (!graphOk(graph, count)) return emergencyFloor(safe.seed, safe.floor);
    return materialize(graph, rand, safe.seed, safe.floor, modifier);
  } catch {
    return emergencyFloor(safe.seed, safe.floor);
  }
}
