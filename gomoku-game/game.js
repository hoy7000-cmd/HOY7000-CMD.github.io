"use strict";

(() => {
  const BOARD_SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const HUMAN = BLACK;
  const AI = WHITE;
  const AI_DELAY_MS = 180;
  const ANIM_DURATION = 160;

  const state = {
    board: Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => EMPTY)),
    current: BLACK,
    winner: EMPTY,
    difficulty: "easy",
    thinking: false,
    animPiece: null
  };

  const canvas = document.getElementById("boardCanvas");
  const ctx = canvas.getContext("2d");
  const turnText = document.getElementById("turnText");
  const resultText = document.getElementById("resultText");
  const restartBtn = document.getElementById("restartBtn");
  const difficultyButtons = Array.from(document.querySelectorAll(".difficulty-btn"));

  const metrics = {
    logicalSize: 0,
    cell: 0,
    padding: 0
  };

  function resizeBoard() {
    const rect = canvas.getBoundingClientRect();
    const logical = Math.max(300, Math.min(rect.width, 620));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(logical * dpr);
    canvas.height = Math.floor(logical * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    metrics.logicalSize = logical;
    metrics.padding = logical * 0.07;
    metrics.cell = (logical - metrics.padding * 2) / (BOARD_SIZE - 1);
    draw();
  }

  function drawBoardGrid() {
    ctx.clearRect(0, 0, metrics.logicalSize, metrics.logicalSize);
    ctx.fillStyle = "#f2d7a3";
    ctx.fillRect(0, 0, metrics.logicalSize, metrics.logicalSize);

    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = 1;

    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const offset = metrics.padding + i * metrics.cell;
      ctx.beginPath();
      ctx.moveTo(metrics.padding, offset);
      ctx.lineTo(metrics.logicalSize - metrics.padding, offset);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(offset, metrics.padding);
      ctx.lineTo(offset, metrics.logicalSize - metrics.padding);
      ctx.stroke();
    }
  }

  function drawPiece(row, col, player) {
    const x = metrics.padding + col * metrics.cell;
    const y = metrics.padding + row * metrics.cell;
    const radius = metrics.cell * 0.4;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();

    // Soft shadow creates a subtle 3D feel.
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;

    if (player === BLACK) {
      const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
      grad.addColorStop(0, "#5b5b5b");
      grad.addColorStop(1, "#111111");
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.08, x, y, radius);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#d9d9d9");
      ctx.fillStyle = grad;
    }

    ctx.fill();
    ctx.restore();
  }

  function drawAnimatedPiece(now) {
    if (!state.animPiece) return;
    const t = (now - state.animPiece.start) / ANIM_DURATION;
    if (t >= 1) {
      state.animPiece = null;
      return;
    }
    const x = metrics.padding + state.animPiece.col * metrics.cell;
    const y = metrics.padding + state.animPiece.row * metrics.cell;
    const radius = metrics.cell * (0.1 + 0.3 * t);

    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.35 + t * 0.9);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    if (state.animPiece.player === BLACK) {
      ctx.fillStyle = "#222";
    } else {
      ctx.fillStyle = "#ececec";
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    drawBoardGrid();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col] !== EMPTY) {
          drawPiece(row, col, state.board[row][col]);
        }
      }
    }
    drawAnimatedPiece(performance.now());
  }

  function inBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function countDirection(row, col, dRow, dCol, player) {
    let total = 0;
    let r = row + dRow;
    let c = col + dCol;
    while (inBounds(r, c) && state.board[r][c] === player) {
      total += 1;
      r += dRow;
      c += dCol;
    }
    return total;
  }

  function checkWin(row, col, player) {
    // Check horizontal, vertical and both diagonals from the latest move.
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];
    for (const [dr, dc] of dirs) {
      const linked = 1 + countDirection(row, col, dr, dc, player) + countDirection(row, col, -dr, -dc, player);
      if (linked >= 5) return true;
    }
    return false;
  }

  function hasAnyEmpty() {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col] === EMPTY) return true;
      }
    }
    return false;
  }

  function pointerToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const col = Math.round((x - metrics.padding) / metrics.cell);
    const row = Math.round((y - metrics.padding) / metrics.cell);

    if (!inBounds(row, col)) return null;

    const centerX = metrics.padding + col * metrics.cell;
    const centerY = metrics.padding + row * metrics.cell;
    const maxOffset = metrics.cell * 0.45;

    // Prevent accidental placement when tapping far from intersections.
    if (Math.abs(x - centerX) > maxOffset || Math.abs(y - centerY) > maxOffset) return null;
    return { row, col };
  }

  function updateStatus() {
    if (state.winner === EMPTY) {
      if (state.current === HUMAN) {
        turnText.textContent = "黑棋（你）";
      } else {
        turnText.textContent = state.thinking ? "白棋（AI思考中）" : "白棋（AI）";
      }
    } else {
      turnText.textContent = state.winner === HUMAN ? "黑棋（你）" : "白棋（AI）";
    }
    if (state.winner === EMPTY) {
      resultText.textContent = "进行中";
    } else {
      resultText.textContent = state.winner === HUMAN ? "你获胜" : "AI获胜";
    }
  }

  function placeMove(row, col, player) {
    state.board[row][col] = player;
    state.animPiece = { row, col, player, start: performance.now() };
    draw();
    if (checkWin(row, col, player)) {
      state.winner = player;
      updateStatus();
      setTimeout(() => {
        window.alert(player === HUMAN ? "你获胜！" : "AI获胜！");
      }, 20);
      return true;
    }
    return false;
  }

  function evaluatePoint(row, col, player) {
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];
    let score = 0;

    for (const [dr, dc] of dirs) {
      const forward = countDirection(row, col, dr, dc, player);
      const backward = countDirection(row, col, -dr, -dc, player);
      const link = forward + backward + 1;
      const r1 = row + (forward + 1) * dr;
      const c1 = col + (forward + 1) * dc;
      const r2 = row - (backward + 1) * dr;
      const c2 = col - (backward + 1) * dc;
      const open1 = inBounds(r1, c1) && state.board[r1][c1] === EMPTY;
      const open2 = inBounds(r2, c2) && state.board[r2][c2] === EMPTY;
      const openEnds = (open1 ? 1 : 0) + (open2 ? 1 : 0);

      if (link >= 5) score += 120000;
      else if (link === 4 && openEnds === 2) score += 18000;
      else if (link === 4 && openEnds === 1) score += 6000;
      else if (link === 3 && openEnds === 2) score += 2500;
      else if (link === 3 && openEnds === 1) score += 450;
      else if (link === 2 && openEnds === 2) score += 120;
      else score += 12;
    }

    return score;
  }

  function getCandidateMoves(limit = 18) {
    const candidates = [];
    let hasStone = false;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col] !== EMPTY) {
          hasStone = true;
        }
      }
    }
    if (!hasStone) return [{ row: 7, col: 7 }];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col] !== EMPTY) continue;
        let near = false;
        for (let dr = -2; dr <= 2 && !near; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (inBounds(nr, nc) && state.board[nr][nc] !== EMPTY) {
              near = true;
              break;
            }
          }
        }
        if (!near) continue;

        const attack = evaluatePoint(row, col, AI);
        const defense = evaluatePoint(row, col, HUMAN);
        candidates.push({ row, col, score: attack * 1.1 + defense });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  }

  function findImmediateWinningMove(player) {
    const candidates = getCandidateMoves(40);
    for (const move of candidates) {
      state.board[move.row][move.col] = player;
      const win = checkWin(move.row, move.col, player);
      state.board[move.row][move.col] = EMPTY;
      if (win) return move;
    }
    return null;
  }

  function pickEasyMove() {
    const empties = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (state.board[row][col] === EMPTY) empties.push({ row, col });
      }
    }
    if (!empties.length) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }

  function pickNormalMove() {
    const winMove = findImmediateWinningMove(AI);
    if (winMove) return winMove;
    const blockMove = findImmediateWinningMove(HUMAN);
    if (blockMove) return blockMove;

    const candidates = getCandidateMoves(20);
    if (!candidates.length) return pickEasyMove();

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const move of candidates) {
      const attack = evaluatePoint(move.row, move.col, AI);
      const defense = evaluatePoint(move.row, move.col, HUMAN);
      const score = attack * 1.15 + defense * 1.1;
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  function evaluateBoardHeuristic() {
    let total = 0;
    const candidates = getCandidateMoves(26);
    for (const move of candidates) {
      total += evaluatePoint(move.row, move.col, AI) * 0.8;
      total -= evaluatePoint(move.row, move.col, HUMAN) * 0.7;
    }
    return total;
  }

  function minimax(depth, maximizing, alpha, beta) {
    if (depth === 0) return evaluateBoardHeuristic();
    const candidates = getCandidateMoves(depth >= 2 ? 8 : 12);
    if (!candidates.length) return 0;

    if (maximizing) {
      let best = -Infinity;
      for (const move of candidates) {
        state.board[move.row][move.col] = AI;
        if (checkWin(move.row, move.col, AI)) {
          state.board[move.row][move.col] = EMPTY;
          return 1e9 - (2 - depth);
        }
        const value = minimax(depth - 1, false, alpha, beta);
        state.board[move.row][move.col] = EMPTY;
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    }

    let best = Infinity;
    for (const move of candidates) {
      state.board[move.row][move.col] = HUMAN;
      if (checkWin(move.row, move.col, HUMAN)) {
        state.board[move.row][move.col] = EMPTY;
        return -1e9 + (2 - depth);
      }
      const value = minimax(depth - 1, true, alpha, beta);
      state.board[move.row][move.col] = EMPTY;
      best = Math.min(best, value);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  function pickHardMove() {
    const winMove = findImmediateWinningMove(AI);
    if (winMove) return winMove;
    const blockMove = findImmediateWinningMove(HUMAN);
    if (blockMove) return blockMove;

    const candidates = getCandidateMoves(10);
    if (!candidates.length) return pickEasyMove();

    let bestMove = candidates[0];
    let bestScore = -Infinity;

    for (const move of candidates) {
      state.board[move.row][move.col] = AI;
      const score = minimax(2, false, -Infinity, Infinity);
      state.board[move.row][move.col] = EMPTY;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  function pickAiMove() {
    if (state.difficulty === "easy") return pickEasyMove();
    if (state.difficulty === "normal") return pickNormalMove();
    return pickHardMove();
  }

  function scheduleAiTurn() {
    if (state.winner !== EMPTY || state.current !== AI) return;
    state.thinking = true;
    updateStatus();
    setTimeout(() => {
      const move = pickAiMove();
      state.thinking = false;
      if (!move || state.winner !== EMPTY) {
        updateStatus();
        return;
      }
      const aiWon = placeMove(move.row, move.col, AI);
      if (aiWon) return;
      if (!hasAnyEmpty()) {
        resultText.textContent = "平局";
        turnText.textContent = "对局结束";
        return;
      }
      state.current = HUMAN;
      updateStatus();
    }, AI_DELAY_MS);
  }

  function onPlace(clientX, clientY) {
    if (state.winner !== EMPTY || state.current !== HUMAN || state.thinking) return;
    const cell = pointerToCell(clientX, clientY);
    if (!cell || state.board[cell.row][cell.col] !== EMPTY) return;

    const humanWon = placeMove(cell.row, cell.col, HUMAN);
    if (humanWon) return;
    if (!hasAnyEmpty()) {
      resultText.textContent = "平局";
      turnText.textContent = "对局结束";
      return;
    }

    state.current = AI;
    updateStatus();
    scheduleAiTurn();
  }

  function bindEvents() {
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      onPlace(event.clientX, event.clientY);
    });

    restartBtn.addEventListener("click", () => {
      state.board = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => EMPTY));
      state.current = BLACK;
      state.winner = EMPTY;
      state.thinking = false;
      state.animPiece = null;
      updateStatus();
      draw();
    });

    difficultyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.difficulty = btn.dataset.difficulty || "easy";
        difficultyButtons.forEach((item) => item.classList.toggle("active", item === btn));
        state.board = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => EMPTY));
        state.current = BLACK;
        state.winner = EMPTY;
        state.thinking = false;
        state.animPiece = null;
        updateStatus();
        draw();
      });
    });

    window.addEventListener("resize", resizeBoard);
    window.addEventListener("orientationchange", resizeBoard);
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  function init() {
    resizeBoard();
    updateStatus();
    bindEvents();
    requestAnimationFrame(loop);
  }

  init();
})();
