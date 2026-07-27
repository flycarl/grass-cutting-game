type HudState = {
  mode: string;
  health: number;
  stamina: number;
  level: number;
  xp: number;
  xpNeeded: number;
  kills: number;
  survived: number;
  enemies: number;
  skills: string;
  boss?: {
    name: string;
    healthRatio: number;
  };
};

export type WeaponChoiceView = {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
};

export type SkillChoiceView = {
  id: string;
  name: string;
  icon: string;
  description: string;
  level: number;
  nextLevel: number;
  maxLevel: number;
};

type HudActions = {
  onWeaponSelect: (id: string) => void;
  onSkillSelect: (id: string) => void;
  onPause: () => void;
  onRestart: () => void;
};

export class Hud {
  private readonly healthFill = this.getElement('#health-fill');
  private readonly staminaFill = this.getElement('#stamina-fill');
  private readonly xpFill = this.getElement('#xp-fill');
  private readonly levelValue = this.getElement('#level-value');
  private readonly killValue = this.getElement('#kill-value');
  private readonly timerValue = this.getElement('#timer-value');
  private readonly enemyValue = this.getElement('#enemy-value');
  private readonly skillValue = this.getElement('#skill-value');
  private readonly weaponName = this.getElement('#weapon-name');
  private readonly statusLine = this.getElement('#status-line');
  private readonly bossBar = this.getElement('#boss-bar');
  private readonly bossTitle = this.getElement('#boss-title');
  private readonly bossFill = this.getElement('#boss-fill');
  private readonly bossPercent = this.getElement('#boss-percent');
  private readonly overlay = this.getElement('#overlay');
  private readonly overlayTitle = this.getElement('#overlay-title');
  private readonly overlayBody = this.getElement('#overlay-body');
  private readonly pauseButton = this.getElement('#pause-button') as HTMLButtonElement;
  private readonly restartButton = this.getElement('#restart-button') as HTMLButtonElement;

  constructor(private readonly actions: HudActions) {
    this.pauseButton.addEventListener('click', () => this.actions.onPause());
    this.restartButton.addEventListener('click', () => this.actions.onRestart());
  }

  update(state: HudState): void {
    this.healthFill.style.width = `${state.health}%`;
    this.staminaFill.style.width = `${state.stamina}%`;
    this.xpFill.style.width = `${Math.min(100, (state.xp / state.xpNeeded) * 100)}%`;
    this.levelValue.textContent = String(state.level).padStart(2, '0');
    this.killValue.textContent = String(state.kills).padStart(3, '0');
    this.enemyValue.textContent = String(state.enemies).padStart(2, '0');
    this.skillValue.textContent = state.skills;
    this.timerValue.textContent = this.formatTime(state.survived);
    if (state.boss) {
      const percent = Math.max(0, Math.min(100, Math.round(state.boss.healthRatio * 100)));
      this.bossBar.hidden = false;
      this.bossTitle.textContent = state.boss.name;
      this.bossFill.style.width = `${percent}%`;
      this.bossPercent.textContent = `${percent}%`;
    } else {
      this.bossBar.hidden = true;
    }
    if (state.mode === 'playing') this.statusLine.textContent = '四面八方有怪物靠近';
    if (state.mode === 'level-up') this.statusLine.textContent = '选择技能强化';
  }

  setWeapon(name: string, color: string): void {
    this.weaponName.textContent = name;
    this.weaponName.style.borderColor = color;
  }

  showWeaponSelect(weapons: WeaponChoiceView[]): void {
    this.overlay.hidden = false;
    this.overlayTitle.textContent = '选择开局枪械';
    this.overlayBody.replaceChildren(
      ...weapons.map((weapon) => {
        const button = this.choiceButton(weapon.icon, weapon.name, weapon.description, `开局武器`);
        button.style.borderColor = weapon.color;
        button.addEventListener('click', () => this.actions.onWeaponSelect(weapon.id));
        return button;
      }),
    );
  }

  showSkillChoices(skills: SkillChoiceView[]): void {
    this.overlay.hidden = false;
    this.overlayTitle.textContent = '升级了，选一个技能';
    this.overlayBody.replaceChildren(
      ...skills.map((skill) => {
        const label = skill.level > 0 ? `Lv.${skill.level} -> ${skill.nextLevel}` : '新技能';
        const button = this.choiceButton(skill.icon, skill.name, skill.description, `${label} / ${skill.maxLevel}`);
        button.addEventListener('click', () => this.actions.onSkillSelect(skill.id));
        return button;
      }),
    );
  }

  showPause(): void {
    this.overlay.hidden = false;
    this.overlayTitle.textContent = '暂停';
    const resume = this.choiceButton('>', '继续战斗', '回到草场继续清怪', '当前局');
    resume.addEventListener('click', () => this.actions.onPause());
    const restart = this.choiceButton('R', '重新开始', '回到枪械选择', '重开');
    restart.addEventListener('click', () => this.actions.onRestart());
    this.overlayBody.replaceChildren(resume, restart);
  }

  showGameOver(kills: number, survived: number): void {
    this.overlay.hidden = false;
    this.overlayTitle.textContent = '被包围了';
    const retry = this.choiceButton('R', '再来一局', `击败 ${kills} 个，存活 ${this.formatTime(survived)}`, '重开');
    retry.addEventListener('click', () => this.actions.onRestart());
    this.overlayBody.replaceChildren(retry);
    this.statusLine.textContent = '倒下了，但草还在';
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  flashDamage(): void {
    this.statusLine.animate([{ color: '#fff' }, { color: '#ff4f5e' }, { color: '#fff' }], {
      duration: 240,
      easing: 'ease-out',
    });
  }

  private choiceButton(icon: string, title: string, description: string, meta: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'choice-button';
    button.type = 'button';
    button.innerHTML = `
      <span class="choice-icon">${icon}</span>
      <span class="choice-copy">
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      <span class="choice-meta">${meta}</span>
    `;
    return button;
  }

  private formatTime(secondsTotal: number): string {
    const minutes = Math.floor(secondsTotal / 60).toString().padStart(2, '0');
    const seconds = Math.floor(secondsTotal % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
