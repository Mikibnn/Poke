import Phaser from 'phaser';
import type { StrategyJSON } from './AIManager';

export interface BattleData {
  strategy: StrategyJSON;
  playerStats: { hp: number; maxHp: number; attack: number; defense: number, isEvolved?: boolean };
  enemyStats?: { hp: number; maxHp: number; attack: number; defense: number, name?: string, color?: number };
}

export class BattleScene extends Phaser.Scene {
  player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  enemy!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  playerHealthBar!: Phaser.GameObjects.Rectangle;
  enemyHealthBar!: Phaser.GameObjects.Rectangle;

  strategy!: StrategyJSON;
  playerStats!: { hp: number; maxHp: number; attack: number; defense: number, isEvolved?: boolean };
  enemyStats = { hp: 100, maxHp: 100, attack: 10, defense: 5, name: "Enemy", color: 0xffffff };

  lastSkillTime = 0;
  skillCooldown = 1500; // ms

  enemyLastSkillTime = 0;
  enemySkillCooldown = 2000;

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
      this.enemyStats = { ...this.enemyStats, ...data.enemyStats };
    }
  }

  create() {
    // Background Grid
    this.add.grid(400, 300, 800, 600, 64, 64, 0x111111, 1, 0x222222, 1);

    // Player
    this.player = this.add.image(200, 300, 'heroTex') as any;

    let baseScale = 4;
    if (this.playerStats.isEvolved) {
      baseScale = 6;
      this.player.setTint(0xffd700); // Gold tint

      // Evolved particle aura
      this.add.particles(0, 0, 'heroTex', {
        speed: 20,
        scale: { start: 0.2, end: 0 },
        blendMode: 'ADD',
        lifespan: 500,
        tint: 0xffd700,
        frequency: 100,
        follow: this.player
      });
    }

    this.player.setScale(baseScale);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    // Add simple breathing animation
    this.tweens.add({
      targets: this.player,
      scaleY: baseScale * 0.95,
      scaleX: baseScale * 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Enemy
    this.enemy = this.add.image(600, 300, 'enemyTex') as any;
    this.enemy.setScale(4);
    if (this.enemyStats.color !== undefined) {
      this.enemy.setTint(this.enemyStats.color);
    }
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
    this.physics.add.collider(this.projectiles, this.player, this.handleProjectileHit.bind(this) as any);

    this.isGameOver = false;
  }

  isGameOver = false;

  update(time: number, _delta: number) {
    if (this.isGameOver) return;

    this.updateHealthBars();
    this.handleMovement(time);
    this.handleSkills(time);
    this.handleEnemySkills(time);
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

  audioCtx: AudioContext | null = null;

  playSound(type: 'hit' | 'shoot') {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        return; // Web Audio API not supported
      }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.1);
    } else if (type === 'shoot') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.1);
    }
  }

  logEvent(msg: string) {
    window.dispatchEvent(new CustomEvent('combat-log', { detail: msg }));
  }

  playAttackAnim(attacker: Phaser.GameObjects.Image) {
    this.playSound('shoot');
    const originalScaleX = attacker.scaleX;
    const originalScaleY = attacker.scaleY;
    this.tweens.add({
      targets: attacker,
      scaleX: originalScaleX * 1.3,
      scaleY: originalScaleY * 1.3,
      angle: 15,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        attacker.scaleX = originalScaleX;
        attacker.scaleY = originalScaleY;
        attacker.angle = 0;
      }
    });
  }

  playHurtAnim(victim: Phaser.GameObjects.Image) {
    this.playSound('hit');
    const originalX = victim.x;
    victim.setTint(0xff0000);
    this.tweens.add({
      targets: victim,
      x: originalX + (Math.random() > 0.5 ? 10 : -10),
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        victim.x = originalX;
        victim.clearTint();
      }
    });
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

  handleMovement(time: number) {
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
        // Strafing logic
        if (this.player.body) {
           const angle = Phaser.Math.Angle.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
           // Strafe left/right perpendicular to the angle to enemy
           const strafeAngle = angle + (Math.PI / 2);
           // Modulate strafe direction over time using sine wave
           const strafeSpeed = (speed * 0.5) * Math.sin(time / 500);

           (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(strafeAngle) * strafeSpeed, Math.sin(strafeAngle) * strafeSpeed);
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

      this.logEvent(`Hero casts ${primarySkill}`);

      this.playAttackAnim(this.player);

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
    }
  }

  handleEnemySkills(time: number) {
    if (this.enemyFrozenTime > 0) return; // Enemy is frozen

    if (time > this.enemyLastSkillTime + this.enemySkillCooldown) {
      this.enemyLastSkillTime = time;
      this.playAttackAnim(this.enemy);

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
      const baseDamage = this.enemyStats.attack;

      // Determine enemy skill
      let chosenSkill = 'Slash';
      if (dist > 100) {
        const rng = Math.random();
        if (rng < 0.5) chosenSkill = 'Fireball';
        else if (rng < 0.8) chosenSkill = 'Lightning';
        else chosenSkill = 'Poison';
      }

      this.logEvent(`${this.enemyStats.name} casts ${chosenSkill}`);

      if (chosenSkill === 'Slash') {
        if (dist < 60) {
          if (Math.random() < 0.1) {
            this.showFloatingText(this.player.x, this.player.y - 20, "Dodge!", "#aaaaaa");
            this.logEvent("Hero dodged enemy Slash!");
          } else {
            let dmg = Math.max(1, baseDamage - this.playerStats.defense);
            let isCrit = false;
            if (Math.random() < 0.15) {
              dmg *= 2;
              isCrit = true;
            }
            this.playerStats.hp -= dmg;
            this.showFloatingText(this.player.x, this.player.y - 20, `-${Math.floor(dmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");
            this.logEvent(`${this.enemyStats.name}'s Slash hits Hero for ${Math.floor(dmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);
            this.playHurtAnim(this.player);

            const slash = this.add.rectangle(this.player.x, this.player.y, 50, 5, 0xffffff);
            slash.setAngle(Phaser.Math.Between(0, 180));
            this.time.delayedCall(100, () => slash.destroy());
          }
        }
      } else if (chosenSkill === 'Fireball' || chosenSkill === 'Poison') {
        const proj = this.add.circle(this.enemy.x, this.enemy.y, 8, chosenSkill === 'Poison' ? 0x800080 : 0xffa500) as any;
        this.physics.add.existing(proj);
        this.projectiles.add(proj);

        proj.isEnemyProjectile = true;
        proj.isPoison = chosenSkill === 'Poison';
        proj.damage = baseDamage;

        const particles = this.add.particles(0, 0, 'enemyTex', {
          speed: 30,
          scale: { start: 0.5, end: 0 },
          blendMode: 'ADD',
          lifespan: 300,
          tint: chosenSkill === 'Poison' ? 0x800080 : 0xffa500
        });
        particles.startFollow(proj);
        proj.particles = particles;

        this.physics.moveToObject(proj, this.player, 250);

        this.time.delayedCall(3000, () => {
            if (proj.active) {
              proj.destroy();
              if (proj.particles) proj.particles.destroy();
            }
        });
      } else if (chosenSkill === 'Lightning') {
        const graphics = this.add.graphics();
        graphics.lineStyle(4, 0xffff00);
        graphics.beginPath();
        graphics.moveTo(this.enemy.x, this.enemy.y);
        const midX = (this.player.x + this.enemy.x) / 2 + (Math.random() * 40 - 20);
        const midY = (this.player.y + this.enemy.y) / 2 + (Math.random() * 40 - 20);
        graphics.lineTo(midX, midY);
        graphics.lineTo(this.player.x, this.player.y);
        graphics.strokePath();

        const particles = this.add.particles(this.player.x, this.player.y, 'enemyTex', {
          speed: 150,
          scale: { start: 0.2, end: 0 },
          blendMode: 'ADD',
          lifespan: 300,
          tint: 0xffff00,
          quantity: 10
        });
        this.time.delayedCall(300, () => particles.destroy());

        if (Math.random() < 0.1) {
          this.showFloatingText(this.player.x, this.player.y - 20, "Dodge!", "#aaaaaa");
          this.logEvent("Hero dodged enemy Lightning!");
        } else {
          let actualDmg = Math.max(1, (baseDamage * 1.5) - this.playerStats.defense);
          let isCrit = false;
          if (Math.random() < 0.15) {
            actualDmg *= 2;
            isCrit = true;
          }
          this.playerStats.hp -= actualDmg;
          this.showFloatingText(this.player.x, this.player.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");
          this.logEvent(`${this.enemyStats.name}'s Lightning strikes Hero for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);
          this.playHurtAnim(this.player);
        }

        this.time.delayedCall(150, () => graphics.destroy());
      }
    }
  }

  castFireball(damage: number) {
    const proj = this.add.circle(this.player.x, this.player.y, 8, 0xffa500) as any;
    this.physics.add.existing(proj);
    this.projectiles.add(proj);

    // Add particle trail
    const particles = this.add.particles(0, 0, 'heroTex', {
      speed: 50,
      scale: { start: 0.5, end: 0 },
      blendMode: 'ADD',
      lifespan: 300,
      tint: 0xffa500
    });
    particles.startFollow(proj);

    // @ts-ignore attach damage
    proj.damage = damage;
    proj.particles = particles;

    this.physics.moveToObject(proj, this.enemy, 300);

    // Destroy after 3s
    this.time.delayedCall(3000, () => {
        if (proj.active) {
          proj.destroy();
          if (proj.particles) proj.particles.destroy();
        }
    });
  }

  castSlash(damage: number) {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
    if (dist < 60) {
      if (Math.random() < 0.1) {
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
        this.logEvent("Enemy dodged Slash!");
      } else {
        let actualDmg = Math.max(1, damage - this.enemyStats.defense);
        let isCrit = false;
        if (Math.random() < 0.15) {
          actualDmg *= 2;
          isCrit = true;
        }
        this.enemyStats.hp -= actualDmg;
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffffff");
        this.logEvent(`Slash hits ${this.enemyStats.name} for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);

        this.playHurtAnim(this.enemy);

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
    this.logEvent(`Hero heals for ${healAmount} HP`);

    // Healing Particles
    const particles = this.add.particles(this.player.x, this.player.y, 'heroTex', {
      speed: { min: -100, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      blendMode: 'ADD',
      lifespan: 800,
      tint: 0x00ff00,
      gravityY: -200,
      quantity: 15
    });
    this.time.delayedCall(800, () => particles.destroy());

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
      this.logEvent("Hero activates Shield! Defense doubled.");
    }
    this.playerShieldedTime = time;
    this.player.setTint(0x8888ff);
  }

  castPoison() {
    const proj = this.add.circle(this.player.x, this.player.y, 8, 0x800080) as any;
    this.physics.add.existing(proj);
    this.projectiles.add(proj);
    proj.isPoison = true;

    const particles = this.add.particles(0, 0, 'heroTex', {
      speed: 20,
      scale: { start: 0.3, end: 0 },
      lifespan: 400,
      tint: 0x800080,
      frequency: 50
    });
    particles.startFollow(proj);
    proj.particles = particles;

    this.physics.moveToObject(proj, this.enemy, 250);
    this.time.delayedCall(3000, () => {
      if (proj.active) {
        proj.destroy();
        if (proj.particles) proj.particles.destroy();
      }
    });
  }

  castVampiricDrain(damage: number) {
    if (Math.random() < 0.1) {
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
      this.logEvent("Enemy dodged Vampiric Drain!");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");

      this.playHurtAnim(this.enemy);

      const healAmount = Math.floor(actualDmg * 0.5);
      this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + healAmount);
      this.showFloatingText(this.player.x, this.player.y - 20, `+${healAmount}`, "#00ff00");
      this.logEvent(`Vampiric Drain hits for ${Math.floor(actualDmg)} damage and heals Hero for ${healAmount}`);

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
      this.logEvent("Enemy dodged Earthquake!");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#8b4513");
      this.logEvent(`Earthquake hits ${this.enemyStats.name} for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);

      this.playHurtAnim(this.enemy);

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
    // Add jitter to lightning
    const midX = (this.player.x + this.enemy.x) / 2 + (Math.random() * 40 - 20);
    const midY = (this.player.y + this.enemy.y) / 2 + (Math.random() * 40 - 20);
    graphics.lineTo(midX, midY);
    graphics.lineTo(this.enemy.x, this.enemy.y);
    graphics.strokePath();

    // Sparks at target
    const particles = this.add.particles(this.enemy.x, this.enemy.y, 'heroTex', {
      speed: 150,
      scale: { start: 0.2, end: 0 },
      blendMode: 'ADD',
      lifespan: 300,
      tint: 0xffff00,
      quantity: 10
    });
    this.time.delayedCall(300, () => particles.destroy());

    if (Math.random() < 0.1) {
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
      this.logEvent("Enemy dodged Lightning!");
    } else {
      let actualDmg = Math.max(1, damage - this.enemyStats.defense);
      let isCrit = false;
      if (Math.random() < 0.15) {
        actualDmg *= 2;
        isCrit = true;
      }
      this.enemyStats.hp -= actualDmg;
      this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffff00");
      this.logEvent(`Lightning strikes ${this.enemyStats.name} for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);
      this.playHurtAnim(this.enemy);
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

  playerPoisonTicks = 0;

  applyPlayerPoisonTick(ticksRemaining: number) {
    if (ticksRemaining <= 0 || this.isGameOver) return;
    this.playerStats.hp -= 2;
    this.showFloatingText(this.player.x, this.player.y - 20, "-2", "#800080");

    this.player.setTint(0x800080);
    this.time.delayedCall(200, () => { if (this.player) this.player.clearTint(); });

    this.time.delayedCall(1000, () => this.applyPlayerPoisonTick(ticksRemaining - 1));
  }

  handleProjectileHit(_target: Phaser.GameObjects.GameObject, projectile: Phaser.GameObjects.GameObject) {
    const proj = projectile as any;
    if (proj.particles) {
      proj.particles.destroy();
    }

    if (proj.isEnemyProjectile) {
      // Hit Player
      if (proj.isPoison) {
        this.applyPlayerPoisonTick(5);
        this.logEvent("Hero is Poisoned!");
      } else {
        if (Math.random() < 0.1) {
          this.showFloatingText(this.player.x, this.player.y - 20, "Dodge!", "#aaaaaa");
          this.logEvent("Hero dodged enemy projectile!");
        } else {
          let actualDmg = Math.max(1, (proj.damage || 0) - this.playerStats.defense);
          let isCrit = false;
          if (Math.random() < 0.15) {
            actualDmg *= 2;
            isCrit = true;
          }
          this.playerStats.hp -= actualDmg;
          this.showFloatingText(this.player.x, this.player.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ff0000");
          this.logEvent(`${this.enemyStats.name}'s Fireball hits Hero for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);
          this.playHurtAnim(this.player);
        }
      }
    } else {
      // Hit Enemy
      if (proj.isPoison) {
        this.applyPoisonTick(5);
        this.logEvent(`${this.enemyStats.name} is Poisoned!`);
      } else if (proj.isFreeze) {
        this.enemyFrozenTime = this.time.now;
        this.enemy.setTint(0x00ffff);
        this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Frozen!", "#00ffff");
        this.logEvent(`${this.enemyStats.name} is Frozen!`);
      } else {
        if (Math.random() < 0.1) {
          this.showFloatingText(this.enemy.x, this.enemy.y - 20, "Dodge!", "#aaaaaa");
          this.logEvent("Enemy dodged Fireball!");
        } else {
          let actualDmg = Math.max(1, (proj.damage || 0) - this.enemyStats.defense);
          let isCrit = false;
          if (Math.random() < 0.15) {
            actualDmg *= 2;
            isCrit = true;
          }
          this.enemyStats.hp -= actualDmg;
          this.showFloatingText(this.enemy.x, this.enemy.y - 20, `-${Math.floor(actualDmg)}${isCrit ? ' CRIT!' : ''}`, isCrit ? "#ff8800" : "#ffa500");
          this.logEvent(`Fireball hits ${this.enemyStats.name} for ${Math.floor(actualDmg)} damage${isCrit ? ' (Critical Hit!)' : ''}`);
          this.playHurtAnim(this.enemy);
        }
      }
    }

    proj.destroy();
  }
}
