<div align="center">

# 🌊 OTAKU: Anime Technique Visualizer

**OTAKU** — A high-performance, modular motion-tracking platform that brings your favorite anime techniques to life through the web.  
Powered by **MediaPipe**, **Three.js**, and **pnpm**.



</div>

## ✨ Project Modules & Techniques

This project features several specialized modules, each using advanced hand/pose tracking to trigger unique visual and audio effects.

### 🤞 Gojo Satoru — JJK Module
*Trigger techniques using precise hand gestures.*

| Technique | Trigger | Visuals |
| :--- | :--- | :--- |
| **🔴 RED (赫)** | Extend **Left Index Finger** | White-hot core, red lightning, repulsive force. |
| **🔵 BLUE (蒼)** | Extend **Right Index Finger** | Electric blue vortex, attractive force. |
| **🟣 PURPLE (茈)** | **Fuse:** Bring Index Fingers together<br>**Fire:** Snap/Charge | Massive purple sphere of ultimate destruction. |
| **🌌 UNLIMITED VOID** | **Cross Fingers** (Index + Middle) | Hyperspace streaks → Black hole accretion disk. |

### 🍥 Naruto — Shinobi Module
*Channel chakra and perform jutsu with hand signs.*

| Jutsu | Gesture | Details |
| :--- | :--- | :--- |
| **🌀 RASENGAN** | **Right Hand Open** | Swirling chakra sphere with custom audio. |
| **⚡ CHIDORI** | **Left Hand Open** | Lightning blade effect with high-voltage sound. |
| **👥 SHADOW CLONE** | **Parallel Peace Signs** | Spawns multiple physical clones with smoke effects. |
| **🎇 RASEN CHIDORI** | **Clasp Hands Together** | Combined elemental attack with massive bloom. |

### 🐉 Dragon Ball Z — Saiyan Module
*Hone your Ki and master the legendary Kamehameha.*

- **CHARGE**: Bring hands together in a cupped position. Watch the Ki gather.
- **FIRE**: Thrust arms forward and open hands to unleash the beam.
- *Includes dynamic camera shake and iconic audio cues.*

### 🎨 Free Draw — Creative Module
*Paint the canvas using your fingertips.*

- **👌 PINCH TO DRAW**: Touch Thumb and Index finger to start sketching.
- **✨ CHAKRA BRUSH**: Multi-colored glowing strokes with particle trails.
- **🛠️ TOOLS**: Undo/Redo support, Clear, and PNG Save functionality.

## 🏗️ Project Structure

The project follows a clean, modular architecture:

```text
/
├── assets/           (Global media: sounds, textures, videos)
├── src/
│   ├── css/          (Modular stylesheets)
│   ├── js/
│   │   ├── core/     (Shared logic: MediaPipe/Three.js utilities)
│   │   ├── modules/  (Feature-specific logic)
│   │   └── config.js (Centralized configuration)
├── index.html        (Landing Page / Technique Selector)
├── gojo.html         (JJK Module Entry)
├── naruto.html       (Shinobi Module Entry)
├── dbz.html          (Saiyan Module Entry)
└── draw.html         (Creative Module Entry)
```

## 🛠️ Installation & Usage

1.  **Clone & Enter**
    ```bash
    git clone https://github.com/pushkarverse/otaku.git
    cd otaku
    ```

2. **Run Locally**
    *   Simply run the following command to start a local development server:
        ```bash
        pnpm start
        ```
    *   Then open your browser to `http://localhost:8080` (or the port shown in your terminal).

## ⚙️ Configuration

Customization is available in `src/js/config.js` and individual module files:
- **Performance**: Adjust `BALL_COUNT` or `particleLimit`.
- **Sensitivity**: Tweak `DetectionConfidence` thresholds.
- **Visuals**: Modify HSL color palettes and bloom intensities.

---

<div align="center">

## 🌟 Connect

If you like this project, please consider:
**⭐ Giving it a Star on GitHub!**

> *"Nah, I'd win."* — Gojo Satoru

</div>
