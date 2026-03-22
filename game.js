"use strict";

(() => {
  const CONFIG = {
    gridSize: 4,
    gap: 10,
    boardPadding: 14,
    spawnCountAtStart: 5,
    baseSpawnLevels: [1, 1, 1, 2],
    mergeAnimDuration: 260,
    popTextDuration: 640,
    dragScale: 1.08,
    maxPixelSize: 640
  };

  const TILE_COLORS = {
    1: "#8ec5ff",
    2: "#7fd6b8",
    3: "#ffe08a",
    4: "#ffbe7f",
    5: "#ff9dad",
    6: "#c6a7ff",
    7: "#9be6ff",
    8: "#ff8fa8",
    9: "#ffc86b",
    10: "#a6e693"
  };

  class GameState {
    constructor(gridSize) {
      this.gridSize = gridSize;
      this.score = 0;
      this.best = Number.parseInt(localStorage.getItem("mergeBestScore") || "0", 10) || 0;
      this.grid = [];
      this.gameOver = false;
    }

    reset() {
      // Rebuild board and spawn a few starter tiles for immediate interaction.
      this.score = 0;
      this.gameOver = false;
      this.grid = Array.from({ length: this.gridSize * this.gridSize }, () => 0);
      for (let i = 0; i < CONFIG.spawnCountAtStart; i += 1) {
        this.spawnRandomTile();
      }
    }

    index(row, col) {
      return row * this.gridSize + col;
    }

    get(row, col) {
      return this.grid[this.index(row, col)];
    }

    set(row, col, value) {
      this.grid[this.index(row, col)] = value;
    }

    getEmptyIndices() {
      const indices = [];
      for (let i = 0; i < this.grid.length; i += 1) {
        if (this.grid[i] === 0) {
          indices.push(i);
        }
      }
      return indices;
    }

    randomSpawnLevel() {
      const pool = CONFIG.baseSpawnLevels;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    spawnRandomTile() {
      const empties = this.getEmptyIndices();
      if (!empties.length) return null;
      const idx = empties[Math.floor(Math.random() * empties.length)];
      this.grid[idx] = this.randomSpawnLevel();
      return {
        row: Math.floor(idx / this.gridSize),
        col: idx % this.gridSize,
        level: this.grid[idx]
      };
    }

    merge(fromRow, fromCol, toRow, toCol) {
      if (this.gameOver) return { ok: false, reason: "gameover" };
      if (fromRow === toRow && fromCol === toCol) return { ok: false, reason: "same-cell" };

      const fromValue = this.get(fromRow, fromCol);
      const toValue = this.get(toRow, toCol);
      if (!fromValue || !toValue) return { ok: false, reason: "empty" };
      if (fromValue !== toValue) return { ok: false, reason: "not-same-level" };

      const mergedLevel = toValue + 1;
      // Source cell is consumed, target cell is upgraded.
      this.set(fromRow, fromCol, 0);
      this.set(toRow, toCol, mergedLevel);

      const gained = this.scoreForLevel(mergedLevel);
      this.score += gained;
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem("mergeBestScore", String(this.best));
      }

      const spawned = this.spawnRandomTile();
      this.gameOver = this.isGameOver();
      return {
        ok: true,
        mergedLevel,
        gained,
        target: { row: toRow, col: toCol },
        spawned,
        gameOver: this.gameOver
      };
    }

    scoreForLevel(level) {
      return 2 ** (level + 1);
    }

    isGameOver() {
      if (this.getEmptyIndices().length) return false;
      // No empty cells: only continue if any adjacent pair can still merge.
      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const value = this.get(row, col);
          const right = col + 1 < this.gridSize ? this.get(row, col + 1) : -1;
          const down = row + 1 < this.gridSize ? this.get(row + 1, col) : -1;
          if (value === right || value === down) {
            return false;
          }
        }
      }
      return true;
    }
  }

  class AudioManager {
    constructor() {
      this.ctx = null;
    }

    ensureContext() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    tone(freq, duration, type, volume, slide = 0) {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      this.ensureContext();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) {
        osc.frequency.linearRampToValueAtTime(freq + slide, now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playPick() {
      this.tone(420, 0.07, "triangle", 0.06, 40);
    }

    playDropFail() {
      this.tone(180, 0.11, "sawtooth", 0.05, -40);
    }

    playMerge(level) {
      const base = 250 + Math.min(level, 10) * 35;
      this.tone(base, 0.11, "square", 0.08, 50);
      this.tone(base * 1.4, 0.09, "triangle", 0.05, 25);
    }

    playGameOver() {
      this.tone(300, 0.12, "triangle", 0.05, -80);
      setTimeout(() => this.tone(210, 0.15, "triangle", 0.05, -70), 80);
    }
  }

  class Renderer {
    constructor(canvas, state) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.state = state;
      this.metrics = {
        boardSize: 0,
        tileSize: 0,
        boardX: 0,
        boardY: 0
      };
      this.dragging = null;
      this.mergeEffects = [];
      this.floatingTexts = [];
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const logical = Math.min(rect.width, CONFIG.maxPixelSize);
      this.canvas.width = Math.floor(logical * dpr);
      this.canvas.height = Math.floor(logical * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.metrics.boardSize = logical;
      this.metrics.boardX = 0;
      this.metrics.boardY = 0;
      this.metrics.tileSize =
        (logical - CONFIG.boardPadding * 2 - CONFIG.gap * (this.state.gridSize - 1)) / this.state.gridSize;
    }

    cellRect(row, col) {
      const { boardX, boardY, tileSize } = this.metrics;
      const x = boardX + CONFIG.boardPadding + col * (tileSize + CONFIG.gap);
      const y = boardY + CONFIG.boardPadding + row * (tileSize + CONFIG.gap);
      return { x, y, w: tileSize, h: tileSize };
    }

    pointToCell(x, y) {
      // Hit test against each tile rectangle to map pointer to board coordinates.
      const size = this.state.gridSize;
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const r = this.cellRect(row, col);
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            return { row, col };
          }
        }
      }
      return null;
    }

    beginDrag(row, col, pointerX, pointerY) {
      const level = this.state.get(row, col);
      if (!level) return false;
      const rect = this.cellRect(row, col);
      this.dragging = {
        from: { row, col },
        level,
        pointerX,
        pointerY,
        offsetX: pointerX - rect.x - rect.w / 2,
        offsetY: pointerY - rect.y - rect.h / 2
      };
      return true;
    }

    updateDrag(pointerX, pointerY) {
      if (!this.dragging) return;
      this.dragging.pointerX = pointerX;
      this.dragging.pointerY = pointerY;
    }

    clearDrag() {
      this.dragging = null;
    }

    addMergeEffect(row, col, level) {
      this.mergeEffects.push({
        row,
        col,
        level,
        start: performance.now()
      });
    }

    addFloatingScore(row, col, score) {
      this.floatingTexts.push({
        row,
        col,
        score,
        start: performance.now()
      });
    }

    drawRoundRect(x, y, w, h, radius) {
      const ctx = this.ctx;
      const r = Math.min(radius, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    drawTileAt(x, y, w, h, level, scale = 1, shadow = false) {
      const ctx = this.ctx;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const tw = w * scale;
      const th = h * scale;
      const tx = cx - tw / 2;
      const ty = cy - th / 2;

      ctx.save();
      if (shadow) {
        ctx.shadowColor = "rgba(42, 65, 110, 0.35)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;
      }
      ctx.fillStyle = TILE_COLORS[level] || "#8ec5ff";
      this.drawRoundRect(tx, ty, tw, th, 14);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      this.drawRoundRect(tx + 6, ty + 6, tw - 12, th * 0.28, 10);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#1f2a44";
      ctx.font = `700 ${Math.max(16, tw * 0.24)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Lv.${level}`, cx, cy);
    }

    draw(now) {
      const ctx = this.ctx;
      const { boardSize } = this.metrics;
      ctx.clearRect(0, 0, boardSize, boardSize);

      ctx.fillStyle = "#d2e2ff";
      this.drawRoundRect(0, 0, boardSize, boardSize, 20);
      ctx.fill();

      const dragFrom = this.dragging ? this.dragging.from : null;

      for (let row = 0; row < this.state.gridSize; row += 1) {
        for (let col = 0; col < this.state.gridSize; col += 1) {
          const rect = this.cellRect(row, col);
          ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
          this.drawRoundRect(rect.x, rect.y, rect.w, rect.h, 12);
          ctx.fill();

          const level = this.state.get(row, col);
          if (!level) continue;
          if (dragFrom && dragFrom.row === row && dragFrom.col === col) continue;

          let scale = 1;
          // Merge effect: brief pop animation with a soft glow.
          for (const effect of this.mergeEffects) {
            if (effect.row === row && effect.col === col) {
              const t = (now - effect.start) / CONFIG.mergeAnimDuration;
              if (t <= 1) {
                scale = 1 + Math.sin(t * Math.PI) * 0.18;
                ctx.save();
                ctx.globalAlpha = (1 - t) * 0.45;
                ctx.fillStyle = "#fff8cc";
                this.drawRoundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 16);
                ctx.fill();
                ctx.restore();
              }
            }
          }
          this.drawTileAt(rect.x, rect.y, rect.w, rect.h, level, scale, false);
        }
      }

      this.mergeEffects = this.mergeEffects.filter(
        (e) => now - e.start <= CONFIG.mergeAnimDuration
      );

      if (this.dragging) {
        const rect = this.cellRect(0, 0);
        const x = this.dragging.pointerX - rect.w / 2 - this.dragging.offsetX;
        const y = this.dragging.pointerY - rect.h / 2 - this.dragging.offsetY;
        this.drawTileAt(x, y, rect.w, rect.h, this.dragging.level, CONFIG.dragScale, true);
      }

      for (const item of this.floatingTexts) {
        // Floating score text fades out while moving upward.
        const t = (now - item.start) / CONFIG.popTextDuration;
        if (t > 1) continue;
        const rect = this.cellRect(item.row, item.col);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "#233b72";
        ctx.font = "700 20px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`+${item.score}`, rect.x + rect.w / 2, rect.y + rect.h / 2 - t * 34);
        ctx.restore();
      }
      this.floatingTexts = this.floatingTexts.filter(
        (item) => now - item.start <= CONFIG.popTextDuration
      );
    }
  }

  class UIBridge {
    constructor(state) {
      this.state = state;
      this.scoreValue = document.getElementById("scoreValue");
      this.bestValue = document.getElementById("bestValue");
      this.modal = document.getElementById("gameOverModal");
      this.finalScoreValue = document.getElementById("finalScoreValue");
      this.finalBestValue = document.getElementById("finalBestValue");
    }

    refresh() {
      this.scoreValue.textContent = String(this.state.score);
      this.bestValue.textContent = String(this.state.best);
    }

    showGameOver() {
      this.finalScoreValue.textContent = String(this.state.score);
      this.finalBestValue.textContent = String(this.state.best);
      this.modal.classList.remove("hidden");
    }

    hideGameOver() {
      this.modal.classList.add("hidden");
    }
  }

  class GameApp {
    constructor() {
      this.canvas = document.getElementById("gameCanvas");
      this.restartBtn = document.getElementById("restartBtn");
      this.playAgainBtn = document.getElementById("playAgainBtn");

      this.state = new GameState(CONFIG.gridSize);
      this.renderer = new Renderer(this.canvas, this.state);
      this.audio = new AudioManager();
      this.ui = new UIBridge(this.state);
      this.activePointerId = null;
      this.loopId = 0;
    }

    init() {
      this.state.reset();
      this.renderer.resize();
      this.ui.refresh();
      this.bindEvents();
      this.startLoop();
    }

    bindEvents() {
      const onResize = () => this.renderer.resize();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);

      this.canvas.addEventListener("pointerdown", (event) => {
        // Lock to one pointer for stable single-finger gameplay.
        if (this.state.gameOver || this.activePointerId !== null) return;
        const p = this.getPointFromEvent(event);
        const cell = this.renderer.pointToCell(p.x, p.y);
        if (!cell) return;
        if (!this.state.get(cell.row, cell.col)) return;
        if (this.renderer.beginDrag(cell.row, cell.col, p.x, p.y)) {
          this.activePointerId = event.pointerId;
          this.canvas.setPointerCapture(event.pointerId);
          this.audio.playPick();
        }
      });

      this.canvas.addEventListener("pointermove", (event) => {
        if (event.pointerId !== this.activePointerId) return;
        const p = this.getPointFromEvent(event);
        this.renderer.updateDrag(p.x, p.y);
      });

      const onPointerEnd = (event) => {
        if (event.pointerId !== this.activePointerId) return;
        const p = this.getPointFromEvent(event);
        this.tryDrop(p.x, p.y);
        this.renderer.clearDrag();
        this.activePointerId = null;
      };

      this.canvas.addEventListener("pointerup", onPointerEnd);
      this.canvas.addEventListener("pointercancel", onPointerEnd);

      this.restartBtn.addEventListener("click", () => this.restart());
      this.playAgainBtn.addEventListener("click", () => this.restart());
    }

    getPointFromEvent(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    tryDrop(x, y) {
      if (!this.renderer.dragging) return;
      const from = this.renderer.dragging.from;
      const targetCell = this.renderer.pointToCell(x, y);
      if (!targetCell) {
        this.audio.playDropFail();
        return;
      }

      const result = this.state.merge(from.row, from.col, targetCell.row, targetCell.col);
      if (!result.ok) {
        this.audio.playDropFail();
        return;
      }

      this.renderer.addMergeEffect(result.target.row, result.target.col, result.mergedLevel);
      this.renderer.addFloatingScore(result.target.row, result.target.col, result.gained);
      this.audio.playMerge(result.mergedLevel);
      this.ui.refresh();

      if (result.gameOver) {
        this.audio.playGameOver();
        this.ui.showGameOver();
      }
    }

    restart() {
      this.ui.hideGameOver();
      this.state.reset();
      this.renderer.clearDrag();
      this.ui.refresh();
    }

    startLoop() {
      const tick = (now) => {
        this.renderer.draw(now);
        this.loopId = requestAnimationFrame(tick);
      };
      this.loopId = requestAnimationFrame(tick);
    }
  }

  const app = new GameApp();
  app.init();
})();
