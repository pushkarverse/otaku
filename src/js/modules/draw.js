import { MediaPipeHelper } from '../core/mediapipe_helper.js';

export class DrawModule {
    constructor() {
        this.canvas = document.getElementById('draw-canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.pCanvas = document.getElementById('particle-canvas');
        this.pCtx = this.pCanvas.getContext('2d');
        this.video = document.getElementById('video-src');
        this.info = document.getElementById('current-info');
        this.preview = document.getElementById('brush-preview');
        this.sizeTag = document.getElementById('size-indicator');

        // State
        this.mode = 'draw';
        this.brushColor = '#00ffcc';
        this.brushSize = 15;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.sX = -1;
        this.sY = -1;
        this.lerpFactor = 0.5;
        this.PINCH_START = 0.065;
        this.PINCH_STOP = 0.11;

        // History
        this.history = [];
        this.redoStack = [];
        this.maxHistory = 20;

        // Particles
        this.particles = [];

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupMediaPipe();
        this.animateParticles();
        this.setupShortcuts();
        
        // Expose globally for HTML handlers
        window.setMode = (m, color, btn) => this.setMode(m, color, btn);
        window.undo = () => this.undo();
        window.redo = () => this.redo();
        window.clearCanvas = () => this.clearCanvas();
        window.saveImage = () => this.saveImage();
    }

    resize() {
        const oldData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.pCanvas.width = this.canvas.width;
        this.pCanvas.height = this.canvas.height;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.putImageData(oldData, 0, 0);
    }

    setupMediaPipe() {
        this.hands = MediaPipeHelper.initHands({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.75,
            minTrackingConfidence: 0.75
        }, (results) => this.onResults(results));

        MediaPipeHelper.initCamera(this.video, async () => {
            await this.hands.send({ image: this.video });
        });
    }

    onResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const tip = landmarks[8];
            const thumb = landmarks[4];
            
            const rawDist = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);
            const threshold = this.isDrawing ? this.PINCH_STOP : this.PINCH_START;
            const isPinching = rawDist < threshold;

            const targetX = (1 - tip.x) * this.canvas.width;
            const targetY = tip.y * this.canvas.height;
            
            if (this.sX === -1) { this.sX = targetX; this.sY = targetY; }
            this.sX += (targetX - this.sX) * this.lerpFactor;
            this.sY += (targetY - this.sY) * this.lerpFactor;

            this.updatePreview();

            if (isPinching) {
                if (!this.isDrawing) {
                    this.saveState();
                    this.isDrawing = true;
                    this.lastX = this.sX;
                    this.lastY = this.sY;
                } else {
                    this.draw();
                }
            } else {
                this.isDrawing = false;
            }
        } else {
            this.isDrawing = false;
            this.preview.style.display = 'none';
        }
    }

    draw() {
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(this.sX, this.sY);
        
        if (this.mode === 'draw') {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.brushColor;
            this.ctx.lineWidth = this.brushSize;
            this.ctx.shadowBlur = this.brushSize / 2;
            this.ctx.shadowColor = this.brushColor;
            if (Math.random() > 0.4) {
                this.particles.push(new Particle(this.sX, this.sY, this.brushColor));
            }
        } else {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = this.brushSize * 2.5;
            this.ctx.shadowBlur = 0;
        }
        
        this.ctx.stroke();
        this.lastX = this.sX;
        this.lastY = this.sY;
    }

    updatePreview() {
        this.preview.style.left = `${this.sX}px`;
        this.preview.style.top = `${this.sY}px`;
        this.preview.style.width = `${this.brushSize}px`;
        this.preview.style.height = `${this.brushSize}px`;
        this.preview.style.display = 'block';
        this.sizeTag.innerText = `BRUSH: ${Math.round(this.brushSize)}px`;
    }

    setMode(m, color, btn) {
        this.mode = m;
        if (color) this.brushColor = color;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (this.mode === 'draw') {
            this.info.innerText = `CHAKRA: ${this.brushColor.toUpperCase()}`;
            this.info.style.color = this.brushColor;
            this.preview.style.borderColor = this.brushColor;
            this.preview.style.backgroundColor = 'transparent';
        } else {
            this.info.innerText = `ERASER ACTIVE`;
            this.info.style.color = '#fff';
            this.preview.style.borderColor = 'white';
            this.preview.style.backgroundColor = 'rgba(255,255,255,0.2)';
        }
    }

    saveState() {
        if (this.history.length >= this.maxHistory) this.history.shift();
        this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
        this.redoStack.length = 0;
    }

    undo() {
        if (this.history.length > 0) {
            this.redoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
            const state = this.history.pop();
            this.ctx.putImageData(state, 0, 0);
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
            const state = this.redoStack.pop();
            this.ctx.putImageData(state, 0, 0);
        }
    }

    clearCanvas() {
        this.saveState();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    saveImage() {
        const link = document.createElement('a');
        link.download = 'chakra-masterpiece.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }

    setupShortcuts() {
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'z') this.undo();
            if (e.ctrlKey && e.key === 'y') this.redo();
        });
    }

    animateParticles() {
        this.pCtx.clearRect(0, 0, this.pCanvas.width, this.pCanvas.height);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.life <= 0) this.particles.splice(i, 1);
            else p.draw(this.pCtx);
        }
        requestAnimationFrame(() => this.animateParticles());
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

new DrawModule();
