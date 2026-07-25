import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { Hud, type SkillChoiceView, type WeaponChoiceView } from '../systems/Hud';

type WeaponId = 'sprout-rifle' | 'bubble-shotgun' | 'star-smg';
type SkillId =
  | 'rapid'
  | 'damage'
  | 'multi'
  | 'speed'
  | 'pierce'
  | 'lightning'
  | 'hammers'
  | 'aura'
  | 'frost'
  | 'growth'
  | 'lucky'
  | 'regen';
type GameMode = 'weapon-select' | 'playing' | 'level-up' | 'paused' | 'game-over';

type Weapon = {
  id: WeaponId;
  name: string;
  icon: string;
  description: string;
  fireRate: number;
  projectileSpeed: number;
  damage: number;
  spread: number;
  pellets: number;
  color: string;
};

type Skill = {
  id: SkillId;
  name: string;
  icon: string;
  description: string;
};

type Enemy = {
  kind: EnemyKind;
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  xp: number;
  stunTimer: number;
  knockback: THREE.Vector3;
};

type EnemyKind = 'normal' | 'runner' | 'brute';

type EnemyConfig = {
  kind: EnemyKind;
  color: string;
  hp: number;
  speed: number;
  radius: number;
  xp: number;
  scale: THREE.Vector3Tuple;
};

type Projectile = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  pierce: number;
  age: number;
  radius: number;
};

type ScheduledShot = {
  timer: number;
  angle: number;
  damageMultiplier: number;
  pierceBonus: number;
  color: string;
};

type XpOrb = {
  mesh: THREE.Mesh;
  value: number;
  radius: number;
};

type HealthOrb = {
  mesh: THREE.Mesh;
  heal: number;
  radius: number;
};

const PLAYER_RADIUS = 0.55;
const MAX_SKILL_LEVEL = 12;
const MAX_STAMINA = 100;
const ROLL_COST = 35;
const ROLL_DURATION = 0.28;
const ROLL_SPEED = 16;

const ENEMY_CONFIGS: Record<EnemyKind, EnemyConfig> = {
  normal: {
    kind: 'normal',
    color: '#ff7b54',
    hp: 18,
    speed: 1.55,
    radius: 0.5,
    xp: 2,
    scale: [1, 0.78, 0.95],
  },
  runner: {
    kind: 'runner',
    color: '#f23b3b',
    hp: 12,
    speed: 2.65,
    radius: 0.42,
    xp: 2,
    scale: [0.82, 0.65, 0.82],
  },
  brute: {
    kind: 'brute',
    color: '#4caf50',
    hp: 46,
    speed: 0.92,
    radius: 0.74,
    xp: 5,
    scale: [1.42, 1.05, 1.32],
  },
};

const WEAPONS: Weapon[] = [
  {
    id: 'sprout-rifle',
    name: '射手步枪',
    icon: 'R',
    description: '精准三连发，自带穿透',
    fireRate: 2.35,
    projectileSpeed: 65,
    damage: 18,
    spread: 0.02,
    pellets: 1,
    color: '#f5ba49',
  },
  {
    id: 'bubble-shotgun',
    name: '泡泡霰弹',
    icon: 'B',
    description: '近距离扇形爆发',
    fireRate: 1.35,
    projectileSpeed: 52.5,
    damage: 13,
    spread: 0.22,
    pellets: 5,
    color: '#5bc3ee',
  },
  {
    id: 'star-smg',
    name: '星星冲锋枪',
    icon: 'S',
    description: '高射速，持续削怪',
    fireRate: 5.6,
    projectileSpeed: 60,
    damage: 9,
    spread: 0.08,
    pellets: 1,
    color: '#ff7fa3',
  },
];

const SKILLS: Skill[] = [
  { id: 'rapid', name: '连发机关', icon: '>>', description: '射速提升，重复选择继续升级' },
  { id: 'damage', name: '糖果弹头', icon: '+', description: '子弹伤害提升' },
  { id: 'multi', name: '双手开花', icon: '*', description: '额外发射子弹' },
  { id: 'speed', name: '溜冰鞋', icon: '^', description: '移动速度提升' },
  { id: 'pierce', name: '穿透果冻', icon: '|', description: '子弹可穿透更多怪物' },
  { id: 'lightning', name: '跳跳落雷', icon: 'L', description: '定时劈向怪群，升级增加次数和伤害' },
  { id: 'hammers', name: '旋风大锤', icon: 'H', description: '身边生成环绕大锤，越升越多越猛' },
  { id: 'aura', name: '蒜香泡泡', icon: 'A', description: '周围持续灼烧靠近的怪物' },
  { id: 'frost', name: '冰沙领域', icon: 'F', description: '降低附近怪物速度，升级扩大范围' },
  { id: 'growth', name: '经验糖果', icon: 'X', description: '获得更多经验，更快触发技能选择' },
  { id: 'lucky', name: '幸运骰子', icon: '?', description: '偶尔暴击，并让掉落经验更丰厚' },
  { id: 'regen', name: '草莓药瓶', icon: '+HP', description: '持续缓慢回血，升级后回复更快' },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud({
    onWeaponSelect: (id) => this.chooseWeapon(id as WeaponId),
    onSkillSelect: (id) => this.chooseSkill(id as SkillId),
    onPause: () => this.togglePause(),
    onRestart: () => this.restart(),
  });
  private readonly cameraRig = new CameraRig(this.camera, new THREE.Vector3(0, 12, 12));
  private readonly loop = new Loop((delta, elapsed) => this.update(delta, elapsed), () => this.render());

  private readonly player = this.createPlayer();
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly scheduledShots: ScheduledShot[] = [];
  private readonly xpOrbs: XpOrb[] = [];
  private readonly healthOrbs: HealthOrb[] = [];
  private readonly hammerMeshes: THREE.Mesh[] = [];
  private readonly reusableVector = new THREE.Vector3();
  private readonly aimNdc = new THREE.Vector2();
  private readonly aimPoint = new THREE.Vector3(0, 0, -1);
  private readonly aimRaycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly skillLevels = new Map<SkillId, number>();

  private mode: GameMode = 'weapon-select';
  private selectedWeapon: Weapon = WEAPONS[0];
  private health = 100;
  private stamina = MAX_STAMINA;
  private level = 1;
  private xp = 0;
  private xpNeeded = 6;
  private kills = 0;
  private survived = 0;
  private spawnTimer = 0;
  private fireTimer = 0;
  private lightningTimer = 1.2;
  private auraTimer = 0;
  private hitCooldown = 0;
  private rollTimer = 0;
  private rollCooldown = 0;
  private aimAngle = 0;
  private frame = 0;
  private readonly rollDirection = new THREE.Vector3(0, 0, -1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.08;

    this.input = new InputController(
      canvas,
      this.getElement('#touch-stick'),
      this.getElement('#touch-knob'),
      this.getElement('#dash-button'),
    );

    this.createScene();
    this.hud.showWeaponSelect(this.weaponViews());
    this.cameraRig.snapTo(this.player.position);
    resizeRenderer(this.renderer, this.camera, 2);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private chooseWeapon(id: WeaponId): void {
    this.selectedWeapon = WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
    this.mode = 'playing';
    this.hud.hideOverlay();
    this.hud.setWeapon(this.selectedWeapon.name, this.selectedWeapon.color);
  }

  private chooseSkill(id: SkillId): void {
    const current = this.skillLevels.get(id) ?? 0;
    if (current >= MAX_SKILL_LEVEL) return;
    this.skillLevels.set(id, current + 1);
    this.mode = 'playing';
    this.hud.hideOverlay();
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.hud.showPause();
      return;
    }
    if (this.mode === 'paused') {
      this.mode = 'playing';
      this.hud.hideOverlay();
    }
  }

  private restart(): void {
    for (const enemy of this.enemies.splice(0)) this.scene.remove(enemy.mesh);
    for (const projectile of this.projectiles.splice(0)) this.scene.remove(projectile.mesh);
    this.scheduledShots.length = 0;
    for (const orb of this.xpOrbs.splice(0)) this.scene.remove(orb.mesh);
    for (const orb of this.healthOrbs.splice(0)) this.scene.remove(orb.mesh);
    for (const hammer of this.hammerMeshes.splice(0)) this.scene.remove(hammer);
    this.player.position.set(0, 0, 0);
    this.health = 100;
    this.stamina = MAX_STAMINA;
    this.level = 1;
    this.xp = 0;
    this.xpNeeded = 6;
    this.kills = 0;
    this.survived = 0;
    this.spawnTimer = 0;
    this.fireTimer = 0;
    this.lightningTimer = 1.2;
    this.auraTimer = 0;
    this.hitCooldown = 0;
    this.rollTimer = 0;
    this.rollCooldown = 0;
    this.skillLevels.clear();
    this.mode = 'weapon-select';
    this.hud.showWeaponSelect(this.weaponViews());
  }

  private update(deltaRaw: number, elapsed: number): void {
    const delta = Math.min(deltaRaw, 0.05);
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, 2);

    if (this.mode === 'playing') {
      this.survived += delta;
      this.hitCooldown = Math.max(0, this.hitCooldown - delta);
      this.updateAim();
      this.updatePlayer(delta, elapsed);
      this.updateSpawning(delta);
      this.updateEnemies(delta, elapsed);
      this.updateScheduledShots(delta);
      this.updateShooting(delta);
      this.updateLightning(delta);
      this.updateHammers(delta, elapsed);
      this.updateAura(delta);
      this.updateHealing(delta);
      this.updateProjectiles(delta);
      this.updateXpOrbs(delta);
      this.updateHealthOrbs(delta);
    }

    this.cameraRig.update(delta, this.player.position, 0.16);
    this.hud.update({
      mode: this.mode,
      health: this.health,
      stamina: this.stamina,
      level: this.level,
      xp: this.xp,
      xpNeeded: this.xpNeeded,
      kills: this.kills,
      survived: this.survived,
      enemies: this.enemies.length,
      skills: this.skillSummary(),
    });
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(delta: number, elapsed: number): void {
    const move = new THREE.Vector2();
    this.input.readMovement(move);
    this.rollCooldown = Math.max(0, this.rollCooldown - delta);
    if (this.rollTimer <= 0) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + delta * 24);
    }
    if (this.input.consumeRollRequest() && this.stamina >= ROLL_COST && this.rollCooldown <= 0) {
      this.stamina -= ROLL_COST;
      this.rollTimer = ROLL_DURATION;
      this.rollCooldown = 0.42;
      if (move.lengthSq() > 0.01) {
        this.rollDirection.set(move.x, 0, move.y).normalize();
      } else {
        this.rollDirection.set(Math.sin(this.player.rotation.y), 0, -Math.cos(this.player.rotation.y)).normalize();
      }
    }

    const speed = 5.4 + this.skillLevel('speed') * 0.28;
    this.reusableVector.set(move.x, 0, move.y).multiplyScalar(speed * delta);
    this.player.position.add(this.reusableVector);
    if (this.rollTimer > 0) {
      this.player.position.addScaledVector(this.rollDirection, ROLL_SPEED * delta);
      this.rollTimer = Math.max(0, this.rollTimer - delta);
      this.player.rotation.z = Math.sin((ROLL_DURATION - this.rollTimer) * 42) * 0.18;
    } else {
      this.player.rotation.z = 0;
    }
    if (this.input.readAimNdc(this.aimNdc)) {
      this.player.rotation.y = this.aimAngle;
    } else if (move.lengthSq() > 0.01) {
      this.player.rotation.y = Math.atan2(move.x, -move.y);
    }
    this.player.position.y = Math.sin(elapsed * 8) * 0.04;
  }

  private updateAim(): void {
    const pointerAim = this.input.readAimNdc(this.aimNdc);
    if (pointerAim) {
      this.aimRaycaster.setFromCamera(pointerAim, this.camera);
      const hit = this.aimRaycaster.ray.intersectPlane(this.groundPlane, this.aimPoint);
      if (hit && hit.distanceToSquared(this.player.position) > 0.05) {
        this.aimAngle = Math.atan2(hit.x - this.player.position.x, hit.z - this.player.position.z);
        return;
      }
    }
    this.aimAngle = this.player.rotation.y;
  }

  private updateSpawning(delta: number): void {
    this.spawnTimer -= delta;
    const interval = Math.max(0.22, 1.1 - this.survived * 0.01);
    if (this.spawnTimer > 0) return;
    this.spawnTimer = interval;
    const count = 1 + Math.floor(this.survived / 28);
    for (let i = 0; i < count; i += 1) this.spawnEnemy();
  }

  private updateEnemies(delta: number, elapsed: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.stunTimer = Math.max(0, enemy.stunTimer - delta);
      enemy.mesh.position.addScaledVector(enemy.knockback, delta);
      enemy.knockback.multiplyScalar(Math.exp(-8 * delta));

      const direction = this.player.position.clone().sub(enemy.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.001) direction.normalize();
      const frostLevel = this.skillLevel('frost');
      const frostRange = 3.4 + frostLevel * 0.25;
      const frostFactor = frostLevel > 0 && distance < frostRange ? Math.max(0.46, 1 - frostLevel * 0.035) : 1;
      if (enemy.stunTimer <= 0) {
        enemy.mesh.position.addScaledVector(direction, enemy.speed * frostFactor * delta);
      }
      enemy.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      enemy.mesh.position.y = 0.08 + Math.sin(elapsed * (enemy.stunTimer > 0 ? 18 : 7) + i) * (enemy.stunTimer > 0 ? 0.025 : 0.05);

      if (distance < enemy.radius + PLAYER_RADIUS && this.hitCooldown <= 0 && this.rollTimer <= 0) {
        this.health -= 12;
        this.hitCooldown = 0.55;
        this.audio.hit();
        this.hud.flashDamage();
        if (this.health <= 0) {
          this.health = 0;
          this.mode = 'game-over';
          this.hud.showGameOver(this.kills, this.survived);
        }
      }
    }
  }

  private updateShooting(delta: number): void {
    this.fireTimer -= delta;
    const fireRate = this.selectedWeapon.fireRate * (1 + this.skillLevel('rapid') * 0.09);
    const singleShot = this.selectedWeapon.id === 'sprout-rifle' || this.selectedWeapon.id === 'bubble-shotgun';
    if (this.fireTimer > 0) return;
    const wantsFire = singleShot ? this.input.consumeFirePress() : this.input.isFireHeld();
    if (!wantsFire) return;
    this.fireTimer = 1 / fireRate;

    const baseAngle = this.aimAngle;
    this.aimAngle = baseAngle;
    const extraPellets = Math.floor(this.skillLevel('multi') / 3);
    if (this.selectedWeapon.id === 'sprout-rifle') {
      const burstCount = 5 + extraPellets;
      for (let i = 0; i < burstCount; i += 1) {
        const offset = (i - (burstCount - 1) / 2) * this.selectedWeapon.spread;
        this.scheduledShots.push({
          timer: i * 0.055,
          angle: baseAngle + offset,
          damageMultiplier: 0.88,
          pierceBonus: 2 + Math.floor(this.skillLevel('pierce') / 2),
          color: '#ffe066',
        });
      }
    } else {
      const pellets = this.selectedWeapon.pellets + extraPellets;
      for (let i = 0; i < pellets; i += 1) {
        const center = (pellets - 1) / 2;
        const angle = baseAngle + (i - center) * this.selectedWeapon.spread;
        this.spawnProjectile(angle);
      }
    }
    this.audio.shoot();
  }

  private updateScheduledShots(delta: number): void {
    for (let i = this.scheduledShots.length - 1; i >= 0; i -= 1) {
      const shot = this.scheduledShots[i];
      shot.timer -= delta;
      if (shot.timer > 0) continue;
      this.spawnProjectile(shot.angle, shot.damageMultiplier, shot.pierceBonus, shot.color);
      this.scheduledShots.splice(i, 1);
    }
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.y += delta * 12;

      let remove = projectile.age > 2.1;
      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        if (projectile.mesh.position.distanceTo(enemy.mesh.position) > projectile.radius + enemy.radius) continue;
        enemy.hp -= projectile.damage;
        projectile.pierce -= 1;
        this.flashEnemy(enemy.mesh);
        if (enemy.hp <= 0) this.killEnemy(j);
        if (projectile.pierce < 0) {
          remove = true;
          break;
        }
      }

      if (remove) {
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateXpOrbs(delta: number): void {
    for (let i = this.xpOrbs.length - 1; i >= 0; i -= 1) {
      const orb = this.xpOrbs[i];
      const distance = orb.mesh.position.distanceTo(this.player.position);
      const pull = this.player.position.clone().sub(orb.mesh.position).normalize();
      orb.mesh.position.addScaledVector(pull, delta * Math.max(7, distance * 2.2));
      orb.mesh.rotation.y += delta * 4;
      if (distance < PLAYER_RADIUS + orb.radius) {
        this.gainXp(orb.value);
        this.scene.remove(orb.mesh);
        this.xpOrbs.splice(i, 1);
      }
    }
  }

  private updateHealthOrbs(delta: number): void {
    for (let i = this.healthOrbs.length - 1; i >= 0; i -= 1) {
      const orb = this.healthOrbs[i];
      const distance = orb.mesh.position.distanceTo(this.player.position);
      const pull = this.player.position.clone().sub(orb.mesh.position).normalize();
      orb.mesh.position.addScaledVector(pull, delta * Math.max(7, distance * 2.2));
      orb.mesh.rotation.y += delta * 3;
      orb.mesh.position.y = 0.46 + Math.sin(this.survived * 5 + i) * 0.06;
      if (distance < PLAYER_RADIUS + orb.radius) {
        this.heal(orb.heal);
        this.audio.pickup(4);
        this.scene.remove(orb.mesh);
        this.healthOrbs.splice(i, 1);
      }
    }
  }

  private updateLightning(delta: number): void {
    const level = this.skillLevel('lightning');
    if (level <= 0 || this.enemies.length === 0) return;
    this.lightningTimer -= delta;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = Math.max(0.45, 2.1 - level * 0.08);

    const strikes = 1 + Math.floor(level / 3);
    const shockRadius = 1.8 + level * 0.12;
    const stunDuration = 0.65 + level * 0.035;
    const shocked = new Set<Enemy>();
    const targets = [...this.enemies].sort(
      (a, b) => a.mesh.position.distanceToSquared(this.player.position) - b.mesh.position.distanceToSquared(this.player.position),
    );
    for (let i = 0; i < Math.min(strikes, targets.length); i += 1) {
      const enemy = targets[i];
      this.createLightningBolt(enemy.mesh.position);
      for (const candidate of this.enemies) {
        if (candidate.mesh.position.distanceTo(enemy.mesh.position) > shockRadius + candidate.radius) continue;
        candidate.stunTimer = Math.max(candidate.stunTimer, stunDuration);
        if (shocked.has(candidate)) continue;
        shocked.add(candidate);
        this.damageEnemy(candidate, candidate === enemy ? 22 + level * 7 : 11 + level * 3.5);
      }
    }
    this.audio.hit();
  }

  private updateHammers(delta: number, elapsed: number): void {
    const level = this.skillLevel('hammers');
    const hammerCount = level > 0 ? Math.min(8, 2 + Math.floor(level / 2)) : 0;
    while (this.hammerMeshes.length < hammerCount) {
      const hammer = this.createHammerMesh();
      this.hammerMeshes.push(hammer);
      this.scene.add(hammer);
    }
    while (this.hammerMeshes.length > hammerCount) {
      const hammer = this.hammerMeshes.pop();
      if (hammer) this.scene.remove(hammer);
    }
    if (hammerCount === 0) return;

    const orbitRadius = 1.75 + level * 0.07;
    const orbitSpeed = 2.7 + level * 0.11;
    for (let i = 0; i < this.hammerMeshes.length; i += 1) {
      const angle = elapsed * orbitSpeed + (i / this.hammerMeshes.length) * Math.PI * 2;
      const hammer = this.hammerMeshes[i];
      hammer.position.set(
        this.player.position.x + Math.sin(angle) * orbitRadius,
        0.75,
        this.player.position.z + Math.cos(angle) * orbitRadius,
      );
      hammer.rotation.set(0.4, angle, elapsed * 7);
      for (const enemy of this.enemies) {
        if (hammer.position.distanceTo(enemy.mesh.position) < enemy.radius + 0.55) {
          this.damageEnemy(enemy, (18 + level * 3) * delta * 3.2);
          this.applyKnockback(enemy, enemy.mesh.position.clone().sub(this.player.position), 6.5 + level * 0.35);
        }
      }
    }
  }

  private updateAura(delta: number): void {
    const level = this.skillLevel('aura');
    const aura = this.player.getObjectByName('aura-ring') as THREE.Mesh | undefined;
    if (level <= 0) {
      if (aura) aura.visible = false;
      return;
    }
    this.auraTimer += delta;
    const radius = 1.8 + level * 0.18;
    const damage = (5 + level * 1.5) * delta;
    for (const enemy of this.enemies) {
      if (enemy.mesh.position.distanceTo(this.player.position) < radius + enemy.radius) {
        this.damageEnemy(enemy, damage);
      }
    }
    if (aura) {
      aura.visible = true;
      aura.scale.setScalar(radius);
      aura.rotation.z = this.auraTimer * 0.8;
    }
  }

  private updateHealing(delta: number): void {
    const regenLevel = this.skillLevel('regen');
    if (regenLevel <= 0 || this.health >= 100) return;
    this.heal((0.18 + regenLevel * 0.12) * delta);
  }

  private gainXp(value: number): void {
    this.xp += value * (1 + this.skillLevel('growth') * 0.08);
    this.audio.pickup(value);
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      this.xpNeeded = Math.floor(this.xpNeeded * 1.22 + 3);
      this.mode = 'level-up';
      this.hud.showSkillChoices(this.skillChoices());
      break;
    }
  }

  private spawnEnemy(): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = 17 + Math.random() * 4;
    const config = this.pickEnemyConfig();
    const mesh = this.createEnemyMesh(config);
    mesh.position.set(
      this.player.position.x + Math.sin(angle) * radius,
      0,
      this.player.position.z + Math.cos(angle) * radius,
    );
    const difficulty = 1 + this.survived / 80;
    this.enemies.push({
      kind: config.kind,
      mesh,
      hp: config.hp * difficulty,
      maxHp: config.hp * difficulty,
      speed: config.speed + Math.random() * 0.18 + this.survived * 0.004,
      radius: config.radius,
      xp: config.xp + Math.floor(this.survived / 35),
      stunTimer: 0,
      knockback: new THREE.Vector3(),
    });
    this.scene.add(mesh);
  }

  private pickEnemyConfig(): EnemyConfig {
    const roll = Math.random();
    const runnerChance = Math.min(0.34, 0.16 + this.survived * 0.002);
    const bruteChance = Math.min(0.22, 0.08 + this.survived * 0.0012);
    if (roll < runnerChance) return ENEMY_CONFIGS.runner;
    if (roll < runnerChance + bruteChance) return ENEMY_CONFIGS.brute;
    return ENEMY_CONFIGS.normal;
  }

  private spawnProjectile(angle: number, damageMultiplier = 1, pierceBonus = 0, color = this.selectedWeapon.color): void {
    const geometry = new THREE.SphereGeometry(0.16, 12, 8);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.35,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.copy(this.player.position).add(new THREE.Vector3(0, 0.85, 0));
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    this.projectiles.push({
      mesh,
      velocity: direction.multiplyScalar(this.selectedWeapon.projectileSpeed),
      damage: this.weaponDamage() * damageMultiplier,
      pierce: (this.skillLevel('pierce') > 0 ? Math.floor(this.skillLevel('pierce') / 2) : 0) + pierceBonus,
      age: 0,
      radius: 0.22,
    });
    this.scene.add(mesh);
  }

  private killEnemy(index: number): void {
    const [enemy] = this.enemies.splice(index, 1);
    this.scene.remove(enemy.mesh);
    this.kills += 1;
    const luckyBonus = this.skillLevel('lucky') > 0 && Math.random() < 0.08 + this.skillLevel('lucky') * 0.015 ? 2 : 1;
    const orb = this.createXpOrb(enemy.mesh.position, enemy.xp * luckyBonus);
    this.xpOrbs.push(orb);
    this.scene.add(orb.mesh);
    if (this.health < 100 && Math.random() < 0.07 + this.skillLevel('regen') * 0.006) {
      const healthOrb = this.createHealthOrb(enemy.mesh.position);
      this.healthOrbs.push(healthOrb);
      this.scene.add(healthOrb.mesh);
    }
  }

  private heal(amount: number): void {
    this.health = Math.min(100, this.health + amount);
  }

  private applyKnockback(enemy: Enemy, direction: THREE.Vector3, force: number): void {
    direction.y = 0;
    if (direction.lengthSq() < 0.001) {
      direction.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }
    direction.normalize();
    enemy.knockback.addScaledVector(direction, force);
    enemy.knockback.clampLength(0, 12);
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    const luckyLevel = this.skillLevel('lucky');
    const crit = luckyLevel > 0 && Math.random() < 0.04 + luckyLevel * 0.012;
    enemy.hp -= crit ? damage * 2.2 : damage;
    this.flashEnemy(enemy.mesh);
    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index >= 0) this.killEnemy(index);
    }
  }

  private weaponDamage(): number {
    const luckyLevel = this.skillLevel('lucky');
    const crit = luckyLevel > 0 && Math.random() < 0.04 + luckyLevel * 0.012;
    const damage = this.selectedWeapon.damage * (1 + this.skillLevel('damage') * 0.13);
    return crit ? damage * 2.2 : damage;
  }

  private skillChoices(): SkillChoiceView[] {
    const available = SKILLS.filter((skill) => this.skillLevel(skill.id) < MAX_SKILL_LEVEL);
    return available
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((skill) => ({
        ...skill,
        level: this.skillLevel(skill.id),
        nextLevel: this.skillLevel(skill.id) + 1,
        maxLevel: MAX_SKILL_LEVEL,
      }));
  }

  private weaponViews(): WeaponChoiceView[] {
    return WEAPONS.map((weapon) => ({
      id: weapon.id,
      name: weapon.name,
      icon: weapon.icon,
      description: weapon.description,
      color: weapon.color,
    }));
  }

  private skillSummary(): string {
    const entries = SKILLS.filter((skill) => this.skillLevel(skill.id) > 0).map(
      (skill) => `${skill.icon}${this.skillLevel(skill.id)}`,
    );
    return entries.length > 0 ? entries.join(' ') : '无技能';
  }

  private skillLevel(id: SkillId): number {
    return this.skillLevels.get(id) ?? 0;
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#9fd9ff');
    this.scene.fog = new THREE.Fog('#9fd9ff', 26, 54);

    const hemi = new THREE.HemisphereLight('#fff8d9', '#68b77b', 1.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0b5', 2.8);
    sun.position.set(-6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    this.scene.add(sun);

    this.scene.add(this.createArena());
    this.scene.add(this.player);
  }

  private createArena(): THREE.Group {
    const arena = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: '#77c96d', roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arena.add(floor);

    for (let i = 0; i < 90; i += 1) {
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.12 + Math.random() * 0.12, 0.42 + Math.random() * 0.28, 5),
        new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? '#4fae57' : '#8bd66f', roughness: 0.85 }),
      );
      tuft.position.set((Math.random() - 0.5) * 52, 0.2, (Math.random() - 0.5) * 38);
      tuft.rotation.y = Math.random() * Math.PI;
      tuft.castShadow = true;
      arena.add(tuft);
    }

    return arena;
  }

  private createLightningBolt(position: THREE.Vector3): void {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.18, 5.2, 8),
      new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.92 }),
    );
    bolt.position.set(position.x, 2.6, position.z);
    this.scene.add(bolt);
    setTimeout(() => this.scene.remove(bolt), 110);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.72 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.04, position.z);
    this.scene.add(ring);
    setTimeout(() => this.scene.remove(ring), 160);
  }

  private createHammerMesh(): THREE.Mesh {
    const hammer = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.28, 0.34),
      new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.5, metalness: 0.1 }),
    );
    hammer.castShadow = true;
    return hammer;
  }

  private createPlayer(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.62, 8, 14),
      new THREE.MeshStandardMaterial({ color: '#ffe066', roughness: 0.45 }),
    );
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.2, 0.12),
      new THREE.MeshStandardMaterial({ color: '#245b7a', emissive: '#143144', emissiveIntensity: 0.3 }),
    );
    visor.position.set(0, 0.93, -0.36);
    group.add(visor);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.72),
      new THREE.MeshStandardMaterial({ color: '#2d4059', roughness: 0.35 }),
    );
    gun.position.set(0.42, 0.72, -0.45);
    gun.castShadow = true;
    group.add(gun);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.05, 48),
      new THREE.MeshBasicMaterial({ color: '#b6ff6a', transparent: true, opacity: 0.26 }),
    );
    aura.name = 'aura-ring';
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    aura.visible = false;
    group.add(aura);
    return group;
  }

  private createEnemyMesh(config: EnemyConfig): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 16, 12),
      new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.65 }),
    );
    body.scale.set(config.scale[0], config.scale[1], config.scale[2]);
    body.position.y = 0.5 * config.scale[1] + 0.12;
    body.castShadow = true;
    group.add(body);

    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.08),
      new THREE.MeshStandardMaterial({ color: '#311d1d' }),
    );
    face.position.set(0, body.position.y + 0.1, -0.43 * config.scale[2]);
    group.add(face);
    return group;
  }

  private createXpOrb(position: THREE.Vector3, value: number): XpOrb {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshStandardMaterial({ color: '#49dcb1', emissive: '#1c8f73', emissiveIntensity: 0.45 }),
    );
    mesh.position.copy(position);
    mesh.position.y = 0.45;
    return { mesh, value, radius: 0.28 };
  }

  private createHealthOrb(position: THREE.Vector3): HealthOrb {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#ff4f5e', emissive: '#9c1f2d', emissiveIntensity: 0.38 }),
    );
    mesh.scale.set(1.15, 0.85, 1.15);
    mesh.position.copy(position);
    mesh.position.y = 0.46;
    return { mesh, heal: 14, radius: 0.3 };
  }

  private flashEnemy(mesh: THREE.Group): void {
    mesh.scale.setScalar(1.14);
    setTimeout(() => mesh.scale.setScalar(1), 70);
  }

  private publishDiagnostics(): void {
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      mode: this.mode,
      health: this.health,
      stamina: this.stamina,
      level: this.level,
      xp: this.xp,
      xpNeeded: this.xpNeeded,
      kills: this.kills,
      survived: this.survived,
      enemies: this.enemies.length,
      enemyKinds: this.enemyKindCounts(),
      projectiles: this.projectiles.length,
      scheduledShots: this.scheduledShots.length,
      xpOrbs: this.xpOrbs.length,
      healthOrbs: this.healthOrbs.length,
      weapon: this.selectedWeapon.id,
      aimAngle: this.aimAngle,
      rolling: this.rollTimer > 0,
      skills: Object.fromEntries(this.skillLevels),
      player: {
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
        },
      },
      renderer: {
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
      },
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  private enemyKindCounts(): Record<EnemyKind, number> {
    return this.enemies.reduce<Record<EnemyKind, number>>(
      (counts, enemy) => {
        counts[enemy.kind] += 1;
        return counts;
      },
      { normal: 0, runner: 0, brute: 0 },
    );
  }
}
