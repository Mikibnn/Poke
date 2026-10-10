import Phaser from 'phaser';
import type { StrategyJSON } from './AIManager';

export interface BattleData {
  strategy: StrategyJSON;
  playerStats: { hp: number; maxHp: number; attack: number; defense: number };
}

export class BattleScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
  enemy!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
  playerHealthBar!: Phaser.GameObjects.Rectangle;
  enemyHealthBar!: Phaser.GameObjects.Rectangle;

  strategy!: StrategyJSON;
  playerStats!: { hp: number; maxHp: number; attack: number; defense: number };
  enemyStats = { hp: 100, maxHp: 100, attack: 10, defense: 5 };

  lastSkillTime = 0;
  skillCooldown = 1500; // ms

  projectiles!: Phaser.Physics.Arcade.Group;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleData) {
    this.strategy = data.strategy || {
      aggressiveness: 0.5,
      preferred_distance: 'mid',
      skill_priorities: ['Slash', 'Fireball'],
      tactical_logic: 'Fallback'
    };
    this.playerStats = data.playerStats || { hp: 100, maxHp: 100, attack: 10, defense: 5 };
  }

  create() {
    // Player
    this.player = this.add.rectangle(200, 300, 40, 40, 0x0000ff) as any;
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    // Enemy
    this.enemy = this.add.rectangle(600, 300, 40, 40, 0xff0000) as any;
    this.physics.add.existing(this.enemy);
    this.enemy.body.setCollideWorldBounds(true);

    // Health Bars
    this.playerHealthBar = this.add.rectangle(200, 270, 40, 5, 0x00ff00);
    this.enemyHealthBar = this.add.rectangle(600, 270, 40, 5, 0x00ff00);

    // Setup collision
    this.physics.add.collider(this.player, this.enemy);

    this.projectiles = this.physics.add.group();
    this.physics.add.collider(this.projectiles, this.enemy, this.handleProjectileHit.bind(this) as any);

    this.isGameOver = false;
  }

  isGameOver = false;

  update(time: number, _delta: number) {
    if (this.isGameOver) return;

    this.updateHealthBars();
    this.handleMovement();
    this.handleSkills(time);
    this.checkWinCondition();
  }

  checkWinCondition() {
    if (this.playerStats.hp <= 0) {
      this.isGameOver = true;
      window.dispatchEvent(new CustomEvent('battle-end', { detail: { win: false } }));
    } else if (this.enemyStats.hp <= 0) {
      this.isGameOver = true;
      window.dispatchEvent(new CustomEvent('battle-end', { detail: { win: true } }));
    }
  }

  updateHealthBars() {
    // Position health bars above entities
    this.playerHealthBar.setPosition(this.player.x, this.player.y - 30);
    this.enemyHealthBar.setPosition(this.enemy.x, this.enemy.y - 30);

    // Update width based on health
    const pWidth = (this.playerStats.hp / this.playerStats.maxHp) * 40;
    this.playerHealthBar.width = Math.max(0, pWidth);

    const eWidth = (this.enemyStats.hp / this.enemyStats.maxHp) * 40;
    this.enemyHealthBar.width = Math.max(0, eWidth);
  }

  handleMovement() {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
    const speed = 150;

    // Enemy logic: always tries to close distance (melee)
    this.physics.moveToObject(this.enemy, this.player, speed * 0.8);

    // Player logic based on preferred_distance
    let targetDist = 0;
    if (this.strategy.preferred_distance === 'melee') targetDist = 40;
    else if (this.strategy.preferred_distance === 'mid') targetDist = 200;
    else if (this.strategy.preferred_distance === 'ranged') targetDist = 400;

    if (dist < targetDist - 20) {
      // Move away
      const angle = Phaser.Math.Angle.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
      this.player.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    } else if (dist > targetDist + 20) {
      // Move towards
      this.physics.moveToObject(this.player, this.enemy, speed);
    } else {
      // Hold position (strafing logic could go here)
      this.player.body.setVelocity(0, 0);
    }
  }

  handleSkills(time: number) {
    if (time > this.lastSkillTime + this.skillCooldown) {
      this.lastSkillTime = time;

      // Select skill based on priorities (simplification: just pick first available that makes sense)
      const primarySkill = this.strategy.skill_priorities[0] || 'Slash';

      const baseDamage = this.playerStats.attack * (0.5 + (this.strategy.aggressiveness * 0.5));

      if (primarySkill === 'Fireball') {
        this.castFireball(baseDamage);
      } else {
        this.castSlash(baseDamage);
      }

      // Random enemy attack logic
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y) < 60) {
        this.playerStats.hp -= Math.max(1, this.enemyStats.attack - this.playerStats.defense);
        // visual flash
        this.player.fillColor = 0xffffff;
        this.time.delayedCall(100, () => {
          if (this.player) this.player.fillColor = 0x0000ff;
        });
      }
    }
  }

  castFireball(damage: number) {
    const proj = this.add.circle(this.player.x, this.player.y, 8, 0xffa500) as any;
    this.physics.add.existing(proj);
    this.projectiles.add(proj);

    // @ts-ignore attach damage
    proj.damage = damage;

    this.physics.moveToObject(proj, this.enemy, 300);

    // Destroy after 3s
    this.time.delayedCall(3000, () => {
        if (proj.active) proj.destroy();
    });
  }

  castSlash(damage: number) {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
    if (dist < 60) {
      this.enemyStats.hp -= Math.max(1, damage - this.enemyStats.defense);
      // visual slash effect
      const slash = this.add.rectangle(this.enemy.x, this.enemy.y, 50, 5, 0xffffff);
      slash.setAngle(Phaser.Math.Between(0, 180));
      this.time.delayedCall(100, () => slash.destroy());
    }
  }

  handleProjectileHit(projectile: Phaser.GameObjects.GameObject, _enemy: Phaser.GameObjects.GameObject) {
    const proj = projectile as any;
    this.enemyStats.hp -= Math.max(1, proj.damage - this.enemyStats.defense);
    proj.destroy();
  }
}
