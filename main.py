import asyncio
import random
import heapq
import json
import os
from collections import deque
from enum import Enum
from typing import List, Tuple
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

from tiktok_manager import TikTokManager

app = FastAPI()

# Game Constants
GRID_WIDTH = 30
GRID_HEIGHT = 30
CELL_SIZE = 20
FPS = 30 
STATS_FILE = "snake_stats.json"

class Direction(Enum):
    UP = (0, -1)
    DOWN = (0, 1)
    LEFT = (-1, 0)
    RIGHT = (1, 0)

# --- TELEMETRY LOGGER ---
class GameLogger:
    def __init__(self):
        self.stats = self._load_stats()
        self.current_game_score = 0
        self.recent_scores = deque(self.stats.get("recent_scores", []), maxlen=10)

    def _load_stats(self):
        if os.path.exists(STATS_FILE):
            try:
                with open(STATS_FILE, "r") as f:
                    return json.load(f)
            except:
                pass
        return {"high_score": 0, "total_games": 0, "recent_scores": []}

    def _save_stats(self):
        self.stats["recent_scores"] = list(self.recent_scores)
        with open(STATS_FILE, "w") as f:
            json.dump(self.stats, f, indent=4)

    def log_game_over(self, score, cause):
        self.recent_scores.append(score)
        self.stats["total_games"] += 1
        
        if score > self.stats["high_score"]:
            self.stats["high_score"] = score
            print(f"🎉 NEW HIGH SCORE: {score}!")

        self._save_stats()
        
        avg = sum(self.recent_scores) / len(self.recent_scores) if self.recent_scores else 0
        print(f"💀 Game Over | Score: {score} | Avg (10): {avg:.1f} | Cause: {cause}")

# --- HAMILTONIAN CYCLE GENERATOR ---
class HamiltonianGenerator:
    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.cycle_map = {} 
        self.path = []
        self.generate()

    def generate(self):
        # Deterministic ZigZag
        self.path = []
        # 1. Top row right (1 to W-1)
        for c in range(1, self.w):
            self.path.append((c, 0))
        # 2. ZigZag down
        for r in range(1, self.h):
            if r % 2 == 1: 
                for c in range(self.w - 1, 0, -1):
                    self.path.append((c, r))
            else: 
                for c in range(1, self.w):
                    self.path.append((c, r))
        # 3. Up Col 0
        for r in range(self.h - 1, -1, -1):
            self.path.append((0, r))
            
        for idx, pos in enumerate(self.path):
            self.cycle_map[pos] = idx

# --- GAME LOGIC ---
class SnakeGame:
    def __init__(self):
        self.logger = GameLogger()
        self.reset()
    
    def reset(self):
        self.snake: List[Tuple[int, int]] = [(GRID_WIDTH // 2, GRID_HEIGHT // 2)]
        self.direction = Direction.UP
        self.food: Tuple[int, int] = self._spawn_food()
        self.score = 0
        self.game_over = False
        self.game_won = False
        self.ai_status = "Initializing..."
        self.death_cause = ""
        
        # TikTok State
        self.hype_level = 0
        self.current_effect = None
        self.force_shortcut = False
        self.boost_timer = 0

    def _spawn_food(self) -> Tuple[int, int]:
        # Safety check: if grid is full, return None (Victory condition handled in step)
        if len(self.snake) >= GRID_WIDTH * GRID_HEIGHT:
            return None
            
        # Try random positions first (fast)
        for _ in range(50):
            pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
            if pos not in self.snake:
                return pos
        
        # Fallback: Scan grid for empty spot
        available = []
        snake_set = set(self.snake)
        for x in range(GRID_WIDTH):
            for y in range(GRID_HEIGHT):
                if (x, y) not in snake_set:
                    available.append((x, y))
        
        if not available:
            return None # Should be caught by length check, but safe fallback
            
        return random.choice(available)

    def step(self, next_move: Direction):
        if self.game_over or self.game_won:
            return

        head_x, head_y = self.snake[0]
        dx, dy = next_move.value
        new_head = (head_x + dx, head_y + dy)

        # Collision Checks
        cause = None
        if not (0 <= new_head[0] < GRID_WIDTH and 0 <= new_head[1] < GRID_HEIGHT):
            cause = "Wall"
        elif new_head in self.snake and new_head != self.snake[-1]:
            cause = "Self-Collision"
            
        if cause:
            self.game_over = True
            self.death_cause = cause
            self.logger.log_game_over(self.score, cause)
            return

        self.snake.insert(0, new_head)
        
        if new_head == self.food:
            self.score += 1
            
            # CHECK VICTORY
            if len(self.snake) >= GRID_WIDTH * GRID_HEIGHT:
                self.game_won = True
                self.food = None # No more food
                self.logger.log_game_over(self.score, "PERFECT GAME")
                return

            self.food = self._spawn_food()
            
            # Double check if food grew into full grid (unlikely 1 step)
            if self.food is None and not self.game_won:
                 # Grid full but maybe triggered atypically?
                 self.game_won = True
                 self.logger.log_game_over(self.score, "PERFECT GAME")
        else:
            self.snake.pop()
            
        # Hype Decay / Boost Decay
        if self.force_shortcut:
            self.boost_timer += 1
            if self.boost_timer > 150: # ~5 seconds at 30FPS
                self.force_shortcut = False
                self.boost_timer = 0
                
        if self.hype_level > 0 and random.random() < 0.05:
            self.hype_level -= 1

    def force_game_over(self, cause):
        self.game_over = True
        self.death_cause = cause
        self.logger.log_game_over(self.score, cause)

    def get_state(self):
        is_aggressive = "Shortcut" in self.ai_status
        state = {
            "snake": self.snake,
            "food": self.food,
            "score": self.score,
            "game_over": self.game_over,
            "game_won": self.game_won,
            "grid_size": (GRID_WIDTH, GRID_HEIGHT),
            "ai_status": self.ai_status,
            "speed_mode": "FAST" if is_aggressive else "NORMAL",
            "planned_path": getattr(ai, 'current_path', []),
            "tiktok_effect": self.current_effect,
            "hype": self.hype_level
        }
        # Consume effect
        self.current_effect = None
        return state

# --- AI CONTROLLER ---
class AIController:
    def __init__(self, game: SnakeGame):
        self.game = game
        self.hamilton = HamiltonianGenerator(GRID_WIDTH, GRID_HEIGHT)
        self.cycle = self.hamilton.cycle_map
        self.cycle_len = len(self.hamilton.path)
        self.current_path = []

    def get_next_move(self) -> Direction:
        snake = self.game.snake
        head = snake[0]
        tail = snake[-1] 
        food = self.game.food
        
        # Determine valid physical moves
        valid_moves = []
        snake_set = set(snake[:-1]) # Body barring tail
        
        for d in Direction:
            nx, ny = head[0] + d.value[0], head[1] + d.value[1]
            if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                n_pos = (nx, ny)
                if n_pos not in snake_set: 
                    valid_moves.append((d, n_pos))
        
        if not valid_moves:
            self.game.force_game_over("Trapped (No Moves)")
            return Direction.UP

        head_idx = self.cycle.get(head)
        tail_idx = self.cycle.get(tail)
        food_idx = self.cycle.get(food)
        
        def dist_cycle(a_idx, b_idx):
            if b_idx >= a_idx: return b_idx - a_idx
            return b_idx - a_idx + self.cycle_len
            
        # RAYCAST HELPER: Check if cycle path from start to end is completely clear
        def is_path_clear(start_idx, end_idx):
            if start_idx == end_idx: return True
            
            # Walk the cycle delta
            curr = (start_idx + 1) % self.cycle_len
            while curr != end_idx:
                curr_pos = self.hamilton.path[curr]
                if curr_pos in snake_set:
                    return False
                curr = (curr + 1) % self.cycle_len
            return True

        # Shortcut Logic
        best_shortcut = None
        min_dist = dist_cycle(head_idx, food_idx)
        
        for move, pos in valid_moves:
            pos_idx = self.cycle.get(pos)
            if pos_idx is None: continue 
            
            # Check 1: Is it the default cycle move? Skip (handled by fallback)
            if pos_idx == (head_idx + 1) % self.cycle_len:
                continue 

            # Check 2: Cycle Raycast
            # Simulate walking from pos -> tail along the cycle.
            # If ANY block is found, this shortcut is unsafe.
            if is_path_clear(pos_idx, tail_idx):
                # Move is safe!
                d_to_food = dist_cycle(pos_idx, food_idx)
                
                # Check 2.1: Is BOOST active?
                if d_to_food < min_dist:
                    min_dist = d_to_food
                    best_shortcut = move
        
        if best_shortcut:
            if self.game.force_shortcut:
                 self.game.ai_status = "Taking Shortcut! (BOOST)"
            else:
                 self.game.ai_status = "Taking Shortcut!"
            return best_shortcut

        # Fallback: STRICT Hamiltonian Cycle
        target_idx = (head_idx + 1) % self.cycle_len
        
        for move, pos in valid_moves:
            if self.cycle.get(pos) == target_idx:
                self.game.ai_status = "Mindmaster Cycle"
                return move
                
        self.game.ai_status = "Emergency Move"
        return valid_moves[0][0]

# --- APP SETUP ---

# Global Declaration AFTER classes
game = SnakeGame()
ai = AIController(game)
tiktok = TikTokManager(game, unique_id="@vladimirwrld1")

# serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def startup_event():
    # Start TikTok task in background
    asyncio.create_task(tiktok.start())

@app.get("/")
async def get():
    return HTMLResponse(open("static/index.html", "r").read())

@app.get("/index.html")
async def get_index():
    return HTMLResponse(open("static/index.html", "r").read())

@app.get("/debug/trigger/{event_type}")
async def debug_trigger(event_type: str):
    if event_type == "gift":
        game.current_effect = "GOLD_RAIN"
        game.hype_level += 50
        print("DEBUG: Triggered GOLD_RAIN")
    elif event_type == "boost":
        game.force_shortcut = True
        print("DEBUG: Triggered BOOST")
    elif event_type == "like":
        game.hype_level += 10
        print("DEBUG: Triggered HYPE")
    return {"status": "triggered", "event": event_type}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if game.game_over:
                await asyncio.sleep(2)
                game.reset()
            
            move = ai.get_next_move()
            game.step(move)
            
            state = game.get_state()
            await websocket.send_json(state)
            
            # Dynamic Speed Control (Slower for visibility)
            delay = 0.06 if state["speed_mode"] == "FAST" else 0.15
            await asyncio.sleep(delay) 
            
    except Exception as e:
        print(f"Connection closed: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
