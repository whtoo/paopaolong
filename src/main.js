import * as PIXI from 'pixi.js';

// 创建应用
const app = new PIXI.Application({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true
});

document.body.appendChild(app.view);

// 泡泡颜色配置
const BUBBLE_COLORS = [
  0xFF0000, // 红
  0x00FF00, // 绿
  0x0000FF, // 蓝
  0xFFFF00, // 黄
  0xFF00FF, // 紫
  0x00FFFF  // 青
];

// 泡泡矩阵配置
const BUBBLE_RADIUS = 20;
const CANNON_SPEED = 10; // 炮台移动速度
const MAX_BUBBLE_ROWS = 7; // 最大行数 (初始值，可能会在游戏过程中调整)
const MIN_BUBBLE_ROWS = 3; // 最小行数
const BUBBLE_COLS = Math.floor(800 / (BUBBLE_RADIUS * 2));
const BUBBLE_START_Y = 50;

// 当前关卡
let currentLevel = 1;
let bubbles = []; // 二维数组，存储泡泡对象 { sprite, color, active, r, c }

// 创建发射器
const shooter = new PIXI.Graphics();
shooter.beginFill(0xFFFFFF);
shooter.drawRect(0, -15, 40, 30);
shooter.endFill();
shooter.pivot.set(20, 0);
shooter.x = app.screen.width / 2;
shooter.y = app.screen.height - 20;
app.stage.addChild(shooter);

// 暴露游戏状态给测试
window.gameState = {
  cannon: { x: shooter.x },
  bubbles: [] // 将在ticker中更新
};

let shootAngle = -Math.PI / 2;

// --- 辅助函数 ---
function getCellCenter(gridR, gridC) {
    const rowIsEven = gridR % 2 === 0;
    const offset = rowIsEven ? 0 : BUBBLE_RADIUS;
    const colsInRow = rowIsEven ? BUBBLE_COLS : BUBBLE_COLS - 1;
    // 处理 colsInRow 可能为0的情况，防止除以0
    const effectiveCols = colsInRow > 0 ? colsInRow : 1;
    const horizontalSpacing = app.screen.width / (effectiveCols + (rowIsEven ? 0 : 0.5));
    const x = gridC * horizontalSpacing + offset + BUBBLE_RADIUS;
    const y = gridR * (BUBBLE_RADIUS * 2) + BUBBLE_START_Y;
    return { x, y };
}

// 工具函数：将像素坐标转换为网格坐标
function getGridCoords(x, y) {
  const rowHeight = BUBBLE_RADIUS * Math.sqrt(3); // 使用精确的√3值替代近似值0.866
  const row = Math.floor(y / rowHeight);
  const colWidth = BUBBLE_RADIUS * 1.5; // 列宽为半径的1.5倍
  const isOddRow = row % 2 === 1;
  const col = Math.floor((x - (isOddRow ? colWidth / 2 : 0)) / colWidth);
  return { row, col };
}

function isValidGridPosition(r, c, checkExistsInArray = false) {
    if (r < 0) return false; // 不允许负数行
    // 允许泡泡吸附到比当前最高泡泡高几行的地方，或比MAX_BUBBLE_ROWS略高的地方
    // 但不能无限高，给一个合理的上限，例如 MAX_BUBBLE_ROWS + 缓冲行数
    const maxAllowedRows = (bubbles.length > 0 ? bubbles.length : MAX_BUBBLE_ROWS) + 3;
    if (r >= maxAllowedRows) return false;

    const colsInRow = (r % 2 === 0) ? BUBBLE_COLS : BUBBLE_COLS - 1;
    if (c < 0 || c >= colsInRow) return false;

    if (checkExistsInArray) {
        return bubbles[r] && bubbles[r][c] && bubbles[r][c].active;
    }
    // 如果不检查数组中是否存在，则仅判断逻辑位置是否有效且为空
    return !bubbles[r] || !bubbles[r][c] || !bubbles[r][c].active;
}

function getNeighborsForCell(r, c) {
    const neighbors = [];
    const isEvenRow = r % 2 === 0;
    const potentialNeighbors = isEvenRow ? [
        {r, c: c - 1}, {r, c: c + 1},             // 左, 右
        {r: r - 1, c: c - 1}, {r: r - 1, c: c},   // 左上, 右上
        {r: r + 1, c: c - 1}, {r: r + 1, c: c}    // 左下, 右下
    ] : [
        {r, c: c - 1}, {r, c: c + 1},             // 左, 右
        {r: r - 1, c: c}, {r: r - 1, c: c + 1},   // 左上, 右上
        {r: r + 1, c: c}, {r: r + 1, c: c + 1}    // 左下, 右下
    ];

    for (const n of potentialNeighbors) {
        // 仅进行基础的行非负数和列非负数检查，具体列数上限由 isValidGridPosition 处理
        if (n.r >= 0 && n.c >= 0) {
            const colsInNeighborRow = (n.r % 2 === 0) ? BUBBLE_COLS : BUBBLE_COLS - 1;
            if (n.c < colsInNeighborRow) { // 确保列在理论范围内
                 neighbors.push(n);
            }
        }
    }
    return neighbors;
}

function findNearestEmptyCellBFS(collisionWorldX, collisionWorldY, initialGridR, initialGridC, maxDepth = 6) {
    console.log(`[findNearestEmptyCellBFS] Start search from initialGrid: [${initialGridR}, ${initialGridC}], collisionPoint: (${collisionWorldX.toFixed(2)}, ${collisionWorldY.toFixed(2)}), maxDepth: ${maxDepth}`);
    const queue = [{ r: initialGridR, c: initialGridC, depth: 0 }];
    const visited = new Set([`${initialGridR},${initialGridC}`]);
    let bestCell = null;
    let minDistanceSq = Infinity;

    // 优先检查初始格子是否可用
    if (isValidGridPosition(initialGridR, initialGridC)) {
        const cellCenter = getCellCenter(initialGridR, initialGridC);
        const dx = cellCenter.x - collisionWorldX;
        const dy = cellCenter.y - collisionWorldY;
        minDistanceSq = dx * dx + dy * dy;
        bestCell = { r: initialGridR, c: initialGridC };
        console.log(`[findNearestEmptyCellBFS] Initial cell [${initialGridR},${initialGridC}] is valid and empty. distSq: ${minDistanceSq.toFixed(2)}`);
    }


    while (queue.length > 0) {
        const current = queue.shift();
        const { r, c, depth } = current;

        if (depth >= maxDepth && bestCell) break; // 如果已找到最佳且达到最大深度，停止

        const neighbors = getNeighborsForCell(r, c);
        for (const neighbor of neighbors) {
            const key = `${neighbor.r},${neighbor.c}`;
            if (!visited.has(key)) {
                visited.add(key);
                if (isValidGridPosition(neighbor.r, neighbor.c)) {
                    const cellCenter = getCellCenter(neighbor.r, neighbor.c);
                    const dx = cellCenter.x - collisionWorldX;
                    const dy = cellCenter.y - collisionWorldY;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        bestCell = { r: neighbor.r, c: neighbor.c };
                        console.log(`[findNearestEmptyCellBFS] Found better empty cell: [${neighbor.r},${neighbor.c}], distSq: ${distSq.toFixed(2)} at depth ${depth + 1}`);
                    }
                     // 即使不是更优，也加入队列继续搜索其邻居（如果深度允许）
                    if (depth + 1 < maxDepth) {
                        queue.push({ ...neighbor, depth: depth + 1 });
                    }
                } else {
                     // 如果邻居被占用，但仍在搜索深度内，也加入队列，以便搜索其邻居
                    if (depth + 1 < maxDepth) {
                        queue.push({ ...neighbor, depth: depth + 1 });
                    }
                }
            }
        }
    }
    if(bestCell) console.log(`[findNearestEmptyCellBFS] Best empty cell found: [${bestCell.r},${bestCell.c}] with distSq ${minDistanceSq.toFixed(2)}`);
    else console.log(`[findNearestEmptyCellBFS] No suitable empty cell found within maxDepth ${maxDepth}`);
    return bestCell;
}
// --- 游戏逻辑函数 ---
function createLevel(level) {
  bubbles.forEach(row => {
    if (row) {
      row.forEach(bubble => {
        if (bubble && bubble.sprite) app.stage.removeChild(bubble.sprite);
      });
    }
  });
  bubbles = []; // 清空后，bubbles 是一个空数组，后续会通过 bubbles[r] = [] 创建行

  const maxColors = Math.min(BUBBLE_COLORS.length, Math.max(3, 6 - Math.floor(level / 3)));
  const rowCount = Math.floor(Math.random() * (MAX_BUBBLE_ROWS - MIN_BUBBLE_ROWS + 1)) + MIN_BUBBLE_ROWS;

  for (let r = 0; r < rowCount; r++) {
    bubbles[r] = []; // 初始化当前行
    const colsInRow = (r % 2 === 0) ? BUBBLE_COLS : BUBBLE_COLS - 1;
    for (let c = 0; c < colsInRow; c++) {
      const colorIdx = Math.floor(Math.random() * maxColors);
      const bubbleSprite = new PIXI.Graphics();
      bubbleSprite.beginFill(BUBBLE_COLORS[colorIdx]);
      bubbleSprite.drawCircle(0, 0, BUBBLE_RADIUS);
      bubbleSprite.endFill();
      const cellCenter = getCellCenter(r,c);
      bubbleSprite.x = cellCenter.x;
      bubbleSprite.y = cellCenter.y;
      app.stage.addChild(bubbleSprite);
      bubbles[r][c] = { sprite: bubbleSprite, color: colorIdx, active: true, r, c };
    }
  }
  // Immediately update gameState after creating a new level
  window.gameState.bubbles = getActiveBubbleDataForGameState();
  console.log('[createLevel] window.gameState.bubbles updated immediately.');
}

// Helper function to get simplified bubble data for gameState
function getActiveBubbleDataForGameState() {
    const activeBubblesData = [];
    for (let r = 0; r < bubbles.length; r++) {
        if (bubbles[r]) {
            for (let c = 0; c < bubbles[r].length; c++) {
                const bubble = bubbles[r][c];
                if (bubble && bubble.active) {
                    activeBubblesData.push({
                        x: bubble.sprite.x,
                        y: bubble.sprite.y,
                        color: bubble.color, // Store the color index
                        r: bubble.r,
                        c: bubble.c,
                        active: bubble.active // Should always be true here
                    });
                }
            }
        }
    }
    return activeBubblesData;
}

app.view.addEventListener('mousemove', (e) => {
  const rect = app.view.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const dx = mouseX - shooter.x;
  const dy = mouseY - shooter.y;
  let angle = Math.atan2(dy, dx);
  // 限制角度在屏幕上半部分 (-PI, 0)
  if (angle > 0) { // 如果角度在下半圆
    angle = (dx > 0 ? 0 : -Math.PI); // 根据x方向决定是0度还是-180度
  } else if (angle === 0 && dx < 0) { // 正好是-PI的情况
    angle = -Math.PI;
  }
  shootAngle = Math.min(0, Math.max(-Math.PI, angle)); // 再次确保在[-PI, 0]

  shooter.rotation = shootAngle;
});

function addNewRowFromTop() {
    // 检查是否会超出最大行数限制（例如，屏幕底部）
    if (bubbles.length >= MAX_BUBBLE_ROWS + 3) { // 允许一些缓冲
        console.warn("[addNewRowFromTop] Max rows reached, not adding new row.");
        // 可以在这里触发游戏结束逻辑
        alert(`游戏结束 - 泡泡已满! 分数: ${score}`);
        createLevel(currentLevel); // 重置关卡
        return;
    }

  // 将所有现有泡泡向下移动一个逻辑行
  for (let r = bubbles.length - 1; r >= 0; r--) {
    if (bubbles[r]) {
      bubbles[r].forEach(bubble => {
        if (bubble && bubble.active) {
          bubble.r += 1; // 更新逻辑行号
          const newCellCenter = getCellCenter(bubble.r, bubble.c);
          bubble.sprite.y = newCellCenter.y; // 更新视觉位置
        }
      });
      bubbles[r+1] = bubbles[r]; // 移动整行数据
    }
  }
  bubbles[0] = []; // 创建新的顶行 (逻辑行0)

  const colsInFirstRow = BUBBLE_COLS;
  for (let c = 0; c < colsInFirstRow; c++) {
    const colorIdx = Math.floor(Math.random() * Math.min(currentLevel + 2, BUBBLE_COLORS.length));
    const bubbleSprite = new PIXI.Graphics();
    bubbleSprite.beginFill(BUBBLE_COLORS[colorIdx]);
    bubbleSprite.drawCircle(0, 0, BUBBLE_RADIUS);
    bubbleSprite.endFill();
    const cellCenter = getCellCenter(0,c);
    bubbleSprite.x = cellCenter.x;
    bubbleSprite.y = cellCenter.y;
    app.stage.addChild(bubbleSprite);
    bubbles[0][c] = { sprite: bubbleSprite, color: colorIdx, active: true, r: 0, c };
  }
}

function findColorCluster(startR, startC, targetColor) {
  console.log(`[findColorCluster] Input: startR=${startR}, startC=${startC}, targetColor=${targetColor}`);
  console.log(`[findColorCluster] Bubbles state snapshot around [${startR}, ${startC}]:`);
  const snapshotRadius = 2;
  for (let r = Math.max(0, startR - snapshotRadius); r <= Math.min(bubbles.length - 1, startR + snapshotRadius); r++) {
    let rowStr = `Row ${r}: `;
    if (!bubbles[r]) { rowStr += " (undefined)"; console.log(rowStr); continue; }
    for (let c = Math.max(0, startC - snapshotRadius - 1); c <= Math.min(bubbles[r].length - 1, startC + snapshotRadius + 1); c++) {
      rowStr += bubbles[r][c] ? `[C:${c}, Clr:${bubbles[r][c].color}, Act:${bubbles[r][c].active ? 'T' : 'F'}] ` : `[C:${c}, Empty] `;
    }
    console.log(rowStr);
  }

  const cluster = [];
  const visited = new Set();
  const queue = [{r: startR, c: startC}];
  visited.add(`${startR},${startC}`); // 将起始点标记为已访问

  while (queue.length > 0) {
    const current = queue.shift();
    const {r, c} = current;

    // 检查当前泡泡是否有效、活跃且颜色匹配
    if (r < 0 || r >= bubbles.length || !bubbles[r] || c < 0 || c >= bubbles[r].length || !bubbles[r][c] || !bubbles[r][c].active || bubbles[r][c].color !== targetColor) {
      continue;
    }
    cluster.push({r, c}); // 将匹配的泡泡加入簇

    const neighbors = getNeighborsForCell(r, c);
    for (const neighbor of neighbors) {
      const key = `${neighbor.r},${neighbor.c}`;
      if (!visited.has(key)) {
        visited.add(key); // 在加入队列前标记，防止重复加入
        // 仅将可能匹配的邻居加入队列（后续会在循环开始时再次检查）
         if (neighbor.r >= 0 && neighbor.r < bubbles.length && bubbles[neighbor.r] &&
            neighbor.c >= 0 && neighbor.c < bubbles[neighbor.r].length && bubbles[neighbor.r][neighbor.c] &&
            bubbles[neighbor.r][neighbor.c].active && bubbles[neighbor.r][neighbor.c].color === targetColor) {
            // console.log(`[findColorCluster] Adding N: [${neighbor.r},${neighbor.c}] to queue.`);
            queue.push(neighbor);
        } else {
            // console.log(`[findColorCluster] N: [${neighbor.r},${neighbor.c}] not added (OOB, inactive, or wrong color).`);
        }
      }
    }
  }
  console.log(`[findColorCluster] Output: cluster.length=${cluster.length}`, JSON.stringify(cluster.map(bubble => ({r:bubble.r, c:bubble.c}))));
  return cluster;
}

function removeBubbles(cluster) {
  cluster.forEach(b => {
    if (bubbles[b.r] && bubbles[b.r][b.c]) {
      if (bubbles[b.r][b.c].sprite) app.stage.removeChild(bubbles[b.r][b.c].sprite);
      bubbles[b.r][b.c].active = false;
      // bubbles[b.r][b.c] = null; // 考虑将单元格设为null，以便isValidGridPosition更容易判断
    }
  });
}

function checkLevelComplete() {
  for (let r = 0; r < bubbles.length; r++) {
    if (bubbles[r]) {
      for (let c = 0; c < bubbles[r].length; c++) {
        if (bubbles[r][c] && bubbles[r][c].active) {
          return false;
        }
      }
    }
  }
  return true;
}

app.view.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = app.view.getBoundingClientRect();
  let touchX = e.touches[0].clientX - rect.left;
  let touchY = e.touches[0].clientY - rect.top;
  touchY = Math.min(touchY, app.screen.height - 50);
  const dx = touchX - shooter.x;
  const dy = touchY - shooter.y;
  let angle = Math.atan2(dy, dx);
  angle = Math.max(-Math.PI, Math.min(0, angle));
  shootAngle = angle;
  shooter.rotation = shootAngle;
}, { passive: false });

createLevel(currentLevel);

let shootingBubble = null;
let shootSpeed = 10;
let shootVelocity = { x: 0, y: 0 };

function shootBubble() {
  if (shootingBubble) return;
  const colorIdx = Math.floor(Math.random() * BUBBLE_COLORS.length);
  shootingBubble = new PIXI.Graphics();
  shootingBubble.beginFill(BUBBLE_COLORS[colorIdx]);
  shootingBubble.drawCircle(0, 0, BUBBLE_RADIUS);
  shootingBubble.endFill();
  shootingBubble.x = shooter.x;
  shootingBubble.y = shooter.y;
  shootingBubble.colorIdx = colorIdx;
  app.stage.addChild(shootingBubble);
  shootVelocity.x = Math.cos(shootAngle) * shootSpeed;
  shootVelocity.y = Math.sin(shootAngle) * shootSpeed;
}

const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);
const KEYBOARD_ANGLE_SPEED = 0.05;

app.view.addEventListener('click', shootBubble);
app.view.addEventListener('touchend', shootBubble);

let score = 0;
const scoreText = new PIXI.Text(`分数: ${score}`, { fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF });
scoreText.x = 10; scoreText.y = 10;
app.stage.addChild(scoreText);

const levelText = new PIXI.Text(`关卡: ${currentLevel}`, { fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF });
levelText.x = app.screen.width - 150; levelText.y = 10;
app.stage.addChild(levelText);

app.ticker.add(() => {
  if (keys['ArrowLeft']) {
    shooter.x = Math.max(BUBBLE_RADIUS, shooter.x - CANNON_SPEED);
  }
  if (keys['ArrowRight']) {
    shooter.x = Math.min(app.screen.width - BUBBLE_RADIUS, shooter.x + CANNON_SPEED);
  }
  if (keys[' '] && !keys.spacePressed) {
    shootBubble();
    keys.spacePressed = true;
  }
  if (!keys[' ']) {
    keys.spacePressed = false;
  }

  if (shootingBubble) {
    shootingBubble.x += shootVelocity.x;
    shootingBubble.y += shootVelocity.y;

    if (shootingBubble.x < BUBBLE_RADIUS) { shootingBubble.x = BUBBLE_RADIUS; shootVelocity.x *= -1; }
    else if (shootingBubble.x > app.screen.width - BUBBLE_RADIUS) { shootingBubble.x = app.screen.width - BUBBLE_RADIUS; shootVelocity.x *= -1; }
    if (shootingBubble.y < BUBBLE_RADIUS) { // 碰撞到顶部
        // shootingBubble.y = BUBBLE_RADIUS; // 确保它在顶部
        // shootVelocity.y = 0; // 停止垂直移动
        // shootVelocity.x = 0; // 停止水平移动，准备吸附
        // 触发吸附逻辑，而不是简单反弹
        // collided = true; // 标记为碰撞，以便进入下面的吸附逻辑
        // (下面的碰撞检测会处理吸附到顶部的情况)
    }


    let collidedWithExistingBubble = false;
    let collisionTargetR, collisionTargetC;

    // 简化碰撞检测：只检测与现有泡泡的碰撞
    for (let r = 0; r < bubbles.length && !collidedWithExistingBubble; r++) {
        if (!bubbles[r]) continue;
        for (let c = 0; c < bubbles[r].length && !collidedWithExistingBubble; c++) {
            const existingBubble = bubbles[r][c];
            if (existingBubble && existingBubble.active) {
                const dx = shootingBubble.x - existingBubble.sprite.x;
                const dy = shootingBubble.y - existingBubble.sprite.y;
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq < (BUBBLE_RADIUS * 2) * (BUBBLE_RADIUS * 2)) {
                    collidedWithExistingBubble = true;
                    // 记录被碰撞的泡泡，它的邻居是潜在的吸附点
                    collisionTargetR = existingBubble.r;
                    collisionTargetC = existingBubble.c;
                    console.log(`[Collision] Detected with existing bubble at [${existingBubble.r}, ${existingBubble.c}]`);
                    break; 
                }
            }
        }
    }
    
    // 新增：如果泡泡到达顶部区域，也视为需要吸附
    let shouldStick = collidedWithExistingBubble;
    if (!shouldStick && shootingBubble.y <= BUBBLE_START_Y + BUBBLE_RADIUS) {
        console.log("[Collision] Shooting bubble reached top area, attempting to stick.");
        shouldStick = true;
        // 尝试找到一个靠近顶部的初始网格点
        const topGridHit = getGridCoords(shootingBubble.x, shootingBubble.y);
        collisionTargetR = topGridHit.row;
        collisionTargetC = topGridHit.col;
    }


    if (shouldStick) {
      console.log(`[Ticker] 'shouldStick' is true. Entering adsorption logic. Shooting bubble at: x=${shootingBubble.x.toFixed(2)}, y=${shootingBubble.y.toFixed(2)}`);
      
      let bfsStartR, bfsStartC;
      let collisionType = "unknown"; // For logging

      if (collidedWithExistingBubble) {
          // Priority: Use the grid cell of the bubble that was hit as the starting point for BFS.
          // Ensure collisionTargetR and collisionTargetC are defined (they should be by the collision detection loop).
          if (collisionTargetR !== undefined && collisionTargetC !== undefined) {
              bfsStartR = collisionTargetR;
              bfsStartC = collisionTargetC;
              collisionType = `bubble collision with [${collisionTargetR},${collisionTargetC}]`;
              console.log(`[Adsorption] Bubble collision detected. Hit bubble at [${collisionTargetR},${collisionTargetC}]. BFS will start from this cell.`);
          } else {
              // Fallback if collisionTargetR/C are somehow undefined, though this shouldn't happen.
              // Use the shooting bubble's current grid position as a less ideal fallback.
              const currentGridPos = getGridCoords(shootingBubble.x, shootingBubble.y);
              bfsStartR = currentGridPos.row;
              bfsStartC = currentGridPos.col;
              collisionType = `bubble collision (fallback) at bubble pos [${bfsStartR},${bfsStartC}]`;
              console.warn(`[Adsorption] Bubble collision, but collisionTargetR/C undefined. BFS starting from shooting bubble's grid pos: [${bfsStartR},${bfsStartC}]`);
          }
      } else if (shootingBubble.y <= BUBBLE_START_Y + BUBBLE_RADIUS) { // Only consider top collision if no bubble was hit
          const topGridPos = getGridCoords(shootingBubble.x, shootingBubble.y);
          bfsStartR = Math.max(0, topGridPos.row); // Ensure row is not negative
          bfsStartC = topGridPos.col;
          collisionType = `top wall collision at [${bfsStartR},${bfsStartC}]`;
          console.log(`[Adsorption] Top wall collision detected. BFS starting from grid [${bfsStartR},${bfsStartC}] calculated from bubble position.`);
      } else {
          // This case should ideally not be reached if shouldStick is true.
          // It implies shouldStick was true but neither of the handled conditions were met.
          // Default to shooting bubble's current position.
          const currentGridPos = getGridCoords(shootingBubble.x, shootingBubble.y);
          bfsStartR = currentGridPos.row;
          bfsStartC = currentGridPos.col;
          collisionType = `unknown (shouldStick was true but no specific collision type matched) at bubble pos [${bfsStartR},${bfsStartC}]`;
          console.error(`[Adsorption] 'shouldStick' is true, but no specific collision condition matched. Defaulting BFS start to shooting bubble's grid pos: [${bfsStartR},${bfsStartC}]`);
      }

      console.log(`[Adsorption] Initiating BFS. Collision Type: ${collisionType}. Collision Point (shooting bubble): (${shootingBubble.x.toFixed(2)}, ${shootingBubble.y.toFixed(2)}). BFS Start Grid: [${bfsStartR}, ${bfsStartC}]`);

      const emptyCell = findNearestEmptyCellBFS(shootingBubble.x, shootingBubble.y, bfsStartR, bfsStartC);

      if (emptyCell) {
        console.log(`[Ticker] 'emptyCell' found by BFS: r=${emptyCell.r}, c=${emptyCell.c}. Proceeding to place bubble.`);
        const finalR = emptyCell.r;
        const finalC = emptyCell.c;

        // 确保行数组存在
        if (!bubbles[finalR]) {
            for(let i = bubbles.length; i <= finalR; i++) { // 如果中间有空行，也创建
                bubbles[i] = [];
            }
        }
         // 再次检查，确保列数对于该行是有效的
        const colsInFinalRow = (finalR % 2 === 0) ? BUBBLE_COLS : BUBBLE_COLS - 1;
        if (finalC < 0 || finalC >= colsInFinalRow) {
            console.error(`[Adsorption] BFS returned invalid column ${finalC} for row ${finalR} (max cols: ${colsInFinalRow-1}). Bubble lost.`);
            app.stage.removeChild(shootingBubble);
            shootingBubble = null;
            return; // ticker继续
        }


        const newBubbleSprite = new PIXI.Graphics();
        newBubbleSprite.beginFill(BUBBLE_COLORS[shootingBubble.colorIdx]);
        newBubbleSprite.drawCircle(0, 0, BUBBLE_RADIUS);
        newBubbleSprite.endFill();
        const cellToPlace = getCellCenter(finalR, finalC);
        newBubbleSprite.x = cellToPlace.x;
        newBubbleSprite.y = cellToPlace.y;
        app.stage.addChild(newBubbleSprite);
        bubbles[finalR][finalC] = { sprite: newBubbleSprite, color: shootingBubble.colorIdx, active: true, r: finalR, c: finalC };
        console.log(`[Adsorption] New bubble placed at [${finalR},${finalC}]`);

        app.stage.removeChild(shootingBubble);
        shootingBubble = null;

        const cluster = findColorCluster(finalR, finalC, bubbles[finalR][finalC].color);
        if (cluster.length >= 3) {
          console.log(`[MainLoop] Cluster found, length=${cluster.length}. Removing bubbles.`);
          const comboBonus = Math.min(50, (cluster.length - 3) * 5);
          score += 10 + comboBonus;
          scoreText.text = `分数: ${score}`;
          removeBubbles(cluster);
          // TODO: Handle floating bubbles after removal
        } else {
          console.log(`[MainLoop] No cluster of 3+ found (length=${cluster.length}). Adding new row from top.`);
          addNewRowFromTop();
        }

        if (checkLevelComplete()) {
          score += currentLevel * 100;
          scoreText.text = `分数: ${score}`;
          currentLevel++;
          levelText.text = `关卡: ${currentLevel}`;
          // if (currentLevel % 3 === 0 && MAX_BUBBLE_ROWS < 12) MAX_BUBBLE_ROWS++; // 增加难度逻辑可以保留或调整
          createLevel(currentLevel);
        }
      } else {
        console.error("[Adsorption] No empty cell found by BFS. Bubble lost.");
        app.stage.removeChild(shootingBubble);
        shootingBubble = null;
        // 考虑是否在这里也 addNewRowFromTop() 作为惩罚或推进游戏
        addNewRowFromTop(); 
      }
    } else if (shootingBubble && shootingBubble.y > app.screen.height + BUBBLE_RADIUS) { // 泡泡飞出底部
      console.log("[MainLoop] Bubble flew off bottom.");
      app.stage.removeChild(shootingBubble);
      shootingBubble = null;
      score = Math.max(0, score - 50); // 惩罚
      scoreText.text = `分数: ${score}`;
      // alert(`关卡 ${currentLevel} 失败！泡泡飞出！`); // 可以考虑不弹窗，直接处理
      // createLevel(currentLevel); // 重新开始当前关卡，或者只是添加新行
      addNewRowFromTop();
    }
  }
  
  // 更新全局游戏状态
  window.gameState.cannon.x = shooter.x;
  window.gameState.bubbles = getActiveBubbleDataForGameState();
});
