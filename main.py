import asyncio
import random
import heapq
from enum import Enum
from typing import List, Tuple, Optional
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

# Game Constants
GRID_WIDTH = 20
GRID_HEIGHT = 30  # Taller for mobile/portrait
CELL_SIZE = 20
FPS = 15  # Game tick rate

class Direction(Enum):
    UP = (0, -1)
    DOWN = (0, 1)
    LEFT = (-1, 0)
    RIGHT = (1, 0)

class SnakeGame:
    def __init__(self):
        self.reset()
    
    def reset(self):
        self.snake: List[Tuple[int, int]] = [(GRID_WIDTH // 2, GRID_HEIGHT // 2)]
        self.direction = Direction.UP
        self.food: Tuple[int, int] = self._spawn_food()
        self.score = 0
        self.game_over = False
        self.ai_status = "Thinking..."

    def _spawn_food(self) -> Tuple[int, int]:
        while True:
            pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
            if pos not in self.snake:
                return pos

    def step(self, next_move: Direction):
        if self.game_over:
            return

        head_x, head_y = self.snake[0]
        dx, dy = next_move.value
        new_head = (head_x + dx, head_y + dy)

        # Collision Check
        if (new_head in self.snake or 
            new_head[0] < 0 or new_head[0] >= GRID_WIDTH or 
            new_head[1] < 0 or new_head[1] >= GRID_HEIGHT):
            self.game_over = True
            return

        self.snake.insert(0, new_head)
        
        if new_head == self.food:
            self.score += 1
            self.food = self._spawn_food()
        else:
            self.snake.pop()

    def get_state(self):
        return {
            "snake": self.snake,
            "food": self.food,
            "score": self.score,
            "game_over": self.game_over,
            "grid_size": (GRID_WIDTH, GRID_HEIGHT),
            "ai_status": self.ai_status,
            "planned_path": getattr(ai, 'current_path', [])  # Send the path AI is thinking about
        }

# AI Controller
class AIController:
    def __init__(self, game: SnakeGame):
        self.game = game
        self.current_path = []

    def get_next_move(self) -> Direction:
        grid_width, grid_height = GRID_WIDTH, GRID_HEIGHT
        snake = self.game.snake[:] # Copy needed?
        head = snake[0]
        food = self.game.food
        
        self.current_path = [] # Reset for visualization

        # --- HELPERS ---
        def get_neighbors(pos):
            neighbors = []
            for d in Direction:
                nx, ny = pos[0] + d.value[0], pos[1] + d.value[1]
                if 0 <= nx < grid_width and 0 <= ny < grid_height:
                    neighbors.append((nx, ny))
            return neighbors
            
        def bfs_path(start, target, obstacles) -> Optional[List[Tuple[int, int]]]:
            # Simple BFS for shortest path
            q = [(start, [start])]
            visited = {start}
            obstacles_set = set(obstacles)
            
            # Optimization: If target is in obstacles (e.g. tail), allow it
            
            while q:
                current, path = q.pop(0)
                if current == target:
                    return path[1:]
                
                for neighbor in get_neighbors(current):
                    if neighbor not in visited:
                        if neighbor not in obstacles_set or neighbor == target:
                            visited.add(neighbor)
                            q.append((neighbor, path + [neighbor]))
            return None

        def get_longest_path_to_tail(start, tail, obstacles):
            # DFS or A* with inverted heuristic to find a long path
            # For speed in Python, we'll try a greedy approach or randomized DFS
            # A simple robust way: extend the path by zig-zagging? 
            # Let's use a BFS to find ANY path to tail, then try to make it longer?
            # Or just use the BFS path to tail. It's usually safe enough to just follow the tail.
            # Ideally, we want to fill space.
            return bfs_path(start, tail, obstacles)

        # --- STRATEGY ---
        
        # 1. Can we reach Food?
        path_to_food = bfs_path(head, food, snake)
        
        if path_to_food:
            # 2. SAFETY CHECK: If we follow this path, will we be stuck?
            # Simulate the state after eating
            virtual_snake = list(snake)
            
            # Move virtual snake along the path
            for step in path_to_food:
                virtual_snake.insert(0, step) # Move head
                # We assume we eat at the end, so we DON'T pop locally for movement
                # But wait, we only grow when we hit food.
                # Actually, standard simulation:
                pass
            
            # Correct Simulation:
            # The body follows the head.
            # If path length is L, and we don't eat, tail moves L steps.
            # If we eat at the end, tail moves L steps (since we grow 1).
            # Wait, if we eat, length increases by 1.
            
            # Simplified Simulation:
            # Construct the snake body AS IT WILL BE when head is at food.
            # Path: [p1, p2, ... food]
            # New Head = food.
            # New Body ...
            
            # Let's just simulate step-by-step to be safe
            sim_snake = list(snake)
            for step in path_to_food:
                sim_snake.insert(0, step) 
                if step == food:
                    # Grow, don't pop
                    pass
                else:
                    sim_snake.pop()
            
            # Now, from this new state (Head at Food), can we reach the NEW Tail?
            new_head = sim_snake[0]
            new_tail = sim_snake[-1]
            
            # Check path from new_head to new_tail
            # Body acts as obstacle (excluding tail for the pathfinding target)
            if bfs_path(new_head, new_tail, sim_snake[:-1]):
                # SAFE!
                self.game.ai_status = "Targeting Food (Safe)"
                self.current_path = path_to_food
                return self._get_dir(head, path_to_food[0])
            else:
                self.game.ai_status = "Food is Trap! Stalling..."
        
        # 3. Fallback: Food is unsafe or unreachable. Follow Tail.
        tail = snake[-1]
        path_to_tail = bfs_path(head, tail, snake[:-1])
        
        if path_to_tail:
            self.game.ai_status = "Following Tail"
            # We visualize the path to tail 
            self.current_path = path_to_tail
            return self._get_dir(head, path_to_tail[0])
            
        # 4. Last Resort: Maximum Space
        self.game.ai_status = "Survival Panic"
        best_move = Direction.UP
        max_space = -1
        
        # Check all valid moves
        valid_neighbors = []
        for d in Direction:
            nx, ny = head[0] + d.value[0], head[1] + d.value[1]
            if 0 <= nx < grid_width and 0 <= ny < grid_height and (nx, ny) not in snake:
                valid_neighbors.append(((nx, ny), d))
        
        if not valid_neighbors:
            return Direction.UP # Dead
            
        for pos, move in valid_neighbors:
            space = self._flood_fill(pos, snake)
            if space > max_space:
                max_space = space
                best_move = move
                
        return best_move

    def _get_dir(self, start, end) -> Direction:
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        for d in Direction:
            if d.value == (dx, dy):
                return d
        return Direction.UP

    def _flood_fill(self, start, obstacles):
        q = [start]
        visited = {start}
        obs_set = set(obstacles)
        count = 0
        while q:
            curr = q.pop(0)
            count += 1
            for d in Direction:
                nx, ny = curr[0] + d.value[0], curr[1] + d.value[1]
                if (0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT and 
                    (nx, ny) not in obs_set and (nx, ny) not in visited):
                    visited.add((nx, ny))
                    q.append((nx, ny))
        return count

# Global Game Instance
game = SnakeGame()
ai = AIController(game)

# serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    return HTMLResponse(open("static/index.html", "r").read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if game.game_over:
                await asyncio.sleep(2) # Show death for a bit
                game.reset()
            
            # AI Move
            move = ai.get_next_move()
            game.step(move)
            
            # Send State
            await websocket.send_json(game.get_state())
            
            # Loop delay
            await asyncio.sleep(1/FPS)
    except Exception as e:
        print(f"Connection closed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
