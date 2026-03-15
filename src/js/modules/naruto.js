import { MediaPipeHelper } from '../core/mediapipe_helper.js';

export class NarutoModule {
    constructor() {
        this.vElement = document.getElementById('v_src');
        this.cElement = document.getElementById('out');
        this.ctx = this.cElement.getContext('2d', { willReadFrequently: true });
        this.n = document.getElementById('n');
        this.s = document.getElementById('s');
        this.sfxN = document.getElementById('sfx-n');
        this.sfxS = document.getElementById('sfx-s');
        this.sfxClone = document.getElementById('sfx-clone');
        
        this.uiLeft = document.getElementById('jutsu-left');
        this.uiRight = document.getElementById('jutsu-right');
        this.uiCenter = document.getElementById('jutsu-center');

        // State
        this.mask = null;
        this.pwr = [0, 0];
        this.activePower = [null, null];
        this.wasActive = [false, false];
        this.clonesTriggered = false;
        this.cloneStartTime = null;
        this.activeSmokes = [];
        this.customClones = [
            { x: -100, y: 100, scale: 0.9, delay: 2800, smokeSpawned: false },
            { x: 120, y: 100, scale: 0.85, delay: 2950, smokeSpawned: false },
            { x: -180, y: 140, scale: 0.8, delay: 3100, smokeSpawned: false },
            { x: 180, y: 160, scale: 0.7, delay: 3250, smokeSpawned: false },
            { x: -250, y: 140, scale: 0.7, delay: 3400, smokeSpawned: false },
            { x: 260, y: 160, scale: 0.65, delay: 3550, smokeSpawned: false },
        ];

        this.SMOKE_FOLDERS = ["smoke_1", "smoke_2", "smoke_3"];
        this.SMOKE_FRAME_COUNT = 5;
        this.SMOKE_DURATION = 600;

        // Initialize persistent offscreen canvases
        this.offscreenCanvas = document.createElement('canvas');
        this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.tempPersonCanvas = document.createElement("canvas");
        this.tempPersonCtx = this.tempPersonCanvas.getContext("2d");

        this.init();
    }

    async init() {
        this.setupMediaPipe();
    }

    setupMediaPipe() {
        // This module uses SelfieSegmentation and Holistic specifically
        this.selfie = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
        this.selfie.setOptions({ modelSelection: 1 });
        this.selfie.onResults(r => this.mask = r.segmentationMask);

        this.holistic = new Holistic({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
        this.holistic.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        this.holistic.onResults(res => this.onResults(res));

        const cam = new Camera(this.vElement, { 
            onFrame: async () => { 
                await this.selfie.send({ image: this.vElement }); 
                await this.holistic.send({ image: this.vElement }); 
            }, 
            width: 1280, 
            height: 720 
        });
        cam.start();
    }

    onResults(res) {
        if (this.cElement.width !== this.vElement.videoWidth) { 
            this.cElement.width = this.vElement.videoWidth; 
            this.cElement.height = this.vElement.videoHeight; 
        }
        
        this.ctx.save(); 
        this.ctx.clearRect(0, 0, this.cElement.width, this.cElement.height);
        this.ctx.drawImage(this.vElement, 0, 0, this.cElement.width, this.cElement.height);
        
        const person = this.grabPerson();
        
        // Gesture Logic for Shadow Clone
        if (!this.clonesTriggered && res.leftHandLandmarks && res.rightHandLandmarks) {
            const gL = this.checkGestures(res.leftHandLandmarks), gR = this.checkGestures(res.rightHandLandmarks);
            if (gL === "PEACE" && gR === "PEACE") {
                const dL = {x: res.leftHandLandmarks[8].x-res.leftHandLandmarks[5].x, y: res.leftHandLandmarks[8].y-res.leftHandLandmarks[5].y};
                const dR = {x: res.rightHandLandmarks[8].x-res.rightHandLandmarks[5].x, y: res.rightHandLandmarks[8].y-res.rightHandLandmarks[5].y};
                const dot = Math.abs(dL.x*dR.x + dL.y*dR.y) / (Math.hypot(dL.x,dL.y)*Math.hypot(dR.x,dR.y));
                if (dot < 0.75) this.triggerShadowClone();
            }
        }

        if (this.clonesTriggered) {
            const now = performance.now();
            this.customClones.forEach(cl => {
                if (!cl.smokeSpawned && now - this.cloneStartTime >= cl.delay) {
                    cl.smokeSpawned = true; 
                    this.spawnSmoke(this.cElement.width/2 + cl.x, this.cElement.height/2 + cl.y - 120, cl.scale);
                }
            });
            this.drawClones(person); 
            this.drawSmokes();
        } else if (person) { 
            this.ctx.drawImage(person, 0, 0); 
        }
        
        this.handleJutsus(res);
        this.ctx.restore();
    }

    handleJutsus(res) {
        // Detect Combined Jutsu state before hand loop
        let isCombinedJutsu = false;
        let combinedCenter = null;
        if (res.leftHandLandmarks && res.rightHandLandmarks) {
            const gL = this.checkGestures(res.leftHandLandmarks), gR = this.checkGestures(res.rightHandLandmarks);
            const dist = Math.hypot(res.leftHandLandmarks[0].x - res.rightHandLandmarks[0].x, res.leftHandLandmarks[0].y - res.rightHandLandmarks[0].y);
            if (dist < 0.15 && gL !== "OPEN" && gR !== "OPEN" && gL !== "PEACE" && gR !== "PEACE") {
                isCombinedJutsu = true;
                combinedCenter = {
                    x: (res.leftHandLandmarks[0].x + res.rightHandLandmarks[0].x) / 2 * this.cElement.width,
                    y: (res.leftHandLandmarks[0].y + res.rightHandLandmarks[0].y) / 2 * this.cElement.height - 100
                };
            }
        }

        // Reset audio if hands are LOST
        [0, 1].forEach(idx => {
            const lm = (idx === 0) ? res.leftHandLandmarks : res.rightHandLandmarks;
            if (!lm && this.wasActive[idx]) {
                const sfx = this.activePower[idx] === this.n ? this.sfxN : this.sfxS;
                if (sfx) { sfx.pause(); sfx.currentTime = 0; }
                this.wasActive[idx] = false;
            }
        });

        const hands = [];
        if (res.leftHandLandmarks) hands.push({pts: res.leftHandLandmarks, isR: false});
        if (res.rightHandLandmarks) hands.push({pts: res.rightHandLandmarks, isR: true});

        hands.forEach(h => {
            const idx = h.isR ? 1 : 0;
            this.drawFingerSkeleton(h.pts);

            const g = this.checkGestures(h.pts);
            let targetPower = null;

            if (g === "OPEN") {
                targetPower = h.isR ? this.n : this.s;
                this.activePower[idx] = targetPower;
                this.pwr[idx] = Math.min(1, this.pwr[idx] + 0.08);
            } else if (isCombinedJutsu) {
                if (!this.activePower[idx]) this.activePower[idx] = h.isR ? this.n : this.s;
                targetPower = this.activePower[idx];
                this.pwr[idx] = Math.min(1, this.pwr[idx] + 0.05); 
            } else if (g === "CLOSED") {
                this.pwr[idx] = 0;
                if (this.activePower[idx]) {
                    const sfx = this.activePower[idx] === this.n ? this.sfxN : this.sfxS;
                    if (sfx) { sfx.pause(); sfx.currentTime = 0; }
                }
            } else {
                this.pwr[idx] = Math.max(0, this.pwr[idx] - 0.12);
            }

            if (targetPower && !this.wasActive[idx]) {
                targetPower.currentTime = 0; 
                try { targetPower.play(); } catch(e){}
                const sfx = targetPower === this.n ? this.sfxN : this.sfxS;
                if (sfx) { sfx.currentTime = 0; try { sfx.play(); } catch(e){} }
            } else if (!targetPower && this.wasActive[idx]) {
                 const sfx = this.activePower[idx] === this.n ? this.sfxN : this.sfxS;
                 if (sfx) { sfx.pause(); sfx.currentTime = 0; }
            }
            this.wasActive[idx] = !!targetPower;

            if (this.pwr[idx] > 0.01 && this.activePower[idx]) {
                if (isCombinedJutsu) {
                    if (idx === 1) {
                        this.ctx.save();
                        this.ctx.shadowBlur = 50;
                        this.ctx.shadowColor = (performance.now() % 400 < 200) ? "#00ffff" : "#0044ff";
                        const combinedPwr = Math.max(this.pwr[0], this.pwr[1]);
                        this.processChromaKey(this.n, combinedCenter.x, combinedCenter.y, 1600 * combinedPwr, 0.9);
                        this.processChromaKey(this.s, combinedCenter.x, combinedCenter.y, 2400 * combinedPwr, 0.75);
                        this.ctx.restore();
                    }
                } else {
                    const x = (h.pts[0].x+h.pts[9].x)/2*this.cElement.width, y = ((h.pts[0].y+h.pts[9].y)/2-0.25)*this.cElement.height;
                    const w = (this.activePower[idx] === this.s ? 2200 : 1400) * this.pwr[idx];
                    this.processChromaKey(this.activePower[idx], x, y, w, this.pwr[idx]);
                }
            }
        });

        this.updateUI(isCombinedJutsu, res);
    }

    updateUI(isCombinedJutsu, res) {
        if (isCombinedJutsu && this.pwr[0] > 0.01 && this.pwr[1] > 0.01) {
            const kanji = this.uiCenter.querySelector('.kanji');
            const romaji = this.uiCenter.querySelector('.romaji');
            kanji.innerText = '融合・螺旋千鳥手裏剣';
            romaji.innerText = 'RASEN CHIDORI SHURIKEN';
            kanji.style.textShadow = '0 0 25px rgba(0, 255, 255, 0.9), 0 0 50px rgba(0, 100, 255, 0.6)';
            romaji.style.textShadow = '0 0 15px rgba(0, 255, 255, 0.8)';
            this.uiCenter.classList.add('active');
            this.uiLeft.classList.remove('active');
            this.uiRight.classList.remove('active');
        } else {
            if (this.clonesTriggered) {
                this.uiCenter.classList.add('active');
            } else {
                this.uiCenter.classList.remove('active');
            }
            
            if (this.activePower[0] === this.s && this.pwr[0] > 0.01 && res.leftHandLandmarks && this.checkGestures(res.leftHandLandmarks) === "OPEN") {
                this.uiLeft.classList.add('active');
            } else {
                this.uiLeft.classList.remove('active');
            }

            if (this.activePower[1] === this.n && this.pwr[1] > 0.01 && res.rightHandLandmarks && this.checkGestures(res.rightHandLandmarks) === "OPEN") {
                this.uiRight.classList.add('active');
            } else {
                this.uiRight.classList.remove('active');
            }
        }
    }

    grabPerson() {
        if (!this.mask) return null;
        this.tempPersonCanvas.width = this.cElement.width;
        this.tempPersonCanvas.height = this.cElement.height;
        
        this.tempPersonCtx.clearRect(0, 0, this.tempPersonCanvas.width, this.tempPersonCanvas.height);
        this.tempPersonCtx.drawImage(this.mask, 0, 0, this.tempPersonCanvas.width, this.tempPersonCanvas.height);
        this.tempPersonCtx.globalCompositeOperation = "source-in";
        this.tempPersonCtx.drawImage(this.vElement, 0, 0, this.tempPersonCanvas.width, this.tempPersonCanvas.height);
        return this.tempPersonCanvas;
    }

    spawnSmoke(x, y, scale) {
        scale *= 1.2;
        const folder = this.SMOKE_FOLDERS[Math.floor(Math.random() * this.SMOKE_FOLDERS.length)];
        const frames = [];
        for (let i = 1; i <= this.SMOKE_FRAME_COUNT; i++) {
            const img = new Image();
            img.src = `assets/${folder}/${i}.png`;
            frames.push(img);
        }
        this.activeSmokes.push({ x, y, scale, start: performance.now(), frames });
    }

    drawSmokes() {
        const now = performance.now();
        for (let i = this.activeSmokes.length - 1; i >= 0; i--) {
            const sm = this.activeSmokes[i];
            const elapsed = now - sm.start;
            const fIndex = Math.floor(elapsed / (this.SMOKE_DURATION / this.SMOKE_FRAME_COUNT));
            if (fIndex >= sm.frames.length) { this.activeSmokes.splice(i, 1); continue; }
            const img = sm.frames[fIndex];
            this.ctx.save();
            this.ctx.translate(sm.x, sm.y);
            this.ctx.scale(sm.scale, sm.scale);
            if (img.complete) {
                this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
            }
            this.ctx.restore();
        }
    }

    drawClones(person) {
        if (!person) return;
        const now = performance.now();
        [...this.customClones].sort((a,b) => b.delay - a.delay).forEach(cl => {
            if (now - this.cloneStartTime >= cl.delay) {
                this.ctx.save();
                this.ctx.translate(this.cElement.width/2 + cl.x, this.cElement.height/2 + cl.y - 120);
                this.ctx.scale(cl.scale, cl.scale);
                this.ctx.drawImage(person, -this.cElement.width/2, -this.cElement.height/2);
                this.ctx.restore();
            }
        });
        this.ctx.drawImage(person, 0, 0);
    }

    processChromaKey(video, x, y, width, opacity) {
        if (!video || video.videoWidth === 0) return;
        const aspect = video.videoHeight / video.videoWidth;
        const height = width * aspect;

        if (this.offscreenCanvas.width !== video.videoWidth || this.offscreenCanvas.height !== video.videoHeight) {
            this.offscreenCanvas.width = video.videoWidth;
            this.offscreenCanvas.height = video.videoHeight;
        }

        this.offCtx.drawImage(video, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        const frame = this.offCtx.getImageData(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        const l = frame.data.length / 4;

        for (let i = 0; i < l; i++) {
            let r = frame.data[i * 4 + 0], g = frame.data[i * 4 + 1], b = frame.data[i * 4 + 2];
            if (g > 80 && g > r * 1.3 && g > b * 1.3) {
                frame.data[i * 4 + 3] = 0;
            }
        }
        this.offCtx.putImageData(frame, 0, 0);

        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.translate(x, y);
        this.ctx.scale(-1, 1); 
        this.ctx.drawImage(this.offscreenCanvas, -width / 2, -height / 2, width, height);
        this.ctx.restore();
    }

    checkGestures(pts) {
        if (!pts) return null;
        const wrist = pts[0];
        const tips = [4, 8, 12, 16, 20]; 
        const joints = [2, 6, 10, 14, 18]; 
        
        const isOpen = tips.map((t, i) => {
            const tipDist = Math.hypot(pts[t].x - wrist.x, pts[t].y - wrist.y);
            const jointDist = Math.hypot(pts[joints[i]].x - wrist.x, pts[joints[i]].y - wrist.y);
            return tipDist > jointDist * 1.25;
        });

        if (isOpen.every(v => v)) return "OPEN";
        const index = isOpen[1], middle = isOpen[2], ring = isOpen[3], pinky = isOpen[4];
        if (index && !middle && !ring && !pinky) return "POINTING";
        if (index && middle && !ring && !pinky) return "PEACE";
        if (isOpen.every(v => !v)) return "CLOSED";
        return null;
    }

    drawFingerSkeleton(lm) {
        this.ctx.save();
        this.ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = "#00ff00";

        const connections = [[0,1,2,3,4], [0,5,6,7,8], [0,9,10,11,12], [0,13,14,15,16], [0,17,18,19,20]];
        connections.forEach(conn => {
            this.ctx.beginPath();
            conn.forEach((i, idx) => {
                const x = lm[i].x * this.cElement.width, y = lm[i].y * this.cElement.height;
                if (idx === 0) this.ctx.moveTo(x,y); else this.ctx.lineTo(x,y);
            });
            this.ctx.stroke();
        });

        lm.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x * this.cElement.width, p.y * this.cElement.height, 5, 0, Math.PI*2);
            this.ctx.fillStyle = "red";
            this.ctx.fill();
        });
        this.ctx.restore();
    }

    triggerShadowClone() {
        if (this.clonesTriggered) return;
        this.clonesTriggered = true; this.cloneStartTime = performance.now();
        if (this.sfxClone) try { this.sfxClone.play(); } catch(e){}
        
        const kanji = this.uiCenter.querySelector('.kanji');
        const romaji = this.uiCenter.querySelector('.romaji');
        kanji.innerText = '影分身の術'; romaji.innerText = 'KAGE BUNSHIN NO JUTSU';
        kanji.style.textShadow = '0 0 15px rgba(255, 150, 0, 0.8), 0 0 30px rgba(255, 100, 0, 0.5)';
        romaji.style.textShadow = '0 0 10px rgba(255, 150, 0, 0.8)';
        this.uiCenter.classList.add('active');

        this.ctx.save(); this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; this.ctx.fillRect(0, 0, this.cElement.width, this.cElement.height); this.ctx.restore();
        
        setTimeout(() => {
            this.clonesTriggered = false; this.customClones.forEach(cl => cl.smokeSpawned = false);
            this.uiCenter.classList.remove('active'); 
        }, 8000);
    }
}

new NarutoModule();
