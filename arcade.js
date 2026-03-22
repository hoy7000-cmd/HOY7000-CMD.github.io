"use strict";

(() => {
  const SAVE_KEY = "qCuteArcadeSaveV1";

  const PETS = [
    { id: "chick", name: "小黄啾", emoji: "🐥", price: 100 },
    { id: "bunny", name: "棉花兔", emoji: "🐰", price: 250 },
    { id: "cat", name: "奶油猫", emoji: "🐱", price: 500 },
    { id: "fox", name: "小狐仙", emoji: "🦊", price: 1000 }
  ];

  const $ = (id) => document.getElementById(id);

  class Economy {
    constructor(data) {
      this.coins = data.coins || 0;
      this.listeners = [];
    }
    onChange(cb) { this.listeners.push(cb); }
    add(value) {
      if (value <= 0) return;
      this.coins += value;
      this.listeners.forEach((cb) => cb(this.coins));
    }
    spend(value) {
      if (value > this.coins) return false;
      this.coins -= value;
      this.listeners.forEach((cb) => cb(this.coins));
      return true;
    }
  }

  class PetSystem {
    constructor(data, economy) {
      this.economy = economy;
      this.owned = new Set(data.ownedPets || []);
      this.equipped = data.equippedPet || null;
      this.follower = $("petFollower");
      this.targetX = window.innerWidth * 0.85;
      this.targetY = window.innerHeight * 0.78;
      this.x = this.targetX;
      this.y = this.targetY;
    }
    bind(container) {
      container.addEventListener("pointerdown", (e) => {
        this.targetX = e.clientX + 20;
        this.targetY = e.clientY - 20;
      });
    }
    loop() {
      this.x += (this.targetX - this.x) * 0.08;
      this.y += (this.targetY - this.y) * 0.08;
      this.follower.style.left = `${this.x}px`;
      this.follower.style.top = `${this.y}px`;
      this.follower.style.transform = `translate(-50%, -50%) translateY(${Math.sin(Date.now() * 0.005) * 4}px)`;
      requestAnimationFrame(() => this.loop());
    }
    updateUI() {
      if (!this.equipped) {
        this.follower.classList.add("hidden");
        return;
      }
      this.follower.classList.remove("hidden");
      const pet = PETS.find((p) => p.id === this.equipped);
      this.follower.textContent = pet ? pet.emoji : "🐥";
    }
    toJSON() {
      return { ownedPets: [...this.owned], equippedPet: this.equipped };
    }
  }

  class IdleGame {
    constructor(economy, data) {
      this.economy = economy;
      this.localCoins = data.idleLocal || 0;
      this.clickLevel = data.idleClickLevel || 0;
      this.autoLevel = data.idleAutoLevel || 0;
      this.lastSeen = data.lastSeen || Date.now();
      this.acc = 0;
      this.bind();
      this.applyOffline();
      this.render();
    }
    get clickIncome() { return 1 + this.clickLevel * 1; }
    get autoIncome() { return 0.1 + this.autoLevel * 0.08; }
    get clickCost() { return Math.floor(18 * 1.22 ** this.clickLevel); }
    get autoCost() { return Math.floor(28 * 1.24 ** this.autoLevel); }
    get level() { return 1 + Math.floor((this.clickLevel + this.autoLevel) / 4); }
    applyOffline() {
      const sec = Math.min(8 * 3600, Math.max(0, (Date.now() - this.lastSeen) / 1000));
      const gain = this.autoIncome * sec * 0.5; // offline gain = 50% speed
      if (gain > 0) {
        this.localCoins += gain;
        this.economy.add(gain);
      }
    }
    bind() {
      $("idleTapBtn").addEventListener("click", () => {
        this.localCoins += this.clickIncome;
        this.economy.add(this.clickIncome);
        this.render();
      });
      $("idleUpgradeClick").addEventListener("click", () => {
        if (!this.economy.spend(this.clickCost)) return;
        this.clickLevel += 1;
        this.render();
      });
      $("idleUpgradeAuto").addEventListener("click", () => {
        if (!this.economy.spend(this.autoCost)) return;
        this.autoLevel += 1;
        this.render();
      });
    }
    tick(dt) {
      this.acc += dt;
      while (this.acc >= 0.2) {
        this.acc -= 0.2;
        const add = this.autoIncome * 0.2;
        this.localCoins += add;
        this.economy.add(add);
      }
      this.render(false);
    }
    render(full = true) {
      $("idleLevel").textContent = String(this.level);
      $("idleClick").textContent = this.clickIncome.toFixed(1);
      $("idleAuto").textContent = this.autoIncome.toFixed(2);
      $("idleLocal").textContent = this.localCoins.toFixed(1);
      $("idleUpgradeClick").textContent = `升级点击 +1（${this.clickCost}金币）`;
      $("idleUpgradeAuto").textContent = `升级自动 +0.08/s（${this.autoCost}金币）`;
      $("idleUpgradeClick").disabled = this.economy.coins < this.clickCost;
      $("idleUpgradeAuto").disabled = this.economy.coins < this.autoCost;
      if (full) $("idleTapBtn").textContent = `点击主角赚金币 +${this.clickIncome.toFixed(1)}`;
    }
    toJSON() {
      return {
        idleLocal: this.localCoins,
        idleClickLevel: this.clickLevel,
        idleAutoLevel: this.autoLevel
      };
    }
  }

  class GomokuGame {
    constructor(economy) {
      this.economy = economy;
      this.canvas = $("gomokuCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.size = 15;
      this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
      this.current = 1;
      this.winner = 0;
      this.level = "easy";
      this.rewardGiven = false;
      this.bind();
      this.resize();
    }
    bind() {
      this.canvas.addEventListener("pointerdown", (e) => this.handlePlayer(e));
      this.canvas.addEventListener("mousedown", (e) => this.handlePlayer(e));
      this.canvas.addEventListener("click", (e) => this.handlePlayer(e));
      $("gomokuRestart").addEventListener("click", () => this.reset());
      document.querySelectorAll(".chip").forEach((b) => {
        b.addEventListener("click", () => {
          document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.level = b.dataset.level;
          this.reset();
        });
      });
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const s = Math.max(300, Math.min(680, rect.width));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(s * dpr);
      this.canvas.height = Math.floor(s * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }
    reset() {
      this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
      this.current = 1;
      this.winner = 0;
      this.rewardGiven = false;
      $("gomokuState").textContent = "黑棋（你）先手";
      this.draw();
    }
    draw() {
      const c = this.ctx;
      const s = this.canvas.width / (window.devicePixelRatio || 1);
      const pad = s * 0.07;
      const cell = (s - pad * 2) / (this.size - 1);
      this.metric = { s, pad, cell };
      c.clearRect(0, 0, s, s);
      c.fillStyle = "#f2d8aa";
      c.fillRect(0, 0, s, s);
      c.strokeStyle = "#8c6d42";
      for (let i = 0; i < this.size; i += 1) {
        const p = pad + i * cell;
        c.beginPath(); c.moveTo(pad, p); c.lineTo(s - pad, p); c.stroke();
        c.beginPath(); c.moveTo(p, pad); c.lineTo(p, s - pad); c.stroke();
      }
      for (let r = 0; r < this.size; r += 1) {
        for (let col = 0; col < this.size; col += 1) {
          if (!this.board[r][col]) continue;
          const x = pad + col * cell;
          const y = pad + r * cell;
          const rad = cell * 0.4;
          c.save();
          c.shadowColor = "rgba(0,0,0,0.3)";
          c.shadowBlur = 7; c.shadowOffsetY = 2;
          c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2);
          c.fillStyle = this.board[r][col] === 1 ? "#181818" : "#f6f6f6";
          c.fill();
          c.restore();
        }
      }
    }
    in(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
    checkWin(r, c, p) {
      const dirs = [[1,0],[0,1],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        let n = 1;
        for (let k = 1; this.in(r + dr * k, c + dc * k) && this.board[r + dr * k][c + dc * k] === p; k += 1) n += 1;
        for (let k = 1; this.in(r - dr * k, c - dc * k) && this.board[r - dr * k][c - dc * k] === p; k += 1) n += 1;
        if (n >= 5) return true;
      }
      return false;
    }
    posFromEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { pad, cell } = this.metric;
      const c = Math.round((x - pad) / cell);
      const r = Math.round((y - pad) / cell);
      return this.in(r, c) ? { r, c } : null;
    }
    handlePlayer(e) {
      if (this.winner || this.current !== 1) return;
      const p = this.posFromEvent(e);
      if (!p || this.board[p.r][p.c]) return;
      this.place(p.r, p.c, 1);
      if (!this.winner) setTimeout(() => this.aiMove(), 140);
    }
    place(r, c, p) {
      this.board[r][c] = p;
      this.draw();
      if (this.checkWin(r, c, p)) {
        this.winner = p;
        if (p === 1) {
          const reward = this.level === "easy" ? 10 : this.level === "normal" ? 25 : 50;
          if (!this.rewardGiven) {
            this.rewardGiven = true;
            this.economy.add(reward);
          }
          $("gomokuState").textContent = `你获胜！+${reward}金币`;
        } else {
          $("gomokuState").textContent = "AI获胜";
        }
        return;
      }
      this.current = p === 1 ? 2 : 1;
      $("gomokuState").textContent = this.current === 1 ? "黑棋（你）回合" : "白棋（AI）思考中";
    }
    emptyCells() {
      const a = [];
      for (let r = 0; r < this.size; r += 1) for (let c = 0; c < this.size; c += 1) if (!this.board[r][c]) a.push({ r, c });
      return a;
    }
    immediate(player) {
      for (const m of this.emptyCells()) {
        this.board[m.r][m.c] = player;
        const win = this.checkWin(m.r, m.c, player);
        this.board[m.r][m.c] = 0;
        if (win) return m;
      }
      return null;
    }
    scoreMove(r, c, p) {
      const dirs = [[1,0],[0,1],[1,1],[1,-1]];
      let score = 0;
      for (const [dr, dc] of dirs) {
        let n1 = 0, n2 = 0;
        for (let k = 1; this.in(r + dr * k, c + dc * k) && this.board[r + dr * k][c + dc * k] === p; k += 1) n1 += 1;
        for (let k = 1; this.in(r - dr * k, c - dc * k) && this.board[r - dr * k][c - dc * k] === p; k += 1) n2 += 1;
        const n = n1 + n2 + 1;
        if (n >= 5) score += 100000;
        else if (n === 4) score += 12000;
        else if (n === 3) score += 1800;
        else if (n === 2) score += 240;
      }
      return score;
    }
    aiMove() {
      if (this.winner) return;
      let move = null;
      const empties = this.emptyCells();
      if (!empties.length) return;

      if (this.level === "easy") {
        move = empties[Math.floor(Math.random() * empties.length)];
      } else {
        move = this.immediate(2) || this.immediate(1);
        if (!move) {
          let best = -Infinity;
          for (const m of empties) {
            const sAtk = this.scoreMove(m.r, m.c, 2);
            const sDef = this.scoreMove(m.r, m.c, 1);
            const s = this.level === "normal" ? sAtk * 1.05 + sDef : sAtk * 1.15 + sDef * 1.2;
            if (s > best) { best = s; move = m; }
          }
        }
      }
      if (move) this.place(move.r, move.c, 2);
    }
  }

  class FishingGame {
    constructor(economy) {
      this.economy = economy;
      this.canvas = $("fishingCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.fishes = [];
      this.hook = { x: 0, y: 34, vy: 0, state: "idle", caught: null };
      this.time = 60;
      this.tAcc = 0;
      this.last = performance.now();
      this.bind();
      this.resize();
      this.reset();
    }
    bind() {
      $("fishCast").addEventListener("click", () => this.cast());
      $("fishReel").addEventListener("click", () => this.reel());
      $("fishRestart").addEventListener("click", () => this.reset());
      this.canvas.addEventListener("pointerdown", () => {
        if (this.hook.state === "idle") this.cast(); else this.reel();
      });
      this.canvas.addEventListener("mousedown", () => {
        if (this.hook.state === "idle") this.cast(); else this.reel();
      });
      this.canvas.addEventListener("click", () => {
        if (this.hook.state === "idle") this.cast(); else this.reel();
      });
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(280, Math.min(680, rect.width));
      const h = w * 14 / 9;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h; this.hook.x = w * 0.52;
    }
    rarity() {
      const r = Math.random();
      if (r < 0.55) return { name: "白", reward: 5, color: "#ffffff", speed: 52 };
      if (r < 0.83) return { name: "绿", reward: 15, color: "#9cf0a8", speed: 48 };
      if (r < 0.96) return { name: "蓝", reward: 30, color: "#8dc4ff", speed: 45 };
      return { name: "紫", reward: 60, color: "#db9eff", speed: 42 };
    }
    spawn() {
      const t = this.rarity();
      const dir = Math.random() > 0.5 ? 1 : -1;
      const y = this.h * (0.34 + Math.random() * 0.55);
      this.fishes.push({ x: dir > 0 ? -40 : this.w + 40, y, dir, t, a: Math.random() * 10 });
    }
    reset() {
      this.time = 60;
      this.tAcc = 0;
      this.running = true;
      this.fishes = [];
      for (let i = 0; i < 7; i += 1) this.spawn();
      this.hook = { x: this.w * 0.52, y: 34, vy: 0, state: "idle", caught: null };
      $("fishTime").textContent = "60";
      $("fishState").textContent = "待命";
    }
    cast() {
      if (!this.running || this.hook.state !== "idle") return;
      this.hook.state = "down";
      this.hook.vy = 210;
      $("fishState").textContent = "下钩中";
    }
    reel() {
      if (!this.running || this.hook.state === "idle") return;
      this.hook.state = "up";
      this.hook.vy = -250;
      $("fishState").textContent = "收线中";
    }
    update(dt) {
      this.last = performance.now();
      if (this.running) {
        this.tAcc += dt;
        if (this.tAcc >= 1) {
          this.tAcc -= 1;
          this.time -= 1;
          $("fishTime").textContent = String(this.time);
          if (this.time <= 0) {
            this.running = false;
            $("fishState").textContent = "时间到";
          }
        }
      }

      for (const f of this.fishes) {
        if (!f.caught) {
          f.x += f.t.speed * f.dir * dt;
          f.a += dt * 3;
          f.y += Math.sin(f.a) * 0.25;
        } else {
          f.x = this.hook.x; f.y = this.hook.y + 14;
        }
      }
      this.fishes = this.fishes.filter((f) => f.x > -60 && f.x < this.w + 60 && f.y < this.h + 60);
      while (this.fishes.length < 7) this.spawn();

      if (this.hook.state !== "idle") {
        this.hook.y += this.hook.vy * dt;
        if (this.hook.state === "down" && this.hook.y > this.h * 0.92) this.reel();
        if (this.hook.state === "down" && !this.hook.caught) {
          for (const f of this.fishes) {
            if (f.caught) continue;
            const dx = f.x - this.hook.x;
            const dy = f.y - this.hook.y;
            if (dx * dx + dy * dy < 16 * 16) {
              f.caught = true;
              this.hook.caught = f;
              this.reel();
              $("fishState").textContent = `钓到${f.t.name}鱼`;
              break;
            }
          }
        }
        if (this.hook.state === "up" && this.hook.y <= 34) {
          this.hook.y = 34;
          if (this.hook.caught) {
            this.economy.add(this.hook.caught.t.reward);
            $("fishState").textContent = `+${this.hook.caught.t.reward}金币`;
            this.fishes = this.fishes.filter((f) => f !== this.hook.caught);
          } else {
            $("fishState").textContent = "待命";
          }
          this.hook.state = "idle";
          this.hook.caught = null;
        }
      }
    }
    draw() {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      const water = this.h * 0.17;
      c.fillStyle = "#9ddcff"; c.fillRect(0, 0, this.w, water);
      const g = c.createLinearGradient(0, water, 0, this.h);
      g.addColorStop(0, "#63c2ff"); g.addColorStop(1, "#257ec4");
      c.fillStyle = g; c.fillRect(0, water, this.w, this.h - water);
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.beginPath();
      for (let x = 0; x <= this.w; x += 8) {
        const y = water + Math.sin((x + Date.now() * 0.05) * 0.05) * 3;
        if (!x) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();

      for (const f of this.fishes) {
        c.save(); c.translate(f.x, f.y); if (f.dir < 0) c.scale(-1, 1);
        c.fillStyle = f.t.color;
        c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(-12, 0); c.lineTo(-20, -6); c.lineTo(-20, 6); c.closePath(); c.fill();
        c.restore();
      }

      c.strokeStyle = "#d7eeff"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(this.hook.x, 18); c.lineTo(this.hook.x, this.hook.y); c.stroke();
      c.beginPath(); c.arc(this.hook.x, this.hook.y, 6, 0.2, Math.PI * 1.4); c.stroke();
    }
    loop() {
      const now = performance.now();
      const dt = Math.min(0.033, (now - this.last) / 1000);
      this.update(dt);
      this.draw();
      requestAnimationFrame(() => this.loop());
    }
  }

  class BrickGame {
    constructor(economy) {
      this.economy = economy;
      this.canvas = $("brickCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.level = 1;
      this.lives = 3;
      this.stageCoins = 0;
      this.running = true;
      this.last = performance.now();
      this.pointerX = null;
      this.bind();
      this.resize();
      this.resetLevel();
    }
    bind() {
      $("brickRestart").addEventListener("click", () => this.fullReset());
      this.canvas.addEventListener("pointerdown", (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointerX = e.clientX - rect.left;
      });
      this.canvas.addEventListener("pointermove", (e) => {
        if (this.pointerX === null && e.buttons !== 1) return;
        const rect = this.canvas.getBoundingClientRect();
        this.pointerX = e.clientX - rect.left;
      });
      this.canvas.addEventListener("pointerup", () => { this.pointerX = null; });
      this.canvas.addEventListener("pointercancel", () => { this.pointerX = null; });
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(280, Math.min(680, rect.width));
      const h = w * 14 / 9;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
      if (!this.paddle) {
        this.paddle = { x: w * 0.5, y: h - 30, w: 78, h: 12 };
      } else {
        this.paddle.y = h - 30;
      }
    }
    fullReset() {
      this.level = 1;
      this.lives = 3;
      this.stageCoins = 0;
      this.running = true;
      this.resetLevel();
    }
    makeBrickType() {
      const r = Math.random();
      if (r < 0.66) return { hp: 1, reward: 1, color: "#9fd6ff", name: "普通" };
      if (r < 0.93) return { hp: 2, reward: 3, color: "#8ff0c8", name: "坚固" };
      return { hp: 3, reward: 8, color: "#d9a7ff", name: "稀有" };
    }
    resetLevel() {
      this.bricks = [];
      const rows = Math.min(3 + this.level, 8);
      const cols = 7;
      const margin = 12;
      const gap = 6;
      const bw = (this.w - margin * 2 - gap * (cols - 1)) / cols;
      const bh = 18;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (Math.random() < 0.08 + this.level * 0.01) continue;
          const t = this.makeBrickType();
          this.bricks.push({
            x: margin + c * (bw + gap),
            y: 48 + r * (bh + gap),
            w: bw,
            h: bh,
            hp: t.hp,
            maxHp: t.hp,
            reward: t.reward,
            color: t.color
          });
        }
      }
      this.ball = {
        x: this.w * 0.5,
        y: this.h * 0.62,
        vx: (Math.random() > 0.5 ? 1 : -1) * (120 + this.level * 10),
        vy: -(160 + this.level * 10),
        r: 7
      };
      this.updateUI(`第${this.level}关开始`);
    }
    updateUI(state) {
      $("brickLevel").textContent = String(this.level);
      $("brickLives").textContent = String(this.lives);
      $("brickStageCoins").textContent = String(this.stageCoins);
      if (state) $("brickState").textContent = state;
    }
    onBrickHit(brick) {
      brick.hp -= 1;
      if (brick.hp <= 0) {
        this.stageCoins += brick.reward;
        this.economy.add(brick.reward);
      }
      this.updateUI();
    }
    tick(dt) {
      if (!this.running) return;
      if (this.pointerX !== null) {
        this.paddle.x += (this.pointerX - this.paddle.x) * 0.35;
      }
      this.paddle.x = Math.max(this.paddle.w * 0.5, Math.min(this.w - this.paddle.w * 0.5, this.paddle.x));

      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;

      if (this.ball.x < this.ball.r) { this.ball.x = this.ball.r; this.ball.vx *= -1; }
      if (this.ball.x > this.w - this.ball.r) { this.ball.x = this.w - this.ball.r; this.ball.vx *= -1; }
      if (this.ball.y < this.ball.r) { this.ball.y = this.ball.r; this.ball.vy *= -1; }

      const p = this.paddle;
      if (this.ball.y + this.ball.r >= p.y - p.h * 0.5 &&
          this.ball.y - this.ball.r <= p.y + p.h * 0.5 &&
          this.ball.x >= p.x - p.w * 0.5 &&
          this.ball.x <= p.x + p.w * 0.5 &&
          this.ball.vy > 0) {
        const offset = (this.ball.x - p.x) / (p.w * 0.5);
        this.ball.vy = -Math.abs(this.ball.vy);
        this.ball.vx += offset * 85;
      }

      for (const b of this.bricks) {
        if (b.hp <= 0) continue;
        if (this.ball.x + this.ball.r < b.x || this.ball.x - this.ball.r > b.x + b.w ||
            this.ball.y + this.ball.r < b.y || this.ball.y - this.ball.r > b.y + b.h) {
          continue;
        }
        const prevY = this.ball.y - this.ball.vy * dt;
        if (prevY <= b.y || prevY >= b.y + b.h) this.ball.vy *= -1;
        else this.ball.vx *= -1;
        this.onBrickHit(b);
        break;
      }

      this.bricks = this.bricks.filter((b) => b.hp > 0);
      if (!this.bricks.length) {
        const clearReward = 10 + this.level * 4; // smooth, controlled growth
        this.economy.add(clearReward);
        this.stageCoins += clearReward;
        this.level += 1;
        this.updateUI(`通关奖励 +${clearReward}金币`);
        this.resetLevel();
        return;
      }

      if (this.ball.y - this.ball.r > this.h) {
        this.lives -= 1;
        if (this.lives <= 0) {
          this.running = false;
          this.updateUI("游戏结束，点击重开");
          return;
        }
        this.ball.x = this.w * 0.5;
        this.ball.y = this.h * 0.62;
        this.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (120 + this.level * 10);
        this.ball.vy = -(160 + this.level * 10);
        this.updateUI("丢球了，继续");
      }
    }
    draw() {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      const bg = c.createLinearGradient(0, 0, 0, this.h);
      bg.addColorStop(0, "#fff1f7");
      bg.addColorStop(1, "#ecf3ff");
      c.fillStyle = bg;
      c.fillRect(0, 0, this.w, this.h);

      for (const b of this.bricks) {
        c.fillStyle = b.color;
        c.fillRect(b.x, b.y, b.w, b.h);
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.fillRect(b.x + 2, b.y + 2, b.w - 4, 4);
        if (b.maxHp > 1) {
          c.fillStyle = "#3e5c7f";
          c.font = "700 11px 'Segoe UI'";
          c.textAlign = "center";
          c.fillText(String(b.hp), b.x + b.w * 0.5, b.y + b.h * 0.72);
        }
      }

      c.fillStyle = "#7ea6ff";
      c.fillRect(this.paddle.x - this.paddle.w * 0.5, this.paddle.y - this.paddle.h * 0.5, this.paddle.w, this.paddle.h);
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
      c.fill();
    }
    loop() {
      const now = performance.now();
      const dt = Math.min(0.033, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.draw();
      requestAnimationFrame(() => this.loop());
    }
  }

  class MemoryGame {
    constructor(economy) {
      this.economy = economy;
      this.grid = $("memoryGrid");
      this.stateText = $("memoryState");
      this.level = "easy";
      this.locked = false;
      this.first = null;
      this.second = null;
      this.matched = 0;
      this.totalPairs = 0;
      this.bind();
      this.reset();
    }
    bind() {
      $("memoryRestart").addEventListener("click", () => this.reset());
      document.querySelectorAll(".m-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".m-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.level = btn.dataset.level || "easy";
          this.reset();
        });
      });
    }
    getConfig() {
      // Reward is controlled to avoid economy inflation.
      if (this.level === "easy") return { pairs: 6, cols: 3, reward: 12 };
      if (this.level === "normal") return { pairs: 8, cols: 4, reward: 26 };
      return { pairs: 10, cols: 4, reward: 45 };
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    reset() {
      const cfg = this.getConfig();
      this.first = null;
      this.second = null;
      this.matched = 0;
      this.locked = false;
      this.totalPairs = cfg.pairs;
      const icons = ["🐣", "🐰", "🐱", "🦊", "🐼", "🐸", "🐶", "🐹", "🐵", "🐯", "🐻", "🦄"];
      const picked = icons.slice(0, cfg.pairs);
      const deck = this.shuffle([...picked, ...picked]).map((icon, idx) => ({
        id: idx,
        icon,
        revealed: false,
        matched: false
      }));
      this.cards = deck;
      this.grid.style.gridTemplateColumns = `repeat(${cfg.cols}, 1fr)`;
      this.render();
      this.stateText.textContent = "翻开两张相同卡片即可消除";
    }
    cardHtml(card) {
      const cls = [
        "memory-card",
        card.revealed ? "revealed" : "",
        card.matched ? "matched" : ""
      ].join(" ").trim();
      return `<button class="${cls}" data-id="${card.id}" ${card.matched ? "disabled" : ""}>${card.icon}</button>`;
    }
    render() {
      this.grid.innerHTML = this.cards.map((c) => this.cardHtml(c)).join("");
      this.grid.querySelectorAll(".memory-card").forEach((btn) => {
        btn.addEventListener("click", () => this.flip(Number(btn.dataset.id)));
      });
    }
    flip(id) {
      if (this.locked) return;
      const card = this.cards[id];
      if (!card || card.revealed || card.matched) return;
      card.revealed = true;

      if (this.first === null) {
        this.first = id;
        this.render();
        return;
      }
      this.second = id;
      this.render();

      const a = this.cards[this.first];
      const b = this.cards[this.second];
      if (a.icon === b.icon) {
        a.matched = true;
        b.matched = true;
        this.matched += 1;
        this.first = null;
        this.second = null;
        this.render();
        if (this.matched >= this.totalPairs) {
          const reward = this.getConfig().reward;
          this.economy.add(reward);
          this.stateText.textContent = `通关成功！+${reward}金币`;
        } else {
          this.stateText.textContent = `已匹配 ${this.matched}/${this.totalPairs}`;
        }
      } else {
        this.locked = true;
        this.stateText.textContent = "不匹配，再试试";
        setTimeout(() => {
          a.revealed = false;
          b.revealed = false;
          this.first = null;
          this.second = null;
          this.locked = false;
          this.render();
          this.stateText.textContent = `已匹配 ${this.matched}/${this.totalPairs}`;
        }, 520);
      }
    }
  }

  class App {
    constructor() {
      this.data = this.load();
      this.economy = new Economy(this.data);
      this.petSystem = new PetSystem(this.data, this.economy);
      this.idle = new IdleGame(this.economy, this.data);
      this.gomoku = new GomokuGame(this.economy);
      this.fishing = new FishingGame(this.economy);
      this.brick = new BrickGame(this.economy);
      this.memory = new MemoryGame(this.economy);
      this.last = performance.now();
      this.bindTabs();
      this.bindShop();
      this.economy.onChange((v) => {
        $("globalCoinsText").textContent = Math.floor(v);
        this.idle.render();
      });
      $("globalCoinsText").textContent = Math.floor(this.economy.coins);
      this.petSystem.updateUI();
      this.petSystem.loop();
      this.petSystem.bind(document.body);
      this.fishing.loop();
      this.brick.loop();
      this.loop();
      this.renderShop();
      setInterval(() => this.save(), 3000);
      window.addEventListener("beforeunload", () => this.save());
    }
    bindTabs() {
      document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          const id = tab.dataset.game;
          document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
          $(`${id}Panel`).classList.add("active");
          // Hidden canvases report incorrect size; resize when panel becomes visible.
          if (id === "gomoku") this.gomoku.resize();
          if (id === "fishing") this.fishing.resize();
          if (id === "brick") this.brick.resize();
        });
      });
    }
    bindShop() {
      $("shopBtn").addEventListener("click", () => $("shopModal").classList.remove("hidden"));
      $("closeShop").addEventListener("click", () => $("shopModal").classList.add("hidden"));
    }
    renderShop() {
      const box = $("petList");
      box.innerHTML = "";
      PETS.forEach((pet) => {
        const item = document.createElement("div");
        item.className = "pet-item";
        const owned = this.petSystem.owned.has(pet.id);
        const equipped = this.petSystem.equipped === pet.id;
        item.innerHTML = `
          <div class="pet-head">${pet.emoji} ${pet.name}</div>
          <div class="pet-meta">价格：${pet.price}</div>
          <div class="line">
            <button class="btn soft buy"> ${owned ? "已拥有" : "购买"} </button>
            <button class="btn equip">${equipped ? "已佩戴" : "佩戴"}</button>
          </div>
        `;
        const buy = item.querySelector(".buy");
        const equip = item.querySelector(".equip");
        buy.disabled = owned;
        equip.disabled = !owned;
        buy.addEventListener("click", () => {
          if (owned) return;
          if (!this.economy.spend(pet.price)) return;
          this.petSystem.owned.add(pet.id);
          this.renderShop();
        });
        equip.addEventListener("click", () => {
          this.petSystem.equipped = pet.id;
          this.petSystem.updateUI();
          this.renderShop();
        });
        box.appendChild(item);
      });
    }
    loop() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.idle.tick(dt);
      requestAnimationFrame(() => this.loop());
    }
    load() {
      try {
        return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      } catch {
        return {};
      }
    }
    save() {
      const payload = {
        coins: this.economy.coins,
        lastSeen: Date.now(),
        ...this.idle.toJSON(),
        ...this.petSystem.toJSON()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    }
  }

  new App();
})();
