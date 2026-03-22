"use strict";

(() => {
  const GAME_SECONDS = 60;
  const FISH_TYPES = [
    { name: "小鱼", points: 10, speed: 78, size: 0.8, color: "#ffe17a" },
    { name: "普通鱼", points: 25, speed: 58, size: 1.0, color: "#ffb37a" },
    { name: "大鱼", points: 50, speed: 42, size: 1.25, color: "#8ed9ff" },
    { name: "稀有鱼", points: 120, speed: 70, size: 1.05, color: "#e8a6ff" }
  ];

  const HookState = {
    IDLE: "idle",
    SINKING: "sinking",
    REELING: "reeling"
  };

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const timeText = document.getElementById("timeText");
  const scoreText = document.getElementById("scoreText");
  const stateText = document.getElementById("stateText");
  const castBtn = document.getElementById("castBtn");
  const reelBtn = document.getElementById("reelBtn");
  const restartBtn = document.getElementById("restartBtn");

  const game = {
    width: 0,
    height: 0,
    dpr: 1,
    fish: [],
    ripples: [],
    floats: [],
    score: 0,
    timeLeft: GAME_SECONDS,
    timerAcc: 0,
    running: true,
    rodX: 0,
    hookX: 0,
    hookY: 0,
    hookVY: 0,
    hookState: HookState.IDLE,
    hookedFishId: null,
    lastTs: performance.now(),
    fishIdInc: 0
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const logicalW = Math.max(320, Math.min(720, rect.width));
    const logicalH = logicalW * (16 / 9);
    game.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(logicalW * game.dpr);
    canvas.height = Math.floor(logicalH * game.dpr);
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    game.width = logicalW;
    game.height = logicalH;
    game.rodX = game.width * 0.5;
    if (game.hookState === HookState.IDLE) {
      game.hookX = game.rodX;
      game.hookY = 38;
    }
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnFish(forceRare = false) {
    const type = forceRare ? FISH_TYPES[3] : FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)];
    const dir = Math.random() > 0.5 ? 1 : -1;
    const yBase = rand(game.height * 0.34, game.height * 0.9);
    game.fish.push({
      id: game.fishIdInc += 1,
      type,
      x: dir > 0 ? -60 : game.width + 60,
      y: yBase,
      baseY: yBase,
      dir,
      t: Math.random() * Math.PI * 2,
      hooked: false
    });
  }

  function spawnRipple(x, y) {
    game.ripples.push({ x, y, r: 0, life: 1 });
  }

  function spawnFloat(x, y, text, color = "#ffffff") {
    game.floats.push({ x, y, text, color, life: 1 });
  }

  function cast() {
    if (!game.running || game.hookState !== HookState.IDLE) return;
    game.hookState = HookState.SINKING;
    game.hookVY = 210;
    game.hookedFishId = null;
    stateText.textContent = "下钩中";
    spawnRipple(game.hookX, game.hookY + 12);
  }

  function reel() {
    if (!game.running) return;
    if (game.hookState === HookState.SINKING || game.hookState === HookState.REELING) {
      game.hookState = HookState.REELING;
      game.hookVY = -300;
      stateText.textContent = "收线中";
    }
  }

  function isHookNearFish(f) {
    const dx = game.hookX - f.x;
    const dy = game.hookY - f.y;
    const radius = 14 + f.type.size * 10;
    return dx * dx + dy * dy < radius * radius;
  }

  function onFishCaught(f) {
    game.score += f.type.points;
    scoreText.textContent = String(game.score);
    spawnFloat(game.hookX, game.hookY - 10, `+${f.type.points} ${f.type.name}`, "#ffe9a8");
  }

  function updateFish(dt) {
    for (const f of game.fish) {
      f.t += dt * 2.1;
      if (!f.hooked) {
        f.x += f.dir * f.type.speed * dt;
        f.y = f.baseY + Math.sin(f.t) * 8;
      } else {
        f.x = game.hookX;
        f.y = game.hookY + 16;
      }
    }
    game.fish = game.fish.filter((f) => f.x > -90 && f.x < game.width + 90 && f.y < game.height + 80);
    while (game.fish.length < 8) {
      spawnFish(Math.random() < 0.08);
    }
  }

  function updateHook(dt) {
    if (game.hookState === HookState.IDLE) return;

    game.hookY += game.hookVY * dt;
    if (game.hookState === HookState.SINKING && game.hookY >= game.height * 0.92) {
      game.hookY = game.height * 0.92;
      reel();
    }

    if (game.hookState === HookState.SINKING && game.hookedFishId === null) {
      for (const f of game.fish) {
        if (!f.hooked && isHookNearFish(f)) {
          f.hooked = true;
          game.hookedFishId = f.id;
          reel();
          stateText.textContent = `钓到${f.type.name}`;
          break;
        }
      }
    }

    if (game.hookState === HookState.REELING && game.hookY <= 38) {
      game.hookY = 38;
      const fish = game.fish.find((f) => f.id === game.hookedFishId);
      if (fish) {
        onFishCaught(fish);
      }
      game.fish = game.fish.filter((f) => f.id !== game.hookedFishId);
      game.hookedFishId = null;
      game.hookState = HookState.IDLE;
      stateText.textContent = game.running ? "待命" : "结束";
    }
  }

  function updateFx(dt) {
    for (const r of game.ripples) {
      r.r += 65 * dt;
      r.life -= 1.15 * dt;
    }
    game.ripples = game.ripples.filter((r) => r.life > 0);

    for (const f of game.floats) {
      f.y -= 24 * dt;
      f.life -= 1.2 * dt;
    }
    game.floats = game.floats.filter((f) => f.life > 0);
  }

  function updateTimer(dt) {
    if (!game.running) return;
    game.timerAcc += dt;
    if (game.timerAcc >= 1) {
      game.timerAcc -= 1;
      game.timeLeft -= 1;
      timeText.textContent = String(game.timeLeft);
      if (game.timeLeft <= 0) {
        game.timeLeft = 0;
        game.running = false;
        stateText.textContent = "时间到";
        setTimeout(() => window.alert(`时间到！最终得分：${game.score}`), 40);
      }
    }
  }

  function drawFish(f) {
    const len = 24 * f.type.size;
    const h = 12 * f.type.size;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.dir < 0) ctx.scale(-1, 1);

    ctx.fillStyle = f.type.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, h * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-len * 0.45, 0);
    ctx.lineTo(-len * 0.75, -h * 0.55);
    ctx.lineTo(-len * 0.75, h * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#25344d";
    ctx.beginPath();
    ctx.arc(len * 0.2, -1, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, game.width, game.height);
    const waterLine = game.height * 0.16;

    // Sky
    ctx.fillStyle = "#9fdfff";
    ctx.fillRect(0, 0, game.width, waterLine);

    // Water
    const g = ctx.createLinearGradient(0, waterLine, 0, game.height);
    g.addColorStop(0, "#67c5ff");
    g.addColorStop(1, "#247ec6");
    ctx.fillStyle = g;
    ctx.fillRect(0, waterLine, game.width, game.height - waterLine);

    // Water waves
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= game.width; x += 8) {
      const y = waterLine + Math.sin((x + performance.now() * 0.05) * 0.04) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (const r of game.ripples) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.6})`;
      ctx.lineWidth = 2;
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const f of game.fish) {
      drawFish(f);
    }

    // Rod and line
    ctx.strokeStyle = "#5b4f3f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(game.rodX - 40, 20);
    ctx.lineTo(game.rodX + 8, 34);
    ctx.stroke();

    ctx.strokeStyle = "#d7ecff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(game.rodX + 8, 34);
    ctx.lineTo(game.hookX, game.hookY);
    ctx.stroke();

    // Hook
    ctx.strokeStyle = "#f7fbff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(game.hookX, game.hookY, 6, 0.2, Math.PI * 1.4);
    ctx.stroke();

    for (const f of game.floats) {
      ctx.globalAlpha = f.life;
      ctx.fillStyle = f.color;
      ctx.font = "700 16px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - game.lastTs) / 1000);
    game.lastTs = ts;

    updateTimer(dt);
    updateFish(dt);
    updateHook(dt);
    updateFx(dt);
    render();

    requestAnimationFrame(loop);
  }

  function resetGame() {
    game.fish = [];
    game.ripples = [];
    game.floats = [];
    game.score = 0;
    game.timeLeft = GAME_SECONDS;
    game.timerAcc = 0;
    game.running = true;
    game.hookState = HookState.IDLE;
    game.hookedFishId = null;
    game.hookX = game.rodX;
    game.hookY = 38;
    scoreText.textContent = "0";
    timeText.textContent = String(GAME_SECONDS);
    stateText.textContent = "待命";
    for (let i = 0; i < 8; i += 1) spawnFish(i === 7);
  }

  function bindEvents() {
    castBtn.addEventListener("click", cast);
    reelBtn.addEventListener("click", reel);
    restartBtn.addEventListener("click", resetGame);

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (game.hookState === HookState.IDLE) cast();
      else reel();
    });

    let startY = 0;
    canvas.addEventListener("pointermove", (event) => {
      if (event.buttons !== 1) return;
      const dy = event.clientY - startY;
      if (dy < -16) reel();
    });
    canvas.addEventListener("pointerdown", (event) => {
      startY = event.clientY;
    });

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
  }

  function init() {
    resize();
    bindEvents();
    resetGame();
    requestAnimationFrame(loop);
  }

  init();
})();
