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

        // State and Assets
        this.offscreenCanvas = document.createElement('canvas');
        this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
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

    grabPerson() {
        if (!this.mask) return null;
        const off = document.createElement("canvas");
        off.width = this.cElement.width; off.height = this.cElement.height;
        const tCtx = off.getContext("2d");
        tCtx.drawImage(this.mask, 0, 0, off.width, off.height);
        tCtx.globalCompositeOperation = "source-in";
        tCtx.drawImage(this.vElement, 0, 0, off.width, off.height);
        return off;
    }

    // ... (rest of the helper functions from the original script)
}

new NarutoModule();
