const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('ai-status');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');
const overlaySubtextEl = document.getElementById('overlay-subtext');

// Hype Elements (Robust Lookup)
const hypeFill = document.getElementById('hype-fill');
const hypeValue = document.getElementById('hype-value');

let ws;
let gameState = null;
let particles = [];
let shakeRemaining = 0;
let countdownInterval = null;

// Configuration
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
        this.vx *= 0.95;
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

function triggerScreenShake(frames) {
    shakeRemaining = frames;
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onmessage = (event) => {
        const newState = JSON.parse(event.data);

        // Detect Score Increase
        if (gameState && newState.score > gameState.score) {
            spawnParticles(newState.food[0], newState.food[1], '#ff0055');
            triggerScreenShake(7);
        }

        // TikTok Effects
        if (newState.tiktok_effect === "GOLD_RAIN") {
            const cx = Math.floor(newState.grid_size[0] / 2);
            const cy = Math.floor(newState.grid_size[1] / 2);
            spawnParticles(cx, cy, '#FFD700', 50);
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

function spawnParticles(gridX, gridY, color, count = 15) {
    const px = gridX * CELL_SIZE + CELL_SIZE / 2;
    const py = gridY * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(px, py, color));
    }
}

function resizeCanvas() {
    if (!gameState) return;
    const aspect = gameState.grid_size[0] / gameState.grid_size[1];
    const maxWidth = window.innerWidth - 100; // Leave space for HUD
    const maxHeight = window.innerHeight - 100;

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

    // Score & Status
    if (scoreEl) scoreEl.textContent = `SCORE: ${gameState.score}`;
    if (statusEl) statusEl.textContent = `SYSTEM: ${gameState.ai_status}`;

    // Hype HUD (Robust Check)
    if (hypeFill && hypeValue) {
        const hypePct = Math.min(gameState.hype || 0, 100);
        hypeFill.style.height = `${hypePct}%`;
        hypeValue.textContent = `${hypePct}%`;

        // Dynamic Glow
        hypeFill.style.boxShadow = `0 0 ${hypePct / 5}px rgba(255, 255, 255, 0.8)`;
    }

    // Game Over / Victory Logic
    if (gameState.game_over || gameState.game_won) {
        canvas.style.filter = "blur(10px)";

        let title = gameState.game_won ? "SYSTEM TRANSCENDED" : "SYSTEM FAILURE";
        let color = gameState.game_won ? "#ffd700" : "#ff0055";
        let shadow = gameState.game_won ? "0 0 30px #ffd700" : "0 0 20px #ff0055";

        overlayEl.classList.add("visible");
        overlayTextEl.textContent = title;
        overlayTextEl.style.color = color;
        overlayTextEl.style.textShadow = shadow;

        if (!countdownInterval) {
            let count = 5;
            overlaySubtextEl.textContent = `REBOOT IN ${count}...`;

            countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    overlaySubtextEl.textContent = `REBOOT IN ${count}...`;
                } else {
                    clearInterval(countdownInterval);
                }
            }, 1000);
        }
    } else {
        canvas.style.filter = "none";
        overlayEl.classList.remove("visible");

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }
}

function draw() {
    requestAnimationFrame(draw);
    if (!gameState) return;

    // 1. Clear / Trail
    ctx.fillStyle = 'rgba(5, 5, 16, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Screen Shake
    ctx.save();
    if (shakeRemaining > 0) {
        const dx = (Math.random() - 0.5) * 10;
        const dy = (Math.random() - 0.5) * 10;
        ctx.translate(dx, dy);
        shakeRemaining--;
    }

    // 3. Grid
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= gameState.grid_size[0]; x++) {
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, canvas.height);
    }
    for (let y = 0; y <= gameState.grid_size[1]; y++) {
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(canvas.width, y * CELL_SIZE);
    }
    ctx.stroke();

    // 4. Food
    if (gameState.food) {
        const fx = gameState.food[0] * CELL_SIZE + CELL_SIZE / 2;
        const fy = gameState.food[1] * CELL_SIZE + CELL_SIZE / 2;
        const pulse = Math.sin(Date.now() / 150) * 2;
        const baseSize = CELL_SIZE / 2 - 2;

        ctx.shadowBlur = 25;
        ctx.shadowColor = '#FF0055';
        ctx.fillStyle = '#FF0055';

        ctx.beginPath();
        ctx.arc(fx, fy, baseSize + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // 5. Snake (Rainbow Mode Check)
    if (gameState.snake.length > 0) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'cyan';

        gameState.snake.forEach((pos, i) => {
            const x = pos[0] * CELL_SIZE;
            const y = pos[1] * CELL_SIZE;

            // COLOR LOGIC
            if ((gameState.hype || 0) > 20) {
                // RAINBOW MODE
                const hue = (Date.now() / 5 + i * 10) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else {
                // CLASSIC CYBERPUNK
                const progress = i / gameState.snake.length;
                const hue = 180 + (progress * 90);
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            }

            if (i === 0) ctx.fillStyle = '#FFFFFF'; // Head always white

            // Draw Rect
            roundRect(ctx, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 6);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }

    // 6. Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particles.splice(i, 1);
    }

    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

window.addEventListener('resize', resizeCanvas);
connect();
requestAnimationFrame(draw);
