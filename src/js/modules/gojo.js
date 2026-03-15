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
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupSystems() {
        this.redSystem = this.createBallSystem();
        this.blueSystem = this.createBallSystem();
        this.voidSystem = this.createBallSystem();

        // Black Flash Initialization
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

    handleVoid() {
        if (this.voidPhase === 0) {
            this.voidPhase = 1; this.voidTimer = 0;
            this.voidSystem.currentShape = 'warp';
            this.setShape(this.voidSystem, (i) => ({
                p: new THREE.Vector3((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 20),
                c: new THREE.Color(0x00eeff).multiplyScalar(0.4 + Math.random() * 0.6),
                s: 1.0 + Math.random() * 2.5
            }));
            this.voidSystem.worldPos.set(0, 0, 0); 
            this.voidSystem.targetWorldPos.set(0, 0, 0);
            this.voidSystem.visible = true; this.voidSystem.opacity = 1;
        }
        this.currentTechnique = 'void';
        this.redSystem.visible = false; this.blueSystem.visible = false;
        this.purpleMode = false; this.fusionActive = false;
    }

    handleCharge(leftSnap, rightSnap, leftIndex, rightIndex) {
        if (this.snapCooldown > 0) return;
        if (!this.chargeActive) {
            this.chargeActive = true; this.chargeTimer = 0;
            this.chargeHand = leftSnap ? 'left' : 'right';
        }
        this.chargeTimer++;
        this.shakeIntensity = Math.min(2.5, this.chargeTimer / 20);

        const ctrl = leftIndex || rightIndex;
        if (ctrl) {
            const sys = this.chargeHand === 'left' ? this.redSystem : this.blueSystem;
            const wp = this.three.screenToWorld(ctrl.x, ctrl.y);
            sys.targetWorldPos.copy(wp);
            sys.visible = true; sys.opacity = 1;
            if (this.chargeHand === 'left') {
                if (sys.currentShape !== 'red') { this.setShape(sys, this.genRed); sys.currentShape = 'red'; }
            } else {
                if (sys.currentShape !== 'blue') { this.setShape(sys, this.genBlue); sys.currentShape = 'blue'; }
            }
        }

        if (this.chargeTimer > CONFIG.DETECTION.chargeFrames) {
            this.projectileActive = true; this.projectileTimer = 0;
            this.projectileSystem = this.purpleMode ? 'both' : (this.chargeHand === 'left' ? 'red' : 'blue');
            this.projectileDir.set(0, 0, 1);
            if (this.purpleMode) this.purpleMode = false;
            this.chargeActive = false; this.chargeTimer = 0;
            this.snapCooldown = CONFIG.DETECTION.snapCooldownFrames;
        }
    }

    handleNormal(leftIndex, rightIndex) {
        if (this.fusionActive) {
            const mx = (leftIndex?.x + rightIndex?.x) / 2 || leftIndex?.x || rightIndex?.x;
            const my = (leftIndex?.y + rightIndex?.y) / 2 || leftIndex?.y || rightIndex?.y;
            if (mx && my) this.fusionCenter.copy(this.three.screenToWorld(mx, my));
            if (!leftIndex && !rightIndex && this.fusionPhase < 3) {
                this.fusionActive = false; this.fusionPhase = 0; this.currentTechnique = 'neutral';
            }
        } else if (this.purpleMode) {
            const ctrl = leftIndex || rightIndex;
            if (ctrl) {
                const wp = this.three.screenToWorld(ctrl.x, ctrl.y);
                this.redSystem.targetWorldPos.copy(wp); this.blueSystem.targetWorldPos.copy(wp);
                this.redSystem.visible = true; this.redSystem.opacity = 1;
                this.blueSystem.visible = true; this.blueSystem.opacity = 1;
                this.currentTechnique = 'purple';
            } else {
                this.purpleMode = false; this.currentTechnique = 'neutral';
            }
        } else {
            const bothActive = leftIndex && rightIndex;
            if (bothActive) {
                const dist = Math.hypot(leftIndex.x - rightIndex.x, leftIndex.y - rightIndex.y);
                if (dist < CONFIG.PURPLE.fusionDistance && !this.fusionActive) {
                    this.fusionActive = true; this.fusionPhase = 1; this.fusionAngle = 0;
                    this.fusionRadius = CONFIG.FUSION.orbitStartRadius;
                    this.fusionSpeed = CONFIG.FUSION.orbitSpeed;
                    const mx = (leftIndex.x + rightIndex.x) / 2, my = (leftIndex.y + rightIndex.y) / 2;
                    this.fusionCenter.copy(this.three.screenToWorld(mx, my));
                    this.redSystem.visible = true; this.redSystem.opacity = 1;
                    this.blueSystem.visible = true; this.blueSystem.opacity = 1;
                    this.currentTechnique = 'fusing';
                } else if (dist >= CONFIG.PURPLE.fusionDistance) {
                    this.handleIndependent(leftIndex, rightIndex);
                }
            } else {
                this.handleIndependent(leftIndex, rightIndex);
            }
        }

        if (this.currentTechnique !== 'void' && this.voidSystem.visible) {
            this.voidSystem.opacity -= CONFIG.ANIMATION.fadeOutSpeed;
            if (this.voidSystem.opacity <= 0) {
                this.voidSystem.visible = false; this.voidSystem.opacity = 0;
                this.voidPhase = 0; this.voidTimer = 0;
            }
        }
    }

    handleIndependent(leftIndex, rightIndex) {
        if (leftIndex) {
            if (this.redSystem.currentShape !== 'red') { this.setShape(this.redSystem, this.genRed); this.redSystem.currentShape = 'red'; }
            this.redSystem.targetWorldPos.copy(this.three.screenToWorld(leftIndex.x, leftIndex.y));
            this.redSystem.visible = true; this.redSystem.opacity = Math.min(1, this.redSystem.opacity + CONFIG.ANIMATION.fadeInSpeed);
        } else {
            this.redSystem.opacity -= CONFIG.ANIMATION.fadeOutSpeed;
            if (this.redSystem.opacity <= 0) { this.redSystem.visible = false; }
        }

        if (rightIndex) {
            if (this.blueSystem.currentShape !== 'blue') { this.setShape(this.blueSystem, this.genBlue); this.blueSystem.currentShape = 'blue'; }
            this.blueSystem.targetWorldPos.copy(this.three.screenToWorld(rightIndex.x, rightIndex.y));
            this.blueSystem.visible = true; this.blueSystem.opacity = Math.min(1, this.blueSystem.opacity + CONFIG.ANIMATION.fadeInSpeed);
        } else {
            this.blueSystem.opacity -= CONFIG.ANIMATION.fadeOutSpeed;
            if (this.blueSystem.opacity <= 0) { this.blueSystem.visible = false; }
        }

        if (this.redSystem.visible && this.blueSystem.visible) this.currentTechnique = 'both';
        else if (this.redSystem.visible) this.currentTechnique = 'red';
        else if (this.blueSystem.visible) this.currentTechnique = 'blue';
        else this.currentTechnique = 'neutral';
    }

    updateUI(tech) {
        const map = {
            neutral: { text: 'CURSED ENERGY DETECTED', color: '#00eeff' },
            red: { text: 'Φ╡½ ΓÇö CURSED TECHNIQUE REVERSAL: RED', color: '#ff3333' },
            blue: { text: 'ΦÆ╝ ΓÇö CURSED TECHNIQUE Lapse: BLUE', color: '#3388ff' },
            both: { text: 'Φíôσ╝Åσ▒òΘûï ΓÇö DUAL CURSED ENERGY', color: '#aa66ff' },
            fusing: { text: 'ΦÖÜσ╝Å ΓÇö MERGING CURSED ENERGY...', color: '#ff66ff' },
            purple: { text: 'Φîê ΓÇö HOLLOW TECHNIQUE: PURPLE', color: '#bb44ff' },
            void: { text: 'τäíΘçÅτ⌐║σçª ΓÇö DOMAIN EXPANSION: INFINITE VOID', color: '#00eeff' },
        };
        const info = map[tech] || map.neutral;
        this.techniqueNameEl.textContent = info.text;
        this.techniqueNameEl.style.color = info.color;
        this.techniqueNameEl.style.textShadow = `0 0 15px ${info.color}80, 0 0 40px ${info.color}30`;
    }

    triggerBlackFlash(worldPos) {
        this.activeBlackFlashing = true; this.blackFlashTimer = 18;
        this.blackFlashMesh.position.copy(worldPos);
        this.blackFlashMesh.visible = true;
        this.sasukeVideo.currentTime = 0; this.sasukeVideo.play().catch(() => {});
        this.blackFlashSFX.currentTime = 0; this.blackFlashSFX.play().catch(() => {});
        this.shakeIntensity = 5.0;
    }

    updateSystem(sys) {
        sys.points.visible = sys.visible;
        if (!sys.visible && sys.opacity <= 0) return;

        sys.worldPos.lerp(sys.targetWorldPos, CONFIG.ANIMATION.positionLerpSpeed);
        sys.points.position.copy(sys.worldPos);

        const pos = sys.pos, col = sys.col, siz = sys.siz;
        const tP = sys.tPos, tC = sys.tCol, tS = sys.tSiz;
        const fade = Math.max(0, sys.opacity);

        for (let i = 0; i < CONFIG.BALL_COUNT * 3; i++) {
            pos[i] += (tP[i] - pos[i]) * CONFIG.ANIMATION.morphLerpSpeed;
            col[i] += (tC[i] * fade - col[i]) * CONFIG.ANIMATION.morphLerpSpeed;
        }
        for (let i = 0; i < CONFIG.BALL_COUNT; i++) {
            siz[i] += (tS[i] * fade - siz[i]) * CONFIG.ANIMATION.morphLerpSpeed;
        }

        sys.geo.attributes.position.needsUpdate = true;
        sys.geo.attributes.color.needsUpdate = true;
        sys.geo.attributes.size.needsUpdate = true;
    }

    animate() {
        requestAnimationFrame(this.animate);

        if (this.fusionActive) {
            const FC = CONFIG.FUSION;
            if (this.fusionPhase === 1 || this.fusionPhase === 2) {
                this.fusionAngle += this.fusionSpeed;
                this.fusionSpeed *= FC.spiralSpeedUp;
                this.fusionRadius *= FC.spiralShrinkRate;

                if (this.fusionPhase === 1 && this.fusionRadius < FC.orbitStartRadius * 0.7) {
                    this.fusionPhase = 2;
                    this.three.bloomPass.strength = FC.orbitBloom + 1.5;
                    this.shakeIntensity = FC.orbitShake + 0.3;
                }

                const rx = this.fusionCenter.x + Math.cos(this.fusionAngle) * this.fusionRadius;
                const ry = this.fusionCenter.y + Math.sin(this.fusionAngle) * this.fusionRadius;
                const bx = this.fusionCenter.x + Math.cos(this.fusionAngle + Math.PI) * this.fusionRadius;
                const by = this.fusionCenter.y + Math.sin(this.fusionAngle + Math.PI) * this.fusionRadius;

                this.redSystem.worldPos.set(rx, ry, 0); this.redSystem.points.position.set(rx, ry, 0);
                this.blueSystem.worldPos.set(bx, by, 0); this.blueSystem.points.position.set(bx, by, 0);

                if (this.fusionRadius < FC.collisionRadius) {
                    this.fusionPhase = 3; this.fusionTimer = 0;
                    this.three.bloomPass.strength = FC.explosionBloom;
                    this.shakeIntensity = FC.explosionShake;
                    this.setShape(this.redSystem, this.genPurple); this.redSystem.currentShape = 'purple';
                    this.setShape(this.blueSystem, this.genPurple); this.blueSystem.currentShape = 'purple';
                    for (let i = 0; i < CONFIG.BALL_COUNT * 3; i++) {
                        this.redSystem.pos[i] += (Math.random() - 0.5) * FC.explosionScatter;
                        this.blueSystem.pos[i] += (Math.random() - 0.5) * FC.explosionScatter;
                    }
                    this.redSystem.worldPos.copy(this.fusionCenter); this.blueSystem.worldPos.copy(this.fusionCenter);
                }
            } else if (this.fusionPhase === 3) {
                this.fusionTimer++;
                const prg = this.fusionTimer / FC.explosionDuration;
                this.three.bloomPass.strength = FC.explosionBloom + (CONFIG.PURPLE.bloom - FC.explosionBloom) * prg;
                this.shakeIntensity = FC.explosionShake * (1 - prg);
                if (this.fusionTimer >= FC.explosionDuration) {
                    this.fusionActive = false; this.purpleMode = true;
                    this.currentTechnique = 'purple'; this.updateUI('purple');
                }
            }
        }

        if (this.projectileActive) {
            this.projectileTimer++;
            const prg = this.projectileTimer / CONFIG.PROJECTILE.duration;
            const spd = CONFIG.PROJECTILE.speed * (1 + prg * 3);
            if (this.projectileSystem === 'red' || this.projectileSystem === 'both') {
                this.redSystem.worldPos.add(this.projectileDir.clone().multiplyScalar(spd));
                this.redSystem.points.position.copy(this.redSystem.worldPos);
                this.redSystem.points.scale.setScalar(1 + prg * 4);
            }
            if (this.projectileSystem === 'blue' || this.projectileSystem === 'both') {
                this.blueSystem.worldPos.add(this.projectileDir.clone().multiplyScalar(spd));
                this.blueSystem.points.position.copy(this.blueSystem.worldPos);
                this.blueSystem.points.scale.setScalar(1 + prg * 4);
            }
            if (this.projectileTimer > CONFIG.PROJECTILE.duration || this.redSystem.worldPos.z > 80 || this.blueSystem.worldPos.z > 80) {
                this.projectileActive = false;
                this.redSystem.visible = false; this.redSystem.opacity = 0; this.redSystem.points.scale.setScalar(1);
                this.blueSystem.visible = false; this.blueSystem.opacity = 0; this.blueSystem.points.scale.setScalar(1);
                this.currentTechnique = 'neutral'; this.updateUI('neutral');
            }
        }

        this.updateSystem(this.redSystem);
        this.updateSystem(this.blueSystem);
        this.updateSystem(this.voidSystem);

        if (this.activeBlackFlashing) {
            this.blackFlashTimer--;
            if (this.blackFlashTimer <= 0) { this.activeBlackFlashing = false; this.blackFlashMesh.visible = false; }
        }

        if (this.currentTechnique === 'void') {
            if (this.voidPhase === 1) {
                this.voidTimer++;
                const posArr = this.voidSystem.geo.attributes.position.array;
                for (let i = 0; i < CONFIG.BALL_COUNT; i++) {
                    posArr[i * 3] += CONFIG.VOID.warpSpeed;
                    if (posArr[i * 3] > 100) posArr[i * 3] -= 200;
                }
                this.voidSystem.geo.attributes.position.needsUpdate = true;
                if (this.voidTimer > CONFIG.VOID.warpDuration) {
                    this.voidPhase = 2; this.voidTimer = 0;
                    this.setShape(this.voidSystem, this.genVoid); this.voidSystem.currentShape = 'void';
                }
            } else {
                this.voidSystem.points.rotation.z += CONFIG.VOID.rotationZ;
                this.voidSystem.points.rotation.x += CONFIG.VOID.rotationX;
            }
            this.dimOverlay.style.opacity = 0.8;
        } else {
            this.dimOverlay.style.opacity = 0;
        }

        // Bloom and Shake per state
        const bloom = { neutral: CONFIG.BLOOM.defaultStrength, red: CONFIG.RED.bloom, blue: CONFIG.BLUE.bloom, both: 2.0, purple: CONFIG.PURPLE.bloom, void: CONFIG.VOID.bloom };
        const shake = { neutral: 0, red: CONFIG.RED.shake, blue: CONFIG.BLUE.shake, both: 0.2, purple: CONFIG.PURPLE.shake, void: CONFIG.VOID.shake };
        if (!this.fusionActive && !this.projectileActive && !this.activeBlackFlashing) {
            this.three.bloomPass.strength = bloom[this.currentTechnique] || CONFIG.BLOOM.defaultStrength;
            this.shakeIntensity = shake[this.currentTechnique] || 0;
        }

        if (this.shakeIntensity > 0) {
            const s = this.shakeIntensity * CONFIG.ANIMATION.shakeMultiplier;
            this.container.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
        } else {
            this.container.style.transform = '';
        }

        this.three.render();
    }

    setShape(sys, generator) {
        for (let i = 0; i < CONFIG.BALL_COUNT; i++) {
            const { p, c, s } = generator(i);
            sys.tPos[i * 3] = p.x; sys.tPos[i * 3 + 1] = p.y; sys.tPos[i * 3 + 2] = p.z;
            sys.tCol[i * 3] = c.r; sys.tCol[i * 3 + 1] = c.g; sys.tCol[i * 3 + 2] = c.b;
            sys.tSiz[i] = s;
        }
    }

    genRed(i) {
        const phi = Math.acos(-1 + (2 * i) / CONFIG.BALL_COUNT), theta = Math.sqrt(CONFIG.BALL_COUNT * Math.PI) * phi;
        const r = 5.0 + Math.random() * 1.5;
        return {
            p: new THREE.Vector3(r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(phi)),
            c: new THREE.Color(0xff2222).multiplyScalar(0.6 + Math.random() * 0.4),
            s: 1.0 + Math.random() * 2.0
        };
    }

    genBlue(i) {
        const phi = Math.acos(-1 + (2 * i) / CONFIG.BALL_COUNT), theta = Math.sqrt(CONFIG.BALL_COUNT * Math.PI) * phi;
        const r = 4.5 + Math.random() * 1.2;
        return {
            p: new THREE.Vector3(r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(phi)),
            c: new THREE.Color(0x2266ff).multiplyScalar(0.7 + Math.random() * 0.3),
            s: 0.8 + Math.random() * 1.8
        };
    }

    genPurple(i) {
        const phi = Math.acos(-1 + (2 * i) / CONFIG.BALL_COUNT), theta = Math.sqrt(CONFIG.BALL_COUNT * Math.PI) * phi;
        const r = 6.0 + Math.random() * 2.0;
        const isRed = Math.random() > 0.5;
        return {
            p: new THREE.Vector3(r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(phi)),
            c: new THREE.Color(isRed ? 0xff0066 : 0xaa00ff),
            s: 1.5 + Math.random() * 3.0
        };
    }

    genVoid(i) {
        const angle = Math.random() * Math.PI * 2, r = 8 + Math.random() * 12;
        return {
            p: new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, (Math.random() - 0.5) * 5),
            c: new THREE.Color(i % 2 === 0 ? 0x000000 : 0x00eeff),
            s: 2.0 + Math.random() * 4.0
        };
    }

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
}

new GojoModule();
