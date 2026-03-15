import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Three.js Boilerplate Utility
 * Standardizes scene, camera, renderer, and post-processing setup.
 */

export class ThreeScene {
    constructor(container, config = {}) {
        this.container = container;
        this.config = {
            fov: 75,
            cameraZ: 50,
            bloom: { strength: 1.5, radius: 0.4, threshold: 0.85 },
            ...config
        };

        this.init();
    }

    init() {
        // Scene & Camera
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            this.config.fov,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.z = this.config.cameraZ;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 1);
        this.container.appendChild(this.renderer.domElement);

        // Composer & Post-processing
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.config.bloom.strength,
            this.config.bloom.radius,
            this.config.bloom.threshold
        );
        this.composer.addPass(this.bloomPass);

        // Resize handler
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.composer.render();
    }

    /**
     * Converts screen coordinates to world coordinates at Z=0.
     */
    screenToWorld(sx, sy) {
        const fov = this.camera.fov * Math.PI / 180;
        const halfH = this.camera.position.z * Math.tan(fov / 2);
        const halfW = halfH * this.camera.aspect;
        return new THREE.Vector3(
            ((sx / window.innerWidth) - 0.5) * 2 * halfW,
            -((sy / window.innerHeight) - 0.5) * 2 * halfH,
            0
        );
    }
}
