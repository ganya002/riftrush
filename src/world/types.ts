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
