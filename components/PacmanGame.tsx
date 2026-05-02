"use client";

import React, { useEffect, useRef, useState, useCallback, TouchEvent } from "react";
import { TILE_SIZE, BOARD_WIDTH, BOARD_HEIGHT } from "@/lib/pacman-map";
import { PacmanEngine, Direction } from "@/lib/pacman-engine";

type GameState = "READY" | "PLAY" | "PAUSE" | "GAME_OVER" | "LEVEL_COMPLETE";

const LEVEL_NAMES = [
  { name: "NOVICE EATER", icon: "🌱", color: "#4caf50" },
  { name: "PHANTOM CHASER", icon: "👻", color: "#2196f3" },
  { name: "GHOST BUSTER", icon: "🚫", color: "#f44336" },
  { name: "MAZE RUNNER", icon: "🔀", color: "#ff9800" },
  { name: "POWER CONSUMER", icon: "⚡", color: "#ffeb3b" },
  { name: "SPECTER FREEZER", icon: "❄️", color: "#00ffff" },
  { name: "SOUL BURNER", icon: "🔥", color: "#ff0000" },
  { name: "LABYRINTH LORD", icon: "👑", color: "#9c27b0" },
  { name: "ETERNAL HUNTER", icon: "⚔️", color: "#e91e63" },
  { name: "PAC-GOD", icon: "🌟", color: "#ffd700" }
];

const POWER_VISUALS: Record<string, { color: string, icon: string, text: string }> = {
  "FREEZE": { color: "#00ffff", icon: "❄️", text: "FREEZE!" },
  "KILL": { color: "#ff0000", icon: "🔥", text: "SOUL BURN!" },
  "SLOW": { color: "#ffff00", icon: "⏳", text: "TIME SLOW!" }
};

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface FloatingText {
  x: number; y: number; text: string;
  life: number; maxLife: number; color: string;
}

interface GameScore {
  score: number;
  highScore: number;
  level: number;
  stage: number;
  xp: number;
  maxXp: number;
  lives: number;
}

const THEMES = [
   { base: "30, 80, 255", bg: "#02050b", text: "#00ffff", dot: "#ffcc80", power: "#ffe082" }, // Stage 1 (classic blue)
   { base: "50, 255, 100", bg: "#020a04", text: "#aaffaa", dot: "#ccffcc", power: "#aaffaa" }, // Toxic green
   { base: "200, 50, 255", bg: "#0a020f", text: "#ffaaff", dot: "#eebbff", power: "#ddaaff" }, // Neon purple
   { base: "255, 120, 30", bg: "#0a0402", text: "#ffffaa", dot: "#ffddaa", power: "#ffcc66" }, // Volcanic orange
   { base: "255, 30, 50",  bg: "#0f0202", text: "#ffaaaa", dot: "#ffcccc", power: "#ff9999" }, // Danger red
   { base: "255, 255, 255",bg: "#000000", text: "#ffffff", dot: "#eeeeee", power: "#ffffff" } // Monochrome finale
];

export default function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PacmanEngine | null>(null);
  const reqRef = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);
  const floatTexts = useRef<FloatingText[]>([]);
  const shake = useRef<number>(0);
  const wallCache = useRef<HTMLCanvasElement | null>(null);
  const cachedStage = useRef<number>(-1);
  const [achievements, setAchievements] = useState<Array<{ name: string, icon: string, color: string }>>([]);
  
  const [gameState, setGameState] = useState<GameState>("READY");
  const [stats, setStats] = useState<GameScore>({
    score: 6920,
    highScore: 12500,
    level: 1,
    stage: 1,
    xp: 0,
    maxXp: 1000,
    lives: 3,
  });

  const initGame = useCallback(() => {
    if (engineRef.current) return;
    const engine = new PacmanEngine();
    
    engine.score = 6920; // Preseeded
    engine.xp = 350;
    
    engine.onStateChange = (s) => {
       setStats(prev => {
          let np = { ...prev, ...s };
          if (np.score > np.highScore) np.highScore = np.score;
          return np;
       });
    };

    engine.onEvent = (ev, data) => {
        if (ev === "DIE") {
            setGameState("PAUSE");
            shake.current = 15;
            for (let i=0; i<30; i++) {
                particles.current.push({
                   x: engine.pacman.x, y: engine.pacman.y,
                   vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
                   life: 1, maxLife: 30 + Math.random() * 30, color: "#ffff00", size: Math.random() * 4 + 2
                });
            }
            setTimeout(() => {
               engine.lives--;
               if (engine.lives < 0) {
                   setGameState("GAME_OVER");
               } else {
                   engine.resetPositions();
                   setStats(s => ({...s, lives: engine.lives}));
                   setGameState("READY");
                   setTimeout(() => setGameState("PLAY"), 2000);
               }
            }, 1500);
        } else if (ev === "LEVEL_COMPLETE") {
            setGameState("LEVEL_COMPLETE");
            setTimeout(() => {
                engine.stage++;
                engine.initGrid();
                engine.resetPositions();
                engine.applyHardness();
                setStats(s => ({...s, stage: engine.stage}));
                setGameState("READY");
                setTimeout(() => setGameState("PLAY"), 2000);
            }, 2000);
        } else if (ev === "EAT_POWER") {
            shake.current = 5;
            for (let i=0; i<15; i++) {
                particles.current.push({
                   x: data.x, y: data.y,
                   vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
                   life: 1, maxLife: 20 + Math.random() * 20, color: "#ffe082", size: Math.random() * 3 + 1
                });
            }
            floatTexts.current.push({ x: data.x, y: data.y, text: "POWER!", life: 1, maxLife: 60, color: "#ffe082" });
        } else if (ev === "EAT_GHOST") {
            shake.current = 8;
            for (let i=0; i<20; i++) {
                particles.current.push({
                   x: data.x, y: data.y,
                   vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                   life: 1, maxLife: 40 + Math.random() * 20, color: data.color || "#ffffff", size: Math.random() * 5 + 2
                });
            }
            floatTexts.current.push({ x: data.x, y: data.y, text: data.score.toString(), life: 1, maxLife: 60, color: "#00ffff" });
        } else if (ev === "EAT_DOT") {
            for (let i=0; i<3; i++) {
                particles.current.push({
                   x: data.x, y: data.y,
                   vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                   life: 1, maxLife: 10 + Math.random() * 10, color: "#ffcc80", size: Math.random() * 1.5 + 0.5
                });
            }
        } else if (ev === "LEVEL_UP") {
            const achDef = LEVEL_NAMES[Math.min(data.level - 1, 9)] || { name: `LEVEL ${data.level}`, icon: "⭐", color: "#ffffff" };
            setAchievements(prev => [...prev, achDef]);
            floatTexts.current.push({ x: data.x, y: data.y, text: "LEVEL UP!", life: 1, maxLife: 90, color: achDef.color });
            shake.current = 10;
            for (let i=0; i<40; i++) {
                particles.current.push({
                   x: data.x, y: data.y,
                   vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
                   life: 1, maxLife: 40 + Math.random() * 40, color: achDef.color, size: Math.random() * 4 + 2
                });
            }
        } else if (ev === "EAT_PRIZE") {
            shake.current = 10;
            const powerVisual = POWER_VISUALS[data.power] || { color: "#ff00ff", icon: "💎", text: data.power };
            for (let i=0; i<30; i++) {
                particles.current.push({
                   x: data.x, y: data.y,
                   vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
                   life: 1, maxLife: 30 + Math.random() * 30, color: powerVisual.color, size: Math.random() * 3 + 2
                });
            }
            floatTexts.current.push({ x: data.x, y: data.y, text: `+500 XP ${powerVisual.icon} ${powerVisual.text}`, life: 1, maxLife: 80, color: powerVisual.color });
        }
    };

    engineRef.current = engine;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
     if (!engineRef.current) return;
     const m = { 
       ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3,
       d: 0, s: 1, a: 2, w: 3,
       D: 0, S: 1, A: 2, W: 3
     } as any;
     if (e.key in m) {
         e.preventDefault();
         engineRef.current.pacman.nextDir = m[e.key] as Direction;
     }
  }, []);

  const touchStartRef = useRef<{x: number, y: number} | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current || !engineRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) {
            engineRef.current.pacman.nextDir = dx > 0 ? 0 : 2;
        }
    } else {
        if (Math.abs(dy) > 30) {
            engineRef.current.pacman.nextDir = dy > 0 ? 1 : 3;
        }
    }
    touchStartRef.current = null;
  }, []);

  const drawGame = useCallback((ctx: CanvasRenderingContext2D, exp: PacmanEngine, t: number) => {
      const theme = THEMES[(exp.stage - 1) % THEMES.length];
      
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      if (cachedStage.current !== exp.stage) {
          if (!wallCache.current) {
              wallCache.current = document.createElement("canvas");
              wallCache.current.width = BOARD_WIDTH;
              wallCache.current.height = BOARD_HEIGHT;
          }
          const wCtx = wallCache.current.getContext("2d");
          if (wCtx) {
              wCtx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
              wCtx.lineCap = "round";
              wCtx.lineJoin = "round";
              wCtx.lineWidth = 2.5;
              wCtx.strokeStyle = `rgba(${theme.base}, 0.8)`;
              wCtx.shadowBlur = 12;
              wCtx.shadowColor = `rgb(${theme.base})`;
              
              for (let y = 0; y < exp.rows; y++) {
                  for (let x = 0; x < exp.cols; x++) {
                      if (exp.grid[y][x].type === "WALL") {
                          wCtx.beginPath();
                          wCtx.roundRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8, 4);
                          wCtx.stroke();
                      }
                  }
              }
          }
          cachedStage.current = exp.stage;
      }

      ctx.save();
      if (shake.current > 0) {
         const sx = (Math.random() - 0.5) * shake.current;
         const sy = (Math.random() - 0.5) * shake.current;
         ctx.translate(sx, sy);
         shake.current *= 0.8;
         if (shake.current < 0.5) shake.current = 0;
      }

      const wallPulse = Math.abs(Math.sin(t / 500));
      ctx.globalAlpha = 0.6 + wallPulse * 0.4;
      if (wallCache.current) {
         ctx.drawImage(wallCache.current, 0, 0);
      }
      ctx.globalAlpha = 1;

      // Draw active elements
      for (let y = 0; y < exp.rows; y++) {
          for (let x = 0; x < exp.cols; x++) {
              const tile = exp.grid[y][x];
              const px = x * TILE_SIZE;
              const py = y * TILE_SIZE;
              const cx = px + TILE_SIZE/2;
              const cy = py + TILE_SIZE/2;

              if (!tile.eaten) {
                  if (tile.type === "DOT") {
                      ctx.fillStyle = theme.dot;
                      ctx.beginPath();
                      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
                      ctx.fill();
                  } else if (tile.type === "POWER") {
                      const r = 6 + Math.sin(t / 150) * 1.5;
                      ctx.fillStyle = theme.power;
                      ctx.shadowBlur = 12;
                      ctx.shadowColor = theme.power;
                      ctx.beginPath();
                      ctx.arc(cx, cy, r, 0, Math.PI * 2);
                      ctx.fill();
                      ctx.shadowBlur = 0;
                  } else if (tile.type === "PRIZE") {
                      const r = 8 + Math.cos(t / 100) * 2;
                      const nextPwr = exp.getNextPower();
                      const pwrCol = POWER_VISUALS[nextPwr]?.color || "#ff00ff";
                      ctx.fillStyle = pwrCol;
                      ctx.shadowBlur = 15;
                      ctx.shadowColor = pwrCol;
                      ctx.beginPath();
                      // Draw a star shape for prize
                      for (let i=0; i<5; i++) {
                          ctx.lineTo(cx + Math.cos((18 + i * 72) / 180 * Math.PI) * r, cy - Math.sin((18 + i * 72) / 180 * Math.PI) * r);
                          ctx.lineTo(cx + Math.cos((54 + i * 72) / 180 * Math.PI) * (r/2), cy - Math.sin((54 + i * 72) / 180 * Math.PI) * (r/2));
                      }
                      ctx.closePath();
                      ctx.fill();
                      ctx.shadowBlur = 0;
                  }
              } else if (tile.type === "GATE") {
                  ctx.strokeStyle = "#ff88ff";
                  ctx.lineWidth = 4;
                  ctx.beginPath();
                  ctx.moveTo(px, cy);
                  ctx.lineTo(px + TILE_SIZE, cy);
                  ctx.stroke();
                  ctx.lineWidth = 2.5; // restore
              }
          }
      }

      // Draw Pacman
      const p = exp.pacman;
      ctx.fillStyle = "#ffff00";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ffff00";
      
      const mouthAnim = Math.abs(Math.sin(t / 80));
      const mouthOpen = mouthAnim * 0.25 * Math.PI;
      const angleOffsets = [0, 0.5, 1, 1.5];
      const baseAngle = angleOffsets[p.dir] * Math.PI;

      ctx.beginPath();
      if (gameState === "PAUSE" && exp.lives >= 0) {
          ctx.arc(p.x, p.y, TILE_SIZE/2 - 2, 0, Math.PI * 2);
      } else {
          ctx.arc(p.x, p.y, TILE_SIZE/2 - 2, baseAngle + mouthOpen, baseAngle + 2 * Math.PI - mouthOpen);
      }
      ctx.lineTo(p.x, p.y);
      ctx.fill();

      // Draw Ghosts
      exp.ghosts.forEach(g => {
         const r = TILE_SIZE / 2;
         ctx.shadowBlur = 10;
         
         if (g.mode === "EATEN") {
             ctx.fillStyle = "white";
             ctx.shadowBlur = 0;
             ctx.beginPath(); ctx.ellipse(g.x - 3, g.y - 2, 3, 4, 0, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.ellipse(g.x + 3, g.y - 2, 3, 4, 0, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = "#3333ff";
             const dx = [1,0,-1,0][g.dir]; const dy = [0,1,0,-1][g.dir];
             ctx.beginPath(); ctx.arc(g.x - 3 + dx, g.y - 2 + dy, 1.5, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(g.x + 3 + dx, g.y - 2 + dy, 1.5, 0, Math.PI*2); ctx.fill();
         } else {
             if (g.mode === "FRIGHTENED") {
                 if (exp.frightenedTimer < 120 && Math.floor(t / 200) % 2 === 0) {
                     ctx.fillStyle = "white";
                     ctx.shadowColor = "white";
                 } else {
                     ctx.fillStyle = "#3366ff";
                     ctx.shadowColor = "#3366ff";
                 }
             } else {
                 ctx.fillStyle = g.color;
                 ctx.shadowColor = g.color;
             }

             ctx.beginPath();
             ctx.arc(g.x, g.y - 2, r - 2, Math.PI, 0); 
             ctx.lineTo(g.x + r - 2, g.y + r - 2);
             ctx.lineTo(g.x + r - 4, g.y + r - 4);
             ctx.lineTo(g.x, g.y + r - 2);
             ctx.lineTo(g.x - r + 4, g.y + r - 4);
             ctx.lineTo(g.x - r + 2, g.y + r - 2);
             ctx.fill();

             if (g.mode !== "FRIGHTENED") {
                 ctx.fillStyle = "white";
                 ctx.shadowBlur = 0;
                 ctx.beginPath(); ctx.ellipse(g.x - 3, g.y - 3, 2, 3, 0, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.ellipse(g.x + 3, g.y - 3, 2, 3, 0, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = "#3333ff";
                 const dx = [1,0,-1,0][g.dir]; const dy = [0,1,0,-1][g.dir];
                 ctx.beginPath(); ctx.arc(g.x - 3 + dx, g.y - 3 + dy, 1, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.arc(g.x + 3 + dx, g.y - 3 + dy, 1, 0, Math.PI*2); ctx.fill();
             } else {
                 ctx.strokeStyle = "#ffcccc";
                 ctx.lineWidth = 1.5;
                 ctx.shadowBlur = 0;
                 ctx.beginPath();
                 ctx.moveTo(g.x - 4, g.y + 2);
                 ctx.lineTo(g.x - 2, g.y);
                 ctx.lineTo(g.x, g.y + 2);
                 ctx.lineTo(g.x + 2, g.y);
                 ctx.lineTo(g.x + 4, g.y + 2);
                 ctx.stroke();
             }
         }
      });

      // Draw Animated Particles
      particles.current = particles.current.filter(p => {
          p.x += p.vx; p.y += p.vy;
          p.life++;
          const alpha = 1 - p.life / p.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          return p.life < p.maxLife;
      });
      ctx.globalAlpha = 1;
      
      // Draw Floating Texts
      floatTexts.current = floatTexts.current.filter(ft => {
          ft.y -= 0.5;
          ft.life++;
          const alpha = 1 - ft.life / ft.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = ft.color;
          ctx.shadowBlur = 5;
          ctx.shadowColor = ft.color;
          ctx.font = "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.fillText(ft.text, ft.x, ft.y);
          return ft.life < ft.maxLife;
      });
      ctx.globalAlpha = 1;

      ctx.restore();
  }, [gameState]);

  useEffect(() => {
      initGame();
      window.addEventListener("keydown", handleKeyDown);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      
      let lastAnimTime = 0;
      const loop = (t: number) => {
          reqRef.current = requestAnimationFrame(loop);
          if (!ctx || !engineRef.current) return;

          if (gameState === "PLAY") {
              engineRef.current.update();
          }

          drawGame(ctx, engineRef.current, t);
      };

      if (gameState === "READY") {
          setTimeout(() => setGameState("PLAY"), 2000);
      }

      reqRef.current = requestAnimationFrame(loop);
      
      return () => {
          if (reqRef.current) cancelAnimationFrame(reqRef.current);
          window.removeEventListener("keydown", handleKeyDown);
      }
  }, [gameState, handleKeyDown, initGame, drawGame]);

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen bg-[#02050b] text-[#00FFFF] font-mono relative overflow-hidden" 
         style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #06122b 0%, #02050b 100%)' }}>
      
      <div className="w-full max-w-2xl p-2 flex flex-col gap-2 z-10 pt-2 lg:pt-8 relative">
        <div className="flex flex-col gap-2 bg-[#0a1530]/80 p-3 rounded-2xl border border-[#1e50ff] shadow-[0_0_15px_rgba(30,80,255,0.4)] backdrop-blur-md">
          {achievements.length > 0 && (
            <div className="flex gap-2 items-center px-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
               {achievements.map((ach, i) => (
                 <div key={i} className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 bg-[#2a0030] text-xs font-bold font-sans shadow-md cursor-help" style={{ borderColor: ach.color, boxShadow: `0 0 8px ${ach.color}` }} title={ach.name}>
                    {ach.icon}<span className="text-[10px] ml-[2px]" style={{ color: ach.color }}>{i+1}</span>
                 </div>
               ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-widest text-[#66aaff] ml-2">XP</span>
            <div className="flex-1 h-6 bg-[#050b1a] rounded-full overflow-hidden border border-[#0a2050] relative">
              <div 
                className="h-full bg-gradient-to-r from-[#8000ff] to-[#00f5ff] shadow-[0_0_10px_#00f5ff] transition-all duration-300"
                style={{ width: `${Math.min(100, (stats.xp / stats.maxXp) * 100)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-[0_0_2px_black]">
                {stats.xp} / {stats.maxXp}
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center px-2 text-xs font-bold font-sans tracking-wide">
            <span className="text-[#66aaff]/80 uppercase">Next Power-Up:</span>
            {(() => {
                const nextPwr = ["FREEZE", "KILL", "SLOW"][(stats.level - 1) % 3];
                const pwrInfo = POWER_VISUALS[nextPwr];
                return pwrInfo ? (
                   <div className="flex items-center gap-2" style={{ color: pwrInfo.color, textShadow: `0 0 5px ${pwrInfo.color}` }}>
                       <span>{pwrInfo.icon}</span>
                       <span>{pwrInfo.text}</span>
                   </div>
                ) : null;
            })()}
          </div>
        </div>

        <div className="flex justify-between items-center px-4 text-xl font-bold">
          <div className="flex flex-col items-center">
            <span className="text-[#66aaff] text-sm tracking-widest uppercase mb-1">SCORE</span>
            <span className="text-white drop-shadow-[0_0_5px_#fff]">{stats.score.toString().padStart(6, '0')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[#66aaff] text-sm tracking-widest uppercase mb-1">LEVEL</span>
            <span className="text-white drop-shadow-[0_0_5px_#fff]">{stats.level.toString().padStart(2, '0')}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[#66aaff] text-sm tracking-widest uppercase mb-1">HIGH</span>
            <span className="text-white drop-shadow-[0_0_5px_#fff]">{stats.highScore.toString().padStart(6, '0')}</span>
          </div>
        </div>
      </div>

      <div 
         className="relative mt-2 p-1 rounded-xl border border-[#1e50ff]/60 shadow-[0_0_30px_rgba(30,80,255,0.4)] bg-black/80 max-w-full overflow-hidden"
         onTouchStart={handleTouchStart}
         onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-screen"
             style={{ backgroundImage: 'linear-gradient(#1e50ff 1px, transparent 1px), linear-gradient(90deg, #1e50ff 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
        </div>
        
        <canvas 
          ref={canvasRef} 
          width={BOARD_WIDTH} 
          height={BOARD_HEIGHT}
          className="block w-full h-auto aspect-square"
          style={{ touchAction: 'none', imageRendering: 'pixelated' }}
        />
        
        {gameState === "READY" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 text-[#ffff00] text-3xl font-bold italic drop-shadow-[0_0_15px_#ffff00]">
            READY!
          </div>
        )}
        {gameState === "GAME_OVER" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 text-red-500 text-5xl font-bold drop-shadow-[0_0_20px_red] flex-col gap-6 pointer-events-auto">
            <span>GAME OVER</span>
            <button 
              className="px-8 py-3 border-4 border-red-500 text-white text-2xl font-bold rounded-lg hover:bg-red-500/20 hover:scale-105 transition-all cursor-pointer shadow-[0_0_15px_red]"
              onClick={() => {
                  if (engineRef.current) engineRef.current.resetGame();
                  setAchievements([]);
                  setGameState("READY");
                  setTimeout(() => setGameState("PLAY"), 2000);
              }}
            >
              RETRY
            </button>
          </div>
        )}
        {gameState === "LEVEL_COMPLETE" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20 text-[#00FFFF] text-4xl font-bold italic drop-shadow-[0_0_15px_#00FFFF]">
            STAGE CLEAR!
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl px-4 py-2 flex justify-between items-center text-xl font-bold mt-1 text-[#00FFFF] drop-shadow-[0_0_8px_#00FFFF]">
        <span className="uppercase tracking-widest text-[#66aaff]">STAGE {stats.stage}</span>
        <div className="flex justify-center gap-2">
            {Array.from({length: Math.max(0, stats.lives)}).map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-[#ffff00] shadow-[0_0_8px_#ffff00]" 
                     style={{clipPath: 'polygon(100% 74%, 44% 48%, 100% 21%, 100% 0, 0 0, 0 100%, 100% 100%)'}} />
            ))}
        </div>
      </div>
    </div>
  );
}
