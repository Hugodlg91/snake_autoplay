import asyncio
import random
import heapq
from enum import Enum
from typing import List, Tuple, Dict
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

# Game Constants
GRID_WIDTH = 20
GRID_HEIGHT = 30
CELL_SIZE = 20
FPS = 30 # Faster for Mindmaster

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
        self.ai_status = "Initializing..."

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

        # Basic Wall/Self Collision (Redundant if AI is perfect, but good safety)
        if (new_head in self.snake and new_head != self.snake[-1]) or \
           not (0 <= new_head[0] < GRID_WIDTH) or \
           not (0 <= new_head[1] < GRID_HEIGHT):
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
            "planned_path": getattr(ai, 'current_path', []) 
        }

# --- HAMILTONIAN CYCLE GENERATOR ---
class HamiltonianGenerator:
    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.cycle_map = {} # (x,y) -> index
        self.generate()

    def generate(self):
        # Prim's Algorithm on a meta-grid (half resolution) ensuring coverage
        # Meta grid size
        mw, mh = self.w // 2, self.h // 2
        
        # Directions for meta-grid
        dirs = [(0, -1), (0, 1), (-1, 0), (1, 0)]
        
        # MST on meta-grid
        # (mx, my) matches to neighbors
        walls = set() # Walls between meta-cells? No, just track edges.
        # Actually, simpler: track visited meta-cells and carve paths.
        
        start_node = (0, 0)
        visited = {start_node}
        edges = []
        
        def add_edges(node):
            mx, my = node
            for dx, dy in dirs:
                nx, ny = mx + dx, my + dy
                if 0 <= nx < mw and 0 <= ny < mh and (nx, ny) not in visited:
                    heapq.heappush(edges, (random.random(), node, (nx, ny)))

        add_edges(start_node)
        
        meta_adjacency = {} # (mx, my) -> list of neighbors in MST
        
        while edges and len(visited) < mw * mh:
            _, u, v = heapq.heappop(edges)
            if v not in visited:
                visited.add(v)
                add_edges(v)
                # Add connection
                if u not in meta_adjacency: meta_adjacency[u] = []
                if v not in meta_adjacency: meta_adjacency[v] = []
                meta_adjacency[u].append(v)
                meta_adjacency[v].append(u)

        # Now traverse the MST to build the cycle
        # We perform a "wall-hugging" traversal around the tree
        # 2x2 blocks for each meta-cell.
        # This is a bit complex to implement from scratch in one go properly.
        # Alternative: Backtracking is easier for small 20x30 but might be slow?
        # 20x30 = 600 nodes. Backtracking fits but is risky.
        # Let's stick to the spanning tree expansion which is O(N).
        
        # The path construction from MST:
        # Each node (x,y) in MST becomes a 2x2 block in real grid.
        # 0 1
        # 3 2  <-- order within block
        # We enter the block from parent direction and exit to child.
        # Actually, standard "maze solving" around the walls of the spanning tree.
        
        self.path = self._expand_mst_to_cycle(meta_adjacency, mw, mh)
        
        # Map path to indices
        for idx, pos in enumerate(self.path):
            self.cycle_map[pos] = idx

    def _expand_mst_to_cycle(self, adj, mw, mh):
        # We start at (0,0) meta-cell.
        # Sub-cells are: TL(0,0), TR(1,0), BR(1,1), BL(0,1) relative to top-left of block
        # Real coordinates: x*2, y*2 
        
        # A simpler way to conceive the cycle on MST:
        # The cycle encloses the spanning tree.
        # Trace the perimeter of the spanning tree.
        
        path = []
        
        # Recursive DFS to trace
        # We need to know which "sub-cell" we are in.
        # Let's verify a simpler robust method:
        # Start at (0,0). Move along the wall on the left.
        # Since it's a grid graph, we can just follow the outline.
        
        # Let's use a standard implementation adaptation:
        # https://en.wikipedia.org/wiki/Maze_generation_algorithm
        
        # Or, just a hardcoded Long ZigZag for 100% reliability right now?
        # User asked for "Mindmaster".
        # Let's use the ZigZag because it's a VALID Hamiltonian Cycle and guarantees 100% success.
        # It's less "random" but perfectly functional for "Invincible".
        # Randomized Prim is better, but failure to implement perfectly leads to broken cycle.
        # I will implement a robust ZigZag cycle which IS a Hamiltonian Cycle.
        
        # ZigZag Pattern:
        # Row 0: 0->W-1
        # Row 1: W-1->1
        # Row 2: 1->W-1
        # ...
        # Last Row: W-1->0
        # Column 0: Down to last row?
        
        # Grid 20x30. Even width.
        # 0,0 -> 19,0. 
        # 19,1 -> 1,1
        # 1,2 -> 19,2
        # ...
        # 19,29 -> 0,29
        # 0,29 -> 0,1 -> 0,0
        
        # Wait, simple loop:
        # Down column 0 from y=0 to y=H-1.
        # Then zigzag covering columns 1..W-1.
        
        p = []
        # Down Col 0
        for y in range(self.h):
            p.append((0, y))
            
        # Then zigzag the rest
        # Col 1 Up (starting at y=H-1 because we ended at 0,H-1)
        # Wait, ended at 0, H-1.
        # Next is 1, H-1.
        
        x = 1
        y = self.h - 1
        heading_up = True
        
        while x < self.w:
            p.append((x, y))
            if heading_up:
                if y > 0:
                    y -= 1
                else:
                    x += 1 # Switch col at top
                    heading_up = False
            else:
                if y < self.h - 1:
                    y += 1
                else:
                    x += 1 # Switch col at bottom
                    heading_up = True
                    
        # Verify: Ends at (W-1, 0) ?
        # If W is 20: 
        # Col 0: ends 0, 29.
        # Col 1: Up to 1, 0. Turn -> 2,0.
        # Col 2: Down to 2, 29. Turn -> 3,29.
        # Col 3: Up...
        # ...
        # Col 19 (Odd index for 0-based): Up to 19, 0.
        # From 19, 0 -> neighbor (0,0) is available?
        # Yes, 19,0 is adj to 18,0 and ... wait, 0,0 is far.
        # We need to loop back to 0,0.
        # The loop starts at 0,0 -> 0,1 ... 0,29.
        # Ideally we want to end at 1,0 or something adjacent to 0,0.
        
        # My Path:
        # (0,0)->(0,29) -> (1,29)->(1,0) -> (2,0)->(2,29) ... -> (19, 0).
        # (19,0) is far from (0,0). Neighbors of 0,0 are 0,1 and 1,0.
        # 0,1 is index 1. 1,0 is index ~60. 
        
        # Better ZigZag:
        # Loop: (0,0) -> (1,0) -> ... (19,0) -> (19,1) -> (1,1) -> (1,2) -> (19,2) ...
        # Cover all rows except Col 0 (except 0,0).
        # Finally go down Col 0 to close loop.
        
        p = []
        # 1. Top row right (1 to W-1)
        for c in range(1, self.w):
            p.append((c, 0))
            
        # 2. ZigZag down for remaining rows
        for r in range(1, self.h):
            if r % 2 == 1: # Odd row: Right to Left (W-1 to 1)
                for c in range(self.w - 1, 0, -1):
                    p.append((c, r))
            else: # Even row: Left to Right (1 to W-1)
                for c in range(1, self.w):
                    p.append((c, r))
                    
        # 3. Up Col 0 (from H-1 to 0)
        for r in range(self.h - 1, -1, -1):
            p.append((0, r))
            
        return p # (0,0) is at end, wraps to start (1,0) at index 0. Perfect.

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
        
        self.current_path = []

        # Current index on cycle
        head_idx = self.cycle[head]
        tail_idx = self.cycle[tail]
        food_idx = self.cycle[food]
        
        # Calculate distance on cycle
        def dist_cycle(a_idx, b_idx):
            if b_idx >= a_idx:
                return b_idx - a_idx
            else:
                return b_idx - a_idx + self.cycle_len

        # Shortcut Logic
        # Try all 4 neighbors
        best_move = None
        min_dist_to_food = dist_cycle(head_idx, food_idx)
        
        # Valid moves (Physical)
        valid_moves = []
        for d in Direction:
            nx, ny = head[0] + d.value[0], head[1] + d.value[1]
            if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                n_pos = (nx, ny)
                # Check not body collision (except tail if valid)
                # Note: Tail will move, so we CAN move into tail pos technically if we don't eat.
                # But safer to just treat snake body as wall.
                if n_pos not in snake[:-1]: 
                    valid_moves.append((d, n_pos))
        
        # Find Shortcuts
        safe_moves = []
        
        for move, pos in valid_moves:
            pos_idx = self.cycle[pos]
            
            # Condition 1: Respect Cycle Order (Don't jump OVER tail)
            # Distance from NewPos to Tail must be enough to fit the snake.
            d_head_tail = dist_cycle(pos_idx, tail_idx)
            
            # Snake length
            # If we eat, length + 1. If not, length same.
            # Space needed = current_length.
            # Wait, d_head_tail is empty space.
            # If we move to pos, we occupy pos. The tail is at tail_idx.
            # The body occupies 'length' cells "behind" the head in cycle order?
            # No, body occupies specific cells.
            # We just need to ensure that if we follow the cycle from Pos, we won't hit the tail.
            # In a static snapshot, the body is on the cycle.
            # If we jump, skipping valid cycle nodes, those skipped nodes are implicitly "empty" now?
            # Yes. But the body segments are still physically blocking.
            # But we already checked physical collision.
            
            # The Danger: We effectively cut the cycle loop smaller.
            # New loop size = d_head_tail.
            # We need New Loop Size > Snake Length.
            # Actually, we need to ensure that the tail moves out of the way fast enough.
            # Since tail moves 1 step per turn along cycle, and we move 1 step per turn along cycle (after shortcut),
            # we just need to ensure we don't catch up.
            # Catch up condition: dist(Head, Tail) <= Margin.
            
            margin = 3 # Safety buffer
            future_len = len(snake) 
            if pos == food: future_len += 1
            
            if d_head_tail > future_len + margin:
                # Safe Shortcut!
                # Does it get us closer to food?
                d_food = dist_cycle(pos_idx, food_idx)
                
                # We want to minimize distance to food
                if d_food < min_dist_to_food:
                    min_dist_to_food = d_food
                    best_move = move
                    self.game.ai_status = "Taking Shortcut!"
        
        if best_move:
            return best_move

        # Fallback: Follow Cycle (Next numerical index)
        # This is strictly 100% safe if we started safely.
        target_idx = (head_idx + 1) % self.cycle_len
        
        # Find which neighbor corresponds to target_idx
        for move, pos in valid_moves:
            if self.cycle[pos] == target_idx:
                self.game.ai_status = "Mindmaster Cycle"
                return move
                
        # Metric Panic (Should not happen unless boxed in physically which shouldn't happen on cycle)
        self.game.ai_status = "PANIC"
        return Direction.UP

# --- APP SETUP ---

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
                await asyncio.sleep(2)
                game.reset()
            
            move = ai.get_next_move()
            game.step(move)
            
            await websocket.send_json(game.get_state())
            await asyncio.sleep(1/FPS) 
            
    except Exception as e:
        print(f"Connection closed: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
