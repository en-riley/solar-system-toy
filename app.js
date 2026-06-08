// ==========================================
// 1. STATE MANAGEMENT (The Source of Truth)
// ==========================================
let universeState = {
    star: { name: "Sol", size: 4, color: 0xffaa00, type: "star", class: "G" }, 
    planets: [], belts: [], comets: []  
};

const STAR_CLASSES = {
    O: { className: "O-Type Blue Giant", size: 7, color: 0x9bb0ff, intensity: 4.0 },
    G: { className: "G-Type Yellow Dwarf", size: 4, color: 0xffaa00, intensity: 2.5 },
    M: { className: "M-Type Red Dwarf", size: 2, color: 0xff3300, intensity: 1.0 },
    WD: { className: "White Dwarf", size: 0.8, color: 0xffffff, intensity: 2.0 },
    NS: { className: "Neutron Star (Pulsar)", size: 0.4, color: 0x88ccff, intensity: 4.5 },
    PROTO: { className: "Proto-Star (Infant)", size: 5, color: 0xff3300, intensity: 1.5 },
    custom: { className: "Custom Sandbox Star" }
};

let planetMeshes = [], orbitLines = [], moonMeshes = [], ringMeshes = [];
let beltSystems = [], cometMeshes = [], cometTails = [], atmosphereMeshes = [];
let starMesh = null, pulsarJets = null; 

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObjectId = null, alwaysShowLabels = false, showPlanetOutlines = false;

// ==========================================
// 1B. LIGHTWEIGHT PROCEDURAL NOISE ENGINE
// ==========================================
const Noise2D = (() => {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function noise(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const A = p[X] + Y, B = p[X + 1] + Y;
        return lerp(v, lerp(u, p[A & 255] / 255, p[B & 255] / 255),
                       lerp(u, p[(A + 1) & 255] / 255, p[(B + 1) & 255] / 255));
    }
    return function fbm(x, y, octaves = 4) {
        let value = 0, amplitude = 1.0, frequency = 1.0, maxVal = 0;
        for (let i = 0; i < octaves; i++) {
            value += noise(x * frequency, y * frequency) * amplitude;
            maxVal += amplitude;
            amplitude *= 0.5; frequency *= 2.0;
        }
        return value / maxVal;
    };
})();

// ==========================================
// 2. INITIALIZE ENGINE & EFFECT COMPOSER
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 45, 80); 

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; 
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambientLight = new THREE.AmbientLight(0x111126);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 3.0, 500);
sunLight.decay = 1.5;
scene.add(sunLight);

const renderPass = new THREE.RenderPass(scene, camera);
const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.85);
bloomPass.threshold = 0.22; bloomPass.strength = 1.3; bloomPass.radius = 0.7;    

const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);

// ==========================================
// 3. ATMOSPHERIC SHADER BLUEPRINT
// ==========================================
const AtmosphereShader = {
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        uniform vec3 glowColor;
        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            float intensity = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);
            gl_FragColor = vec4(glowColor, intensity * 0.45);
        }
    `
};

// ==========================================
// 4. GENERATE FRACTAL NOISE MAPS
// ==========================================
function generateAdvancedMaps(baseColorHex, planetClass) {
    const width = 1024, height = 512;
    const colorCanvas = document.createElement('canvas'); colorCanvas.width = width; colorCanvas.height = height;
    const bumpCanvas = document.createElement('canvas');  bumpCanvas.width = width; bumpCanvas.height = height;
    
    const cCtx = colorCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');
    
    const imgDataC = cCtx.createImageData(width, height);
    const imgDataB = bCtx.createImageData(width, height);
    const baseColor = new THREE.Color(baseColorHex);
    
    const offsetX = Math.random() * 1000; const offsetY = Math.random() * 1000;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = (x / width) * 12.0 + offsetX;
            const ny = (y / height) * 6.0 + offsetY;
            const n = Noise2D(nx, ny, 5);
            const idx = (y * width + x) * 4;
            
            let r = 0, g = 0, b = 0, bump = 128;
            
            if (planetClass === 'lava') {
                if (n > 0.46) {
                    const crustTech = (n - 0.46) * 2;
                    r = Math.min(25, crustTech * 15); g = Math.min(25, crustTech * 15); b = Math.min(28, crustTech * 18);
                    bump = 180 + (n * 30);
                } else {
                    const heat = (0.46 - n) * 4.0;
                    r = Math.min(255, 200 + heat * 55); g = Math.min(130, 40 + heat * 90); b = Math.min(20, heat * 10);
                    bump = 40 + (n * 40);
                }
            } else if (planetClass === 'ocean' || planetClass === 'ringworld') {
                if (n > 0.50) {
                    r = Math.min(255, baseColor.r * 255 * 0.4 + (n * 30));
                    g = Math.min(255, baseColor.g * 255 * 1.1 + (n * 40));
                    b = Math.min(255, baseColor.b * 255 * 0.4);
                    bump = 140 + (n * 50);
                } else {
                    r = baseColor.r * 255 * 0.2; g = baseColor.g * 255 * 0.5; b = Math.min(255, baseColor.b * 255 * 1.4 + (n * 30));
                    bump = 80;
                }
            } else if (planetClass === 'fractured') {
                if (n > 0.40) {
                    r = 45; g = 45; b = 48; bump = 200;
                } else {
                    r = 255; g = 60; b = 0; bump = 20;
                }
            } else if (planetClass === 'gas' || planetClass === 'toxic') {
                const band = Math.sin(ny * 2.5 + n * 1.8); const mix = (band + 1) / 2;
                r = THREE.MathUtils.lerp(baseColor.r * 160, baseColor.r * 255, mix);
                g = THREE.MathUtils.lerp(baseColor.g * 140, baseColor.g * 220, mix);
                b = THREE.MathUtils.lerp(baseColor.b * 140, baseColor.b * 255, mix);
                bump = 128 + (n * 10);
            } else if (planetClass === 'cyberpunk') {
                const gridX = Math.floor(x / 8) % 4 === 0; const gridY = Math.floor(y / 8) % 4 === 0;
                if ((gridX || gridY) && n < 0.45) {
                    r = 58; g = 191; b = 248; bump = 160;
                } else {
                    r = 20 + (n * 15); g = 22 + (n * 15); b = 26 + (n * 18);
                    bump = 100 + (n * 40);
                }
            } else {
                const brightness = n * 1.4;
                r = Math.min(255, baseColor.r * 255 * brightness); g = Math.min(255, baseColor.g * 255 * brightness); b = Math.min(255, baseColor.b * 255 * brightness);
                bump = n * 255;
            }
            
            imgDataC.data[idx] = r; imgDataC.data[idx+1] = g; imgDataC.data[idx+2] = b; imgDataC.data[idx+3] = 255;
            imgDataB.data[idx] = bump; imgDataB.data[idx+1] = bump; imgDataB.data[idx+2] = bump; imgDataB.data[idx+3] = 255;
        }
    }
    
    cCtx.putImageData(imgDataC, 0, 0); bCtx.putImageData(imgDataB, 0, 0);
    const colorMap = new THREE.CanvasTexture(colorCanvas); const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    colorMap.needsUpdate = true; bumpMap.needsUpdate = true;
    return { colorMap, bumpMap };
}

// ==========================================
// 5. GRAPHICS COMPILATION LOOP (buildVisuals)
// ==========================================
function buildVisuals() {
    planetMeshes.forEach(p => { scene.remove(p.mesh); });
    atmosphereMeshes.forEach(a => { scene.remove(a); a.geometry.dispose(); a.material.dispose(); });
    orbitLines.forEach(line => { scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
    moonMeshes.forEach(m => { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); });
    ringMeshes.forEach(r => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
    beltSystems.forEach(b => { if (b.points) scene.remove(b.points); });
    cometMeshes.forEach(c => { if (c.mesh) scene.remove(c.mesh); });
    cometTails.forEach(t => { if (t.points) scene.remove(t.points); });
    
    if (pulsarJets) { scene.remove(pulsarJets); pulsarJets = null; }
    if (starMesh) { scene.remove(starMesh); starMesh = null; }

    let existingPlanetAngles = planetMeshes.map(p => p.angle);
    let existingCometAngles = cometMeshes.map(c => c.angle);
    planetMeshes = []; atmosphereMeshes = []; orbitLines = []; moonMeshes = []; ringMeshes = []; beltSystems = []; cometMeshes = []; cometTails = [];

    if (!universeState.star) { universeState.star = { name: "Sol", size: 4, color: 0xffaa00, type: "star", class: "G" }; }
    let targetSize = parseFloat(universeState.star.size) || 4;
    let targetColor = parseInt(universeState.star.color) || 0xffaa00;
    let targetIntensity = (universeState.star.intensity !== undefined) ? parseFloat(universeState.star.intensity) : 2.5;

    if (universeState.star.type === "blackhole") {
        starMesh = new THREE.Mesh(new THREE.SphereGeometry(targetSize, 32, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1;
        const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)'); gradient.addColorStop(0.1, 'rgba(255, 145, 0, 0.9)'); gradient.addColorStop(0.6, 'rgba(180, 25, 0, 0.3)'); gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        canvas.getContext('2d').fillStyle = gradient; canvas.getContext('2d').fillRect(0, 0, 256, 1);
        
        const mainDisk = new THREE.Mesh(new THREE.RingGeometry(targetSize * 1.3, targetSize * 4.5, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        mainDisk.rotation.x = Math.PI / 2; starMesh.add(mainDisk);
        sunLight.color.setHex(0xffaa44);
    } else {
        const activeClass = universeState.star.class || "G";
        if (activeClass !== 'custom' && STAR_CLASSES[activeClass]) {
            targetSize = STAR_CLASSES[activeClass].size; targetColor = STAR_CLASSES[activeClass].color;
            if (universeState.star.intensity === undefined) { targetIntensity = STAR_CLASSES[activeClass].intensity; }
            universeState.star.size = targetSize; universeState.star.color = targetColor;
        }
        if (isNaN(targetSize) || targetSize <= 0) targetSize = 4;
        
        starMesh = new THREE.Mesh(new THREE.SphereGeometry(targetSize, 32, 32), new THREE.MeshBasicMaterial({ color: targetColor }));
        sunLight.color.setHex(targetColor);
        const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(targetSize * 1.08, 32, 32), new THREE.MeshBasicMaterial({ color: targetColor, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
        starMesh.add(coronaMesh);
    }
    
    starMesh.userData = { type: 'star' }; scene.add(starMesh);
    sunLight.intensity = targetIntensity;

    const labelsContainer = document.getElementById('labels-container'); labelsContainer.innerHTML = '';
    const starLabel = document.createElement('div'); starLabel.className = 'space-label star-label'; starLabel.id = 'label-star'; starLabel.innerText = universeState.star.name; labelsContainer.appendChild(starLabel);

    universeState.planets.forEach((pData, pIdx) => {
        let pMasterGroup = new THREE.Group(); 
        const maps = generateAdvancedMaps(pData.c, pData.class);
        
        if (pData.class === 'ringworld') {
            const ringRadius = pData.s * 7.0; const ringWidth = pData.s * 1.6;
            const habGeo = new THREE.CylinderGeometry(ringRadius, ringRadius, ringWidth, 64, 1, true);
            habGeo.scale(-1, 1, 1); 
            const habMat = new THREE.MeshStandardMaterial({ map: maps.colorMap, bumpMap: maps.bumpMap, bumpScale: 0.1, roughness: 0.4, side: THREE.FrontSide });
            const habMesh = new THREE.Mesh(habGeo, habMat); habMesh.rotation.x = Math.PI / 2; pMasterGroup.add(habMesh);
            
            const structureGeo = new THREE.CylinderGeometry(ringRadius + 0.15, ringRadius + 0.15, ringWidth + 0.05, 64, 1, true);
            const structureMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5, metalness: 0.8, side: THREE.FrontSide });
            const structureMesh = new THREE.Mesh(structureGeo, structureMat); structureMesh.rotation.x = Math.PI / 2; pMasterGroup.add(structureMesh);
        } else if (pData.class === 'fractured') {
            const chunkCount = 12;
            for(let i=0; i<chunkCount; i++) {
                const sizeMod = pData.s * (0.2 + Math.random() * 0.3); const chunkGeo = new THREE.DodecahedronGeometry(sizeMod, 1);
                const chunkMat = new THREE.MeshStandardMaterial({ map: maps.colorMap, bumpMap: maps.bumpMap, bumpScale: 0.15, roughness: 0.8 });
                chunkMat.emissive = new THREE.Color(0xff2200); chunkMat.emissiveMap = maps.colorMap;
                const chunkMesh = new THREE.Mesh(chunkGeo, chunkMat);
                const dist = pData.s * (0.6 + Math.random() * 0.9); const theta = Math.random() * Math.PI * 2; const phi = Math.acos((Math.random() * 2) - 1);
                chunkMesh.position.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi));
                chunkMesh.rotation.set(Math.random()*3, Math.random()*3, 0); pMasterGroup.add(chunkMesh);
            }
            const coreGeo = new THREE.SphereGeometry(pData.s * 0.4, 16, 16); pMasterGroup.add(new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff3300 })));
        } else {
            const pGeo = new THREE.SphereGeometry(pData.s, 64, 64);
            let rough = 0.8; let metal = 0.0;
            if (pData.class === 'gas') rough = 0.35;
            if (pData.class === 'ice') { rough = 0.2; metal = 0.2; }
            if (pData.class === 'lava') rough = 0.85;
            if (pData.class === 'ocean') { rough = 0.12; metal = 0.05; }
            if (pData.class === 'desert') rough = 0.95;
            if (pData.class === 'toxic') rough = 0.5;
            if (pData.class === 'cyberpunk') { rough = 0.5; metal = 0.6; }

            const pMat = new THREE.MeshStandardMaterial({ map: maps.colorMap, bumpMap: maps.bumpMap, bumpScale: (pData.class === 'gas' || pData.class === 'toxic') ? 0.005 : 0.12, roughness: rough, metalness: metal });
            if (pData.class === 'lava') { pMat.emissive = new THREE.Color(0xff3300); pMat.emissiveMap = maps.colorMap; }
            if (pData.class === 'cyberpunk') { pMat.emissive = new THREE.Color(0x00a3ff); pMat.emissiveMap = maps.colorMap; }

            pMasterGroup.add(new THREE.Mesh(pGeo, pMat));

            if (pData.class === 'gas' || pData.class === 'ocean' || pData.class === 'rocky' || pData.class === 'toxic') {
                let gasGlow = pData.c; if (pData.class === 'ocean') gasGlow = 0x4cc3ff; if (pData.class === 'toxic') gasGlow = 0x65a30d;
                const atmosMesh = new THREE.Mesh(new THREE.SphereGeometry(pData.s * 1.12, 32, 32), new THREE.ShaderMaterial({
                    vertexShader: AtmosphereShader.vertexShader, fragmentShader: AtmosphereShader.fragmentShader,
                    uniforms: { glowColor: { value: new THREE.Color(gasGlow) } }, blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true
                }));
                atmosphereMeshes.push(atmosMesh); scene.add(atmosMesh);
            }
        }

        pMasterGroup.userData = { type: 'planet', index: pIdx }; scene.add(pMasterGroup);

        if (pData.hasRings && pData.class !== 'ringworld') {
            const ringMesh = new THREE.Mesh(new THREE.RingGeometry(pData.s * 1.4, pData.s * 2.8, 64), new THREE.MeshStandardMaterial({ color: pData.c, side: THREE.DoubleSide, transparent: true, opacity: 0.6, roughness: 0.7 }));
            ringMesh.rotation.x = Math.PI / 2; pMasterGroup.add(ringMesh); ringMeshes.push(ringMesh);
        }

        const lineMat = new THREE.LineBasicMaterial({ color: pData.c, transparent: true, opacity: 0.12 });
        const lineGeo = new THREE.BufferGeometry(); const points = [];
        for (let i = 0; i <= 128; i++) {
            const theta = (i / 128) * Math.PI * 2; const b = pData.d * Math.sqrt(1 - pData.e * pData.e);
            let x = Math.cos(theta) * pData.d - (pData.d * pData.e); let z = Math.sin(theta) * b;
            points.push(new THREE.Vector3(x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt), 0, x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt)));
        }
        lineGeo.setFromPoints(points); const oLine = new THREE.Line(lineGeo, lineMat); scene.add(oLine); orbitLines.push(oLine);

        const pAngle = existingPlanetAngles[pIdx] !== undefined ? existingPlanetAngles[pIdx] : Math.random() * Math.PI * 2;
        planetMeshes.push({ mesh: pMasterGroup, angle: pAngle });

        const pLabel = document.createElement('div'); pLabel.className = 'space-label'; pLabel.id = `label-planet-${pIdx}`; pLabel.innerText = pData.name; labelsContainer.appendChild(pLabel);
    });

    universeState.belts.forEach((bData) => {
        const count = bData.count || 400; const geom = new THREE.BufferGeometry(); const positions = new Float32Array(count * 3); const angles = new Float32Array(count); const distances = new Float32Array(count);
        for(let i=0; i < count; i++) {
            const radius = bData.innerR + Math.random() * (bData.outerR - bData.innerR); const angle = Math.random() * Math.PI * 2;
            distances[i] = radius; angles[i] = angle; positions[i*3] = Math.cos(angle) * radius; positions[i*3 + 1] = (Math.random() - 0.5) * 0.8; positions[i*3 + 2] = Math.sin(angle) * radius;
        }
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3)); const pts = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0xa1a8b8, size: 0.4, transparent: true, opacity: 0.7 }));
        scene.add(pts); beltSystems.push({ points: pts, geometry: geom, distances: distances, angles: angles, speed: bData.sp });
    });

    universeState.comets.forEach((cData, cIdx) => {
        const cMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xeeffff }));
        cMesh.userData = { type: 'comet', index: cIdx }; scene.add(cMesh);
        const cLineGeo = new THREE.BufferGeometry(); const cPoints = [];
        for (let i = 0; i <= 128; i++) {
            const theta = (i / 128) * Math.PI * 2; const b = cData.d * Math.sqrt(1 - cData.e * cData.e); let x = Math.cos(theta) * cData.d - (cData.d * cData.e); let z = Math.sin(theta) * b;
            cPoints.push(new THREE.Vector3(x * Math.cos(cData.tilt) - z * Math.sin(cData.tilt), 0, x * Math.sin(cData.tilt) + z * Math.cos(cData.tilt)));
        }
        cLineGeo.setFromPoints(cPoints); scene.add(new THREE.Line(cLineGeo, new THREE.LineBasicMaterial({ color: 0x5588aa, transparent: true, opacity: 0.15 })));
        
        const maxTailPoints = 30; const tailGeo = new THREE.BufferGeometry(); const tailPos = new Float32Array(maxTailPoints * 3); tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
        const tailPts = new THREE.Points(tailGeo, new THREE.PointsMaterial({ color: 0xc4e2ff, size: 0.5, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })); scene.add(tailPts);
        
        const cAngle = existingCometAngles[cIdx] !== undefined ? existingCometAngles[cIdx] : Math.PI;
        cometMeshes.push({ mesh: cMesh, angle: cAngle, data: cData }); cometTails.push({ points: tailPts, geometry: tailGeo, history: [], maxPoints: maxTailPoints });
        
        const cLabel = document.createElement('div'); cLabel.className = 'space-label'; cLabel.id = `label-comet-${cIdx}`; cLabel.innerText = cData.name; labelsContainer.appendChild(cLabel);
    });
}

// ==========================================
// 6. URL HANDLING & SYNC
// ==========================================
function saveToURL() {
    const json = btoa(encodeURIComponent(JSON.stringify(universeState)));
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?sys=${json}`).then(() => { alert("Share link copied!"); });
}
function loadFromURL() {
    const data = new URLSearchParams(window.location.search).get('sys'); if (!data) return null;
    try { return JSON.parse(decodeURIComponent(atob(data))); } catch(e) { return null; }
}

// ==========================================
// 7. DYNAMIC DASHBOARD PANEL BUILDER
// ==========================================
function updateUI() {
    const list = document.getElementById('planet-list'); list.innerHTML = ''; 

    const starCard = document.createElement('div'); starCard.className = 'planet-control-card'; starCard.style.borderLeftColor = '#ffaa00'; 
    starCard.innerHTML = `
        <h4><span style="color: #ffcc00;">🌟 Center Object Settings</span></h4>
        <div class="control-group"><label>Core Type</label>
            <select id="star-type-select" style="background:#222; color:white; border:1px solid #444; width:60%;">
                <option value="star" ${universeState.star.type === 'star' ? 'selected' : ''}>Star (Standard/Exotic)</option>
                <option value="blackhole" ${universeState.star.type === 'blackhole' ? 'selected' : ''}>Black Hole</option>
            </select>
        </div>
        <div class="control-group" id="star-class-group" style="display: ${universeState.star.type === 'blackhole' ? 'none' : 'flex'}">
            <label>Spectral Class</label>
            <select id="star-class-select" style="background:#222; color:white; border:1px solid #444; width:60%;">
                <option value="G" ${universeState.star.class === 'G' ? 'selected' : ''}>Class G (Yellow Dwarf)</option>
                <option value="O" ${universeState.star.class === 'O' ? 'selected' : ''}>Class O (Blue Giant)</option>
                <option value="M" ${universeState.star.class === 'M' ? 'selected' : ''}>Class M (Red Dwarf)</option>
                <option value="WD" ${universeState.star.class === 'WD' ? 'selected' : ''}>White Dwarf</option>
                <option value="NS" ${universeState.star.class === 'NS' ? 'selected' : ''}>Neutron Star (Pulsar)</option>
                <option value="PROTO" ${universeState.star.class === 'PROTO' ? 'selected' : ''}>Proto-Star (Infant)</option>
                <option value="custom" ${universeState.star.class === 'custom' ? 'selected' : ''}>[ Custom Sandbox Star ]</option>
            </select>
        </div>
        <div class="control-group"><label>Name</label><input type="text" id="star-name-input" value="${universeState.star.name}" style="width:60%;"></div>
        <div class="control-group"><label>Light Intensity</label><input type="range" id="star-intensity-slider" min="0.0" max="6.0" step="0.2" value="${sunLight.intensity}"></div>
    `;
    list.appendChild(starCard);

    universeState.planets.forEach((pData, pIdx) => {
        const card = document.createElement('div'); card.className = 'planet-control-card';
        card.innerHTML = `
            <h4>
                <input type="text" class="name-input" data-index="${pIdx}" value="${pData.name}" style="width:70%; background:none; border:1px solid #444; color:white;">
                <button class="delete-btn" data-type="planet" data-index="${pIdx}">X</button>
            </h4>
            <div class="control-group"><label>Planet Class</label>
                <select class="planet-class-select" data-index="${pIdx}" style="background:#222; color:white; border:1px solid #444; width:60%;">
                    <option value="rocky" ${pData.class === 'rocky' ? 'selected' : ''}>Terrestrial (Rocky)</option>
                    <option value="gas" ${pData.class === 'gas' ? 'selected' : ''}>Gas Giant</option>
                    <option value="lava" ${pData.class === 'lava' ? 'selected' : ''}>Lava World</option>
                    <option value="ocean" ${pData.class === 'ocean' ? 'selected' : ''}>Ocean Planet</option>
                    <option value="desert" ${pData.class === 'desert' ? 'selected' : ''}>Desert/Dune World</option>
                    <option value="toxic" ${pData.class === 'toxic' ? 'selected' : ''}>Toxic/Sulfur Planet</option>
                    <option value="cyberpunk" ${pData.class === 'cyberpunk' ? 'selected' : ''}>Cyberpunk Megacity</option>
                    <option value="ringworld" ${pData.class === 'ringworld' ? 'selected' : ''}>Forerunner Ringworld</option>
                    <option value="fractured" ${pData.class === 'fractured' ? 'selected' : ''}>Fractured Shattered Core</option>
                </select>
            </div>
            <div class="control-group"><label>Scale Factor</label><input type="range" class="size-slider" data-index="${pIdx}" min="0.2" max="4" step="0.1" value="${pData.s}"></div>
            <div class="control-group"><label>Distance</label><input type="range" class="dist-slider" data-index="${pIdx}" min="8" max="100" step="1" value="${pData.d}"></div>
            
            <div class="control-group"><label>Orbit Speed</label><input type="range" class="speed-slider" data-index="${pIdx}" min="0.0" max="0.03" step="0.001" value="${pData.sp}"></div>
            
            <div class="control-group"><label>Orbit Shape</label><input type="range" class="ecc-slider" data-index="${pIdx}" min="0.0" max="0.9" step="0.05" value="${pData.e}"></div>
            <div class="control-group"><label>Orbit Tilt</label><input type="range" class="tilt-slider" data-index="${pIdx}" min="0" max="6.28" step="0.05" value="${pData.tilt}"></div>
            <div class="control-group"><label>Base Color</label><input type="color" class="color-picker" data-index="${pIdx}" value="${pData.c}"></div>
        `;
        list.appendChild(card);
    });

    attachSliderListeners();
}

function attachSliderListeners() {
    document.querySelectorAll('.size-slider').forEach(s => s.addEventListener('input', (e) => { const idx = e.target.dataset.index; universeState.planets[idx].s = parseFloat(e.target.value); buildVisuals(); }));
    document.querySelectorAll('.dist-slider').forEach(s => s.addEventListener('input', (e) => { const idx = e.target.dataset.index; universeState.planets[idx].d = parseFloat(e.target.value); buildVisuals(); }));
    
    // SPEED BINDING RESTORATION PASS: Connects user inputs directly to physics increment loops
    document.querySelectorAll('.speed-slider').forEach(s => s.addEventListener('input', (e) => { 
        const idx = e.target.dataset.index; 
        universeState.planets[idx].sp = parseFloat(e.target.value); 
    }));
    
    document.querySelectorAll('.ecc-slider').forEach(s => s.addEventListener('input', (e) => { const idx = e.target.dataset.index; universeState.planets[idx].e = parseFloat(e.target.value); buildVisuals(); }));
    document.querySelectorAll('.tilt-slider').forEach(s => s.addEventListener('input', (e) => { const idx = e.target.dataset.index; universeState.planets[idx].tilt = parseFloat(e.target.value); buildVisuals(); }));
    document.querySelectorAll('.color-picker').forEach(p => p.addEventListener('input', (e) => { const idx = e.target.dataset.index; universeState.planets[idx].c = e.target.value; buildVisuals(); }));
    
    document.querySelectorAll('.planet-class-select').forEach(sel => sel.addEventListener('change', (e) => {
        const idx = e.target.dataset.index; universeState.planets[idx].class = e.target.value; buildVisuals();
    }));
    document.querySelectorAll('.name-input').forEach(i => i.addEventListener('input', (e) => {
        const idx = e.target.dataset.index; universeState.planets[idx].name = e.target.value;
        const el = document.getElementById(`label-planet-${idx}`); if (el) el.innerText = e.target.value;
    }));
    document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index); universeState.planets.splice(idx, 1); buildVisuals(); updateUI();
    }));

    document.getElementById('star-type-select').addEventListener('change', (e) => { universeState.star.type = e.target.value; buildVisuals(); updateUI(); });
    document.getElementById('star-name-input').addEventListener('input', (e) => { universeState.star.name = e.target.value; const l = document.getElementById('label-star'); if (l) l.innerText = e.target.value; });
}

// ==========================================
// 8. GLOBAL ACCESSORS & INTERSECTS
// ==========================================
window.addEventListener('mousemove', (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; });
window.buildVisuals = buildVisuals; window.updateUI = updateUI;

document.getElementById('toggle-always-show').addEventListener('change', (e) => { alwaysShowLabels = e.target.checked; });
document.getElementById('toggle-outlines').addEventListener('change', (e) => { showPlanetOutlines = e.target.checked; buildVisuals(); });
document.getElementById('ui-toggle-btn').addEventListener('click', () => {
    document.getElementById('ui-wrapper').classList.toggle('collapsed');
    document.getElementById('ui-toggle-btn').innerText = document.getElementById('ui-wrapper').classList.contains('collapsed') ? '▶' : '◀';
});

document.getElementById('add-planet-btn').addEventListener('click', () => {
    const colors = ['#44ff88', '#4488ff', '#ffcc44', '#cc44ff'];
    const dist = universeState.planets.length > 0 ? universeState.planets[universeState.planets.length - 1].d + 15 : 20;
    
    // UNIFIED BLUEPRINT SYNC: Instantiates standard default speed keys safely matched to slider parameters
    universeState.planets.push({ 
        name: "System Body " + (universeState.planets.length+1), 
        s: 1.2, d: dist, sp: 0.005, e: 0, tilt: 0, c: colors[Math.floor(Math.random()*colors.length)], moons: [], hasRings: false, class: "rocky" 
    });
    
    buildVisuals(); updateUI();
});
document.getElementById('add-belt-btn').addEventListener('click', () => { universeState.belts.push({ innerR: 35, outerR: 42, count: 600, sp: 0.002 }); buildVisuals(); updateUI(); });
document.getElementById('add-comet-btn').addEventListener('click', () => { universeState.comets.push({ name: "Comet " + (universeState.comets.length+1), d: 35, e: 0.85, tilt: 0.4, sp: 0.015 }); buildVisuals(); updateUI(); });
document.getElementById('share-btn').addEventListener('click', saveToURL);

function projectLabelPosition(meshTarget, domElementId, shouldBeVisible) {
    const el = document.getElementById(domElementId); if (!el) return;
    if (shouldBeVisible || alwaysShowLabels) {
        const v = new THREE.Vector3(); meshTarget.getWorldPosition(v); v.project(camera);
        el.style.left = `${(v.x * .5 + .5) * window.innerWidth}px`; el.style.top = `${(v.y * -.5 + .5) * window.innerHeight - 15}px`; el.classList.add('visible');
    } else { el.classList.remove('visible'); }
}

// ==========================================
// 9. ANIMATION LOOP & RENDERING PIPELINE
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    planetMeshes.forEach((p, idx) => {
        const data = universeState.planets[idx]; if (!data) return;
        
        // Dynamic speed step calculations execute correctly
        p.angle += data.sp; 
        
        let semiMinor = data.d * Math.sqrt(1 - data.e * data.e);
        let localX = Math.cos(p.angle) * data.d - (data.d * data.e); let localZ = Math.sin(p.angle) * semiMinor;
        
        p.mesh.position.x = localX * Math.cos(data.tilt) - localZ * Math.sin(data.tilt);
        p.mesh.position.z = localX * Math.sin(data.tilt) + localZ * Math.cos(data.tilt);
        
        if (data.class === 'fractured') {
            p.mesh.children.forEach((child) => {
                child.rotation.x += 0.01; child.rotation.y += 0.005;
            });
        } else {
            p.mesh.rotation.y += 0.006;
        }
        
        if (atmosphereMeshes[idx]) { atmosphereMeshes[idx].position.copy(p.mesh.position); }
    });

    beltSystems.forEach((b) => {
        const posAttr = b.points.geometry.attributes.position;
        for(let i=0; i<b.distances.length; i++) {
            b.angles[i] += b.speed;
            posAttr.array[i*3] = Math.cos(b.angles[i]) * b.distances[i]; posAttr.array[i*3 + 2] = Math.sin(b.angles[i]) * b.distances[i];
        }
        posAttr.needsUpdate = true; b.points.rotation.y += 0.0002;
    });

    cometMeshes.forEach((c, idx) => {
        c.angle += c.data.sp; let semiMinor = c.data.d * Math.sqrt(1 - c.data.e * c.data.e); let localX = Math.cos(c.angle) * c.data.d - (c.data.d * c.data.e); let localZ = Math.sin(c.angle) * semiMinor;
        c.mesh.position.x = localX * Math.cos(c.data.tilt) - localZ * Math.sin(c.data.tilt); c.mesh.position.z = localX * Math.sin(c.data.tilt) + localZ * Math.cos(c.data.tilt);
    });

    if (starMesh) starMesh.rotation.y += 0.002;

    raycaster.setFromCamera(mouse, camera);
    const targets = planetMeshes.map(p => p.mesh); if (starMesh) targets.push(starMesh);
    const hits = raycaster.intersectObjects(targets, true); hoveredObjectId = null;
    if (hits.length > 0) {
        let rootObj = hits[0].object;
        while (rootObj.parent && rootObj.parent !== scene) { rootObj = rootObj.parent; }
        if (rootObj.userData.type === 'star') hoveredObjectId = 'star';
        if (rootObj.userData.type === 'planet') hoveredObjectId = rootObj.userData.index;
    }

    if (starMesh) projectLabelPosition(starMesh, 'label-star', hoveredObjectId === 'star');
    planetMeshes.forEach((p, idx) => projectLabelPosition(p.mesh, `label-planet-${idx}`, hoveredObjectId === idx));

    controls.update(); composer.render(); 
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
});

function initUniverse() { 
    const sharedData = loadFromURL(); if (sharedData) { universeState = sharedData; } 
    const starCount = 3000; const starfieldGeo = new THREE.BufferGeometry(); const starfieldPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
        const radius = 300 + Math.random() * 150; const theta = Math.random() * Math.PI * 2; const phi = Math.acos((Math.random() * 2) - 1);
        starfieldPositions[i] = radius * Math.sin(phi) * Math.cos(theta); starfieldPositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta); starfieldPositions[i + 2] = radius * Math.cos(phi);
    }
    starfieldGeo.setAttribute('position', new THREE.BufferAttribute(starfieldPositions, 3));
    scene.add(new THREE.Points(starfieldGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.9 })));
    buildVisuals(); updateUI(); 
}
initUniverse(); animate();