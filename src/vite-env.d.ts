/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  mode: string;
  health: number;
  stamina: number;
  level: number;
  xp: number;
  xpNeeded: number;
  kills: number;
  survived: number;
  enemies: number;
  enemyKinds: Record<string, number>;
  bosses: number;
  aimTargetIsBoss: boolean;
  enemyHealthRatios: number[];
  lowestEnemyHealthRatioSeen: number;
  waveNumber: number;
  projectiles: number;
  enemyProjectiles: number;
  deflectedEnemyProjectiles: number;
  scheduledShots: number;
  xpOrbs: number;
  healthOrbs: number;
  weapon: string;
  aimAngle: number;
  rolling: boolean;
  playerKnockback: number;
  skills: Record<string, number>;
  player: {
    position: { x: number; y: number; z: number };
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
}
