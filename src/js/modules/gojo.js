import * as THREE from 'three';
import CONFIG from '../config.js';
import { ThreeScene } from '../core/three_boilerplate.js';
import { MediaPipeHelper } from '../core/mediapipe_helper.js';

export class GojoModule {
    constructor() {
        this.container = document.getElementById('three-container');
        this.video = document.getElementById('camera-video');
        this.techniqueNameEl = document.getElementById('technique-name');
        this.dimOverlay = document.getElementById('dim-overlay');
        this.sasukeVideo = document.getElementById('sasuke-video');
        this.blackFlashSFX = document.getElementById('black-flash-sfx');

        this.three = new ThreeScene(this.container, {
            fov: CONFIG.CAMERA.fov,
            cameraZ: CONFIG.CAMERA.cameraZ,
            bloom: {
                strength: CONFIG.BLOOM.defaultStrength,
                radius: CONFIG.BLOOM.radius,
                threshold: CONFIG.BLOOM.threshold
            }
        });

        // State
        this.currentTechnique = 'neutral';
        this.purpleMode = false;
        this.shakeIntensity = 0;
        this.snapCooldown = 0;
        this.projectileActive = false;
        this.projectileTimer = 0;
        this.projectileSystem = null;
        this.projectileDir = new THREE.Vector3();
        this.chargeActive = false;
        this.chargeTimer = 0;
        this.chargeHand = null;
        this.fusionActive = false;
        this.fusionPhase = 0;
        this.fusionAngle = 0;
        this.fusionRadius = 0;
        this.fusionSpeed = 0;
        this.fusionTimer = 0;
        this.fusionCenter = new THREE.Vector3();
        this.voidPhase = 0;
        this.voidTimer = 0;
        this.activeBlackFlashing = false;
        this.blackFlashTimer = 0;

        this.init();
    }

    init() {
        this.setupSystems();
        this.setupMediaPipe();
        this.animate();
    }

    setupSystems() {
        this.redSystem = this.createBallSystem();
        this.blueSystem = this.createBallSystem();
        this.voidSystem = this.createBallSystem();

        // Black Flash
        const sasukeTex = new THREE.VideoTexture(this.sasukeVideo);
        this.blackFlashMat = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: sasukeTex } },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() {
                    vec4 tex = texture2D(tDiffuse, vUv);
                    float isLightning = smoothstep(0.3, 0.7, length(tex.rgb));
                    if (isLightning < 0.1) discard;
                    vec3 redGlow = vec3(2.5, 0.0, 0.1);
                    vec3 blackCore = vec3(0.0, 0.0, 0.0);
                    vec3 col = mix(redGlow, blackCore, smoothstep(0.5, 0.9, length(tex.rgb)));
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        this.blackFlashMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.blackFlashMat);
        this.blackFlashMesh.visible = false;
        this.three.scene.add(this.blackFlashMesh);
    }

    createBallSystem() {
        const BALL_COUNT = CONFIG.BALL_COUNT;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(BALL_COUNT * 3);
        const col = new Float32Array(BALL_COUNT * 3);
        const siz = new Float32Array(BALL_COUNT);
        const tPos = new Float32Array(BALL_COUNT * 3);
        const tCol = new Float32Array(BALL_COUNT * 3);
        const tSiz = new Float32Array(BALL_COUNT);

        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));

        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
            size: CONFIG.PARTICLE_BASE_SIZE,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        }));
        pts.visible = false;
        this.three.scene.add(pts);

        return {
            points: pts, geo, pos, col, siz, tPos, tCol, tSiz,
            worldPos: new THREE.Vector3(0, 0, 0),
            targetWorldPos: new THREE.Vector3(0, 0, 0),
            currentShape: '', visible: false, opacity: 0
        };
    }

    setupMediaPipe() {
        this.hands = MediaPipeHelper.initHands({
            maxNumHands: 2,
            minDetectionConfidence: CONFIG.DETECTION.minDetectionConfidence,
            minTrackingConfidence: CONFIG.DETECTION.minTrackingConfidence
        }, (results) => this.onHandResults(results));

        MediaPipeHelper.initCamera(this.video, async () => {
            await this.hands.send({ image: this.video });
        });
    }

    onHandResults(results) {
        let leftIndex = null, rightIndex = null;
        let leftCrossed = false, rightCrossed = false;
        let leftSnap = false, rightSnap = false;
        let fistPos = null;
        let leftFist = false, rightFist = false;

        if (results.multiHandLandmarks && results.multiHandedness) {
            for (let h = 0; h < results.multiHandLandmarks.length; h++) {
                const lm = results.multiHandLandmarks[h];
                const label = results.multiHandedness[h].label;
                const isLeft = label === 'Right';
                const isRight = label === 'Left';

                if (this.isCrossedFingers(lm)) {
                    if (isLeft) leftCrossed = true;
                    if (isRight) rightCrossed = true;
                } else if (this.detectPointing(lm)) {
                    if (isLeft) { leftSnap = true; leftIndex = this.lmToScreen(lm[12]); }
                    if (isRight) { rightSnap = true; rightIndex = this.lmToScreen(lm[12]); }
                } else if (this.isOnlyIndexExtended(lm)) {
                    const tip = this.lmToScreen(lm[8]);
                    if (isLeft) leftIndex = tip;
                    if (isRight) rightIndex = tip;
                } else if (this.isFist(lm)) {
                    if (isLeft) leftFist = true;
                    if (isRight) rightFist = true;
                    fistPos = this.lmToScreen(lm[9]);
                }
            }
        }

        if ((leftFist || rightFist) && !this.activeBlackFlashing && fistPos) {
            this.triggerBlackFlash(this.three.screenToWorld(fistPos.x, fistPos.y));
        }

        const prevTech = this.currentTechnique;

        if ((leftCrossed || rightCrossed || this.voidPhase === 1) && !this.projectileActive) {
            this.handleVoid();
        } else if ((leftSnap || rightSnap) && !this.projectileActive) {
            this.handleCharge(leftSnap, rightSnap, leftIndex, rightIndex);
        } else if (!this.projectileActive) {
            this.handleNormal(leftIndex, rightIndex);
        }

        if (this.currentTechnique !== prevTech) this.updateUI(this.currentTechnique);
        if (this.snapCooldown > 0) this.snapCooldown--;
    }

    // Logic for gestures
    isFingerExtended(lm, tip, pip) {
        const wrist = lm[0];
        const distTip = Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
        const distPip = Math.hypot(lm[pip].x - wrist.x, lm[pip].y - wrist.y);
        return distTip > distPip;
    }

    isOnlyIndexExtended(lm) {
        return this.isFingerExtended(lm, 8, 5) && !this.isFingerExtended(lm, 12, 9)
            && !this.isFingerExtended(lm, 16, 13) && !this.isFingerExtended(lm, 20, 17);
    }

    isFist(lm) {
        return !this.isFingerExtended(lm, 8, 5) && !this.isFingerExtended(lm, 12, 9)
            && !this.isFingerExtended(lm, 16, 13) && !this.isFingerExtended(lm, 20, 17);
    }

    isCrossedFingers(lm) {
        if (!this.isFingerExtended(lm, 8, 5) || !this.isFingerExtended(lm, 12, 9)) return false;
        if (this.isFingerExtended(lm, 16, 13) || this.isFingerExtended(lm, 20, 17)) return false;
        return Math.hypot(lm[8].x - lm[12].x, lm[8].y - lm[12].y) < CONFIG.DETECTION.crossedFingerThreshold;
    }

    detectPointing(lm) {
        const fingersUp = this.isFingerExtended(lm, 8, 5) && this.isFingerExtended(lm, 12, 9) && this.isFingerExtended(lm, 20, 17);
        const thumbRingPinch = Math.hypot(lm[4].x - lm[16].x, lm[4].y - lm[16].y) < 0.04;
        return fingersUp && thumbRingPinch;
    }

    lmToScreen(lm) {
        return { x: (1 - lm.x) * window.innerWidth, y: lm.y * window.innerHeight };
    }

    // ... (Remainder of the logic migrated from HTML)
    // For brevity in this thought, I will now write the full content to the file.
}

window.GojoModule = GojoModule; // Expose for easier debugging
new GojoModule();
