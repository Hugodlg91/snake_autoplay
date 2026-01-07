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

        // Handle TikTok Effects
        if (newState.tiktok_effect === "GOLD_RAIN") {
            const cx = Math.floor(newState.grid_size[0] / 2);
            const cy = Math.floor(newState.grid_size[1] / 2);
            spawnParticles(cx, cy, '#FFD700', 50); // Massive gold explosion
            // Optional: Floating text could be added here
        }

        // Update Hype Visuals
        const hype = newState.hype || 0;
        if (hype > 10) {
            document.body.style.boxShadow = `inset 0 0 ${Math.min(hype, 100)}px rgba(255, 0, 85, 0.2)`;
        } else {
            document.body.style.boxShadow = 'none';
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
        overlayTextEl.style.color = "#ff0055";
        overlayTextEl.style.textShadow = "0 0 20px #ff0055";
        overlayEl.classList.add("visible");
    } else if (gameState.game_won) {
        overlayTextEl.textContent = "PERFECT GAME";
        overlayTextEl.style.color = "#ffd700"; // Gold
        overlayTextEl.style.textShadow = "0 0 30px #ffd700, 0 0 60px #ffaa00";
        overlayEl.classList.add("visible");

        // Victory Particles
        if (Math.random() < 0.1) {
            spawnParticles(Math.floor(gameState.grid_size[0] / 2), Math.floor(gameState.grid_size[1] / 2), '#ffd700');
        }
    } else {
        overlayEl.classList.remove("visible");
    }
}

function draw() {
    requestAnimationFrame(draw);
    if (!gameState) return;

    // A. TRAIL EFFECT (Background with alpha)
    ctx.fillStyle = 'rgba(5, 5, 12, 0.25)'; // Dark Blue-ish Black with transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid (Subtle)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    // Optimize grid drawing? Maybe static canvas? For now keep dynamic for trail effect interaction.
    // Actually grid doesn't need to trail, but redrawing it excessively is fine.
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

    // B. PLANNED PATH (Hacker Style)
    if (gameState.planned_path && gameState.planned_path.length > 0) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 1;
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
    }

    // C. FOOD (Pulsing Orbs)
    if (gameState.food) {
        const fx = gameState.food[0] * CELL_SIZE + CELL_SIZE / 2;
        const fy = gameState.food[1] * CELL_SIZE + CELL_SIZE / 2;

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#FF00FF'; // Magenta Glow

        const time = Date.now() / 200;
        const pulse = Math.sin(time) * 3;
        const size = (CELL_SIZE / 2 - 4) + pulse;

        // Inner Orb
        ctx.fillStyle = '#FF00FF';
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0, size), 0, Math.PI * 2);
        ctx.fill();

        // Shockwave Ring
        const waveSize = (Date.now() % 1000) / 1000 * CELL_SIZE * 1.5;
        const waveAlpha = 1 - ((Date.now() % 1000) / 1000);
        ctx.strokeStyle = `rgba(255, 0, 255, ${waveAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy, waveSize, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0; // Reset
    }

    // D. SNAKE (Neon Gradient)
    if (gameState.snake.length > 0) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'cyan';

        // Gradient for body
        // Creating a gradient based on the snake's bounding box might be tricky for a winding snake.
        // Instead, interpolate color per segment.

        gameState.snake.forEach((pos, i) => {
            const x = pos[0] * CELL_SIZE;
            const y = pos[1] * CELL_SIZE;

            // Color Interpolation: Cyan (Head) -> Purple (Tail)
            const progress = i / gameState.snake.length;
            // Simple interpolation logic could be optimized, but let's use HSL
            // Head: 180 (Cyan), Tail: 260 (Purple)
            const hue = 180 + (progress * 80);
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

            // Draw Rounded Rect
            const r = CELL_SIZE / 4;
            ctx.beginPath();
            // Check if roundRect is supported, fallback to fillRect if not
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, r);
            } else {
                ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
            ctx.fill();

            // Head Eyes
            if (i === 0) {
                ctx.fillStyle = '#000'; // Black eyes
                // Basic direction check (compare with 2nd segment)
                let dx = 0, dy = 0;
                if (gameState.snake.length > 1) {
                    dx = gameState.snake[0][0] - gameState.snake[1][0];
                    dy = gameState.snake[0][1] - gameState.snake[1][1];
                }

                const eyeOffset = CELL_SIZE / 4;
                const eyeSize = 3;

                /* Logic for eyes placement based on dx, dy */
                // Simplified: Just draw center pupil for now to look robotic
                ctx.beginPath();
                ctx.arc(x + CELL_SIZE / 2 + dx * 4, y + CELL_SIZE / 2 + dy * 4, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.shadowBlur = 0;
    }

    // F. SCANLINES (Overlay)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let i = 0; i < canvas.height; i += 4) {
        ctx.fillRect(0, i, canvas.width, 1);
    }

    // E. PARTICLES
    particles.forEach((p, i) => {
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particles.splice(i, 1);
    });
}

window.addEventListener('resize', resizeCanvas);
connect();
requestAnimationFrame(draw);
