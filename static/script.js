const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('ai-status');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');

let ws;
let gameState = null;
let particles = [];
let lastScore = 0;

// Configuration
const CELL_GAP = 2;
let CELL_SIZE = 20;

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.vx *= 0.95; // Friction
        this.vy *= 0.95;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onmessage = (event) => {
        const newState = JSON.parse(event.data);

        // Detect Score Increase
        if (gameState && newState.score > gameState.score) {
            spawnParticles(newState.food[0], newState.food[1], '#ff0055');
        }

        gameState = newState;
        updateUI();
    };

    ws.onclose = () => {
        statusEl.textContent = "DISCONNECTED";
        statusEl.style.color = "red";
        setTimeout(connect, 1000);
    };
}

function spawnParticles(gridX, gridY, color) {
    const px = gridX * CELL_SIZE + CELL_SIZE / 2;
    const py = gridY * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(px, py, color));
    }
}

function resizeCanvas() {
    if (!gameState) return;
    const aspect = gameState.grid_size[0] / gameState.grid_size[1];
    const maxWidth = window.innerWidth - 40;
    const maxHeight = window.innerHeight - 200;
    let width = maxWidth;
    let height = width / aspect;
    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
    }
    canvas.width = width;
    canvas.height = height;
    CELL_SIZE = width / gameState.grid_size[0];
}

function updateUI() {
    if (!gameState) return;

    if (canvas.width === 0 || Math.abs(canvas.width / gameState.grid_size[0] - CELL_SIZE) > 0.1) {
        resizeCanvas();
    }

    scoreEl.textContent = gameState.score;

    if (gameState.ai_status !== statusEl.textContent) {
        statusEl.textContent = gameState.ai_status;
        if (gameState.ai_status.includes("Shortcut")) statusEl.style.color = "#00ff88"; // Green
        else if (gameState.ai_status.includes("Cycle")) statusEl.style.color = "#00ccff"; // Blue
        else statusEl.style.color = "#ff0055"; // Red/Warn
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

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
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

    // Planned Path
    if (gameState.planned_path && gameState.planned_path.length > 0) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const headX = gameState.snake[0][0] * CELL_SIZE + CELL_SIZE / 2;
        const headY = gameState.snake[0][1] * CELL_SIZE + CELL_SIZE / 2;
        ctx.moveTo(headX, headY);
        gameState.planned_path.forEach(pos => {
            const px = pos[0] * CELL_SIZE + CELL_SIZE / 2;
            const py = pos[1] * CELL_SIZE + CELL_SIZE / 2;
            ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Food
    const fx = gameState.food[0] * CELL_SIZE;
    const fy = gameState.food[1] * CELL_SIZE;
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0055';
    const pulse = Math.sin(Date.now() / 150) * 3;
    ctx.beginPath();
    ctx.arc(fx + CELL_SIZE / 2, fy + CELL_SIZE / 2, (CELL_SIZE / 2 - 2) + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake with Pulse
    const snakePulse = Math.sin(Date.now() / 200) * 0.2 + 0.8; // 0.6 to 1.0 opacity
    gameState.snake.forEach((segment, index) => {
        const x = segment[0] * CELL_SIZE;
        const y = segment[1] * CELL_SIZE;

        ctx.fillStyle = index === 0 ? '#ffffff' : '#00ff88';

        if (index === 0) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ffffff';
        } else {
            ctx.shadowBlur = 0;
            // Pulsing opacity for body
            ctx.globalAlpha = snakePulse - (index / (gameState.snake.length + 10));
            if (ctx.globalAlpha < 0.2) ctx.globalAlpha = 0.2;
        }

        ctx.fillRect(x + CELL_GAP, y + CELL_GAP, CELL_SIZE - CELL_GAP * 2, CELL_SIZE - CELL_GAP * 2);
        ctx.globalAlpha = 1;
    });

    // Particles
    particles.forEach((p, i) => {
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particles.splice(i, 1);
    });
}

window.addEventListener('resize', resizeCanvas);
connect();
requestAnimationFrame(draw);
