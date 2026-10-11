import './style.css'
import { db, initDB } from './db'
import { aiManager, type StrategyJSON } from './AIManager'

// App State
let currentScreen = 'home-screen';

function showScreen(screenId: string) {
  document.getElementById(currentScreen)!.style.display = 'none';
  document.getElementById(screenId)!.style.display = 'block';
  currentScreen = screenId;
}

async function renderHomeStats() {
  const stats = await db.MonsterStats.get(1);
  if (stats) {
    const display = document.getElementById('stats-display')!;
    display.innerHTML = `
      <h2>Stage: ${stats.currentStage || 1}</h2>
      <p>Level: ${stats.level} (XP: ${stats.xp})</p>
      <p>HP: ${stats.hp}</p>
      <p>Attack: ${stats.attack}</p>
      <p>Defense: ${stats.defense}</p>
      <p>Coins: ${stats.currency}</p>
      <p>Hunger: ${stats.hunger}</p>
    `;
  }
}

async function handleTrain() {
  const stats = await db.MonsterStats.get(1);
  if (stats) {
    if (stats.hunger < 10) {
      alert("Monster is too hungry to train!");
      return;
    }
    stats.hunger -= 10;
    stats.xp += 10;
    if (stats.xp >= stats.level * 100) {
      stats.xp = 0;
      stats.level += 1;
      stats.hp += 10;
      stats.attack += 2;
      stats.defense += 1;
    }
    await db.MonsterStats.put(stats);
    await renderHomeStats();
  }
}

// Simple time loop for hunger
setInterval(async () => {
  const stats = await db.MonsterStats.get(1);
  if (stats && stats.hunger > 0) {
    stats.hunger = Math.max(0, stats.hunger - 1);
    await db.MonsterStats.put(stats);
    if (currentScreen === 'home-screen') {
      renderHomeStats();
    }
  }
}, 60000); // decrease hunger every minute

async function init() {
  await initDB();
  await renderHomeStats();

  // Setup Event Listeners
  document.getElementById('train-btn')!.addEventListener('click', handleTrain);

  async function renderShop() {
    const stats = await db.MonsterStats.get(1);
    if (!stats) return;

    const shopDisplay = document.getElementById('shop-stats-display')!;
    shopDisplay.innerHTML = `<p>Coins: ${stats.currency}</p>`;

    const inv = await db.Inventory.toArray();
    const invDisplay = document.getElementById('inventory-display')!;
    invDisplay.innerHTML = '<h3>Inventory</h3><ul>' + inv.map(i => `<li>${i.item_name} (x${i.quantity}) <button class="use-item-btn" data-id="${i.id}">Use</button></li>`).join('') + '</ul>';

    document.querySelectorAll('.use-item-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = Number((e.target as HTMLButtonElement).dataset.id);
        const item = await db.Inventory.get(id);
        const currentStats = await db.MonsterStats.get(1);
        if (item && currentStats && item.quantity > 0) {
          if (item.item_name === 'Health Potion') {
            currentStats.hp = Math.min(currentStats.hp + 50, 100 + (currentStats.level * 10)); // Approximate maxHP
            await db.MonsterStats.put(currentStats);
          } else if (item.item_name === 'Food') {
            currentStats.hunger = Math.min(currentStats.hunger + 30, 100);
            await db.MonsterStats.put(currentStats);
          }
          item.quantity -= 1;
          if (item.quantity <= 0) {
            await db.Inventory.delete(id);
          } else {
            await db.Inventory.put(item);
          }
          renderShop();
        }
      });
    });
  }

  document.getElementById('go-shop-btn')!.addEventListener('click', () => {
    showScreen('shop-screen');
    renderShop();
  });

  document.getElementById('buy-potion-btn')!.addEventListener('click', async () => {
    const stats = await db.MonsterStats.get(1);
    if (stats && stats.currency >= 50) {
      stats.currency -= 50;
      await db.MonsterStats.put(stats);

      const existingPotion = await db.Inventory.where('item_name').equals('Health Potion').first();
      if (existingPotion) {
        existingPotion.quantity += 1;
        await db.Inventory.put(existingPotion);
      } else {
        await db.Inventory.add({
          item_name: 'Health Potion',
          type: 'consumable',
          quantity: 1
        });
      }
      renderShop();
    } else {
      alert("Not enough coins!");
    }
  });

  const buyFoodBtn = document.createElement('button');
  buyFoodBtn.id = 'buy-food-btn';
  buyFoodBtn.textContent = 'Buy Food (20 coins)';
  document.getElementById('shop-items')!.appendChild(buyFoodBtn);

  buyFoodBtn.addEventListener('click', async () => {
    const stats = await db.MonsterStats.get(1);
    if (stats && stats.currency >= 20) {
      stats.currency -= 20;
      await db.MonsterStats.put(stats);

      const existingFood = await db.Inventory.where('item_name').equals('Food').first();
      if (existingFood) {
        existingFood.quantity += 1;
        await db.Inventory.put(existingFood);
      } else {
        await db.Inventory.add({
          item_name: 'Food',
          type: 'consumable',
          quantity: 1
        });
      }
      renderShop();
    } else {
      alert("Not enough coins!");
    }
  });

  document.getElementById('go-prep-btn')!.addEventListener('click', () => {
    showScreen('prep-screen');
  });

  document.getElementById('back-home-from-shop')!.addEventListener('click', () => {
    showScreen('home-screen');
    renderHomeStats();
  });

  document.getElementById('back-home-from-prep')!.addEventListener('click', () => {
    showScreen('home-screen');
  });

  // Arena Prep Logic
  const generateBtn = document.getElementById('generate-strategy-btn') as HTMLButtonElement;
  const startBattleBtn = document.getElementById('start-battle-btn') as HTMLButtonElement;
  const strategyInput = document.getElementById('strategy-input') as HTMLTextAreaElement;
  const strategyOutput = document.getElementById('strategy-output') as HTMLPreElement;
  let currentStrategy: StrategyJSON | null = null;

  generateBtn.addEventListener('click', async () => {
    const text = strategyInput.value.trim();
    if (!text) return;

    generateBtn.disabled = true;
    startBattleBtn.disabled = true;
    strategyOutput.textContent = "Loading AI Engine and generating strategy (this might take a moment to download the model the first time)...";

    try {
      await aiManager.init((progress) => {
        strategyOutput.textContent = `Loading Model: ${(progress * 100).toFixed(1)}%`;
      });
      strategyOutput.textContent = "Generating strategy...";

      currentStrategy = await aiManager.generateStrategy(text);
      strategyOutput.textContent = JSON.stringify(currentStrategy, null, 2);
      console.log("Generated Strategy:", currentStrategy);
    } catch (e) {
      strategyOutput.textContent = "Error generating strategy. Falling back to default aggressive strategy.\n\n" + String(e);
      console.error(e);
      currentStrategy = {
        aggressiveness: 1.0,
        preferred_distance: 'melee',
        skill_priorities: ['Lightning', 'Slash', 'Fireball'],
        flee_threshold: 10,
        healing_threshold: 20,
        tactical_logic: "Fallback aggressive strategy due to AI load failure."
      };
    } finally {
      generateBtn.disabled = false;
      startBattleBtn.disabled = false;
    }
  });

  let gameInstance: Phaser.Game | null = null;
  startBattleBtn.addEventListener('click', async () => {
    if (currentStrategy) {
      showScreen('game-screen');
      const stats = await db.MonsterStats.get(1);
      if (!stats) return;

      if (!gameInstance) {
        const { createGame } = await import('./game');
        gameInstance = createGame();
      }

      // Wait a tick for scene to register, then start with data
      setTimeout(() => {
        const stage = stats.currentStage || 1;
        gameInstance!.scene.start('BattleScene', {
          strategy: currentStrategy,
          playerStats: {
            hp: stats.hp,
            maxHp: stats.hp,
            attack: stats.attack,
            defense: stats.defense
          },
          enemyStats: {
            hp: 50 + (stage * 20),
            maxHp: 50 + (stage * 20),
            attack: 5 + (stage * 3),
            defense: Math.floor(stage * 1.5)
          }
        });
      }, 100);
    }
  });

  // Tactical Pause Logic
  const changeTacticsBtn = document.getElementById('change-tactics-btn') as HTMLButtonElement;
  const tacticsOverlay = document.getElementById('tactics-overlay') as HTMLDivElement;
  const tacticsContext = document.getElementById('tactics-context') as HTMLParagraphElement;
  const applyTacticsBtn = document.getElementById('apply-tactics-btn') as HTMLButtonElement;
  const tacticsInput = document.getElementById('tactics-input') as HTMLTextAreaElement;

  changeTacticsBtn.addEventListener('click', () => {
    if (!gameInstance) return;
    const scene = gameInstance.scene.getScene('BattleScene') as any;
    if (!scene) return;

    scene.scene.pause();
    tacticsOverlay.style.display = 'block';

    tacticsContext.innerHTML = `Player HP: ${Math.floor(scene.playerStats.hp)}/${scene.playerStats.maxHp} | Enemy HP: ${Math.floor(scene.enemyStats.hp)}/${scene.enemyStats.maxHp}<br>
                                Current Distance: ${Math.floor(Phaser.Math.Distance.Between(scene.player.x, scene.player.y, scene.enemy.x, scene.enemy.y))}`;
  });

  applyTacticsBtn.addEventListener('click', async () => {
    if (!gameInstance) return;
    const scene = gameInstance.scene.getScene('BattleScene') as any;
    if (!scene) return;

    applyTacticsBtn.disabled = true;
    const oldText = applyTacticsBtn.textContent;
    applyTacticsBtn.textContent = "Updating Strategy...";

    try {
      const text = tacticsInput.value.trim();
      if (text) {
        const contextStr = `Player HP: ${scene.playerStats.hp}, Enemy HP: ${scene.enemyStats.hp}.`;
        const newStrategy = await aiManager.generateStrategy(text, contextStr);
        scene.strategy = newStrategy;
        console.log("Updated Strategy:", newStrategy);
      }
    } catch (e) {
      console.error(e);
    } finally {
      applyTacticsBtn.disabled = false;
      applyTacticsBtn.textContent = oldText || "Change Tactics";
      tacticsOverlay.style.display = 'none';
      scene.scene.resume();
    }
  });

  // Listen for Battle End Event
  window.addEventListener('battle-end', async (e: any) => {
    const { win } = e.detail;

    if (win) {
      const stats = await db.MonsterStats.get(1);
      if (stats) {
        const stage = stats.currentStage || 1;
        const coinsEarned = 20 + (stage * 10);
        const xpEarned = 30 + (stage * 15);

        stats.currency += coinsEarned;
        stats.xp += xpEarned;
        stats.currentStage = stage + 1;

        // Level up check
        if (stats.xp >= stats.level * 100) {
          stats.xp = 0;
          stats.level += 1;
          stats.hp += 10;
          stats.attack += 2;
          stats.defense += 1;
          alert(`You won! Earned ${coinsEarned} Coins, ${xpEarned} XP. LEVEL UP to ${stats.level}! Next Stage: ${stats.currentStage}`);
        } else {
          alert(`You won! Earned ${coinsEarned} Coins, ${xpEarned} XP. Next Stage: ${stats.currentStage}`);
        }

        await db.MonsterStats.put(stats);
      }
    } else {
      alert('You lost!');
    }

    if (gameInstance) {
      const scene = gameInstance.scene.getScene('BattleScene');
      if (scene) {
        scene.scene.stop();
      }
    }

    showScreen('home-screen');
    renderHomeStats();
  });
}

init();
