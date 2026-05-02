import { MAPS, TILE_SIZE, createGrid, TileType, BOARD_WIDTH } from "@/lib/pacman-map";

export type Direction = 0 | 1 | 2 | 3; // 0: Right, 1: Down, 2: Left, 3: Up
const DIR_X = [1, 0, -1, 0];
const DIR_Y = [0, 1, 0, -1];

export interface Entity {
  x: number;
  y: number;
  dir: Direction;
  nextDir: Direction;
  speed: number;
  startX: number;
  startY: number;
  startDir: Direction;
}

export interface Ghost extends Entity {
  id: string;
  color: string;
  mode: "CHASE" | "SCATTER" | "FRIGHTENED" | "EATEN" | "RESPAWNING" | "LEAVING_PEN";
  timer: number;
}

export class PacmanEngine {
  pacman: Entity;
  ghosts: Ghost[];
  grid: { type: TileType; eaten: boolean }[][];
  cols: number;
  rows: number;
  
  score: number = 0;
  xp: number = 0;
  maxXp: number = 1000;
  level: number = 1;
  stage: number = 1;
  lives: number = 3;
  dotsRemaining: number = 0;

  frightenedTimer: number = 0;
  globalModeTimer: number = 0;
  isScatter: boolean = true;
  
  powerMode: "FREEZE" | "SLOW" | "KILL" | null = null;
  powerTimer: number = 0;
  
  onStateChange?: (stats: any) => void;
  onEvent?: (event: string, data?: any) => void;

  constructor() {
    this.rows = MAPS[0].length;
    this.cols = MAPS[0][0].length;
    this.grid = createGrid();
    
    // Using definite assignment since we initialize them in initEntities
    this.pacman = {} as Entity;
    this.ghosts = [];
    this.initGrid();
    this.initEntities();
  }

  initGrid() {
    this.dotsRemaining = 0;
    this.grid = createGrid(this.stage);
    this.grid.forEach(row => row.forEach(tile => {
      if (tile.type === "DOT" || tile.type === "POWER") {
        this.dotsRemaining++;
      }
    }));
  }

  initEntities() {
    this.pacman = { x: 13.5 * TILE_SIZE, y: 23 * TILE_SIZE, dir: 2, nextDir: 2, speed: 2, startX: 13.5, startY: 23, startDir: 2 };
    this.ghosts = [
      { id: "blinky", color: "#ff0000", x: 13.5 * TILE_SIZE, y: 11 * TILE_SIZE, dir: 2, nextDir: 2, speed: 1.8, mode: "SCATTER", timer: 0, startX: 13.5, startY: 11, startDir: 2 },
      { id: "pinky", color: "#ffb8ff", x: 13.5 * TILE_SIZE, y: 14 * TILE_SIZE, dir: 3, nextDir: 3, speed: 1.8, mode: "RESPAWNING", timer: 60, startX: 13.5, startY: 14, startDir: 3 },
      { id: "inky", color: "#00ffff", x: 11.5 * TILE_SIZE, y: 14 * TILE_SIZE, dir: 3, nextDir: 3, speed: 1.8, mode: "RESPAWNING", timer: 120, startX: 11.5, startY: 14, startDir: 3 },
      { id: "clyde", color: "#ffaa00", x: 15.5 * TILE_SIZE, y: 14 * TILE_SIZE, dir: 3, nextDir: 3, speed: 1.8, mode: "RESPAWNING", timer: 180, startX: 15.5, startY: 14, startDir: 3 }
    ];
    if (this.stage > 4) {
      this.ghosts.push({ id: "sue", color: "#ff00ff", x: 13.5 * TILE_SIZE, y: 15 * TILE_SIZE, dir: 3, nextDir: 3, speed: 2.0, mode: "RESPAWNING", timer: 240, startX: 13.5, startY: 15, startDir: 3 });
    }
    this.applyHardness();
  }

  resetPositions() {
    [this.pacman, ...this.ghosts].forEach(e => {
      e.x = e.startX * TILE_SIZE;
      e.y = e.startY * TILE_SIZE;
      e.dir = e.startDir;
      e.nextDir = e.startDir;
      if ('mode' in e) {
        const g = e as Ghost;
        g.mode = g.startY > 11 ? "RESPAWNING" : "SCATTER";
        if (g.id === "pinky") g.timer = 60;
        if (g.id === "inky") g.timer = 120;
        if (g.id === "clyde") g.timer = 180;
      }
    });
  }

  applyHardness() {
    const s = Math.min(this.stage, 10);
    this.pacman.speed = 2 + (s - 1) * 0.15;
    const ghostBase = 1.9 + s * 0.15;
    this.ghosts.forEach(g => {
      if (g.mode === "CHASE" || g.mode === "SCATTER") g.speed = ghostBase;
    });
  }

  getNextPower(): "FREEZE" | "SLOW" | "KILL" {
      const powers: ("FREEZE" | "SLOW" | "KILL")[] = ["FREEZE", "KILL", "SLOW"];
      return powers[(this.level - 1) % powers.length];
  }

  update() {
    if (this.powerTimer > 0) {
       this.powerTimer--;
       if (this.powerTimer <= 0) {
          this.powerMode = null;
          this.applyHardness(); // Reset speeds
       }
    }

    this.updatePacman();
    this.updateGhosts();
    this.checkCollisions();
    
    if (this.frightenedTimer > 0) {
      this.frightenedTimer--;
      if (this.frightenedTimer <= 0) {
        this.ghosts.forEach(g => {
           if (g.mode === "FRIGHTENED") {
              g.mode = this.isScatter ? "SCATTER" : "CHASE";
              this.applyHardness();
           }
        });
      }
    } else {
      this.globalModeTimer++;
      const scatterDur = Math.max(100, 400 - this.stage * 30);
      const chaseDur = 1000 + this.stage * 100;
      if (this.isScatter && this.globalModeTimer > scatterDur) {
        this.isScatter = false;
        this.globalModeTimer = 0;
        this.setGhostModes("CHASE");
      } else if (!this.isScatter && this.globalModeTimer > chaseDur) {
        this.isScatter = true;
        this.globalModeTimer = 0;
        this.setGhostModes("SCATTER");
      }
    }
  }

  setGhostModes(mode: "CHASE" | "SCATTER") {
    this.ghosts.forEach(g => {
      if (g.mode === "CHASE" || g.mode === "SCATTER") {
        g.mode = mode;
        g.dir = ((g.dir + 2) % 4) as Direction;
      }
    });
  }

  getTileXY(x: number, y: number) {
    return {
      tx: Math.floor(x / TILE_SIZE),
      ty: Math.floor(y / TILE_SIZE)
    };
  }

  isWall(tx: number, ty: number, ghost?: Ghost) {
    if (tx < 0 || tx >= this.cols) return false;
    if (ty < 0 || ty >= this.rows) return true;
    
    const type = this.grid[ty][tx].type;
    if (type === "WALL") return true;
    
    if (type === "GATE") {
      if (!ghost) return true;
      if (ghost.mode === "EATEN" || ghost.mode === "LEAVING_PEN" || (ghost.mode === "RESPAWNING" && ghost.timer <= 0)) {
        return false;
      }
      return true;
    }
    
    return false;
  }

  moveEntity(e: Entity, isGhost: boolean, ghost?: Ghost) {
    if (!isGhost && e.nextDir === (e.dir + 2) % 4) {
      e.dir = e.nextDir;
    }

    let currentTx = Math.floor(e.x / TILE_SIZE);
    let currentTy = Math.floor(e.y / TILE_SIZE);

    if (e.x < 0) currentTx = 0;
    if (e.x > BOARD_WIDTH) currentTx = this.cols - 1;

    const tileCenterX = currentTx * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = currentTy * TILE_SIZE + TILE_SIZE / 2;

    const prevX = e.x;
    const prevY = e.y;

    if (!isGhost && e.nextDir !== e.dir) {
      const cx = e.x - tileCenterX;
      const cy = e.y - tileCenterY;
      const checkTx = currentTx + DIR_X[e.nextDir];
      const checkTy = currentTy + DIR_Y[e.nextDir];
      
      if (!this.isWall(checkTx, checkTy, ghost)) {
        if (Math.abs(cx) <= e.speed && Math.abs(cy) <= e.speed) {
          e.x = tileCenterX;
          e.y = tileCenterY;
          e.dir = e.nextDir;
        }
      }
    }

    const nextX = e.x + DIR_X[e.dir] * e.speed;
    const nextY = e.y + DIR_Y[e.dir] * e.speed;

    let canMove = true;
    const pastCenter = 
        (e.dir === 0 && nextX > tileCenterX) ||
        (e.dir === 2 && nextX < tileCenterX) ||
        (e.dir === 1 && nextY > tileCenterY) ||
        (e.dir === 3 && nextY < tileCenterY);

    if (pastCenter) {
       const forwardTx = currentTx + DIR_X[e.dir];
       const forwardTy = currentTy + DIR_Y[e.dir];
       if (this.isWall(forwardTx, forwardTy, ghost)) {
          canMove = false;
       }
    }

    if (canMove) {
       e.x = nextX;
       e.y = nextY;
    } else {
       e.x = tileCenterX;
       e.y = tileCenterY;
    }

    if (e.x < -TILE_SIZE / 2) e.x = BOARD_WIDTH + TILE_SIZE / 2;
    if (e.x > BOARD_WIDTH + TILE_SIZE / 2) e.x = -TILE_SIZE / 2;

    let crossedCenter = false;
    if (e.dir === 0 && prevX < tileCenterX && e.x >= tileCenterX) crossedCenter = true;
    if (e.dir === 2 && prevX > tileCenterX && e.x <= tileCenterX) crossedCenter = true;
    if (e.dir === 1 && prevY < tileCenterY && e.y >= tileCenterY) crossedCenter = true;
    if (e.dir === 3 && prevY > tileCenterY && e.y <= tileCenterY) crossedCenter = true;

    if (isGhost && ghost) {
      if (crossedCenter || (!canMove && prevX === e.x && prevY === e.y)) {
         this.runGhostAI(ghost, currentTx, currentTy, tileCenterX, tileCenterY);
      }
    }
  }

  runGhostAI(g: Ghost, tx: number, ty: number, cx: number, cy: number) {
    if (g.mode === "RESPAWNING") {
      if (g.timer > 0 || this.frightenedTimer > 0) {
        g.x = cx; 
        g.y = cy;
        if (g.timer > 0) g.timer--;
        if (this.frightenedTimer > 0) g.mode = "RESPAWNING"; // Stay if frightened
        return;
      } else {
        g.mode = "LEAVING_PEN";
        g.speed = 1.0;
      }
    }

    let targetX = 0; let targetY = 0;
    const pTX = Math.floor(this.pacman.x / TILE_SIZE);
    const pTY = Math.floor(this.pacman.y / TILE_SIZE);

    if (g.mode === "EATEN") {
      targetX = 13; targetY = 14;
      g.speed = 5.0;
      if (tx >= 12 && tx <= 15 && ty >= 12 && ty <= 15) {
        g.mode = "RESPAWNING";
        g.timer = 60 * 3;
        g.x = 13.5 * TILE_SIZE;
        g.y = 14 * TILE_SIZE;
        return;
      }
    } else if (g.mode === "LEAVING_PEN") {
      targetX = 13; targetY = 11;
      if (ty <= 11) {
        g.mode = this.isScatter ? "SCATTER" : "CHASE";
        this.applyHardness();
      }
    } 
    
    if (g.mode === "FRIGHTENED") {
      g.speed = 1.0;
      targetX = Math.floor(Math.random() * this.cols);
      targetY = Math.floor(Math.random() * this.rows);
    } else if (g.mode === "SCATTER") {
      if (g.id === "blinky") { targetX = 26; targetY = 1; }
      else if (g.id === "pinky") { targetX = 1; targetY = 1; }
      else if (g.id === "inky") { targetX = 26; targetY = 26; }
      else if (g.id === "clyde") { targetX = 1; targetY = 26; }
      else if (g.id === "sue") { targetX = 13; targetY = 26; }
    } else if (g.mode === "CHASE") {
      if (g.id === "blinky" || g.id === "sue") { targetX = pTX; targetY = pTY; }
      else if (g.id === "pinky") {
        targetX = pTX + DIR_X[this.pacman.dir] * 4;
        targetY = pTY + DIR_Y[this.pacman.dir] * 4;
      } else if (g.id === "inky") {
        targetX = pTX; targetY = pTY;
      } else {
        const dist = Math.hypot(tx - pTX, ty - pTY);
        const retreatDist = this.stage > 4 ? 3 : 8;
        if (dist > retreatDist) { targetX = pTX; targetY = pTY; }
        else { targetX = 1; targetY = 26; }
      }
    }

    let validDirs: Direction[] = [];
    for(let d=0; d<4; d++) {
      if (d === (g.dir + 2) % 4) continue;
      const nx = tx + DIR_X[d];
      const ny = ty + DIR_Y[d];
      if (nx < 0 || nx >= this.cols) { validDirs.push(d as Direction); continue; }
      if (!this.isWall(nx, ny, g)) validDirs.push(d as Direction);
    }

    if (validDirs.length === 0) validDirs.push(((g.dir + 2) % 4) as Direction);

    let bestDir = g.dir;
    
    if (g.mode === "FRIGHTENED") {
        bestDir = validDirs[Math.floor(Math.random() * validDirs.length)];
    } else {
        let bestDist = Infinity;
        for (const d of validDirs) {
            const nx = tx + DIR_X[d];
            const ny = ty + DIR_Y[d];
            const dist = Math.hypot(nx - targetX, ny - targetY);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = d;
            }
        }
    }
    
    g.dir = bestDir;
    g.x = cx;
    g.y = cy;
  }

  updatePacman() {
    this.moveEntity(this.pacman, false);
    
    const tx = Math.floor(this.pacman.x / TILE_SIZE);
    const ty = Math.floor(this.pacman.y / TILE_SIZE);
    
    if (tx >= 0 && tx < this.cols && ty >= 0 && ty < this.rows) {
       const tile = this.grid[ty][tx];
       if (!tile.eaten) {
          if (tile.type === "DOT") {
             tile.eaten = true;
             this.addScore(10, 10);
             this.dotsRemaining--;
             this.onEvent?.("EAT_DOT", { x: this.pacman.x, y: this.pacman.y });
          } else if (tile.type === "POWER") {
             tile.eaten = true;
             this.addScore(50, 50);
             this.dotsRemaining--;
             this.frightenedTimer = Math.max(120, 600 - this.stage * 40);
             this.onEvent?.("EAT_POWER", { x: this.pacman.x, y: this.pacman.y });
             this.ghosts.forEach(g => {
                 if (g.mode === "CHASE" || g.mode === "SCATTER") {
                     g.mode = "FRIGHTENED";
                     g.speed = 1.0;
                     g.dir = ((g.dir + 2) % 4) as Direction;
                 }
             });
          } else if (tile.type === "PRIZE") {
             tile.eaten = true;
             this.addScore(500, 500);
             
             // Activate superpower
             const powers: ("FREEZE" | "SLOW" | "KILL")[] = ["FREEZE", "KILL", "SLOW"];
             this.powerMode = powers[(this.level - 1) % powers.length];
             this.powerTimer = 300; // 5 seconds
             
             if (this.powerMode === "KILL") {
                 this.ghosts.forEach(g => {
                     g.mode = "RESPAWNING";
                     g.timer = 180; // keep them in pen for 3 seconds
                     g.x = g.startX * TILE_SIZE;
                     g.y = g.startY * TILE_SIZE;
                     this.addScore(200, 0);
                 });
             } else if (this.powerMode === "SLOW") {
                 this.ghosts.forEach(g => {
                     g.speed = 0.5;
                 });
             }

             this.onEvent?.("EAT_PRIZE", { x: this.pacman.x, y: this.pacman.y, power: this.powerMode });
          }
          
          if (this.dotsRemaining === 0) {
              this.onEvent?.("LEVEL_COMPLETE");
          }
       }
    }

    if (this.dotsRemaining <= 0) {
       this.onEvent?.("WIN");
    }
  }

  updateGhosts() {
    if (this.powerMode === "FREEZE") return; // ghosts don't move
    this.ghosts.forEach(g => {
        this.moveEntity(g, true, g);
    });
  }

  checkCollisions() {
    const margin = TILE_SIZE / 2;
    for (const g of this.ghosts) {
       if (Math.abs(g.x - this.pacman.x) < margin && Math.abs(g.y - this.pacman.y) < margin) {
          if (g.mode === "FRIGHTENED") {
              g.mode = "EATEN";
              this.addScore(200, 200);
              this.onEvent?.("EAT_GHOST", { x: g.x, y: g.y, score: 200, color: g.color });
          } else if (g.mode === "CHASE" || g.mode === "SCATTER" || g.mode === "LEAVING_PEN") {
              this.onEvent?.("DIE");
              return;
          }
       }
    }
  }

  spawnPrize() {
     const emptyTiles: {x: number, y: number}[] = [];
     for(let y=1; y<this.rows-1; y++) {
         for(let x=1; x<this.cols-1; x++) {
             // Avoid ghost house and its inner boundaries (y: 9-17, x: 7-20)
             if (y >= 9 && y <= 17 && x >= 7 && x <= 20) continue;
             
             if (this.grid[y][x].type === "EMPTY" || (this.grid[y][x].type === "DOT" && this.grid[y][x].eaten)) {
                 emptyTiles.push({x, y});
             }
         }
     }
     if (emptyTiles.length > 0) {
         const t = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
         this.grid[t.y][t.x] = { type: "PRIZE", eaten: false };
     }
  }

  addScore(pts: number, xpPts: number) {
     this.score += pts;
     this.xp += xpPts;
     if (this.xp >= this.maxXp) {
         this.level++;
         this.xp -= this.maxXp;
         this.maxXp = 1000 * this.level;
         this.lives++; 
         this.spawnPrize();
         this.onEvent?.("LEVEL_UP", { level: this.level, x: this.pacman.x, y: this.pacman.y });
     }
     this.onStateChange?.(this.getStats());
  }

  resetGame() {
      this.score = 0;
      this.xp = 0;
      this.level = 1;
      this.stage = 1;
      this.maxXp = 1000;
      this.lives = 3;
      this.initGrid();
      this.initEntities();
      this.onStateChange?.(this.getStats());
  }

  getStats() {
      return {
          score: this.score,
          level: this.level,
          stage: this.stage,
          xp: this.xp,
          maxXp: this.maxXp,
          lives: this.lives
      };
  }
}
