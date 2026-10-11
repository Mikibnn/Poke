import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface MonsterStats {
  id: number;
  hp: number;
  attack: number;
  defense: number;
  currency: number;
  xp: number;
  level: number;
  hunger: number;
  currentStage: number;
}

export interface InventoryItem {
  id?: number;
  item_name: string;
  type: string;
  quantity: number;
}

export interface Skill {
  id?: number;
  skill_name: string;
}

export class TamagotchiDB extends Dexie {
  MonsterStats!: Table<MonsterStats, number>;
  Inventory!: Table<InventoryItem, number>;
  Skills!: Table<Skill, number>;

  constructor() {
    super('TamagotchiDB');
    this.version(1).stores({
      MonsterStats: 'id',
      Inventory: '++id, item_name, type',
      Skills: '++id, skill_name'
    });
  }
}

export const db = new TamagotchiDB();

export async function initDB() {
  const statsCount = await db.MonsterStats.count();
  if (statsCount === 0) {
    await db.MonsterStats.add({
      id: 1,
      hp: 100,
      attack: 10,
      defense: 5,
      currency: 100, // starting with some currency
      xp: 0,
      level: 1,
      hunger: 100,
      currentStage: 1
    });

    // Add default skills
    await db.Skills.add({ skill_name: 'Fireball' });
    await db.Skills.add({ skill_name: 'Slash' });
    await db.Skills.add({ skill_name: 'Heal' });
    await db.Skills.add({ skill_name: 'Shield' });
    await db.Skills.add({ skill_name: 'Poison' });
    await db.Skills.add({ skill_name: 'Lightning' });
    await db.Skills.add({ skill_name: 'Vampiric Drain' });
    await db.Skills.add({ skill_name: 'Freeze' });
    await db.Skills.add({ skill_name: 'Earthquake' });
  }
}
