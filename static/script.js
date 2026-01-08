const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('ai-status');
const overlayEl = document.getElementById('overlay');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');
const hypeValueEl = document.getElementById('hype-value');
const hypeFillEl = document.getElementById('hype-fill');

let ws;
let gameState = null;
let particles = [];
let lastScore = 0;

// --- FIX 1 : Déclaration des variables manquantes ---
let shakeRemaining = 0;
let countdownInterval = null;
// ----------------------------------------------------

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

// --- FIX 2 : Ajout de la fonction helper manquante ---
function triggerScreenShake(frames) {
    shakeRemaining = frames;
}
// ----------------------------------------------------

function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onmessage = (event) => {
        const newState = JSON.parse(event.data);

        // Detect Score Increase
        if (gameState && newState.score > gameState.score) {
            spawnParticles(newState.food[0], newState.food[1], '#ff0055');
            triggerScreenShake(7); // Shake for 7 frames
        }

        // Handle TikTok Effects
        if (newState.tiktok_effect === "GOLD_RAIN") {
            const cx = Math.floor(newState.grid_size[0] / 2);
            const cy = Math.floor(newState.grid_size[1] / 2);
            spawnParticles(cx, cy, '#FFD700', 50); // Massive gold explosion
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

    scoreEl.textContent = `SCORE: ${gameState.score}`;
    statusEl.textContent = `SYSTEM: ${gameState.ai_status}`;

    // Hype Styling
    const hype = gameState.hype || 0;
    if (hype > 0) {
        document.body.style.boxShadow = `inset 0 0 ${Math.min(hype * 2, 100)}px rgba(255, 0, 85, 0.4)`;
    } else {
        document.body.style.boxShadow = 'none';
    }

    // Update Hype HUD
    if (hypeValueEl && hypeFillEl) {
        hypeValueEl.textContent = hype;
        const percentage = Math.min(hype, 100); // Cap at 100% for bar
        hypeFillEl.style.height = `${percentage}%`;

        // Dynamic Glow
        hypeFillEl.style.boxShadow = `0 0 ${percentage / 5}px rgba(255, 255, 255, 0.8)`;
    }

    if (gameState.game_over || gameState.game_won) {
        canvas.style.filter = "blur(10px)";

        let title = "";
        let color = "";
        let shadow = "";

        if (gameState.game_won) {
            title = "SYSTEM TRANSCENDED";
            color = "#ffd700";
            shadow = "0 0 30px #ffd700";
        } else {
            title = "SYSTEM FAILURE";
            color = "#ff0055";
            shadow = "0 0 20px #ff0055";
        }

        if (!countdownInterval) {
            let count = 5;
            overlayEl.classList.add("visible");

            const updateText = () => {
                overlayTextEl.innerHTML = `
                    <div style="font-size: 40px; color: ${color}; text-shadow: ${shadow}">${title}</div>
                    <div style="font-size: 20px; margin-top: 10px; color: #fff;">REBOOT IN ${count}...</div>
                `;
            };

            updateText();
            countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    updateText();
                } else {
                    clearInterval(countdownInterval);
                }
            }, 1000);
        }
    } else {
        canvas.style.filter = "none";
        overlayEl.classList.remove("visible");

        // Clear countdown if game restarts
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }
}

// Helper function to draw and update particles
function drawParticles(ctx) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// --- RENDU GRAPHIQUE ---
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

    // --- FIX 3 : ACTIVATION DU TRAIL (Néon Baveux) ---
    // Au lieu d'effacer, on dessine un voile semi-transparent
    ctx.fillStyle = 'rgba(5, 5, 16, 0.25)'; // Bleu nuit très transparent
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // --------------------------------------------------

    // 3. Grid (Very subtle scanline style grid)
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

    // 5. Food (Neon Orb)
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

        // Shockwave Ring
        const waveTick = (Date.now() % 1200) / 1200; // 0 to 1
        ctx.strokeStyle = `rgba(255, 0, 85, ${1 - waveTick})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy, baseSize + (waveTick * 20), 0, Math.PI * 2);
        ctx.stroke();
    }

    // 6. Snake (Cyberpunk Energy Beam)
    if (gameState.snake.length > 0) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'cyan';

        gameState.snake.forEach((pos, i) => {
            const x = pos[0] * CELL_SIZE;
            const y = pos[1] * CELL_SIZE;

            // Gradient or Rainbow Mode
            if (gameState.hype > 20) {
                // Rainbow Mode
                const hue = (Date.now() / 5 + i * 10) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else {
                // Standard Cyberpunk Gradient: Cyan (#00FFFF) to Violet (#8A2BE2)
                const progress = i / gameState.snake.length;
                const hue = 180 + (progress * 90);
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            }

            // Head is white
            if (i === 0) ctx.fillStyle = '#FFFFFF';

            // Draw Rect with rounded corners
            const pad = 2;
            const size = CELL_SIZE - (pad * 2);
            roundRect(ctx, x + pad, y + pad, size, size, 6);
            ctx.fill();

            // Eyes for Head (Directional)
            if (i === 0 && gameState.snake.length > 1) {
                const next = gameState.snake[1];
                const dx = pos[0] - next[0];
                const dy = pos[1] - next[1];

                ctx.fillStyle = '#000000';
                const eyeSize = 3;
                const cx = x + CELL_SIZE / 2;
                const cy = y + CELL_SIZE / 2;

                let ex1, ey1, ex2, ey2;
                if (dx === 1) { // Right
                    ex1 = cx + 4; ey1 = cy - 4;
                    ex2 = cx + 4; ey2 = cy + 4;
                } else if (dx === -1) { // Left
                    ex1 = cx - 4; ey1 = cy - 4;
                    ex2 = cx - 4; ey2 = cy + 4;
                } else if (dy === 1) { // Down
                    ex1 = cx - 4; ey1 = cy + 4;
                    ex2 = cx + 4; ey2 = cy + 4;
                } else { // Up
                    ex1 = cx - 4; ey1 = cy - 4;
                    ex2 = cx + 4; ey2 = cy - 4;
                }
                ctx.beginPath(); ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2); ctx.fill();
            }
        });
        ctx.shadowBlur = 0;
    }

    // 7. Particles
    drawParticles(ctx);

    ctx.restore(); // Restore transform (Screen Shake)

    // 8. Scanlines Overlay (Static on top)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let y = 0; y < canvas.height; y += 3) {
        ctx.fillRect(0, y, canvas.width, 1);
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

window.addEventListener('resize', resizeCanvas);
connect();
requestAnimationFrame(draw);
