const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('ai-status');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');

let ws;
let gameState = null;
let lastFrameTime = 0;

// Configuration
const CELL_GAP = 2; // Gap between snake segments
let CELL_SIZE = 20;

function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onmessage = (event) => {
        gameState = JSON.parse(event.data);
        updateUI();
    };

    ws.onclose = () => {
        statusEl.textContent = "DISCONNECTED";
        statusEl.style.color = "red";
        setTimeout(connect, 1000); // Reconnect
    };
}

function resizeCanvas() {
    if (!gameState) return;

    // Maintain aspect ratio based on grid
    const aspect = gameState.grid_size[0] / gameState.grid_size[1];
    const maxWidth = window.innerWidth - 40;
    const maxHeight = window.innerHeight - 200; // Leave space for header/footer

    let width = maxWidth;
    let height = width / aspect;

    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
    }

    canvas.width = width;
    canvas.height = height;

    // Update cell size based on canvas width/height
    CELL_SIZE = width / gameState.grid_size[0];
}

function updateUI() {
    if (!gameState) return;

    // Resize if first frame or grid changed
    if (canvas.width === 0 || Math.abs(canvas.width / gameState.grid_size[0] - CELL_SIZE) > 0.1) {
        resizeCanvas();
    }

    scoreEl.textContent = gameState.score;
    // statusEl.textContent = gameState.ai_status; // Too fast changes?

    // Smoother text update
    if (gameState.ai_status !== statusEl.textContent) {
        statusEl.textContent = gameState.ai_status;

        // Color coding
        if (gameState.ai_status === "Targeting Food") statusEl.style.color = "#00ff88";
        else if (gameState.ai_status === "Survival Mode") statusEl.style.color = "#ffaa00";
        else if (gameState.ai_status === "Giving Up") statusEl.style.color = "#ff0055";
        else statusEl.style.color = "#00ccff";
    }

    if (gameState.game_over) {
        overlayTextEl.textContent = "GAME OVER";
        overlayEl.classList.add("visible");
    } else {
        overlayEl.classList.remove("visible");
    }
}

function draw() {
    requestAnimationFrame(draw);

    if (!gameState) return;

    ctx.fillStyle = '#050505'; // Clear with bg color
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Optional, subtle)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let x = 0; x <= gameState.grid_size[0]; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= gameState.grid_size[1]; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(canvas.width, y * CELL_SIZE);
        ctx.stroke();
    }

    // Draw Food
    const fx = gameState.food[0] * CELL_SIZE;
    const fy = gameState.food[1] * CELL_SIZE;
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0055';

    // Pulse effect
    const time = Date.now() / 200;
    const pulse = Math.sin(time) * 2;

    ctx.beginPath();
    ctx.arc(fx + CELL_SIZE / 2, fy + CELL_SIZE / 2, (CELL_SIZE / 2 - 2) + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Planned Path (AI Prediction)
    if (gameState.planned_path && gameState.planned_path.length > 0) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)'; // Faint AI color
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line to indicate "future"

        ctx.beginPath();
        // Start from head
        const headX = gameState.snake[0][0] * CELL_SIZE + CELL_SIZE / 2;
        const headY = gameState.snake[0][1] * CELL_SIZE + CELL_SIZE / 2;
        ctx.moveTo(headX, headY);

        gameState.planned_path.forEach(pos => {
            const px = pos[0] * CELL_SIZE + CELL_SIZE / 2;
            const py = pos[1] * CELL_SIZE + CELL_SIZE / 2;
            ctx.lineTo(px, py);
        });

        ctx.stroke();
        ctx.setLineDash([]); // Reset
    }

    // Draw Snake
    gameState.snake.forEach((segment, index) => {
        const x = segment[0] * CELL_SIZE;
        const y = segment[1] * CELL_SIZE;

        ctx.fillStyle = index === 0 ? '#ffffff' : '#00ff88';

        // Head glow
        if (index === 0) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffffff';
        } else {
            ctx.shadowBlur = 0;
            // Gradient or darkening for tail?
            ctx.globalAlpha = 1 - (index / (gameState.snake.length + 5));
        }

        ctx.fillRect(x + CELL_GAP, y + CELL_GAP, CELL_SIZE - CELL_GAP * 2, CELL_SIZE - CELL_GAP * 2);
        ctx.globalAlpha = 1;
    });
}

// Init
window.addEventListener('resize', resizeCanvas);
connect();
requestAnimationFrame(draw);
