// ==========================================
// 1. STATE MANAGEMENT (The Source of Truth)
// ==========================================
let universeState = {
    star: { name: "Sol", size: 4, color: 0xffaa00 }, 
    planets: []
};

// 3D Objects tracking arrays
let planetMeshes = [];
let orbitLines = [];
let moonMeshes = []; 
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
            moons: [] 
        });
    }

    buildVisuals();
    updateUI();
}

function buildVisuals() {
    // Clean up older graphic arrays out of hardware memory pools
    if (planetMeshes) planetMeshes.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
    if (orbitLines) orbitLines.forEach(line => { scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
    if (moonMeshes) moonMeshes.forEach(m => { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); });
    if (starMesh) { scene.remove(starMesh); starMesh.geometry.dispose(); starMesh.material.dispose(); }

    let existingPlanetAngles = planetMeshes ? planetMeshes.map(p => p.angle) : [];
    let existingMoonAngles = {};
    if (moonMeshes) {
        moonMeshes.forEach(m => { existingMoonAngles[`${m.parentIdx}-${m.angle}`] = m.angle; });
    }

    // Build Central Star
    const starGeo = new THREE.SphereGeometry(universeState.star.size, 32, 32);
    const starMat = new THREE.MeshBasicMaterial({ color: universeState.star.color });
    starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.userData = { type: 'star' }; 
    scene.add(starMesh);

    planetMeshes = [];
    orbitLines = [];
    moonMeshes = [];

    // Clear and build the flat 2D HTML Label text overlay system
    const labelsContainer = document.getElementById('labels-container');
    labelsContainer.innerHTML = '';

    // Create label specifically for the central Sun
    const starLabel = document.createElement('div');
    starLabel.className = 'space-label star-label';
    starLabel.id = 'label-star';
    starLabel.innerText = universeState.star.name;
    labelsContainer.appendChild(starLabel);

    // Build Planet structures out of current state values
    universeState.planets.forEach((pData, pIdx) => {
        const pGeo = new THREE.SphereGeometry(pData.s, 32, 32);
        const pMat = new THREE.MeshStandardMaterial({ color: pData.c, roughness: 0.6 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.userData = { type: 'planet', index: pIdx }; 
        scene.add(pMesh);

        // Track structural orbit line loops
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

        // Build HTML overlay badge node for this planet
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

            moonMeshes.push({
                mesh: mMesh,
                parentIdx: pIdx,
                distance: mData.d,
                speed: mData.sp,
                angle: mAngle
            });
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

    // Inject dedicated control card for the Central Star at the top of the list
    const starCard = document.createElement('div');
    starCard.className = 'planet-control-card';
    starCard.style.borderLeftColor = '#ffaa00'; 
    starCard.innerHTML = `
        <h4>
            <span style="color: #ffcc00;">🌟 Star Name</span>
        </h4>
        <input type="text" id="star-name-input" value="${universeState.star.name}" 
               style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:white; font-weight:bold; font-size:15px; padding:4px; width:95%;">
    `;
    planetList.appendChild(starCard);

    // Build cards for all existing planets
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
    // Size sliders
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

    // Distance sliders
    document.querySelectorAll('.dist-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].d = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    // Speed / Timing slider
    document.querySelectorAll('.speed-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].sp = parseFloat(e.target.value);
        });
    });

    // Color pickers
    document.querySelectorAll('.color-picker').forEach(picker => {
        picker.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            const newColor = e.target.value;
            universeState.planets[idx].c = newColor;
            planetMeshes[idx].mesh.material.color.set(newColor);
        });
    });

    // Delete planet buttons
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

    // Eccentricity shape slider
    document.querySelectorAll('.ecc-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].e = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    // Tilt Angle Offset slider
    document.querySelectorAll('.tilt-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].tilt = parseFloat(e.target.value);
            buildVisuals(); 
        });
    });

    // Planet Name Live Input Listener
    document.querySelectorAll('.name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].name = e.target.value;
            const element = document.getElementById(`label-planet-${idx}`);
            if (element) element.innerText = e.target.value;
        });
    });

    // Moon Name Input Listener
    document.querySelectorAll('.moon-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const pIdx = e.target.dataset.planetIndex;
            const mIdx = e.target.dataset.moonIndex;
            universeState.planets[pIdx].moons[mIdx].name = e.target.value;
        });
    });

    // Delete Moon Button Listener
    document.querySelectorAll('.delete-moon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pIdx = parseInt(e.target.dataset.planetIndex);
            const mIdx = parseInt(e.target.dataset.moonIndex);
            universeState.planets[pIdx].moons.splice(mIdx, 1);
            buildVisuals();
            updateUI();
        });
    });

    // Add Moon Button Listener
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

    // Central Star Name Input Listener
    const starInput = document.getElementById('star-name-input');
    if (starInput) {
        starInput.addEventListener('input', (e) => {
            universeState.star.name = e.target.value;
            const starLabel = document.getElementById('label-star');
            if (starLabel) starLabel.innerText = e.target.value;
        });
    }
}

// ==========================================
// 6. MOUSE TRACKING & INTERACTIVE UI BUTTONS
// ==========================================

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
        c: randomColor, sp: 0.01, e: 0.0, tilt: 0.0, moons: [] 
    });
    buildVisuals();
    updateUI(); 
});

document.getElementById('share-btn').addEventListener('click', saveToURL);

// Helper function to project standard 3D scene vectors onto a flat 2D viewport sheet
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

    // Step D: Re-map projected coordinates of flat HTML text overlays
    if (starMesh) {
        projectLabelPosition(starMesh, 'label-star', hoveredObjectId === 'star');
    }
    planetMeshes.forEach((p, idx) => {
        projectLabelPosition(p.mesh, `label-planet-${idx}`, hoveredObjectId === idx);
    });

    controls.update();
    renderer.render(scene, camera);
}

// Window resizing adjustments
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Launch Engine
initUniverse();
animate();