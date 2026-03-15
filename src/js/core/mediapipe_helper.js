/**
 * MediaPipe Helper Utility
 * Standardizes initialization of Camera, Hands, and Pose models.
 */

export class MediaPipeHelper {
    /**
     * Initializes the MediaPipe Camera utility.
     * @param {HTMLVideoElement} videoElement 
     * @param {Function} onFrameCallback 
     * @returns {Promise<Camera>}
     */
    static async initCamera(videoElement, onFrameCallback) {
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await onFrameCallback();
            },
            width: 1280,
            height: 720
        });
        camera.start();
        return camera;
    }

    /**
     * Initializes the MediaPipe Hands model.
     * @param {Object} options 
     * @param {Function} onResults 
     * @returns {Hands}
     */
    static initHands(options, onResults) {
        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
            ...options
        });
        
        hands.onResults(onResults);
        return hands;
    }

    /**
     * Initializes the MediaPipe Pose model.
     * @param {Object} options 
     * @param {Function} onResults 
     * @returns {Pose}
     */
    static initPose(options, onResults) {
        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            ...options
        });

        pose.onResults(onResults);
        return pose;
    }
}
