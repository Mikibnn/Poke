import Phaser from 'phaser';
import type { StrategyJSON } from './AIManager';

export interface BattleData {
  strategy: StrategyJSON;
  playerStats: { hp: number; maxHp: number; attack: number; defense: number };
}

export class BattleScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Image & { body: Phaser.Physics.Arcade.Body };
  enemy!: Phaser.GameObjects.Image & { body: Phaser.Physics.Arcade.Body };
  playerHealthBar!: Phaser.GameObjects.Rectangle;
  enemyHealthBar!: Phaser.GameObjects.Rectangle;

  strategy!: StrategyJSON;
  playerStats!: { hp: number; maxHp: number; attack: number; defense: number };
  enemyStats = { hp: 100, maxHp: 100, attack: 10, defense: 5 };

  lastSkillTime = 0;
  skillCooldown = 1500; // ms

  projectiles!: Phaser.Physics.Arcade.Group;

  // Status effects
  enemyPoisonTicks = 0;
  playerShieldedTime = 0;

  constructor() {
    super('BattleScene');
  }

  preload() {
    // Generate a basic SVG texture for the hero
    const heroSVG = `
      <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="25" fill="#4ea8de" stroke="#000" stroke-width="3" />
        <circle cx="20" cy="25" r="5" fill="#fff" />
        <circle cx="40" cy="25" r="5" fill="#fff" />
        <circle cx="20" cy="25" r="2" fill="#000" />
        <circle cx="40" cy="25" r="2" fill="#000" />
        <path d="M 20 40 Q 30 50 40 40" stroke="#000" stroke-width="3" fill="none" />
      </svg>
    `;
    // Generate a basic SVG texture for the enemy
    const enemySVG = `
      <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <polygon points="30,5 55,55 5,55" fill="#e63946" stroke="#000" stroke-width="3" />
        <path d="M 20 30 L 25 35 M 40 30 L 35 35" stroke="#000" stroke-width="3" />
        <path d="M 25 45 Q 30 40 35 45" stroke="#000" stroke-width="3" fill="none" />
      </svg>
    `;

    if (!this.textures.exists('heroTex')) {
      this.textures.addBase64('heroTex', 'data:image/svg+xml;base64,' + btoa(heroSVG));
    }
    if (!this.textures.exists('enemyTex')) {
      this.textures.addBase64('enemyTex', 'data:image/svg+xml;base64,' + btoa(enemySVG));
    }
  }

  init(data: BattleData) {
    this.strategy = data.strategy || {
      aggressiveness: 0.5,
      preferred_distance: 'mid',
      skill_priorities: ['Slash', 'Fireball'],
      flee_threshold: 20,
      healing_threshold: 30,
      tactical_logic: 'Fallback'
    };
    this.playerStats = data.playerStats || { hp: 100, maxHp: 100, attack: 10, defense: 5 };
  }

  create() {
    // Background Grid
    this.add.grid(400, 300, 800, 600, 64, 64, 0x111111, 1, 0x222222, 1);

    // Player
    this.player = this.add.image(200, 300, 'heroTex') as any;
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    // Add simple breathing animation
    this.tweens.add({
      targets: this.player,
      scaleX: 1.05,
      scaleY: 0.95,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Enemy
    this.enemy = this.add.image(600, 300, 'enemyTex') as any;
    this.physics.add.existing(this.enemy);
    this.enemy.body.setCollideWorldBounds(true);
    // Add simple breathing animation
    this.tweens.add({
      targets: this.enemy,
      scaleX: 1.05,
      scaleY: 0.95,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

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
    this.handleStatusEffects(time);
    this.checkWinCondition();
  }

  handleStatusEffects(time: number) {
    // Shield expiration
    if (this.playerShieldedTime > 0 && time > this.playerShieldedTime + 5000) {
      this.playerShieldedTime = 0;
      this.playerStats.defense /= 2; // Remove shield buff
      this.player.clearTint();
    }
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

    const hpPercent = (this.playerStats.hp / this.playerStats.maxHp) * 100;
    let currentPrefDist = this.strategy.preferred_distance;

    // Flee override
    if (this.strategy.flee_threshold && hpPercent < this.strategy.flee_threshold) {
      currentPrefDist = 'ranged';
    }

    // Player logic based on preferred_distance
    let targetDist = 0;
    if (currentPrefDist === 'melee') targetDist = 40;
    else if (currentPrefDist === 'mid') targetDist = 200;
    else if (currentPrefDist === 'ranged') targetDist = 400;

    if (this.player && this.player.body && this.enemy && this.enemy.body) {
      if (dist < targetDist - 20) {
        // Move away
        const angle = Phaser.Math.Angle.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
        if (this.player.body) {
           (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
      } else if (dist > targetDist + 20) {
        // Move towards
        this.physics.moveToObject(this.player, this.enemy, speed);
      } else {
        // Hold position (strafing logic could go here)
        if (this.player.body) {
           (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        }
      }
    }
  }

  handleSkills(time: number) {
    if (time > this.lastSkillTime + this.skillCooldown) {
      this.lastSkillTime = time;

      const hpPercent = (this.playerStats.hp / this.playerStats.maxHp) * 100;
      let primarySkill = this.strategy.skill_priorities[0] || 'Slash';

      // Healing override
      if (this.strategy.healing_threshold && hpPercent < this.strategy.healing_threshold) {
        // If they have heal in their priorities somewhere, force it
        if (this.strategy.skill_priorities.includes('Heal')) {
          primarySkill = 'Heal';
        }
      }

      const baseDamage = this.playerStats.attack * (0.5 + ((this.strategy.aggressiveness || 0.5) * 0.5));

      if (primarySkill === 'Heal') {
        this.castHeal();
      } else if (primarySkill === 'Shield') {
        this.castShield(time);
      } else if (primarySkill === 'Poison') {
        this.castPoison();
      } else if (primarySkill === 'Lightning') {
        this.castLightning(baseDamage * 1.5);
      } else if (primarySkill === 'Fireball') {
        this.castFireball(baseDamage);
      } else {
        this.castSlash(baseDamage);
      }

      // Random enemy attack logic
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y) < 60) {
        let dmg = Math.max(1, this.enemyStats.attack - this.playerStats.defense);
        this.playerStats.hp -= dmg;
        // visual flash
        this.player.setTint(0xff0000);
        this.time.delayedCall(100, () => {
          if (this.player) this.player.clearTint();
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

  castHeal() {
    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 30);
    const healEffect = this.add.circle(this.player.x, this.player.y, 30, 0x00ff00, 0.5);
    this.tweens.add({
      targets: healEffect,
      scale: 1.5,
      alpha: 0,
      duration: 500,
      onComplete: () => healEffect.destroy()
    });
  }

  castShield(time: number) {
    if (this.playerShieldedTime === 0) {
      this.playerStats.defense *= 2; // Buff defense
    }
    this.playerShieldedTime = time;
    this.player.setTint(0x8888ff);
  }

  castPoison() {
    const proj = this.add.circle(this.player.x, this.player.y, 8, 0x800080) as any;
    this.physics.add.existing(proj);
    this.projectiles.add(proj);
    proj.isPoison = true;
    this.physics.moveToObject(proj, this.enemy, 250);
    this.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
  }

  castLightning(damage: number) {
    // Instant line
    const graphics = this.add.graphics();
    graphics.lineStyle(4, 0xffff00);
    graphics.beginPath();
    graphics.moveTo(this.player.x, this.player.y);
    graphics.lineTo(this.enemy.x, this.enemy.y);
    graphics.strokePath();

    this.enemyStats.hp -= Math.max(1, damage - this.enemyStats.defense);

    this.time.delayedCall(150, () => graphics.destroy());
  }

  applyPoisonTick(ticksRemaining: number) {
    if (ticksRemaining <= 0 || this.isGameOver) return;
    this.enemyStats.hp -= 2; // Flat poison damage
    this.enemy.setTint(0x800080);
    this.time.delayedCall(200, () => { if (this.enemy) this.enemy.clearTint(); });

    this.time.delayedCall(1000, () => this.applyPoisonTick(ticksRemaining - 1));
  }

  handleProjectileHit(projectile: Phaser.GameObjects.GameObject, _enemy: Phaser.GameObjects.GameObject) {
    const proj = projectile as any;
    if (proj.isPoison) {
      this.applyPoisonTick(5); // 5 ticks of poison
    } else {
      this.enemyStats.hp -= Math.max(1, proj.damage - this.enemyStats.defense);
    }
    proj.destroy();
  }
}
