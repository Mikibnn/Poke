import Phaser from 'phaser';
import type { StrategyJSON } from './AIManager';

export interface BattleData {
  strategy: StrategyJSON;
  playerStats: { hp: number; maxHp: number; attack: number; defense: number };
  enemyStats?: { hp: number; maxHp: number; attack: number; defense: number };
}

export class BattleScene extends Phaser.Scene {
  player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  enemy!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
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
  enemyFrozenTime = 0;

  constructor() {
    super('BattleScene');
  }

  preload() {
    // 16x16 pixel-art monster style SVG for hero
    const heroSVG = `
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="2" width="6" height="2" fill="#4ea8de" />
        <rect x="3" y="4" width="10" height="8" fill="#4ea8de" />
        <rect x="5" y="6" width="2" height="2" fill="#fff" />
        <rect x="9" y="6" width="2" height="2" fill="#fff" />
        <rect x="5" y="6" width="1" height="1" fill="#000" />
        <rect x="9" y="6" width="1" height="1" fill="#000" />
        <rect x="4" y="12" width="3" height="2" fill="#4ea8de" />
        <rect x="9" y="12" width="3" height="2" fill="#4ea8de" />
      </svg>
    `;

    // 16x16 pixel-art monster style SVG for enemy
    const enemySVG = `
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="8" height="12" fill="#e63946" />
        <rect x="3" y="4" width="2" height="6" fill="#e63946" />
        <rect x="11" y="4" width="2" height="6" fill="#e63946" />
        <rect x="5" y="5" width="2" height="2" fill="#fff" />
        <rect x="9" y="5" width="2" height="2" fill="#fff" />
        <rect x="6" y="5" width="1" height="1" fill="#000" />
        <rect x="10" y="5" width="1" height="1" fill="#000" />
        <rect x="6" y="10" width="4" height="2" fill="#000" />
        <rect x="7" y="10" width="2" height="2" fill="#fff" />
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
    if (data.enemyStats) {
      this.enemyStats = data.enemyStats;
    }
  }

  create() {
    // Background Grid
    this.add.grid(400, 300, 800, 600, 64, 64, 0x111111, 1, 0x222222, 1);

    // Player
    this.player = this.add.image(200, 300, 'heroTex') as any;
    this.player.setScale(4);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    // Add simple breathing animation
    this.tweens.add({
      targets: this.player,
      scaleY: 3.8,
      scaleX: 4.2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Enemy
    this.enemy = this.add.image(600, 300, 'enemyTex') as any;
    this.enemy.setScale(4);
    this.physics.add.existing(this.enemy);
    this.enemy.body.setCollideWorldBounds(true);
    // Add simple breathing animation
    this.tweens.add({
      targets: this.enemy,
      scaleY: 3.8,
      scaleX: 4.2,
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
    // Freeze expiration
    if (this.enemyFrozenTime > 0 && time > this.enemyFrozenTime + 3000) {
      this.enemyFrozenTime = 0;
      this.enemy.clearTint();
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

  showFloatingText(x: number, y: number, text: string, color: string) {
    const floatText = this.add.text(x, y, text, { font: '16px Arial', color: color, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.tweens.add({
      targets: floatText,
      y: y - 50,
      alpha: 0,
      duration: 1000,
      ease: 'Power1',
      onComplete: () => floatText.destroy()
    });
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

    // Enemy logic: always tries to close distance (melee) unless frozen
    if (this.enemyFrozenTime === 0) {
      if (this.enemy && this.enemy.active && this.player && this.player.active) {
        this.physics.moveToObject(this.enemy, this.player, speed * 0.8);
      }
    } else {
      if (this.enemy && this.enemy.active && this.enemy.body) {
        (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    }

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

    if (this.player && this.player.active && this.player.body && this.enemy && this.enemy.active && this.enemy.body) {
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
      } else if (primarySkill === 'Vampiric Drain') {
        this.castVampiricDrain(baseDamage * 1.2);
      } else if (primarySkill === 'Freeze') {
        this.castFreeze(time);
      } else if (primarySkill === 'Earthquake') {
        this.castEarthquake(baseDamage * 0.8);
      } else if (primarySkill === 'Fireball') {
        this.castFireball(baseDamage);
      } else {
        this.castSlash(baseDamage);
      }

      // Random enemy attack logic (only if not frozen)
      if (this.enemyFrozenTime === 0 && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y) < 60) {
        // 10% chance for player to dodge
        if (Math.random() < 0.1) {
          this.showFloatingText(this.player.x, this.player.y - 20, "Dodge!", "#aaaaaa");
        } else {
          let dmg = Math.max(1, this.enemyStats.attack - this.playerStats.defense);

          // 15% chance for enemy to crit
          let isCrit = false;
          if (Math.random() < 0.15) {
            dmg *= 2;
            isCrit = true;
          }

          this.playerStats.hp -= dmg;
          this.showFloatingText(this.player.x, this.player.y - 20, `-${dmg}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");

          // visual flash
          this.player.setTint(0xff0000);
          this.time.delayedCall(100, () => {
            if (this.player) this.player.clearTint();
          });
        }
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
      if (Math.random() < 0.1) {
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
      } else {
        let actualDmg = Math.max(1, damage - this.enemyStats.defense);
        let isCrit = false;
        if (Math.random() < 0.15) {
          actualDmg *= 2;
          isCrit = true;
        }
        this.enemyStats.hp -= actualDmg;
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffffff");

        // visual slash effect
        const slash = this.add.rectangle(this.enemy.x, this.enemy.y, 50, 5, 0xffffff);
        slash.setAngle(Phaser.Math.Between(0, 180));
        this.time.delayedCall(100, () => slash.destroy());
      }
    }
  }

  castHeal() {
    const healAmount = 30;
    this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmount);
    this.showFloatingText(this.player.x, this.player.y - 20, `+${healAmount}`, "#00ff00");

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

  castVampiricDrain(damage: number) {
    if (Math.random() < 0.1) {
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");

      const healAmount = Math.floor(actualDmg * 0.5);
      this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmount);
      this.showFloatingText(this.player.x, this.player.y - 20, `+${healAmount}`, "#00ff00");

      // visual effect
      const line = this.add.graphics();
      line.lineStyle(6, 0xff0000);
      line.beginPath();
      line.moveTo(this.player.x, this.player.y);
      line.lineTo(this.enemy.x, this.enemy.y);
      line.strokePath();
      this.time.delayedCall(150, () => line.destroy());
    }
  }

  castFreeze(time: number) {
    const proj = this.add.circle(this.player.x, this.player.y, 8, 0x00ffff) as any;
    this.physics.add.existing(proj);
    this.projectiles.add(proj);
    proj.isFreeze = true;
    proj.castTime = time;
    this.physics.moveToObject(proj, this.enemy, 350);
    this.time.delayedCall(2000, () => { if (proj.active) proj.destroy(); });
  }

  castEarthquake(damage: number) {
    this.cameras.main.shake(300, 0.02);

    if (Math.random() < 0.1) {
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#8b4513");

      // pushback
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
      if (this.enemy && this.enemy.active && this.enemy.body) {
        (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * 300, Math.sin(angle) * 300);
      }
      this.time.delayedCall(200, () => {
        if (this.enemyFrozenTime === 0 && this.enemy && this.enemy.active && this.enemy.body) {
          (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0,0);
        }
      });
    }
  }

  castLightning(damage: number) {
    // Instant line
    const graphics = this.add.graphics();
    graphics.lineStyle(4, 0xffff00);
    graphics.beginPath();
    graphics.moveTo(this.player.x, this.player.y);
    graphics.lineTo(this.enemy.x, this.enemy.y);
    graphics.strokePath();

    if (Math.random() < 0.1) {
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffff00");
    }

    this.time.delayedCall(150, () => graphics.destroy());
  }

  applyPoisonTick(ticksRemaining: number) {
    if (ticksRemaining <= 0 || this.isGameOver) return;
    this.enemyStats.hp -= 2; // Flat poison damage
    this.showFloatingText(this.enemy.x, this.enemy.y - 20, "-2", "#800080");

    this.enemy.setTint(0x800080);
    this.time.delayedCall(200, () => { if (this.enemy) this.enemy.clearTint(); });

    this.time.delayedCall(1000, () => this.applyPoisonTick(ticksRemaining - 1));
  }

  handleProjectileHit(projectile: Phaser.GameObjects.GameObject, _enemy: Phaser.GameObjects.GameObject) {
    const proj = projectile as any;
    if (proj.isPoison) {
      this.applyPoisonTick(5); // 5 ticks of poison
    } else if (proj.isFreeze) {
      this.enemyFrozenTime = this.time.now;
      this.enemy.setTint(0x00ffff);
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Frozen!", "#00ffff");
    } else {
      if (Math.random() < 0.1) {
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
      } else {
        let actualDmg = Math.max(1, proj.damage - this.enemyStats.defense);
        let isCrit = false;
        if (Math.random() < 0.15) {
          actualDmg *= 2;
          isCrit = true;
        }
        this.enemyStats.hp -= actualDmg;
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffa500");
      }
    }
    proj.destroy();
  }
}
