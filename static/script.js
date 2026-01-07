const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("ai-status");
const overlayEl = document.getElementById("overlay");
const overlayTextEl = document.getElementById("overlay-text");

let ws = null;
let gameState = null;
let particles = [];
let shakeRemaining = 0; // Fixed: Defined variable

// Canvas Resizing to fit container
function resizeCanvas() {
    const container = document.getElementById("game-container");
    const rect = container.getBoundingClientRect();
    // Make canvas match container size (minus borders)
    canvas.width = rect.width;
    canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial call

// Helper to trigger shake
function triggerScreenShake(frames) {
    shakeRemaining = frames;
}

const CELL_SIZE = 24.8; // Approximate based on 500px / 20 cols (adjusted dynamically if needed)

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2; // Explosive velocity
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
        this.color = color;
        this.friction = 0.92; // Slow down over time
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10 * this.life;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3 * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

function spawnParticles(gridX, gridY, color, count = 20) {
    const px = gridX * CELL_SIZE + CELL_SIZE / 2;
    const py = gridY * CELL_SIZE + CELL_SIZE / 2;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(px, py, color));
    }
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onopen = () => {
        console.log("Connected to Snake Logic Server");
    };

    ws.onmessage = (event) => {
        const newState = JSON.parse(event.data);

        // Detect Score Increase
        if (gameState && newState.score > gameState.score) {
            spawnParticles(newState.food[0], newState.food[1], '#ff0055');
            triggerScreenShake(7);
        }

        // Handle TikTok Effects
        if (newState.tiktok_effect === "GOLD_RAIN") {
            // Spawn massive gold particles
            for (let i = 0; i < 5; i++) {
                spawnParticles(
                    Math.floor(Math.random() * 20),
                    Math.floor(Math.random() * 30),
                    '#FFD700',
                    10
                );
            }
        }

        gameState = newState;
        updateUI();
    };

    ws.onclose = () => {
        console.log("Disconnected. Reconnecting...");
        setTimeout(connect, 1000);
    };
}

function updateUI() {
    if (!gameState) return;
    scoreEl.textContent = `SCORE: ${gameState.score}`;
    statusEl.textContent = `SYSTEM: ${gameState.ai_status}`;

    // Hype Styling
    const hype = gameState.hype || 0;
    if (hype > 0) {
        document.body.style.boxShadow = `inset 0 0 ${Math.min(hype * 2, 100)}px rgba(255, 0, 85, 0.4)`;
    } else {
        document.body.style.boxShadow = 'none';
    }

    if (gameState.game_over) {
        overlayTextEl.textContent = "SYSTEM FAILURE";
        overlayTextEl.style.color = "#ff0055";
        overlayTextEl.style.textShadow = "0 0 20px #ff0055";
        overlayEl.classList.add("visible");
    } else if (gameState.game_won) {
        overlayTextEl.textContent = "SYSTEM TRANSCENDED";
        overlayTextEl.style.color = "#ffd700";
        overlayTextEl.style.textShadow = "0 0 30px #ffd700";
        overlayEl.classList.add("visible");
    } else {
        overlayEl.classList.remove("visible");
    }
}

// Helper: Custom Round Rect
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

function draw() {
    requestAnimationFrame(draw);
    if (!gameState) return;

    // 1. Screen Shake Transform
    ctx.save();
    if (shakeRemaining > 0) {
        const dx = (Math.random() - 0.5) * 10;
        const dy = (Math.random() - 0.5) * 10;
        ctx.translate(dx, dy);
        shakeRemaining--;
    }

    // 2. Trail Effect (Cyberpunk Vibe)
    // Instead of clearRect, we draw a semi-transparent dark rect to create trails
    ctx.fillStyle = 'rgba(5, 5, 16, 0.2)'; // Dark Blue-ish Black with transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 3. Grid (Neon)
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

    // 4. Planned Path
    if (gameState.planned_path && gameState.planned_path.length > 0) {
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Start from head
        const head = gameState.snake[0];
        ctx.moveTo(head[0] * CELL_SIZE + CELL_SIZE / 2, head[1] * CELL_SIZE + CELL_SIZE / 2);
        gameState.planned_path.forEach(pos => {
            ctx.lineTo(pos[0] * CELL_SIZE + CELL_SIZE / 2, pos[1] * CELL_SIZE + CELL_SIZE / 2);
        });
        ctx.stroke();
    }

    // 5. Food (Pulsing Neon Orb)
    if (gameState.food) {
        const fx = gameState.food[0] * CELL_SIZE + CELL_SIZE / 2;
        const fy = gameState.food[1] * CELL_SIZE + CELL_SIZE / 2;

        const pulse = Math.sin(Date.now() / 150) * 2;
        const baseSize = CELL_SIZE / 2 - 2;

        ctx.shadowBlur = 25;
        ctx.shadowColor = '#FF0055';
        ctx.fillStyle = '#FF0055';

        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0, baseSize + pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Shockwave Ring
        const waveTick = (Date.now() % 1200) / 1200; // 0 to 1
        ctx.strokeStyle = `rgba(255, 0, 85, ${1 - waveTick})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy, baseSize + (waveTick * 20), 0, Math.PI * 2);
        ctx.stroke();
    }

    // 6. Snake (Cyberpunk Gradient)
    if (gameState.snake.length > 0) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'cyan';

        gameState.snake.forEach((pos, i) => {
            const x = pos[0] * CELL_SIZE;
            const y = pos[1] * CELL_SIZE;

            // Gradient: Cyan (#00FFFF) to Violet (#8A2BE2)
            const progress = i / gameState.snake.length;
            const hue = 180 + (progress * 90);
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

            // Head is White
            if (i === 0) ctx.fillStyle = '#FFFFFF';

            // Draw Rect with rounded corners
            const pad = 2;
            const size = CELL_SIZE - (pad * 2);
            roundRect(ctx, x + pad, y + pad, size, size, 6);
            ctx.fill();

            // Eyes for Head
            if (i === 0 && gameState.snake.length > 1) {
                const next = gameState.snake[1];
                const dx = pos[0] - next[0];
                const dy = pos[1] - next[1];

                ctx.fillStyle = '#000000';
                const eyeSize = 3;
                const cx = x + CELL_SIZE / 2;
                const cy = y + CELL_SIZE / 2;

                let ex1, ey1, ex2, ey2;
                if (dx === 1) { ex1 = cx + 4; ey1 = cy - 4; ex2 = cx + 4; ey2 = cy + 4; }
                else if (dx === -1) { ex1 = cx - 4; ey1 = cy - 4; ex2 = cx - 4; ey2 = cy + 4; }
                else if (dy === 1) { ex1 = cx - 4; ey1 = cy + 4; ex2 = cx + 4; ey2 = cy + 4; }
                else { ex1 = cx - 4; ey1 = cy - 4; ex2 = cx + 4; ey2 = cy - 4; }

                ctx.beginPath(); ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2); ctx.fill();
            }
        });
        ctx.shadowBlur = 0;
    }

    // 7. Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    ctx.restore(); // Restore shake

    // 8. Scanlines (Overlay)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < canvas.height; y += 3) {
        ctx.fillRect(0, y, canvas.width, 1);
    }
}

connect();
