
// ==========================================
// 1. STATE MANAGEMENT (The Source of Truth)
// ==========================================
let universeState = {
    star: { name: "Sol", size: 4, color: 0xffaa00, type: "star" }, 
    planets: []
};

// 3D Objects tracking arrays
let planetMeshes = [];
let orbitLines = [];
let moonMeshes = []; 
let ringMeshes = [];
let starMesh = null; 

// Hover, Raycasting & Toggle tracking states
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObjectId = null; 
let alwaysShowLabels = false;

// ==========================================
// 2. INITIALIZE THREE.JS ENGINE
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 35, 60); 

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Controls (allows drag to rotate, scroll to zoom)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const ambientLight = new THREE.AmbientLight(0x333333);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 2, 300);
scene.add(sunLight);

// ==========================================
// 3. CORE FUNCTIONS (Building the Scene)
// ==========================================

function initUniverse() {
    const loadedState = loadFromURL();
    if (loadedState) {
        universeState = loadedState;
        if (!universeState.star.name) universeState.star.name = "Sol"; 
    } else {
        universeState.planets = [];
        universeState.planets.push({ 
            name: "Aria 1", 
            s: 1.2, 
            d: 15, 
            c: '#00aaff', 
            sp: 0.01, 
            e: 0.0, 
            tilt: 0.0, 
            moons: [],
            hasRings: false
        });
    }

    buildVisuals();
    updateUI();
    createStarfield(); 
}

function createStarfield() {
    const starCount = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        const radius = 200 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[i] = radius * Math.sin(phi) * Math.cos(theta);     
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta); 
        positions[i + 2] = radius * Math.cos(phi);                  
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.6,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true 
    });

    const starPoints = new THREE.Points(geometry, material);
    scene.add(starPoints);
}

function buildVisuals() {
    // Cleanup hardware VRAM memory allocations explicitly
    if (planetMeshes) planetMeshes.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    if (orbitLines) orbitLines.forEach(line => { scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
    if (moonMeshes) moonMeshes.forEach(m => { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); });
    if (ringMeshes) ringMeshes.forEach(r => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
    if (starMesh) { 
        while(starMesh.children.length > 0){ 
            let obj = starMesh.children[0];
            starMesh.remove(obj); 
            obj.geometry.dispose(); 
            obj.material.dispose();
        }
        scene.remove(starMesh); starMesh.geometry.dispose(); starMesh.material.dispose(); 
    }

    let existingPlanetAngles = planetMeshes ? planetMeshes.map(p => p.angle) : [];
    let existingMoonAngles = {};
    if (moonMeshes) {
        moonMeshes.forEach(m => { existingMoonAngles[`${m.parentIdx}-${m.angle}`] = m.angle; });
    }

    planetMeshes = [];
    orbitLines = [];
    moonMeshes = [];
    ringMeshes = [];

    // Build Central Anchor (Star vs Black Hole)
    // 2. BUILD CENTRAL OBJECT (Star vs Upgraded Cinematic Black Hole)
    if (universeState.star.type === "blackhole") {
        // Core Singularity (Pitch black sphere)
        const starGeo = new THREE.SphereGeometry(universeState.star.size, 32, 32);
        const starMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); 
        starMesh = new THREE.Mesh(starGeo, starMat);
        
        // --- VISUAL UPGRADE: DYNAMIC ACCRETION DISK GRADIENT ---
        // We create an HTML canvas on the fly to generate a smooth, dusty transparency gradient
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        
        // Define color bands: Inner white hot glow -> Vibrant Orange -> Fading Deep Red
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)'); // Inner lip edge intense heat
        gradient.addColorStop(0.1, 'rgba(255, 130, 0, 0.9)');   // Main accretion flow stream
        gradient.addColorStop(0.5, 'rgba(200, 40, 0, 0.4)');    // Outer swirling dust lanes
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');       // Complete dissipation into vacuum
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        
        const texture = new THREE.CanvasTexture(canvas);

        // Core Accretion Disk (Uses a flat ring geometry mapped with our custom texture)
        const diskGeo = new THREE.RingGeometry(universeState.star.size * 1.3, universeState.star.size * 3.5, 64);
        const diskMat = new THREE.MeshBasicMaterial({ 
            map: texture,
            side: THREE.DoubleSide, 
            transparent: true,
            blending: THREE.AdditiveBlending, // Forces colors to compound and mathematically "glow"
            depthWrite: false // Prevents transparency rendering glitches when planets orbit behind it
        });
        
        const mainDisk = new THREE.Mesh(diskGeo, diskMat);
        mainDisk.rotation.x = Math.PI / 2; 
        starMesh.add(mainDisk); 

        // SECONDARY LAYER: The Secondary Swirling Dust Lane Ring
        // Adding an asymmetric, slightly offset layer creates complex spatial depth
        const detailDiskGeo = new THREE.RingGeometry(universeState.star.size * 1.5, universeState.star.size * 2.8, 64);
        const detailDiskMat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const detailDisk = new THREE.Mesh(detailDiskGeo, detailDiskMat);
        detailDisk.rotation.x = Math.PI / 2;
        detailDisk.rotation.y = 0.08; // Slight structural tilt so it overlaps beautifully
        starMesh.add(detailDisk);

    } else {
        // Standard Star (Your existing code stays exactly the same here)
        const starGeo = new THREE.SphereGeometry(universeState.star.size, 32, 32);
        const starMat = new THREE.MeshBasicMaterial({ color: universeState.star.color });
        starMesh = new THREE.Mesh(starGeo, starMat);
    }
    starMesh.userData = { type: 'star' }; 
    scene.add(starMesh);

    // Build Flat text overlay badge elements container
    const labelsContainer = document.getElementById('labels-container');
    labelsContainer.innerHTML = '';

    const starLabel = document.createElement('div');
    starLabel.className = 'space-label star-label';
    starLabel.id = 'label-star';
    starLabel.innerText = universeState.star.name;
    labelsContainer.appendChild(starLabel);

    // Build Planets Loop array
    universeState.planets.forEach((pData, pIdx) => {
        const pGeo = new THREE.SphereGeometry(pData.s, 32, 32);
        const pMat = new THREE.MeshStandardMaterial({ color: pData.c, roughness: 0.6 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.userData = { type: 'planet', index: pIdx }; 
        scene.add(pMesh);

        if (pData.hasRings) {
            const rGeo = new THREE.RingGeometry(pData.s * 1.4, pData.s * 2.3, 64);
            const rMat = new THREE.MeshStandardMaterial({ 
                color: pData.c, side: THREE.DoubleSide, transparent: true, opacity: 0.6, roughness: 0.8
            });
            const ringMesh = new THREE.Mesh(rGeo, rMat);
            ringMesh.rotation.x = Math.PI / 2; 
            pMesh.add(ringMesh); 
            ringMeshes.push(ringMesh);
        }

        const lineMaterial = new THREE.LineBasicMaterial({ color: pData.c, transparent: true, opacity: 0.15 });
        const lineGeometry = new THREE.BufferGeometry();
        const points = [];
        for (let i = 0; i <= 128; i++) {
            const theta = (i / 128) * Math.PI * 2;
            const b = pData.d * Math.sqrt(1 - pData.e * pData.e);
            let x = Math.cos(theta) * pData.d - (pData.d * pData.e);
            let z = Math.sin(theta) * b;
            points.push(new THREE.Vector3(x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt), 0, x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt)));
        }
        lineGeometry.setFromPoints(points);
        const orbitLine = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(orbitLine);
        orbitLines.push(orbitLine);

        const pAngle = existingPlanetAngles[pIdx] !== undefined ? existingPlanetAngles[pIdx] : Math.random() * Math.PI * 2;
        planetMeshes.push({ mesh: pMesh, angle: pAngle });

        const pLabel = document.createElement('div');
        pLabel.className = 'space-label';
        pLabel.id = `label-planet-${pIdx}`;
        pLabel.innerText = pData.name;
        labelsContainer.appendChild(pLabel);

        // Build child nested satellite moons
        pData.moons.forEach((mData, mIdx) => {
            const mGeo = new THREE.SphereGeometry(mData.s, 16, 16);
            const mMat = new THREE.MeshStandardMaterial({ color: mData.c, roughness: 0.9 });
            const mMesh = new THREE.Mesh(mGeo, mMat);
            scene.add(mMesh); 

            const moonKey = `${pIdx}-${mIdx}`;
            const mAngle = existingMoonAngles[moonKey] !== undefined ? existingMoonAngles[moonKey] : Math.random() * Math.PI * 2;

            moonMeshes.push({ mesh: mMesh, parentIdx: pIdx, distance: mData.d, speed: mData.sp, angle: mAngle });
        });
    });
}

// ==========================================
// 4. URL SAVE & LOAD PIPELINE
// ==========================================
function saveToURL() {
    const jsonString = JSON.stringify(universeState);
    const encoded = btoa(encodeURIComponent(jsonString));
    const shareURL = `${window.location.origin}${window.location.pathname}?sys=${encoded}`;
    navigator.clipboard.writeText(shareURL).then(() => { alert("Share link copied to clipboard!"); });
}

function loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('sys');
    if (!data) return null;
    try { return JSON.parse(decodeURIComponent(atob(data))); } catch(e) { return null; }
}

// ==========================================
// 5. DYNAMIC UI GENERATION
// ==========================================
function updateUI() {
    const planetList = document.getElementById('planet-list');
    planetList.innerHTML = ''; 

    // Center Object Card Setup
    const starCard = document.createElement('div');
    starCard.className = 'planet-control-card';
    starCard.style.borderLeftColor = universeState.star.type === 'blackhole' ? '#ff5500' : '#ffaa00'; 
    starCard.innerHTML = `
        <h4><span style="color: #ffcc00;">🌟 Center Object Settings</span></h4>
        <div class="control-group">
            <label>Type</label>
            <select id="star-type-select" style="background:#222; color:white; border:1px solid #444; padding:2px; border-radius:4px; width:60%;">
                <option value="star" ${universeState.star.type === 'star' ? 'selected' : ''}>Star (Sun)</option>
                <option value="blackhole" ${universeState.star.type === 'blackhole' ? 'selected' : ''}>Black Hole</option>
            </select>
        </div>
        <div class="control-group">
            <label>Name</label>
            <input type="text" id="star-name-input" value="${universeState.star.name}" 
                   style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-weight:bold; font-size:14px; padding:4px; width:60%;">
        </div>
        <div class="control-group">
            <label>Size</label>
            <input type="range" id="star-size-slider" min="1" max="10" step="0.5" value="${universeState.star.size}">
        </div>
        <div class="control-group" id="star-color-group" style="display: ${universeState.star.type === 'blackhole' ? 'none' : 'flex'};">
            <label>Color</label>
            <input type="color" id="star-color-picker" value="${
                universeState.star.color ? "#" + universeState.star.color.toString(16).padStart(6, '0') : '#ffaa00'
            }">
        </div>
    `;
    planetList.appendChild(starCard);

    // Dynamic Planet Configuration Cards Loop
    universeState.planets.forEach((pData, pIdx) => {
        const card = document.createElement('div');
        card.className = 'planet-control-card';
        
        let moonsHTML = '';
        pData.moons.forEach((moon, mIdx) => {
            moonsHTML += `
                <div style="padding-left:15px; margin-top:8px; border-left: 2px dashed #555; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:12px; margin-right:5px;">🌙</span>
                    <input type="text" class="moon-name-input" data-planet-index="${pIdx}" data-moon-index="${mIdx}" value="${moon.name}" 
                           style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#aaa; font-size:12px; padding:2px 5px; border-radius:3px; width:75%;">
                    <button class="delete-moon-btn" data-planet-index="${pIdx}" data-moon-index="${mIdx}" 
                            style="background:none; color:#ef4444; border:none; width:auto; margin:0; padding:0 5px; cursor:pointer; font-size:12px;">X</button>
                </div>
            `;
        });

        card.innerHTML = `
            <h4>
                <input type="text" class="name-input" data-index="${pIdx}" value="${pData.name}" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-weight:bold; font-size:15px; padding:4px; width:70%;">
                <button class="delete-btn" data-index="${pIdx}">X</button>
            </h4>
            <div class="control-group">
                <label>Size</label>
                <input type="range" class="size-slider" data-index="${pIdx}" min="0.2" max="4" step="0.1" value="${pData.s}">
            </div>
            <div class="control-group" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <label>Planetary Rings</label>
                <input type="checkbox" class="rings-checkbox" data-index="${pIdx}" ${pData.hasRings ? 'checked' : ''} style="cursor:pointer; transform:scale(1.2);">
            </div>
            <div class="control-group">
                <label>Orbit Distance</label>
                <input type="range" class="dist-slider" data-index="${pIdx}" min="8" max="100" step="1" value="${pData.d}">
            </div>
            <div class="control-group">
                <label>Orbit Speed</label>
                <input type="range" class="speed-slider" data-index="${pIdx}" min="0.0" max="0.08" step="0.001" value="${pData.sp}">
            </div>
            <div class="control-group">
                <label>Orbit Shape</label>
                <input type="range" class="ecc-slider" data-index="${pIdx}" min="0.0" max="0.9" step="0.05" value="${pData.e}">
            </div>
            <div class="control-group">
                <label>Orbit Tilt</label>
                <input type="range" class="tilt-slider" data-index="${pIdx}" min="0" max="6.28" step="0.05" value="${pData.tilt}">
            </div>
            <div class="control-group">
                <label>Color</label>
                <input type="color" class="color-picker" data-index="${pIdx}" value="${pData.c}">
            </div>
            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:10px 0;">
            <button class="add-moon-btn" data-index="${pIdx}" style="background:#10b981; font-size:12px; padding:5px;">+ Add Satellite Moon</button>
            <div class="moons-list" style="margin-top:5px;">${moonsHTML}</div>
        `;
        planetList.appendChild(card);
    });

    attachSliderListeners();
}

function attachSliderListeners() {
    document.querySelectorAll('.size-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            const newSize = parseFloat(e.target.value);
            universeState.planets[idx].s = newSize;
            const mesh = planetMeshes[idx].mesh;
            mesh.geometry.dispose(); 
            mesh.geometry = new THREE.SphereGeometry(newSize, 32, 32);
        });
    });

    document.querySelectorAll('.dist-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].d = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    document.querySelectorAll('.speed-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].sp = parseFloat(e.target.value);
        });
    });

    document.querySelectorAll('.color-picker').forEach(picker => {
        picker.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            const newColor = e.target.value;
            universeState.planets[idx].c = newColor;
            planetMeshes[idx].mesh.material.color.set(newColor);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            scene.remove(planetMeshes[idx].mesh);
            universeState.planets.splice(idx, 1);
            planetMeshes.splice(idx, 1);
            buildVisuals(); 
            updateUI();
        });
    });

    document.querySelectorAll('.ecc-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].e = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    document.querySelectorAll('.tilt-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].tilt = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    document.querySelectorAll('.name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].name = e.target.value;
            const element = document.getElementById(`label-planet-${idx}`);
            if (element) element.innerText = e.target.value;
        });
    });

    document.querySelectorAll('.moon-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const pIdx = e.target.dataset.planetIndex;
            const mIdx = e.target.dataset.moonIndex;
            universeState.planets[pIdx].moons[mIdx].name = e.target.value;
        });
    });

    document.querySelectorAll('.delete-moon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pIdx = parseInt(btn.dataset.planetIndex);
            const mIdx = parseInt(btn.dataset.moonIndex);
            universeState.planets[pIdx].moons.splice(mIdx, 1);
            buildVisuals();
            updateUI();
        });
    });

    document.querySelectorAll('.add-moon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pIdx = parseInt(btn.dataset.index);
            const parentPlanet = universeState.planets[pIdx];
            parentPlanet.moons.push({
                name: parentPlanet.name + " Sat-" + String.fromCharCode(65 + parentPlanet.moons.length),
                s: parentPlanet.s * 0.3, 
                d: parentPlanet.s + (parentPlanet.moons.length * 1.5 + 2), 
                c: '#888888',
                sp: 0.03 + (Math.random() * 0.02)
            });
            buildVisuals();
            updateUI();
        });
    });

    const starTypeSelect = document.getElementById('star-type-select');
    if (starTypeSelect) {
        starTypeSelect.addEventListener('change', (e) => {
            universeState.star.type = e.target.value;
            buildVisuals();
            updateUI(); 
        });
    }

    const starInput = document.getElementById('star-name-input');
    if (starInput) {
        starInput.addEventListener('input', (e) => {
            universeState.star.name = e.target.value;
            const starLabel = document.getElementById('label-star');
            if (starLabel) starLabel.innerText = e.target.value;
        });
    }

    const starSizeSlider = document.getElementById('star-size-slider');
    if (starSizeSlider) {
        starSizeSlider.addEventListener('input', (e) => {
            const newSize = parseFloat(e.target.value);
            universeState.star.size = newSize;
            if (starMesh) {
                starMesh.geometry.dispose();
                starMesh.geometry = new THREE.SphereGeometry(newSize, 32, 32);
            }
        });
    }

    const starColorPicker = document.getElementById('star-color-picker');
    if (starColorPicker) {
        starColorPicker.addEventListener('input', (e) => {
            const newColorNum = parseInt(e.target.value.replace("#", "0x"));
            universeState.star.color = newColorNum;
            if (starMesh) starMesh.material.color.set(newColorNum);
        });
    }

    document.querySelectorAll('.rings-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].hasRings = e.target.checked;
            buildVisuals(); 
        });
    });
}

// ==========================================
// 6. MOUSE TRACKING & INTERACTIVE UI BUTTONS
// ==========================================
// UI Collapse / Expand Toggle Listener
document.getElementById('ui-toggle-btn').addEventListener('click', () => {
    const wrapper = document.getElementById('ui-wrapper');
    const btn = document.getElementById('ui-toggle-btn');
    
    // Toggle the collapsed class on our parent container
    wrapper.classList.toggle('collapsed');
    
    // Change the arrow icon depending on state
    if (wrapper.classList.contains('collapsed')) {
        btn.innerText = '▶'; // Point out to expand
    } else {
        btn.innerText = '◀'; // Point back to hide
    }
});

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

document.getElementById('toggle-always-show').addEventListener('change', (e) => {
    alwaysShowLabels = e.target.checked;
});

document.getElementById('add-planet-btn').addEventListener('click', () => {
    const colors = ['#ff4444', '#44ff88', '#4488ff', '#ffcc44', '#cc44ff'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const lastDistance = universeState.planets.length > 0 ? universeState.planets[universeState.planets.length - 1].d : 10;

    const planetNames = ["Aegis", "Boreas", "Cinder", "Dusk", "Echo", "Flux", "Gorgon"];
    const randomName = planetNames[Math.floor(Math.random() * planetNames.length)] + " " + (universeState.planets.length + 1);

    universeState.planets.push({
        name: randomName, s: Math.random() * 1.5 + 0.5, d: lastDistance + (Math.random() * 5 + 8), 
        c: randomColor, sp: 0.01, e: 0.0, tilt: 0.0, moons: [], hasRings: false 
    });
    buildVisuals();
    updateUI(); 
});

document.getElementById('share-btn').addEventListener('click', saveToURL);

function projectLabelPosition(meshTarget, domElementId, shouldBeVisible) {
    const element = document.getElementById(domElementId);
    if (!element) return;

    if (shouldBeVisible || alwaysShowLabels) {
        const wpVector = new THREE.Vector3();
        meshTarget.getWorldPosition(wpVector); 
        wpVector.project(camera); 

        const xPixel = (wpVector.x * .5 + .5) * window.innerWidth;
        const yPixel = (wpVector.y * -.5 + .5) * window.innerHeight;

        element.style.left = `${xPixel}px`;
        element.style.top = `${yPixel - 15}px`; 
        element.classList.add('visible');
    } else {
        element.classList.remove('visible');
    }
}

// ==========================================
// 7. THE ANIMATION LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Step A: Position Planets Relative to Sun
    planetMeshes.forEach((p, idx) => {
        const pData = universeState.planets[idx];
        if (!pData) return;
        p.angle += pData.sp; 
        const b = pData.d * Math.sqrt(1 - pData.e * pData.e);
        let x = Math.cos(p.angle) * pData.d - (pData.d * pData.e);
        let z = Math.sin(p.angle) * b;
        p.mesh.position.x = x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt);
        p.mesh.position.z = x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt);
        p.mesh.rotation.y += 0.01; 
    });

    // Step B: Position Moons Relative to Planet
    moonMeshes.forEach((m) => {
        const parentPlanetMesh = planetMeshes[m.parentIdx]?.mesh;
        if (!parentPlanetMesh) return;
        m.angle += m.speed;
        m.mesh.position.x = parentPlanetMesh.position.x + Math.cos(m.angle) * m.distance;
        m.mesh.position.z = parentPlanetMesh.position.z + Math.sin(m.angle) * m.distance;
        m.mesh.rotation.y += 0.02;
    });

    // Step C: Execute Raycasting tracking targeting loops
    raycaster.setFromCamera(mouse, camera);
    const validTargets = planetMeshes.map(p => p.mesh);
    if (starMesh) validTargets.push(starMesh);

    const intersections = raycaster.intersectObjects(validTargets);
    
    hoveredObjectId = null;
    if (intersections.length > 0) {
        const topHit = intersections[0].object;
        if (topHit.userData.type === 'star') {
            hoveredObjectId = 'star';
        } else if (topHit.userData.type === 'planet') {
            hoveredObjectId = topHit.userData.index;
        }
    }

    // Step D: Spin Black Hole Accretion Disk if active
    if (universeState.star.type === 'blackhole' && starMesh && starMesh.children.length > 0) {
        starMesh.children[0].rotation.z += 0.005; 
    }

    // Step E: Re-map coordinates of HTML overlays
    if (starMesh) {
        projectLabelPosition(starMesh, 'label-star', hoveredObjectId === 'star');
    }
    planetMeshes.forEach((p, idx) => {
        projectLabelPosition(p.mesh, `label-planet-${idx}`, hoveredObjectId === idx);
    });

    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Launch Engine
initUniverse();
animate();