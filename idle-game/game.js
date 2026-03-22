"use strict";

(() => {
  const SAVE_KEY = "idleCuteGameSaveV1";
  const MAX_OFFLINE_SECONDS = 60 * 60 * 8;

  const CONFIG = {
    clickBase: 1,
    autoBase: 0,
    critBase: 0.05,
    critMultiplier: 2.5,
    clickUpgrade: { baseCost: 18, growth: 1.26, gain: 1 },
    autoUpgrade: { baseCost: 36, growth: 1.32, gain: 1 },
    critUpgrade: { baseCost: 50, growth: 1.36, gain: 0.012, max: 0.65 },
    tickMs: 100,
    levelCurve: 120
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatNumber(value) {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(0);
  }

  class AudioFeedback {
    constructor() {
      this.ctx = null;
    }

    ensureContext() {
      if (!window.AudioContext && !window.webkitAudioContext) return false;
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
    }

    play(freq, duration, type, volume, slide = 0) {
      if (!this.ensureContext()) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    click(isCrit) {
      this.play(isCrit ? 640 : 430, 0.08, "triangle", isCrit ? 0.08 : 0.05, isCrit ? 80 : 30);
    }

    upgrade() {
      this.play(520, 0.09, "square", 0.06, 50);
      this.play(680, 0.08, "triangle", 0.05, 20);
    }
  }

  class GameState {
    constructor() {
      this.gold = 0;
      this.totalGold = 0;
      this.clickLevel = 0;
      this.autoLevel = 0;
      this.critLevel = 0;
      this.lastSave = Date.now();
    }

    fromSave(data) {
      this.gold = Number(data.gold) || 0;
      this.totalGold = Number(data.totalGold) || 0;
      this.clickLevel = Number(data.clickLevel) || 0;
      this.autoLevel = Number(data.autoLevel) || 0;
      this.critLevel = Number(data.critLevel) || 0;
      this.lastSave = Number(data.lastSave) || Date.now();
    }

    toSave() {
      return {
        gold: this.gold,
        totalGold: this.totalGold,
        clickLevel: this.clickLevel,
        autoLevel: this.autoLevel,
        critLevel: this.critLevel,
        lastSave: Date.now()
      };
    }

    get clickIncome() {
      return CONFIG.clickBase + this.clickLevel * CONFIG.clickUpgrade.gain;
    }

    get autoIncome() {
      return CONFIG.autoBase + this.autoLevel * CONFIG.autoUpgrade.gain;
    }

    get critRate() {
      const rate = CONFIG.critBase + this.critLevel * CONFIG.critUpgrade.gain;
      return clamp(rate, CONFIG.critBase, CONFIG.critUpgrade.max);
    }

    get level() {
      return 1 + Math.floor(Math.sqrt(this.totalGold / CONFIG.levelCurve));
    }

    clickCost() {
      return Math.floor(CONFIG.clickUpgrade.baseCost * CONFIG.clickUpgrade.growth ** this.clickLevel);
    }

    autoCost() {
      return Math.floor(CONFIG.autoUpgrade.baseCost * CONFIG.autoUpgrade.growth ** this.autoLevel);
    }

    critCost() {
      return Math.floor(CONFIG.critUpgrade.baseCost * CONFIG.critUpgrade.growth ** this.critLevel);
    }

    addGold(amount) {
      if (amount <= 0) return;
      this.gold += amount;
      this.totalGold += amount;
    }
  }

  class UI {
    constructor() {
      this.goldText = document.getElementById("goldText");
      this.levelText = document.getElementById("levelText");
      this.clickIncomeText = document.getElementById("clickIncomeText");
      this.autoIncomeText = document.getElementById("autoIncomeText");
      this.critRateText = document.getElementById("critRateText");
      this.heroBtn = document.getElementById("heroBtn");
      this.floatLayer = document.getElementById("floatLayer");

      this.upgradeClickBtn = document.getElementById("upgradeClickBtn");
      this.upgradeAutoBtn = document.getElementById("upgradeAutoBtn");
      this.upgradeCritBtn = document.getElementById("upgradeCritBtn");
      this.resetBtn = document.getElementById("resetBtn");
    }

    render(state) {
      this.goldText.textContent = formatNumber(state.gold);
      this.levelText.textContent = String(state.level);
      this.clickIncomeText.textContent = formatNumber(state.clickIncome);
      this.autoIncomeText.textContent = formatNumber(state.autoIncome);
      this.critRateText.textContent = `${(state.critRate * 100).toFixed(1)}%`;

      const clickCost = state.clickCost();
      const autoCost = state.autoCost();
      const critCost = state.critCost();

      this.upgradeClickBtn.textContent = `升级点击收益 Lv.${state.clickLevel} (+1) - ${formatNumber(clickCost)} 金币`;
      this.upgradeAutoBtn.textContent = `升级自动收益 Lv.${state.autoLevel} (+1/s) - ${formatNumber(autoCost)} 金币`;
      this.upgradeCritBtn.textContent = `升级暴击率 Lv.${state.critLevel} (+1.2%) - ${formatNumber(critCost)} 金币`;

      this.upgradeClickBtn.disabled = state.gold < clickCost;
      this.upgradeAutoBtn.disabled = state.gold < autoCost;
      this.upgradeCritBtn.disabled = state.gold < critCost || state.critRate >= CONFIG.critUpgrade.max;
    }

    pulseHero() {
      this.heroBtn.classList.remove("hero-pulse");
      void this.heroBtn.offsetWidth;
      this.heroBtn.classList.add("hero-pulse");
    }

    spawnFloatText(label, x, y, isCrit = false) {
      const text = document.createElement("span");
      text.className = `float-text${isCrit ? " crit" : ""}`;
      text.textContent = label;
      text.style.left = `${x}px`;
      text.style.top = `${y}px`;
      this.floatLayer.appendChild(text);
      setTimeout(() => text.remove(), 900);
    }
  }

  class GameApp {
    constructor() {
      this.state = new GameState();
      this.ui = new UI();
      this.audio = new AudioFeedback();
      this.accumulatorMs = 0;
      this.lastTickTime = performance.now();
      this.saveTimer = 0;
    }

    init() {
      this.load();
      this.bindEvents();
      this.ui.render(this.state);
      this.loop();
    }

    load() {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        try {
          this.state.fromSave(JSON.parse(raw));
        } catch (_error) {
          // Ignore broken save and continue with defaults.
        }
      }

      // Offline income is based on elapsed time since the last save.
      const elapsedSeconds = clamp((Date.now() - this.state.lastSave) / 1000, 0, MAX_OFFLINE_SECONDS);
      const offlineGain = this.state.autoIncome * elapsedSeconds;
      if (offlineGain > 0) {
        this.state.addGold(offlineGain);
      }
    }

    save() {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state.toSave()));
    }

    bindEvents() {
      this.ui.heroBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.onHeroClick(event);
      });

      this.ui.upgradeClickBtn.addEventListener("click", () => {
        const cost = this.state.clickCost();
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.clickLevel += 1;
        this.audio.upgrade();
        this.ui.render(this.state);
      });

      this.ui.upgradeAutoBtn.addEventListener("click", () => {
        const cost = this.state.autoCost();
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.autoLevel += 1;
        this.audio.upgrade();
        this.ui.render(this.state);
      });

      this.ui.upgradeCritBtn.addEventListener("click", () => {
        const cost = this.state.critCost();
        if (this.state.gold < cost || this.state.critRate >= CONFIG.critUpgrade.max) return;
        this.state.gold -= cost;
        this.state.critLevel += 1;
        this.audio.upgrade();
        this.ui.render(this.state);
      });

      this.ui.resetBtn.addEventListener("click", () => {
        localStorage.removeItem(SAVE_KEY);
        this.state = new GameState();
        this.ui.render(this.state);
      });

      window.addEventListener("beforeunload", () => this.save());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.save();
      });
    }

    onHeroClick(event) {
      const isCrit = Math.random() < this.state.critRate;
      const gain = this.state.clickIncome * (isCrit ? CONFIG.critMultiplier : 1);
      this.state.addGold(gain);
      this.ui.render(this.state);
      this.ui.pulseHero();
      this.audio.click(isCrit);

      const rect = this.ui.floatLayer.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const label = `${isCrit ? "暴击! " : "+"}${formatNumber(gain)}`;
      this.ui.spawnFloatText(label, x, y, isCrit);
    }

    loop() {
      const now = performance.now();
      const deltaMs = now - this.lastTickTime;
      this.lastTickTime = now;
      this.accumulatorMs += deltaMs;
      this.saveTimer += deltaMs;

      while (this.accumulatorMs >= CONFIG.tickMs) {
        const seconds = CONFIG.tickMs / 1000;
        this.state.addGold(this.state.autoIncome * seconds);
        this.accumulatorMs -= CONFIG.tickMs;
      }

      this.ui.render(this.state);

      if (this.saveTimer >= 3000) {
        this.save();
        this.saveTimer = 0;
      }

      requestAnimationFrame(() => this.loop());
    }
  }

  new GameApp().init();
})();
