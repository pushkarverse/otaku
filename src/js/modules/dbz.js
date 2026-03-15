import { MediaPipeHelper } from '../core/mediapipe_helper.js';

export class DBZModule {
    constructor() {
        this.video = document.getElementById('v_src');
        this.canvas = document.getElementById('out');
        this.ctx = this.canvas.getContext('2d');
        this.vEnergy = document.getElementById('v-energy');
        this.vKame = document.getElementById('v-kame');
        this.sfxKame = document.getElementById('sfx-kame');
        this.labelFiring = document.getElementById('state-firing');

        this.currentState = "IDLE";
        this.smoothH = { x: -1, y: -1 };
        this.fireAngle = 0;
        this.smoothFactor = 0.8;
        this.chargeProgress = 0;
        this.fireReadyThreshold = 0.85;

        // Offscreen canvas for chroma key
        this.offscreenCanvas = document.createElement('canvas');
        this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

        this.init();
    }

    init() {
        this.setupMediaPipe();
    }

    setupMediaPipe() {
        this.pose = MediaPipeHelper.initPose({
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        }, (results) => this.onResults(results));

        MediaPipeHelper.initCamera(this.video, async () => {
            await this.pose.send({ image: this.video });
        });
    }

    onResults(results) {
        if (this.canvas.width !== this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.translate(-this.canvas.width, 0);
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);

        let targetState = "IDLE";
        let hx = -1, hy = -1;
        let currentAngle = 0;

        if (results.poseLandmarks) {
            const lm = results.poseLandmarks;
            const leftShoulder = lm[11], rightShoulder = lm[12];
            const leftElbow = lm[13], rightElbow = lm[14];
            const lWrist = lm[15], rWrist = lm[16];
            const lThumb = lm[19], rThumb = lm[20];
            const lPinky = lm[17], rPinky = lm[18];

            if (lWrist.visibility > 0.4 && rWrist.visibility > 0.4) {
                const shDist = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
                const wristDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
                
                const lC = { x: (lWrist.x + lThumb.x + lPinky.x)/3, y: (lWrist.y + lThumb.y + lPinky.y)/3 };
                const rC = { x: (rWrist.x + rThumb.x + rPinky.x)/3, y: (rWrist.y + rThumb.y + rPinky.y)/3 };
                hx = (lC.x + rC.x) / 2 * this.canvas.width;
                hy = (lC.y + rC.y) / 2 * this.canvas.height;

                const bcx = (leftShoulder.x + rightShoulder.x) / 2;
                const bcy = (leftShoulder.y + rightShoulder.y) / 2;
                const dx = hx - bcx * this.canvas.width;
                const dy = hy - bcy * this.canvas.height;
                currentAngle = Math.atan2(dy, dx);

                const isCupped = wristDist < shDist * 0.55;
                const isOpening = wristDist > shDist * 0.85;

                const leftElbowAngle = this.getAngle3D(leftShoulder, leftElbow, lWrist);
                const rightElbowAngle = this.getAngle3D(rightShoulder, rightElbow, rWrist);
                const armsExtended = Math.max(leftElbowAngle, rightElbowAngle) > 115;

                if (isCupped) {
                    targetState = "CHARGING";
                } else if (isOpening || armsExtended) {
                    if (this.currentState === "CHARGING") {
                        const audioProgress = this.sfxKame.currentTime / (this.sfxKame.duration || 1);
                        if (armsExtended || audioProgress > this.fireReadyThreshold) {
                            targetState = "FIRING";
                        } else {
                            targetState = "IDLE";
                        }
                    } else if (this.currentState === "FIRING") {
                        targetState = "FIRING";
                    } else {
                        targetState = "IDLE";
                    }
                } else {
                    targetState = "IDLE";
                }
            }
        }

        this.updateState(targetState, hx, hy, currentAngle);
        this.drawEffects();
        this.ctx.restore();
    }

    getAngle3D(a, b, c) {
        const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
        const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
        const mag2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);
        if (mag1 === 0 || mag2 === 0) return 0;
        let cos = dot / (mag1 * mag2);
        cos = Math.max(-1, Math.min(1, cos));
        return Math.acos(cos) * (180 / Math.PI);
    }

    updateState(targetState, hx, hy, currentAngle) {
        if (targetState === "IDLE") {
            if (this.currentState !== "IDLE") {
                this.currentState = "IDLE";
                this.chargeProgress = 0;
                this.sfxKame.pause();
                this.sfxKame.currentTime = 0;
                this.vEnergy.pause();
                this.vKame.pause();
                this.labelFiring.classList.remove('active');
            }
        } else {
            if (targetState === "CHARGING") {
                if (this.currentState !== "CHARGING") {
                    this.sfxKame.currentTime = 0;
                    this.sfxKame.play().catch(()=>{});
                    this.vEnergy.play().catch(()=>{});
                }
                if (this.sfxKame.duration > 0) {
                    this.chargeProgress = this.sfxKame.currentTime / this.sfxKame.duration;
                }
            } else if (targetState === "FIRING") {
                if (this.currentState !== "FIRING") {
                    this.vKame.currentTime = 0; 
                    this.vKame.play().catch(e => console.error("Video play error:", e));
                    this.labelFiring.classList.add('active');
                }
            }
            this.currentState = targetState;
        }

        if (hx !== -1) {
            if (this.smoothH.x === -1) {
                this.smoothH.x = hx; this.smoothH.y = hy;
                this.fireAngle = currentAngle;
            } else {
                this.smoothH.x = (1 - this.smoothFactor) * this.smoothH.x + this.smoothFactor * hx;
                this.smoothH.y = (1 - this.smoothFactor) * this.smoothH.y + this.smoothFactor * hy;
                let adiff = currentAngle - this.fireAngle;
                while (adiff > Math.PI) adiff -= Math.PI * 2;
                while (adiff < -Math.PI) adiff += Math.PI * 2;
                this.fireAngle += adiff * this.smoothFactor;
            }
        }
    }

    drawEffects() {
        this.ctx.globalCompositeOperation = 'screen';
        if (this.currentState === "CHARGING" && this.smoothH.x !== -1) {
            const size = this.canvas.height * (0.15 + (this.chargeProgress * 0.45));
            this.drawShiningEnergy(this.ctx, this.smoothH.x, this.smoothH.y, size, this.chargeProgress);
        } else if (this.currentState === "FIRING" && this.smoothH.x !== -1) {
            const h = this.canvas.height * 1.2;
            const aspect = (this.vKame.videoWidth || 1) / (this.vKame.videoHeight || 1);
            const w = h * aspect;
            this.ctx.save();
            this.ctx.translate(this.smoothH.x, this.smoothH.y);
            this.ctx.rotate(this.fireAngle);
            const coreSize = this.canvas.height * 0.5;
            this.ctx.save();
            this.ctx.rotate(performance.now() * 0.01);
            this.ctx.drawImage(this.vEnergy, -coreSize/2, -coreSize/2, coreSize, coreSize);
            this.ctx.restore();
            this.ctx.drawImage(this.vKame, -w * 0.05, -h/2, w, h);
            this.ctx.restore();
        }
    }

    drawShiningEnergy(ctx, x, y, size, progress) {
        const time = performance.now() * 0.005;
        ctx.save();
        ctx.translate(x, y);
        
        const auraGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
        auraGrad.addColorStop(0, `rgba(0, 200, 255, ${0.1 * progress})`);
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + time * 0.8;
            const p = (time * 1.8 + i) % 1;
            const dist = size * (3.0 - p * 2.5);
            ctx.strokeStyle = `rgba(180, 245, 255, ${0.7 * (1 - p)})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00eeff";
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
            const cpAngle = angle + 0.8 * (1-p);
            const cpDist = dist * 0.7;
            ctx.quadraticCurveTo(Math.cos(cpAngle) * cpDist, Math.sin(cpAngle) * cpDist, 0, 0);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.7);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 + 0.3 * progress})`);
        coreGrad.addColorStop(0.3, `rgba(0, 238, 255, ${0.5 + 0.5 * progress})`);
        coreGrad.addColorStop(1, 'rgba(0, 238, 255, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
        ctx.fill();

        if (!this.vEnergy.paused) {
            const vSize = size * (0.3 + 0.7 * progress);
            ctx.rotate(-time * 1.2);
            ctx.globalAlpha = 0.5 + 0.5 * progress;
            ctx.drawImage(this.vEnergy, -vSize/2, -vSize/2, vSize, vSize);
        }
        ctx.restore();
    }
}

new DBZModule();
