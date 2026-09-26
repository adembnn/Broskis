export type DifficultyLevel = 'Facile' | 'Moyen' | 'Difficile' | 'Hardcore';

export interface AIDifficultySettings {
  aimSigmaYaw: number;
  aimSigmaPower: number;
  attackChoice: 'random_top_half' | 'top_5' | 'top_3_riposte' | 'best_depth_2';
  attackErrorRate: number;
  parrySigmaMs: number;
  parryMissRate: number;
  feintRate: number;
  niceRate: number;
  biteFeintRate: number;
  windowMultiplier: number;
  damageReceivedMultiplier: number;
  aimAssist: 'full' | 'trajectory_circle' | 'trajectory_60' | 'trajectory_35_no_circle';
  targetWinRate: number;
}

export const DIFFICULTY_LEVELS: Record<DifficultyLevel, AIDifficultySettings> = {
  Facile: {
    aimSigmaYaw: 6, aimSigmaPower: 0.15,
    attackChoice: 'random_top_half', attackErrorRate: 0.25,
    parrySigmaMs: 150, parryMissRate: 0.20,
    feintRate: 0, niceRate: 0.10, biteFeintRate: 0.50,
    windowMultiplier: 1.4, damageReceivedMultiplier: 0.8,
    aimAssist: 'full', targetWinRate: 0.85
  },
  Moyen: {
    aimSigmaYaw: 4, aimSigmaPower: 0.10,
    attackChoice: 'top_5', attackErrorRate: 0.10,
    parrySigmaMs: 100, parryMissRate: 0.10,
    feintRate: 0.30, niceRate: 0.30, biteFeintRate: 0.30,
    windowMultiplier: 1.15, damageReceivedMultiplier: 1.0,
    aimAssist: 'trajectory_circle', targetWinRate: 0.60
  },
  Difficile: {
    aimSigmaYaw: 3, aimSigmaPower: 0.06,
    attackChoice: 'top_3_riposte', attackErrorRate: 0.0,
    parrySigmaMs: 65, parryMissRate: 0.05,
    feintRate: 0.60, niceRate: 0.50, biteFeintRate: 0.15,
    windowMultiplier: 1.0, damageReceivedMultiplier: 1.0,
    aimAssist: 'trajectory_60', targetWinRate: 0.45
  },
  Hardcore: {
    aimSigmaYaw: 2, aimSigmaPower: 0.04,
    attackChoice: 'best_depth_2', attackErrorRate: 0.0,
    parrySigmaMs: 45, parryMissRate: 0.02,
    feintRate: 0.90, niceRate: 0.70, biteFeintRate: 0.05,
    windowMultiplier: 0.85, damageReceivedMultiplier: 1.0, // Floor is 40ms, handled in rules
    aimAssist: 'trajectory_35_no_circle', targetWinRate: 0.25
  }
};

export class AdaptiveDifficulty {
  public rating: number; // 0 to 100
  public level: DifficultyLevel;
  public streak: number = 0; // Negative for losses, positive for wins

  constructor(initialLevel: DifficultyLevel) {
    this.level = initialLevel;
    this.rating = this.getInitialRating(initialLevel);
  }

  private getInitialRating(level: DifficultyLevel): number {
    switch(level) {
      case 'Facile': return 0;
      case 'Moyen': return 25;
      case 'Difficile': return 50;
      case 'Hardcore': return 80;
    }
  }

  public updateAfterMatch(won: boolean, hpDifference: number) {
    if (this.level === 'Hardcore') return; // Hardcore is fixed

    if (won) {
      this.streak = this.streak > 0 ? this.streak + 1 : 1;
      this.rating += hpDifference > 50 ? 6 : 3; 
    } else {
      this.streak = this.streak < 0 ? this.streak - 1 : -1;
      this.rating -= 3;
      if (hpDifference < -50) this.rating -= 3;
      if (this.streak <= -2) this.rating -= 8;
    }

    this.rating = Math.max(0, Math.min(100, this.rating));
    this.updateLevel();
  }

  private updateLevel() {
    if (this.rating <= 30) this.level = 'Facile';
    else if (this.rating <= 55) this.level = 'Moyen';
    else if (this.rating <= 80) this.level = 'Difficile';
    else this.level = 'Hardcore';
  }

  public getInMatchSettings(aiHp: number, playerHp: number): AIDifficultySettings {
    const settings = { ...DIFFICULTY_LEVELS[this.level] };
    if (aiHp - playerHp >= 40) {
      // Temperature x1.5 => increase error and randomness slightly
      settings.attackErrorRate = Math.min(1.0, settings.attackErrorRate * 1.5);
      settings.parryMissRate = Math.min(1.0, settings.parryMissRate * 1.5);
      settings.aimSigmaYaw *= 1.5;
    }
    return settings;
  }
}
