import Phaser from 'phaser';
import { BattleScene } from './BattleScene';

export function createGame() {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 800,
    height: 600,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false
      }
    },
    scene: [BattleScene]
  };

  return new Phaser.Game(config);
}
