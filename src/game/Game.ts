import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { Hud, type SkillChoiceView, type WeaponChoiceView } from '../systems/Hud';

type WeaponId = 'sprout-rifle' | 'bubble-shotgun' | 'star-smg' | 'sniper-rifle' | 'rocket-launcher' | 'laser-rifle';
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
  | 'regen'
  | 'sprout-burst'
  | 'shotgun-pellets'
  | 'smg-overdrive'
  | 'sniper-focus'
  | 'rocket-blast'
  | 'rocket-payload'
  | 'laser-arc'
  | 'laser-duration'
  | 'laser-power'
  | 'laser-coolant';
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
  weapon?: WeaponId;
};

type Enemy = {
  kind: EnemyKind;
  mesh: THREE.Group;
  healthFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  burnEffect: THREE.Group;
  targetMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  isBoss: boolean;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  xp: number;
  stunTimer: number;
  burnTimer: number;
  burnDamage: number;
  attackTimer: number;
  knockback: THREE.Vector3;
};

type EnemyKind = 'normal' | 'runner' | 'brute' | 'boss-gunner' | 'boss-caster' | 'boss-charger';

type EnemyConfig = {
  kind: EnemyKind;
  color: string;
  hp: number;
  speed: number;
  radius: number;
  xp: number;
  scale: THREE.Vector3Tuple;
  boss?: boolean;
};

type Projectile = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  trueDamage: number;
  pierce: number;
  age: number;
  radius: number;
  explosionRadius: number;
  hitEnemies: Set<Enemy>;
};

type EnemyProjectile = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  age: number;
  radius: number;
  deflected: boolean;
};

type Hammer = {
  mesh: THREE.Mesh;
  cooldown: number;
  hitCount: number;
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
const BOSS_TARGET_SECONDS: Partial<Record<EnemyKind, number>> = {
  'boss-gunner': 30,
  'boss-caster': 34,
  'boss-charger': 38,
};

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
    xp: 9,
    scale: [1.42, 1.05, 1.32],
  },
  'boss-gunner': {
    kind: 'boss-gunner',
    color: '#7657ff',
    hp: 420,
    speed: 1.18,
    radius: 1.05,
    xp: 95,
    scale: [1.75, 1.55, 1.75],
    boss: true,
  },
  'boss-caster': {
    kind: 'boss-caster',
    color: '#18b6a6',
    hp: 390,
    speed: 0.95,
    radius: 1,
    xp: 90,
    scale: [1.62, 1.7, 1.62],
    boss: true,
  },
  'boss-charger': {
    kind: 'boss-charger',
    color: '#c0433f',
    hp: 450,
    speed: 1.85,
    radius: 1.16,
    xp: 115,
    scale: [2, 1.35, 1.85],
    boss: true,
  },
};

const WEAPONS: Weapon[] = [
  {
    id: 'sprout-rifle',
    name: '射手步枪',
    icon: '苗',
    description: '精准三连发，自带穿透',
    fireRate: 2.35,
    projectileSpeed: 65,
    damage: 3,
    spread: 0.02,
    pellets: 1,
    color: '#f5ba49',
  },
  {
    id: 'bubble-shotgun',
    name: '泡泡霰弹',
    icon: '泡',
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
    icon: '星',
    description: '高射速，持续削怪',
    fireRate: 5.6,
    projectileSpeed: 60,
    damage: 9,
    spread: 0.08,
    pellets: 1,
    color: '#ff7fa3',
  },
  {
    id: 'sniper-rifle',
    name: '重炮狙击枪',
    icon: '狙',
    description: '射速很慢，单发重击',
    fireRate: 0.55,
    projectileSpeed: 86,
    damage: 52,
    spread: 0,
    pellets: 1,
    color: '#7ee081',
  },
  {
    id: 'rocket-launcher',
    name: '番茄火箭筒',
    icon: '炮',
    description: '慢速火箭，命中后范围爆炸',
    fireRate: 0.55,
    projectileSpeed: 42,
    damage: 24,
    spread: 0,
    pellets: 1,
    color: '#ff5a36',
  },
  {
    id: 'laser-rifle',
    name: '彩虹激光枪',
    icon: '光',
    description: '蓄能后从左到右扫射',
    fireRate: 0.28,
    projectileSpeed: 0,
    damage: 18,
    spread: 0,
    pellets: 1,
    color: '#8f7dff',
  },
];

const SKILLS: Skill[] = [
  { id: 'rapid', name: '连发机关', icon: '速', description: '射速大幅提升，重复选择更明显' },
  { id: 'damage', name: '真伤弹头', icon: '弹', description: '子弹附加无视防御的真实伤害' },
  { id: 'multi', name: '双手开花', icon: '多', description: '额外发射子弹' },
  { id: 'speed', name: '溜冰鞋', icon: '靴', description: '移动速度提升' },
  { id: 'pierce', name: '穿透果冻', icon: '穿', description: '子弹可穿透更多怪物' },
  { id: 'lightning', name: '跳跳落雷', icon: '雷', description: '定时劈向怪群，升级增加次数和伤害' },
  { id: 'hammers', name: '旋风大锤', icon: '锤', description: '环绕大锤升级会增加数量、伤害和耐久' },
  { id: 'aura', name: '蒜香泡泡', icon: '火', description: '生成灼烧火圈，并让命中的怪物持续燃烧' },
  { id: 'frost', name: '冰沙领域', icon: '冰', description: '降低附近怪物速度，升级扩大范围' },
  { id: 'growth', name: '经验糖果', icon: '糖', description: '获得更多经验，更快触发技能选择' },
  { id: 'lucky', name: '幸运骰子', icon: '运', description: '偶尔暴击，并让掉落经验更丰厚' },
  { id: 'regen', name: '草莓药瓶', icon: '药', description: '持续缓慢回血，升级后回复更快' },
];

const WEAPON_SKILLS: Skill[] = [
  {
    id: 'sprout-burst',
    name: '苗苗连射',
    icon: '苗',
    description: '射手步枪每级增加连发数量',
    weapon: 'sprout-rifle',
  },
  {
    id: 'shotgun-pellets',
    name: '泡泡散布',
    icon: '泡',
    description: '泡泡霰弹每级增加弹丸数量',
    weapon: 'bubble-shotgun',
  },
  {
    id: 'smg-overdrive',
    name: '星星过热',
    icon: '星',
    description: '星星冲锋枪专属射速继续提升',
    weapon: 'star-smg',
  },
  {
    id: 'sniper-focus',
    name: '狙击重击',
    icon: '狙',
    description: '重炮狙击枪每级提高单发伤害',
    weapon: 'sniper-rifle',
  },
  {
    id: 'rocket-blast',
    name: '爆炸半径',
    icon: '爆',
    description: '番茄火箭筒每级扩大爆炸范围',
    weapon: 'rocket-launcher',
  },
  {
    id: 'rocket-payload',
    name: '加量装药',
    icon: '炮',
    description: '番茄火箭筒每级提高爆炸伤害',
    weapon: 'rocket-launcher',
  },
  {
    id: 'laser-arc',
    name: '广角棱镜',
    icon: '扇',
    description: '激光枪每级大幅扩大扫射角度',
    weapon: 'laser-rifle',
  },
  {
    id: 'laser-duration',
    name: '延时光束',
    icon: '时',
    description: '激光枪每级延长扫射时间',
    weapon: 'laser-rifle',
  },
  {
    id: 'laser-power',
    name: '高能灼光',
    icon: '光',
    description: '激光枪每级明显提高持续伤害',
    weapon: 'laser-rifle',
  },
  {
    id: 'laser-coolant',
    name: '冷却晶片',
    icon: '冷',
    description: '激光枪每级缩短蓄能冷却',
    weapon: 'laser-rifle',
  },
];

const ALL_SKILLS = [...SKILLS, ...WEAPON_SKILLS];

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
  private readonly laserBeam = this.createLaserBeam();
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly enemyProjectiles: EnemyProjectile[] = [];
  private readonly scheduledShots: ScheduledShot[] = [];
  private readonly xpOrbs: XpOrb[] = [];
  private readonly healthOrbs: HealthOrb[] = [];
  private readonly hammers: Hammer[] = [];
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
  private bossTimer = 18;
  private bossSpawnCount = 0;
  private waveNumber = 0;
  private waveWasAboveThreshold = false;
  private fireTimer = 0;
  private laserTimer = 0;
  private laserDuration = 0;
  private laserBaseAngle = 0;
  private laserSecondBaseAngle = 0;
  private laserSweepAngle = 0;
  private laserSecondSweepLocked = false;
  private lightningTimer = 1.2;
  private auraTimer = 0;
  private hitCooldown = 0;
  private rollTimer = 0;
  private rollCooldown = 0;
  private aimAngle = 0;
  private manualTargetMode = false;
  private hoveredTarget: Enemy | null = null;
  private lockedTarget: Enemy | null = null;
  private lowestEnemyHealthRatioSeen = 1;
  private frame = 0;
  private readonly rollDirection = new THREE.Vector3(0, 0, -1);
  private readonly playerKnockback = new THREE.Vector3();

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
    for (const projectile of this.enemyProjectiles.splice(0)) this.scene.remove(projectile.mesh);
    this.scheduledShots.length = 0;
    for (const orb of this.xpOrbs.splice(0)) this.scene.remove(orb.mesh);
    for (const orb of this.healthOrbs.splice(0)) this.scene.remove(orb.mesh);
    for (const hammer of this.hammers.splice(0)) this.scene.remove(hammer.mesh);
    this.player.position.set(0, 0, 0);
    this.health = 100;
    this.stamina = MAX_STAMINA;
    this.level = 1;
    this.xp = 0;
    this.xpNeeded = 6;
    this.kills = 0;
    this.survived = 0;
    this.spawnTimer = 0;
    this.bossTimer = 18;
    this.bossSpawnCount = 0;
    this.waveNumber = 0;
    this.waveWasAboveThreshold = false;
    this.fireTimer = 0;
    this.laserTimer = 0;
    this.laserDuration = 0;
    this.laserBaseAngle = 0;
    this.laserSecondBaseAngle = 0;
    this.laserSweepAngle = 0;
    this.laserSecondSweepLocked = false;
    this.laserBeam.visible = false;
    this.lightningTimer = 1.2;
    this.auraTimer = 0;
    this.hitCooldown = 0;
    this.rollTimer = 0;
    this.rollCooldown = 0;
    this.manualTargetMode = false;
    this.hoveredTarget = null;
    this.lockedTarget = null;
    this.updateTargetMarkers();
    this.playerKnockback.set(0, 0, 0);
    this.lowestEnemyHealthRatioSeen = 1;
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
      this.updateTargetSelection();
      this.updateAim();
      this.updatePlayer(delta, elapsed);
      this.updateSpawning(delta);
      this.updateEnemies(delta, elapsed);
      this.updateScheduledShots(delta);
      this.updateShooting(delta);
      this.updateLaser(delta, elapsed);
      this.updateLightning(delta);
      this.updateHammers(delta, elapsed);
      this.updateAura(delta);
      this.updateFrostField(elapsed);
      this.updateHealing(delta);
      this.updateProjectiles(delta);
      this.updateEnemyProjectiles(delta);
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
      waveNumber: this.waveNumber,
      enemies: this.enemies.length,
      skills: this.skillSummary(),
      aimMode: this.aimModeLabel(),
      boss: this.bossHudState(),
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
        this.rollDirection.set(Math.sin(this.player.rotation.y), 0, Math.cos(this.player.rotation.y)).normalize();
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
    this.player.position.addScaledVector(this.playerKnockback, delta);
    this.playerKnockback.multiplyScalar(Math.exp(-9 * delta));
    if (this.input.readAimNdc(this.aimNdc)) {
      this.player.rotation.y = this.aimAngle;
    } else if (move.lengthSq() > 0.01) {
      this.player.rotation.y = Math.atan2(move.x, move.y);
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

  private updateTargetSelection(): void {
    if (this.input.consumeTargetSelectRequest()) {
      this.manualTargetMode = !this.manualTargetMode;
      this.hoveredTarget = null;
      this.lockedTarget = null;
      this.updateTargetMarkers();
    }
    if (this.input.consumeAutoAimRequest()) {
      this.manualTargetMode = false;
      this.hoveredTarget = null;
      this.lockedTarget = null;
      this.updateTargetMarkers();
      return;
    }

    if (this.lockedTarget && !this.enemies.includes(this.lockedTarget)) this.lockedTarget = null;
    if (!this.manualTargetMode) return;

    const pointerAim = this.input.readAimNdc(this.aimNdc);
    this.hoveredTarget = pointerAim ? this.pickEnemyAtPointer(pointerAim) : null;
    if (this.input.consumeFirePress() && this.hoveredTarget) {
      this.lockedTarget = this.hoveredTarget;
    }
    this.updateTargetMarkers();
  }

  private pickEnemyAtPointer(pointerAim: THREE.Vector2): Enemy | null {
    this.aimRaycaster.setFromCamera(pointerAim, this.camera);
    let selected: Enemy | null = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    const groundHit = this.aimRaycaster.ray.intersectPlane(this.groundPlane, this.aimPoint);
    if (!groundHit) return null;
    for (const enemy of this.enemies) {
      const dx = enemy.mesh.position.x - groundHit.x;
      const dz = enemy.mesh.position.z - groundHit.z;
      const distance = dx * dx + dz * dz;
      const pickRadius = Math.max(1.35, enemy.radius * 2.2);
      if (distance < pickRadius * pickRadius && distance < selectedDistance) {
        selected = enemy;
        selectedDistance = distance;
      }
    }
    return selected;
  }

  private updateTargetMarkers(): void {
    for (const enemy of this.enemies) {
      const active = this.manualTargetMode && (enemy === this.hoveredTarget || enemy === this.lockedTarget);
      enemy.targetMarker.visible = active;
      enemy.targetMarker.material.color.set(enemy === this.lockedTarget ? '#77ff66' : '#b8ff7a');
      enemy.targetMarker.scale.setScalar(enemy === this.lockedTarget ? 1.18 : 1);
      enemy.targetMarker.rotation.z += 0.045;
    }
  }

  private updateSpawning(delta: number): void {
    this.spawnTimer -= delta;
    const bossAlive = this.enemies.some((enemy) => enemy.isBoss);
    if (!bossAlive) {
      this.bossTimer -= delta;
      if (this.bossTimer <= 0) {
        this.spawnBoss();
        this.bossTimer = 36;
      }
    }
    const interval = Math.max(0.22, 1.1 - this.survived * 0.01);
    const shouldStartNextWave =
      this.enemies.length === 0 ||
      (this.enemies.length <= 5 && (this.waveWasAboveThreshold || this.spawnTimer <= 0));
    if (!shouldStartNextWave) {
      this.waveWasAboveThreshold ||= this.enemies.length > 5;
      return;
    }
    this.spawnTimer = interval;
    this.waveNumber += 1;
    const count = 6 + Math.floor(this.survived / 24) + Math.floor(this.waveNumber / 3);
    for (let i = 0; i < count; i += 1) this.spawnEnemy();
    this.waveWasAboveThreshold = this.enemies.length > 5;
  }

  private updateEnemies(delta: number, elapsed: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.stunTimer = Math.max(0, enemy.stunTimer - delta);
      if (!this.updateEnemyBurn(enemy, delta, elapsed)) continue;
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
        this.updateEnemyMovement(enemy, direction, distance, frostFactor, delta);
        this.updateBossAttack(enemy, direction, distance, delta);
      }
      enemy.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      enemy.mesh.position.y = 0.08 + Math.sin(elapsed * (enemy.stunTimer > 0 ? 18 : 7) + i) * (enemy.stunTimer > 0 ? 0.025 : 0.05);
      this.updateEnemyHealthBar(enemy);

      if (distance < enemy.radius + PLAYER_RADIUS && this.hitCooldown <= 0 && this.rollTimer <= 0) {
        this.damagePlayer(12, this.player.position.clone().sub(enemy.mesh.position), 8.5);
      }
    }
  }

  private updateEnemyMovement(enemy: Enemy, directionToPlayer: THREE.Vector3, distance: number, frostFactor: number, delta: number): void {
    if (enemy.kind === 'boss-gunner') {
      const preferredRange = 6.2;
      const moveDirection = distance < preferredRange ? directionToPlayer.clone().multiplyScalar(-1) : directionToPlayer;
      enemy.mesh.position.addScaledVector(moveDirection, enemy.speed * frostFactor * delta);
      return;
    }
    if (enemy.kind === 'boss-caster') {
      const preferredRange = 7.5;
      if (distance < preferredRange - 0.5) {
        enemy.mesh.position.addScaledVector(directionToPlayer, -enemy.speed * frostFactor * delta);
      } else if (distance > preferredRange + 1.2) {
        enemy.mesh.position.addScaledVector(directionToPlayer, enemy.speed * frostFactor * delta);
      } else {
        const orbit = new THREE.Vector3(directionToPlayer.z, 0, -directionToPlayer.x);
        enemy.mesh.position.addScaledVector(orbit, enemy.speed * 0.55 * frostFactor * delta);
      }
      return;
    }
    const chargeBoost = enemy.kind === 'boss-charger' && enemy.attackTimer > 0.75 ? 1.85 : 1;
    enemy.mesh.position.addScaledVector(directionToPlayer, enemy.speed * chargeBoost * frostFactor * delta);
  }

  private updateEnemyBurn(enemy: Enemy, delta: number, elapsed: number): boolean {
    if (enemy.burnTimer <= 0) {
      enemy.burnEffect.visible = false;
      return true;
    }

    enemy.burnTimer = Math.max(0, enemy.burnTimer - delta);
    enemy.burnEffect.visible = true;
    enemy.burnEffect.rotation.y += delta * 5.8;
    enemy.burnEffect.children.forEach((child, index) => {
      const flame = child as THREE.Mesh;
      const pulse = 0.86 + Math.sin(elapsed * 13 + index * 1.4) * 0.18;
      flame.scale.setScalar(pulse * (enemy.isBoss ? 1.25 : 1));
    });

    this.damageEnemy(enemy, enemy.burnDamage * delta, 0, false, false);
    return this.enemies.includes(enemy);
  }

  private updateBossAttack(enemy: Enemy, directionToPlayer: THREE.Vector3, distance: number, delta: number): void {
    if (!enemy.isBoss) return;
    enemy.attackTimer -= delta;
    if (enemy.kind === 'boss-charger') {
      if (enemy.attackTimer <= 0) enemy.attackTimer = distance < 9 ? 1.35 : 0.45;
      return;
    }
    if (enemy.attackTimer > 0) return;

    const angle = Math.atan2(directionToPlayer.x, directionToPlayer.z);
    if (enemy.kind === 'boss-gunner') {
      enemy.attackTimer = 1.15;
      this.spawnEnemyProjectile(enemy.mesh.position, angle, 10.5, 10, '#b8a7ff', 0.2);
      return;
    }
    if (enemy.kind === 'boss-caster') {
      enemy.attackTimer = 1.8;
      for (let i = -1; i <= 1; i += 1) {
        this.spawnEnemyProjectile(enemy.mesh.position, angle + i * 0.28, 7.2, 13, '#40f0d0', 0.28);
      }
    }
  }

  private updateShooting(delta: number): void {
    this.fireTimer -= delta;
    if (this.selectedWeapon.id === 'laser-rifle' && this.laserTimer > 0) return;
    const fireRate = this.selectedWeapon.fireRate * this.rapidFireMultiplier() * this.weaponFireRateMultiplier();
    if (this.fireTimer > 0 || this.enemies.length === 0) return;

    const target = this.findNearestEnemy();
    if (!target) return;

    const baseAngle = Math.atan2(target.mesh.position.x - this.player.position.x, target.mesh.position.z - this.player.position.z);
    this.aimAngle = baseAngle;
    this.player.rotation.y = baseAngle;
    if (this.selectedWeapon.id === 'laser-rifle') {
      this.startLaserSweep(baseAngle);
      this.fireTimer = 0;
      this.audio.shoot(this.selectedWeapon.id);
      return;
    }

    this.fireTimer = 1 / fireRate;
    const extraPellets = Math.floor(this.skillLevel('multi') / 3);
    if (this.selectedWeapon.id === 'sprout-rifle') {
      const burstCount = 3 + extraPellets + this.skillLevel('sprout-burst');
      for (let i = 0; i < burstCount; i += 1) {
        const offset = (i - (burstCount - 1) / 2) * this.selectedWeapon.spread;
        this.scheduledShots.push({
          timer: i * 0.055,
          angle: baseAngle + offset,
          damageMultiplier: 0.88,
          pierceBonus: 2 + this.skillLevel('pierce'),
          color: '#ffe066',
        });
      }
    } else {
      const pellets = this.selectedWeapon.pellets + this.weaponExtraPellets();
      for (let i = 0; i < pellets; i += 1) {
        const center = (pellets - 1) / 2;
        const angle = baseAngle + (i - center) * this.selectedWeapon.spread;
        this.spawnProjectile(angle);
      }
      for (let i = 0; i < extraPellets; i += 1) {
        const offset = (i - (extraPellets - 1) / 2) * Math.max(0.035, this.selectedWeapon.spread * 0.45);
        this.scheduledShots.push({
          timer: 0.14 + i * 0.11,
          angle: baseAngle + offset,
          damageMultiplier: 0.96,
          pierceBonus: 0,
          color: this.selectedWeapon.color,
        });
      }
    }
    this.audio.shoot(this.selectedWeapon.id);
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

  private startLaserSweep(baseAngle: number): void {
    this.laserDuration = this.laserSweepDuration() * 2;
    this.laserTimer = this.laserDuration;
    this.laserSweepAngle = this.laserSweepArc();
    this.laserBaseAngle = baseAngle;
    this.laserSecondBaseAngle = baseAngle;
    this.laserSecondSweepLocked = false;
    this.laserBeam.visible = true;
  }

  private updateLaser(delta: number, elapsed: number): void {
    if (this.laserTimer <= 0) {
      this.laserBeam.visible = false;
      return;
    }

    this.laserTimer = Math.max(0, this.laserTimer - delta);
    const progress = 1 - this.laserTimer / Math.max(0.001, this.laserDuration);
    if (progress >= 0.5 && !this.laserSecondSweepLocked) {
      const nextTarget = this.findNearestEnemy();
      if (nextTarget) {
        this.laserSecondBaseAngle = Math.atan2(
          nextTarget.mesh.position.x - this.player.position.x,
          nextTarget.mesh.position.z - this.player.position.z,
        );
      }
      this.laserSecondSweepLocked = true;
    }
    const firstPass = progress < 0.5;
    const passProgress = firstPass ? progress / 0.5 : (progress - 0.5) / 0.5;
    const sweep = THREE.MathUtils.smoothstep(passProgress, 0, 1);
    const baseAngle = firstPass ? this.laserBaseAngle : this.laserSecondBaseAngle;
    const angle = firstPass
      ? baseAngle - this.laserSweepAngle / 2 + sweep * this.laserSweepAngle
      : baseAngle + this.laserSweepAngle / 2 - sweep * this.laserSweepAngle;
    this.aimAngle = angle;
    this.player.rotation.y = angle;

    const range = this.laserRange();
    const width = this.laserWidth();
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const start = this.player.position.clone().addScaledVector(direction, 0.74).addScaledVector(right, 0.32);
    const beamCenter = start.clone().addScaledVector(direction, range / 2);
    this.laserBeam.position.set(beamCenter.x, 0.78, beamCenter.z);
    this.laserBeam.rotation.y = angle;
    this.laserBeam.scale.set(width, 0.16 + Math.sin(elapsed * 28) * 0.025, range);
    const material = this.laserBeam.material as THREE.MeshBasicMaterial;
    material.opacity = 0.5 + Math.sin(elapsed * 40) * 0.12;

    const damage = this.laserDamagePerSecond() * delta;
    const trueDamage = this.weaponTrueDamage() * delta * 0.8;
    for (const enemy of [...this.enemies]) {
      const toEnemy = enemy.mesh.position.clone().sub(start);
      const forward = THREE.MathUtils.clamp(toEnemy.dot(direction), 0, range);
      const closest = start.clone().addScaledVector(direction, forward);
      const dx = enemy.mesh.position.x - closest.x;
      const dz = enemy.mesh.position.z - closest.z;
      if (dx * dx + dz * dz > (width + enemy.radius) * (width + enemy.radius)) continue;
      this.damageEnemy(enemy, damage, trueDamage);
    }

    if (this.laserTimer <= 0) {
      this.laserBeam.visible = false;
      const fireRate = this.selectedWeapon.fireRate * this.rapidFireMultiplier() * this.weaponFireRateMultiplier();
      this.fireTimer = this.laserCooldown(fireRate);
    }
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.y += delta * 12;

      let remove = projectile.age > 2.1;
      let explode = remove && projectile.explosionRadius > 0;
      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        if (projectile.hitEnemies.has(enemy)) continue;
        const hitRadius = projectile.radius + enemy.radius;
        const dx = projectile.mesh.position.x - enemy.mesh.position.x;
        const dz = projectile.mesh.position.z - enemy.mesh.position.z;
        if (dx * dx + dz * dz > hitRadius * hitRadius) continue;
        if (projectile.explosionRadius > 0) {
          explode = true;
          remove = true;
          break;
        }
        projectile.hitEnemies.add(enemy);
        this.damageEnemy(enemy, projectile.damage, projectile.trueDamage);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) {
          remove = true;
          break;
        }
      }

      if (remove) {
        if (explode) {
          this.explodeProjectile(projectile.mesh.position, projectile.damage, projectile.trueDamage, projectile.explosionRadius);
        }
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateEnemyProjectiles(delta: number): void {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.enemyProjectiles[i];
      projectile.age += delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.rotation.y += delta * 8;
      let remove = projectile.age > (projectile.deflected ? 3.2 : 4);

      if (projectile.deflected) {
        for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = this.enemies[j];
          if (enemy.isBoss) continue;
          const hitRadius = projectile.radius + enemy.radius;
          const dx = projectile.mesh.position.x - enemy.mesh.position.x;
          const dz = projectile.mesh.position.z - enemy.mesh.position.z;
          if (dx * dx + dz * dz > hitRadius * hitRadius) continue;
          this.damageEnemy(enemy, projectile.damage * 1.7);
          remove = true;
          break;
        }
      } else {
        const dx = projectile.mesh.position.x - this.player.position.x;
        const dz = projectile.mesh.position.z - this.player.position.z;
        const hitRadius = projectile.radius + PLAYER_RADIUS;
        const hitPlayer = dx * dx + dz * dz < hitRadius * hitRadius;
        if (hitPlayer && this.hitCooldown <= 0) {
          this.damagePlayer(projectile.damage, this.player.position.clone().sub(projectile.mesh.position), 7.5);
        }
        remove ||= hitPlayer;
      }

      if (remove) {
        this.scene.remove(projectile.mesh);
        this.enemyProjectiles.splice(i, 1);
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
    while (this.hammers.length < hammerCount) {
      const hammer = { mesh: this.createHammerMesh(), cooldown: 0, hitCount: 0 };
      this.hammers.push(hammer);
      this.scene.add(hammer.mesh);
    }
    while (this.hammers.length > hammerCount) {
      const hammer = this.hammers.pop();
      if (hammer) this.scene.remove(hammer.mesh);
    }
    if (hammerCount === 0) return;

    const orbitRadius = 1.75 + level * 0.07;
    const orbitSpeed = 2.7 + level * 0.11;
    const hitsBeforeCooldown = this.hammerDurability(level);
    for (let i = 0; i < this.hammers.length; i += 1) {
      const hammer = this.hammers[i];
      hammer.cooldown = Math.max(0, hammer.cooldown - delta);
      const active = hammer.cooldown <= 0;
      hammer.mesh.visible = active;
      const angle = elapsed * orbitSpeed + (i / this.hammers.length) * Math.PI * 2;
      hammer.mesh.position.set(
        this.player.position.x + Math.sin(angle) * orbitRadius,
        0.75,
        this.player.position.z + Math.cos(angle) * orbitRadius,
      );
      hammer.mesh.rotation.set(0.4, angle, elapsed * 7);
      if (!active) continue;
      for (const projectile of this.enemyProjectiles) {
        if (projectile.deflected) continue;
        if (hammer.mesh.position.distanceTo(projectile.mesh.position) < projectile.radius + 0.62) {
          this.deflectEnemyProjectile(projectile, hammer.mesh.position);
          this.cooldownHammer(hammer, 2.8);
          break;
        }
      }
      if (hammer.cooldown > 0) continue;
      for (const enemy of this.enemies) {
        if (hammer.mesh.position.distanceTo(enemy.mesh.position) < enemy.radius + 0.55) {
          this.damageEnemy(enemy, (18 + level * 3) * delta * 3.2);
          this.applyKnockback(enemy, enemy.mesh.position.clone().sub(this.player.position), 6.5 + level * 0.35);
          hammer.hitCount += 1;
          if (hammer.hitCount >= hitsBeforeCooldown) {
            this.cooldownHammer(hammer, 1.7);
            break;
          }
        }
      }
    }
  }

  private updateAura(delta: number): void {
    const level = this.skillLevel('aura');
    const aura = this.player.getObjectByName('aura-ring') as THREE.Mesh | undefined;
    const flames = this.player.getObjectByName('aura-flames') as THREE.Group | undefined;
    if (level <= 0) {
      if (aura) aura.visible = false;
      if (flames) flames.visible = false;
      return;
    }
    this.auraTimer += delta;
    const rangeLevel = Math.ceil(level / 2);
    const damageLevel = Math.floor(level / 2);
    const radius = 1.75 + rangeLevel * 0.32;
    const damage = (6 + damageLevel * 2.8) * delta;
    for (const enemy of this.enemies) {
      const dx = enemy.mesh.position.x - this.player.position.x;
      const dz = enemy.mesh.position.z - this.player.position.z;
      if (dx * dx + dz * dz < (radius + enemy.radius) ** 2) {
        this.damageEnemy(enemy, damage);
      }
    }
    if (aura) {
      aura.visible = true;
      aura.scale.setScalar(radius);
      aura.rotation.z = this.auraTimer * 1.15;
      const material = aura.material as THREE.MeshBasicMaterial;
      material.opacity = 0.34 + Math.sin(this.auraTimer * 8) * 0.08;
    }
    if (flames) {
      flames.visible = true;
      flames.children.forEach((flame, index) => {
        const phase = this.auraTimer * 4.8 + index * 0.75;
        const angle = (index / flames.children.length) * Math.PI * 2 + this.auraTimer * 0.55;
        const flicker = 0.86 + Math.sin(phase) * 0.16;
        flame.position.set(Math.sin(angle) * radius, 0.2 + Math.sin(phase * 1.7) * 0.045, Math.cos(angle) * radius);
        flame.scale.setScalar(flicker);
        flame.rotation.set(0, angle, Math.sin(phase) * 0.18);
      });
    }
  }

  private updateFrostField(elapsed: number): void {
    const level = this.skillLevel('frost');
    const frostRing = this.player.getObjectByName('frost-ring') as THREE.Mesh | undefined;
    if (!frostRing) return;
    if (level <= 0) {
      frostRing.visible = false;
      return;
    }
    const radius = 3.4 + level * 0.25;
    frostRing.visible = true;
    frostRing.scale.setScalar(radius);
    frostRing.rotation.z = -elapsed * 0.42;
    const material = frostRing.material as THREE.MeshBasicMaterial;
    material.opacity = 0.22 + Math.sin(elapsed * 5.5) * 0.05;
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
    const visual = this.createEnemyMesh(config);
    const mesh = visual.group;
    mesh.position.set(
      this.player.position.x + Math.sin(angle) * radius,
      0,
      this.player.position.z + Math.cos(angle) * radius,
    );
    const difficulty = Math.min(8, 1 + this.survived / 100);
    this.enemies.push({
      kind: config.kind,
      mesh,
      healthFill: visual.healthFill,
      burnEffect: visual.burnEffect,
      targetMarker: visual.targetMarker,
      isBoss: config.boss ?? false,
      hp: config.hp * difficulty,
      maxHp: config.hp * difficulty,
      speed: config.speed + Math.random() * 0.18 + this.survived * 0.004,
      radius: config.radius,
      xp: config.xp + Math.floor(this.survived / 35),
      stunTimer: 0,
      burnTimer: 0,
      burnDamage: 0,
      attackTimer: 0,
      knockback: new THREE.Vector3(),
    });
    this.scene.add(mesh);
  }

  private spawnBoss(): void {
    const bossKinds: EnemyKind[] = ['boss-gunner', 'boss-caster', 'boss-charger'];
    const config = ENEMY_CONFIGS[bossKinds[this.bossSpawnCount % bossKinds.length]];
    this.bossSpawnCount += 1;
    const angle = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 3;
    const visual = this.createEnemyMesh(config);
    const mesh = visual.group;
    mesh.position.set(
      this.player.position.x + Math.sin(angle) * radius,
      0,
      this.player.position.z + Math.cos(angle) * radius,
    );
    const difficulty = Math.min(1.18, 1 + this.survived / 180);
    const maxHp = this.bossHpForCurrentWeapon(config.kind) * difficulty;
    this.enemies.push({
      kind: config.kind,
      mesh,
      healthFill: visual.healthFill,
      burnEffect: visual.burnEffect,
      targetMarker: visual.targetMarker,
      isBoss: true,
      hp: maxHp,
      maxHp,
      speed: config.speed + this.survived * 0.0025,
      radius: config.radius,
      xp: config.xp + Math.floor(this.survived / 18),
      stunTimer: 0,
      burnTimer: 0,
      burnDamage: 0,
      attackTimer: 0.8,
      knockback: new THREE.Vector3(),
    });
    this.scene.add(mesh);
  }

  private bossHpForCurrentWeapon(kind: EnemyKind): number {
    const targetSeconds = BOSS_TARGET_SECONDS[kind] ?? 30;
    return Math.round(this.baseWeaponSustainedDps() * targetSeconds);
  }

  private baseWeaponSustainedDps(): number {
    switch (this.selectedWeapon.id) {
      case 'sprout-rifle':
        return this.selectedWeapon.fireRate * 3 * this.selectedWeapon.damage * 0.88;
      case 'bubble-shotgun':
        return this.selectedWeapon.fireRate * this.selectedWeapon.pellets * this.selectedWeapon.damage;
      case 'laser-rifle':
        return this.selectedWeapon.damage;
      default:
        return this.selectedWeapon.fireRate * this.selectedWeapon.damage;
    }
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
    const isRocket = this.selectedWeapon.id === 'rocket-launcher';
    const geometry = isRocket ? new THREE.CapsuleGeometry(0.13, 0.42, 4, 10) : new THREE.SphereGeometry(0.16, 12, 8);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isRocket ? 0.8 : 0.55,
      roughness: 0.35,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    mesh.position
      .copy(this.player.position)
      .addScaledVector(direction, isRocket ? 0.86 : 0.78)
      .addScaledVector(right, 0.32)
      .add(new THREE.Vector3(0, 0.78, 0));
    if (isRocket) {
      mesh.scale.set(1.2, 1.2, 1.2);
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.y = angle;
    }
    this.projectiles.push({
      mesh,
      velocity: direction.multiplyScalar(this.selectedWeapon.projectileSpeed),
      damage: this.weaponDamage() * damageMultiplier,
      trueDamage: this.weaponTrueDamage(),
      pierce: this.skillLevel('pierce') + pierceBonus,
      age: 0,
      radius: isRocket ? 0.32 : 0.22,
      explosionRadius: isRocket ? this.rocketExplosionRadius() : 0,
      hitEnemies: new Set(),
    });
    this.scene.add(mesh);
  }

  private explodeProjectile(position: THREE.Vector3, damage: number, trueDamage: number, radius: number): void {
    const blastCenter = position.clone();
    for (const enemy of [...this.enemies]) {
      const dx = enemy.mesh.position.x - blastCenter.x;
      const dz = enemy.mesh.position.z - blastCenter.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > (radius + enemy.radius) * (radius + enemy.radius)) continue;
      const distance = Math.sqrt(distanceSquared);
      const falloff = THREE.MathUtils.clamp(1.12 - distance / (radius * 1.45), 0.68, 1);
      this.damageEnemy(enemy, damage * falloff, trueDamage);
    }

    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.38, radius, 48),
      new THREE.MeshBasicMaterial({
        color: '#ffb020',
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.copy(blastCenter);
    shockwave.position.y = 0.08;
    shockwave.renderOrder = 4;
    this.scene.add(shockwave);
    shockwave.scale.setScalar(1);
    setTimeout(() => {
      this.scene.remove(shockwave);
      shockwave.geometry.dispose();
      shockwave.material.dispose();
    }, 160);
  }

  private spawnEnemyProjectile(
    position: THREE.Vector3,
    angle: number,
    speed: number,
    damage: number,
    color: string,
    radius: number,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 10),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 }),
    );
    mesh.castShadow = true;
    mesh.position.copy(position).add(new THREE.Vector3(0, 0.9, 0));
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    this.enemyProjectiles.push({
      mesh,
      velocity: direction.multiplyScalar(speed),
      damage,
      age: 0,
      radius,
      deflected: false,
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

  private damagePlayer(amount: number, direction: THREE.Vector3, force: number): void {
    this.health -= amount;
    this.hitCooldown = 0.55;
    direction.y = 0;
    if (direction.lengthSq() < 0.001) {
      direction.set(Math.sin(this.aimAngle), 0, Math.cos(this.aimAngle));
    }
    direction.normalize();
    this.playerKnockback.addScaledVector(direction, force);
    this.playerKnockback.clampLength(0, 16);
    this.audio.hit();
    this.hud.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.mode = 'game-over';
      this.hud.showGameOver(this.kills, this.survived);
    }
  }

  private deflectEnemyProjectile(projectile: EnemyProjectile, hammerPosition: THREE.Vector3): void {
    const direction = projectile.mesh.position.clone().sub(hammerPosition);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) {
      direction.copy(projectile.velocity).multiplyScalar(-1);
    }
    direction.normalize();
    projectile.deflected = true;
    projectile.age = 0;
    projectile.velocity.copy(direction.multiplyScalar(15));
    projectile.damage *= 1.4;
    projectile.radius *= 1.08;
    const material = projectile.mesh.material as THREE.MeshStandardMaterial;
    material.color.set('#ffe066');
    material.emissive.set('#ff8a2b');
    projectile.mesh.scale.setScalar(1.16);
  }

  private cooldownHammer(hammer: Hammer, duration: number): void {
    hammer.cooldown = duration;
    hammer.hitCount = 0;
    hammer.mesh.visible = false;
  }

  private hammerDurability(level: number): number {
    return 6 + Math.floor(level / 2);
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

  private updateEnemyHealthBar(enemy: Enemy): void {
    const healthRatio = THREE.MathUtils.clamp(enemy.hp / enemy.maxHp, 0, 1);
    this.lowestEnemyHealthRatioSeen = Math.min(this.lowestEnemyHealthRatioSeen, healthRatio);
    enemy.healthFill.scale.x = healthRatio;
    enemy.healthFill.material.color.set(healthRatio > 0.55 ? '#7dff6a' : healthRatio > 0.25 ? '#ffd166' : '#ff5a5f');
    const bar = enemy.mesh.getObjectByName('health-bar');
    if (bar) bar.lookAt(this.camera.position);
  }

  private damageEnemy(enemy: Enemy, damage: number, trueDamage = 0, applyBurn = true, flash = true): void {
    const luckyLevel = this.skillLevel('lucky');
    const crit = luckyLevel > 0 && Math.random() < 0.04 + luckyLevel * 0.012;
    enemy.hp -= (crit ? damage * 2.2 : damage) + trueDamage;
    if (applyBurn && enemy.hp > 0) this.igniteEnemy(enemy);
    this.updateEnemyHealthBar(enemy);
    if (flash) this.flashEnemy(enemy.mesh);
    if (enemy.hp <= 0) {
      const index = this.enemies.indexOf(enemy);
      if (index >= 0) this.killEnemy(index);
    }
  }

  private igniteEnemy(enemy: Enemy): void {
    const level = this.skillLevel('aura');
    if (level <= 0) return;
    const damageLevel = Math.floor(level / 2);
    enemy.burnTimer = Math.max(enemy.burnTimer, 2.2 + level * 0.18);
    enemy.burnDamage = Math.max(enemy.burnDamage, 4.2 + damageLevel * 2.2);
    enemy.burnEffect.visible = true;
  }

  private weaponDamage(): number {
    const luckyLevel = this.skillLevel('lucky');
    const crit = luckyLevel > 0 && Math.random() < 0.04 + luckyLevel * 0.012;
    let damage = this.selectedWeapon.damage;
    if (this.selectedWeapon.id === 'sniper-rifle') {
      damage += this.skillLevel('sniper-focus') * 7;
    }
    if (this.selectedWeapon.id === 'rocket-launcher') {
      damage += this.skillLevel('rocket-payload') * 3.5;
    }
    return crit ? damage * 2.2 : damage;
  }

  private weaponTrueDamage(): number {
    const level = this.skillLevel('damage');
    if (level <= 0) return 0;
    return 2 + level * 2.4;
  }

  private rapidFireMultiplier(): number {
    const level = this.skillLevel('rapid');
    if (level <= 0) return 1;
    return 1 + level * 0.18 + Math.floor(level / 3) * 0.12;
  }

  private weaponFireRateMultiplier(): number {
    if (this.selectedWeapon.id !== 'star-smg') return 1;
    const level = this.skillLevel('smg-overdrive');
    return 1 + level * 0.13;
  }

  private weaponExtraPellets(): number {
    if (this.selectedWeapon.id !== 'bubble-shotgun') return 0;
    return this.skillLevel('shotgun-pellets');
  }

  private rocketExplosionRadius(): number {
    return 2.45 + this.skillLevel('rocket-blast') * 0.28 + this.skillLevel('multi') * 0.06;
  }

  private laserSweepDuration(): number {
    return 1.15 + this.skillLevel('laser-duration') * 0.24;
  }

  private laserSweepArc(): number {
    return 1.05 + this.skillLevel('laser-arc') * 0.24;
  }

  private laserDamagePerSecond(): number {
    return this.selectedWeapon.damage + this.skillLevel('laser-power') * 7;
  }

  private laserCooldown(fireRate: number): number {
    const baseCooldown = 1 / fireRate;
    return Math.max(1.15, baseCooldown - this.skillLevel('laser-coolant') * 0.24);
  }

  private laserRange(): number {
    return 11.5 + this.skillLevel('laser-arc') * 0.35;
  }

  private laserWidth(): number {
    return 0.34 + this.skillLevel('laser-power') * 0.025;
  }

  private bossHudState(): { name: string; healthRatio: number } | undefined {
    const bosses = this.enemies.filter((enemy) => enemy.isBoss);
    if (bosses.length === 0) return undefined;
    const boss = bosses.reduce((selected, enemy) => (enemy.maxHp > selected.maxHp ? enemy : selected), bosses[0]);
    return {
      name: this.enemyDisplayName(boss.kind),
      healthRatio: THREE.MathUtils.clamp(boss.hp / boss.maxHp, 0, 1),
    };
  }

  private enemyDisplayName(kind: EnemyKind): string {
    switch (kind) {
      case 'boss-gunner':
        return '枪手 BOSS';
      case 'boss-caster':
        return '法球 BOSS';
      case 'boss-charger':
        return '冲锋 BOSS';
      default:
        return 'BOSS';
    }
  }

  private findNearestEnemy(): Enemy | null {
    if (this.lockedTarget && this.enemies.includes(this.lockedTarget)) return this.lockedTarget;
    let nearest: Enemy | null = null;
    let nearestDistance = Infinity;
    const bosses = this.enemies.filter((enemy) => enemy.isBoss);
    const candidates = bosses.length > 0 ? bosses : this.enemies;
    for (const enemy of candidates) {
      const distance = enemy.mesh.position.distanceToSquared(this.player.position);
      if (distance < nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private skillChoices(): SkillChoiceView[] {
    const available = ALL_SKILLS.filter(
      (skill) =>
        (!skill.weapon || skill.weapon === this.selectedWeapon.id) &&
        this.skillAppliesToWeapon(skill.id) &&
        this.skillLevel(skill.id) < MAX_SKILL_LEVEL,
    );
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
    const entries = ALL_SKILLS.filter((skill) => this.skillLevel(skill.id) > 0).map(
      (skill) => `${skill.icon}${this.skillLevel(skill.id)}`,
    );
    return entries.length > 0 ? entries.join(' ') : '无技能';
  }

  private skillLevel(id: SkillId): number {
    return this.skillLevels.get(id) ?? 0;
  }

  private aimModeLabel(): string {
    if (!this.manualTargetMode) return '自动瞄准';
    return this.lockedTarget ? '锁定目标' : '鼠标选怪';
  }

  private skillAppliesToWeapon(id: SkillId): boolean {
    if (id === 'pierce') {
      return !['sprout-rifle', 'rocket-launcher', 'laser-rifle'].includes(this.selectedWeapon.id);
    }
    if (id === 'multi') {
      return this.selectedWeapon.id !== 'laser-rifle';
    }
    return true;
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#9fd9ff');
    this.scene.fog = new THREE.Fog('#9fd9ff', 34, 88);

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
    this.scene.add(this.laserBeam);
  }

  private createLaserBeam(): THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: '#8f7dff',
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.visible = false;
    beam.renderOrder = 6;
    return beam;
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

    const grassGeometry = new THREE.ConeGeometry(1, 1, 5);
    const darkGrass = new THREE.InstancedMesh(grassGeometry, new THREE.MeshStandardMaterial({ color: '#4fae57', roughness: 0.85 }), 220);
    const lightGrass = new THREE.InstancedMesh(grassGeometry, new THREE.MeshStandardMaterial({ color: '#8bd66f', roughness: 0.85 }), 260);
    const dummy = new THREE.Object3D();
    let darkIndex = 0;
    let lightIndex = 0;
    const placeGrass = (count: number, width: number, depth: number, minHeight: number, maxHeight: number): void => {
      for (let i = 0; i < count; i += 1) {
        const height = minHeight + Math.random() * (maxHeight - minHeight);
        const radius = 0.1 + Math.random() * 0.16;
        dummy.position.set((Math.random() - 0.5) * width, height / 2, (Math.random() - 0.5) * depth);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(radius, height, radius);
        dummy.updateMatrix();
        if ((i + count) % 3 === 0 && darkIndex < darkGrass.count) {
          darkGrass.setMatrixAt(darkIndex, dummy.matrix);
          darkIndex += 1;
        } else if (lightIndex < lightGrass.count) {
          lightGrass.setMatrixAt(lightIndex, dummy.matrix);
          lightIndex += 1;
        }
      }
    };
    placeGrass(180, 72, 56, 0.38, 0.72);
    placeGrass(300, 180, 140, 0.28, 0.56);
    darkGrass.count = darkIndex;
    lightGrass.count = lightIndex;
    darkGrass.castShadow = true;
    lightGrass.castShadow = true;
    arena.add(darkGrass, lightGrass);

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
    visor.position.set(0, 0.93, 0.36);
    group.add(visor);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.72),
      new THREE.MeshStandardMaterial({ color: '#2d4059', roughness: 0.35 }),
    );
    gun.position.set(0.42, 0.72, 0.45);
    gun.castShadow = true;
    group.add(gun);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.08, 64),
      new THREE.MeshBasicMaterial({ color: '#ff8a2b', transparent: true, opacity: 0.34, depthWrite: false }),
    );
    aura.name = 'aura-ring';
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    aura.visible = false;
    group.add(aura);

    const frostRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1.04, 72),
      new THREE.MeshBasicMaterial({
        color: '#6edcff',
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    frostRing.name = 'frost-ring';
    frostRing.rotation.x = -Math.PI / 2;
    frostRing.position.y = 0.07;
    frostRing.visible = false;
    frostRing.renderOrder = 3;
    group.add(frostRing);

    const flames = new THREE.Group();
    flames.name = 'aura-flames';
    flames.visible = false;
    for (let i = 0; i < 16; i += 1) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.34, 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? '#ff4f1f' : '#ffd166',
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
        }),
      );
      flame.position.y = 0.2;
      flames.add(flame);
    }
    group.add(flames);
    return group;
  }

  private createEnemyMesh(config: EnemyConfig): {
    group: THREE.Group;
    healthFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    burnEffect: THREE.Group;
    targetMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  } {
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

    if (config.boss) {
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.42, 5),
        new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#9c5b00', emissiveIntensity: 0.35, roughness: 0.4 }),
      );
      marker.position.set(0, body.position.y + 0.86, 0);
      marker.rotation.y = Math.PI / 5;
      group.add(marker);

      if (config.kind === 'boss-gunner') {
        const cannon = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.24, 1.05),
          new THREE.MeshStandardMaterial({ color: '#2d4059', emissive: '#4b3cff', emissiveIntensity: 0.22, roughness: 0.3 }),
        );
        cannon.position.set(0.58, body.position.y, -0.68);
        cannon.castShadow = true;
        group.add(cannon);
      } else if (config.kind === 'boss-caster') {
        for (let i = 0; i < 4; i += 1) {
          const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 10, 8),
            new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? '#40f0d0' : '#fff27a' }),
          );
          const angle = (i / 4) * Math.PI * 2;
          orb.position.set(Math.sin(angle) * 0.52, body.position.y + 0.58, Math.cos(angle) * 0.52);
          group.add(orb);
        }
      } else if (config.kind === 'boss-charger') {
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(
            new THREE.ConeGeometry(0.12, 0.55, 8),
            new THREE.MeshStandardMaterial({ color: '#f7efe2', roughness: 0.45 }),
          );
          horn.position.set(side * 0.5, body.position.y + 0.2, -0.55);
          horn.rotation.x = Math.PI / 2;
          horn.rotation.z = side * 0.38;
          horn.castShadow = true;
          group.add(horn);
        }
      }
    }

    const bar = new THREE.Group();
    bar.name = 'health-bar';
    bar.position.set(0, body.position.y + (config.boss ? 1.08 : 0.7), 0);
    const barBack = new THREE.Mesh(
      new THREE.PlaneGeometry(config.boss ? 1.5 : 0.92, config.boss ? 0.14 : 0.1),
      new THREE.MeshBasicMaterial({ color: '#263238', depthTest: false }),
    );
    const healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(config.boss ? 1.38 : 0.84, config.boss ? 0.088 : 0.064),
      new THREE.MeshBasicMaterial({ color: '#7dff6a', depthTest: false }),
    );
    healthFill.name = 'health-fill';
    healthFill.position.set(config.boss ? -0.69 : -0.42, 0, 0.004);
    healthFill.scale.x = 1;
    healthFill.geometry.translate(config.boss ? 0.69 : 0.42, 0, 0);
    bar.add(barBack, healthFill);
    group.add(bar);

    const targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(config.boss ? 0.95 : 0.58, config.boss ? 1.12 : 0.72, 4),
      new THREE.MeshBasicMaterial({
        color: '#77ff66',
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.rotation.z = Math.PI / 4;
    targetMarker.position.y = 0.08;
    targetMarker.renderOrder = 7;
    targetMarker.visible = false;
    group.add(targetMarker);

    const burnEffect = this.createBurnEffect(config.boss ? 1.25 : 0.82);
    burnEffect.position.y = body.position.y + (config.boss ? 0.1 : 0);
    burnEffect.visible = false;
    group.add(burnEffect);

    return { group, healthFill, burnEffect, targetMarker };
  }

  private createBurnEffect(scale: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'burn-effect';
    const colors = ['#ff3b1f', '#ff8a1f', '#ffe066'];
    for (let i = 0; i < 5; i += 1) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.08 + i * 0.012, 0.34 + i * 0.035, 7),
        new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 0.78,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      const angle = (i / 5) * Math.PI * 2;
      flame.position.set(Math.sin(angle) * 0.22 * scale, 0.18 + (i % 2) * 0.08, Math.cos(angle) * 0.22 * scale);
      flame.scale.setScalar(scale);
      flame.castShadow = false;
      flame.receiveShadow = false;
      group.add(flame);
    }
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
      bosses: this.enemies.filter((enemy) => enemy.isBoss).length,
      aimTargetIsBoss: this.findNearestEnemy()?.isBoss ?? false,
      enemyHealthRatios: this.enemies.map((enemy) => THREE.MathUtils.clamp(enemy.hp / enemy.maxHp, 0, 1)),
      lowestEnemyHealthRatioSeen: this.lowestEnemyHealthRatioSeen,
      burningEnemies: this.enemies.filter((enemy) => enemy.burnTimer > 0).length,
      waveNumber: this.waveNumber,
      projectiles: this.projectiles.length,
      enemyProjectiles: this.enemyProjectiles.length,
      deflectedEnemyProjectiles: this.enemyProjectiles.filter((projectile) => projectile.deflected).length,
      hammers: this.hammers.length,
      coolingHammers: this.hammers.filter((hammer) => hammer.cooldown > 0).length,
      hammerDurability: this.hammerDurability(this.skillLevel('hammers')),
      laserActive: this.laserTimer > 0,
      laserTimer: this.laserTimer,
      scheduledShots: this.scheduledShots.length,
      xpOrbs: this.xpOrbs.length,
      healthOrbs: this.healthOrbs.length,
      weapon: this.selectedWeapon.id,
      manualTargetMode: this.manualTargetMode,
      hoveredTarget: this.hoveredTarget ? this.enemies.indexOf(this.hoveredTarget) : -1,
      lockedTarget: this.lockedTarget ? this.enemies.indexOf(this.lockedTarget) : -1,
      aimAngle: this.aimAngle,
      rolling: this.rollTimer > 0,
      playerKnockback: this.playerKnockback.length(),
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
      { normal: 0, runner: 0, brute: 0, 'boss-gunner': 0, 'boss-caster': 0, 'boss-charger': 0 },
    );
  }
}
