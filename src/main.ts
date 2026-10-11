import './style.css'
import { db, initDB } from './db'
import { aiManager, type StrategyJSON } from './AIManager'

// App State
let currentScreen = 'home-screen';
let isResting = false;

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
      <p>Fatigue: ${stats.fatigue || 0}/100</p>
    `;

    const trainBtn = document.getElementById('train-btn') as HTMLButtonElement;
    const prepBtn = document.getElementById('go-prep-btn') as HTMLButtonElement;
    const restBtn = document.getElementById('rest-btn') as HTMLButtonElement;

    const isExhausted = (stats.fatigue || 0) >= 100;
    trainBtn.disabled = isExhausted || isResting;
    prepBtn.disabled = isExhausted || isResting;
    restBtn.disabled = isResting;

    if (isResting) {
      restBtn.textContent = "Sleeping... zZz";
    } else {
      restBtn.textContent = "Rest (-Fatigue)";
    }
  }
}

async function handleTrain() {
  if (isResting) return;
  const stats = await db.MonsterStats.get(1);
  if (stats) {
    if (stats.hunger < 10) {
      alert("Monster is too hungry to train!");
      return;
    }
    if ((stats.fatigue || 0) >= 100) {
      alert("Monster is too tired to train!");
      return;
    }
    stats.hunger -= 10;
    stats.fatigue = Math.min((stats.fatigue || 0) + 20, 100);
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

async function handleRest() {
  if (isResting) return;
  const stats = await db.MonsterStats.get(1);
  if (stats) {
    isResting = true;
    renderHomeStats();

    setTimeout(async () => {
      const currentStats = await db.MonsterStats.get(1);
      if (currentStats) {
        currentStats.fatigue = 0;
        await db.MonsterStats.put(currentStats);
      }
      isResting = false;
      renderHomeStats();
    }, 5000);
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
  document.getElementById('rest-btn')!.addEventListener('click', handleRest);

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
          } else if (item.item_name === 'Energy Drink') {
            currentStats.fatigue = Math.max((currentStats.fatigue || 0) - 50, 0);
            await db.MonsterStats.put(currentStats);
          } else if (item.item_name === 'Mystery Box') {
            const rng = Math.random();
            if (rng < 0.33) {
              currentStats.currency += 100;
              alert("Mystery Box opened: +100 Coins!");
            } else if (rng < 0.66) {
              currentStats.xp += 100;
              alert("Mystery Box opened: +100 XP!");
            } else {
              const pot = await db.Inventory.where('item_name').equals('Health Potion').first();
              if (pot) {
                pot.quantity += 1;
                await db.Inventory.put(pot);
              } else {
                await db.Inventory.add({ item_name: 'Health Potion', type: 'consumable', quantity: 1 });
              }
              alert("Mystery Box opened: +1 Health Potion!");
            }
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

  const buyEnergyBtn = document.createElement('button');
  buyEnergyBtn.id = 'buy-energy-btn';
  buyEnergyBtn.textContent = 'Buy Energy Drink (30 coins)';
  document.getElementById('shop-items')!.appendChild(buyEnergyBtn);

  buyEnergyBtn.addEventListener('click', async () => {
    const stats = await db.MonsterStats.get(1);
    if (stats && stats.currency >= 30) {
      stats.currency -= 30;
      await db.MonsterStats.put(stats);

      const existingItem = await db.Inventory.where('item_name').equals('Energy Drink').first();
      if (existingItem) {
        existingItem.quantity += 1;
        await db.Inventory.put(existingItem);
      } else {
        await db.Inventory.add({
          item_name: 'Energy Drink',
          type: 'consumable',
          quantity: 1
        });
      }
      renderShop();
    } else {
      alert("Not enough coins!");
    }
  });

  const buyMysteryBoxBtn = document.createElement('button');
  buyMysteryBoxBtn.id = 'buy-mystery-box-btn';
  buyMysteryBoxBtn.textContent = 'Buy Mystery Box (50 coins)';
  document.getElementById('shop-items')!.appendChild(buyMysteryBoxBtn);

  buyMysteryBoxBtn.addEventListener('click', async () => {
    const stats = await db.MonsterStats.get(1);
    if (stats && stats.currency >= 50) {
      stats.currency -= 50;
      await db.MonsterStats.put(stats);

      const existingItem = await db.Inventory.where('item_name').equals('Mystery Box').first();
      if (existingItem) {
        existingItem.quantity += 1;
        await db.Inventory.put(existingItem);
      } else {
        await db.Inventory.add({
          item_name: 'Mystery Box',
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
      const stats = await db.MonsterStats.get(1);
      if (!stats) return;

      if ((stats.fatigue || 0) >= 100) {
        alert("Monster is too tired to fight!");
        return;
      }

      stats.fatigue = Math.min((stats.fatigue || 0) + 30, 100);
      await db.MonsterStats.put(stats);

      showScreen('game-screen');

      // Clear the combat log and initialize it with a start message
      const logContainer = document.getElementById('combat-log');
      if (logContainer) logContainer.innerHTML = '<p>--- Battle Started ---</p>';

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
            defense: stats.defense,
            isEvolved: stats.isEvolved
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

  // Combat Log Listener
  window.addEventListener('combat-log', (e: any) => {
    const msg = e.detail;
    const logContainer = document.getElementById('combat-log');
    if (logContainer) {
      const p = document.createElement('p');
      p.textContent = msg;
      logContainer.appendChild(p);
      logContainer.scrollTop = logContainer.scrollHeight;
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

        // Evolution check
        if (stats.level >= 5 && !stats.isEvolved) {
          stats.isEvolved = true;
          stats.hp += 100;
          stats.attack += 10;
          stats.defense += 10;
          alert("WHAT IS HAPPENING?! YOUR MONSTER HAS EVOLVED!");
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
