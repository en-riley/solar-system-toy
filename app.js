// ==========================================
// 1. STATE MANAGEMENT (The Source of Truth)
// ==========================================
let universeState = {
    star: { size: 4, color: 0xffaa00 },
    planets: []
};

// 3D Objects tracking arrays
let planetMeshes = [];

// ==========================================
// 2. INITIALIZE THREE.JS ENGINE
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Camera setup
// Ensure camera is elevated and pulled back to view a wide area immediately
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 35, 60); // Raised slightly higher (Y=35, Z=60)

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
    // 1. Check if a shared system exists in the URL first
    const loadedState = loadFromURL();
    if (loadedState) {
        universeState = loadedState;
    } else {
        // Clear any half-baked objects to ensure a fresh structural state
        universeState.planets = [];
        // Default starter planet if URL is empty
        universeState.planets.push({ s: 1.2, d: 15, c: '#00aaff', sp: 0.01, e: 0.0, tilt: 0.0 });
    }

    // 2. Clear old placeholders out of the Three.js ecosystem and spawn fresh meshes
    buildVisuals();
    
    // 3. Populate the sidebar control card framework
    updateUI();
}

// Global array to track the visual orbit line meshes
let orbitLines = [];

function buildVisuals() {
    // 1. DYNAMIC CLEANUP: Safely dispose of and remove old planet objects
    // BUT preserve their current angles so they don't jump around on slider change!
    let existingAngles = [];
    if (planetMeshes && planetMeshes.length > 0) {
        planetMeshes.forEach((p, idx) => {
            existingAngles[idx] = p.angle; // Save where the planet currently is in its orbit
            scene.remove(p.mesh);
            if (p.mesh.geometry) p.mesh.geometry.dispose();
            if (p.mesh.material) p.mesh.material.dispose();
        });
    }

    // 2. DYNAMIC CLEANUP: Safely dispose of and remove old orbit tracks
    if (orbitLines && orbitLines.length > 0) {
        orbitLines.forEach(line => {
            scene.remove(line);
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
    }

    // 3. Central Star Management
    if (!scene.getObjectByName("central-star")) {
        const starGeo = new THREE.SphereGeometry(universeState.star.size, 32, 32);
        const starMat = new THREE.MeshBasicMaterial({ color: universeState.star.color });
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.name = "central-star";
        scene.add(starMesh);
    }

    // Reset tracking arrays
    planetMeshes = [];
    orbitLines = [];

    // 4. Generate fresh 3D objects from the state
    universeState.planets.forEach((pData, idx) => {
        // Create Planet Mesh
        const pGeo = new THREE.SphereGeometry(pData.s, 32, 32);
        const pMat = new THREE.MeshStandardMaterial({ color: pData.c, roughness: 0.6 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        scene.add(pMesh);

        // Generate Elliptical Orbit Line Mesh
        const lineMaterial = new THREE.LineBasicMaterial({ color: pData.c, transparent: true, opacity: 0.25 });
        const lineGeometry = new THREE.BufferGeometry();
        const points = [];
        
        const segments = 128;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const a = pData.d; 
            const b = a * Math.sqrt(1 - pData.e * pData.e);
            const focusShift = a * pData.e;

            let x = Math.cos(theta) * a - focusShift;
            let z = Math.sin(theta) * b;

            const tiltedX = x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt);
            const tiltedZ = x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt);

            points.push(new THREE.Vector3(tiltedX, 0, tiltedZ));
        }
        
        lineGeometry.setFromPoints(points);
        const orbitLine = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(orbitLine);
        orbitLines.push(orbitLine);

        // FIX: Use the existing angle if it exists, otherwise generate a random starter angle
        const currentAngle = (existingAngles[idx] !== undefined) ? existingAngles[idx] : Math.random() * Math.PI * 2;
        
        // Give the mesh its initial 3D position immediately
        const a = pData.d;
        const b = a * Math.sqrt(1 - pData.e * pData.e);
        const focusShift = a * pData.e;
        let x = Math.cos(currentAngle) * a - focusShift;
        let z = Math.sin(currentAngle) * b;
        
        pMesh.position.x = x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt);
        pMesh.position.z = x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt);

        planetMeshes.push({
            mesh: pMesh,
            angle: currentAngle
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
    
    navigator.clipboard.writeText(shareURL).then(() => {
        alert("Share link copied to clipboard!");
    });
}

function loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('sys');
    if (!data) return null;
    try {
        return JSON.parse(decodeURIComponent(atob(data)));
    } catch(e) {
        console.error("Malformed URL configuration link.");
        return null;
    }
}
// ==========================================
// NEW: GENERATE UI CONTROLS DYNAMICALLY
// ==========================================
function updateUI() {
    const planetList = document.getElementById('planet-list');
    planetList.innerHTML = ''; // Clear the sidebar list

    universeState.planets.forEach((pData, index) => {
        // Create a card container for the planet's sliders
        const card = document.createElement('div');
        card.className = 'planet-control-card';
        
        card.innerHTML = `
            <h4>
                <span>Planet #${index + 1}</span>
                <button class="delete-btn" data-index="${index}">X</button>
            </h4>
            <div class="control-group">
                <label>Size</label>
                <input type="range" class="size-slider" data-index="${index}" min="0.2" max="4" step="0.1" value="${pData.s}">
            </div>
            <div class="control-group">
                <label>Orbit Distance</label>
                <input type="range" class="dist-slider" data-index="${index}" min="8" max="100" step="1" value="${pData.d}">
            </div>
            <div class="control-group">
                <label>Orbit Speed / Timing</label>
                <input type="range" class="speed-slider" data-index="${index}" min="0.0" max="0.08" step="0.001" value="${pData.sp}">
            </div>
            <div class="control-group">
                <label>Orbit Shape (Oval)</label>
                <input type="range" class="ecc-slider" data-index="${index}" min="0.0" max="0.9" step="0.05" value="${pData.e}">
            </div>
            <div class="control-group">
                <label>Orbit Angle Offset</label>
                <input type="range" class="tilt-slider" data-index="${index}" min="0" max="6.28" step="0.05" value="${pData.tilt}">
            </div>
            <div class="control-group">
                <label>Color</label>
                <input type="color" class="color-picker" data-index="${index}" value="${pData.c}">
            </div>
        `;
        
        planetList.appendChild(card);
    });

    // Attach event listeners to all the newly generated sliders
    attachSliderListeners();
}

function attachSliderListeners() {
    // Size sliders
    document.querySelectorAll('.size-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            const newSize = parseFloat(e.target.value);
            
            // 1. Update the state data
            universeState.planets[idx].s = newSize;
            
            // 2. Update the 3D element live without recreating the whole universe
            const mesh = planetMeshes[idx].mesh;
            mesh.geometry.dispose(); // Delete old geometry from memory
            mesh.geometry = new THREE.SphereGeometry(newSize, 32, 32);
        });
    });

    // Distance sliders
    document.querySelectorAll('.dist-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            const newDist = parseFloat(e.target.value);
            
            universeState.planets[idx].d = newDist;
            
            // REMOVE this old line:
            // planetMeshes[idx].distance = newDist; 

            // ADD THIS INSTEAD: 
            // Re-draw all orbit line paths and meshes instantly to reflect the new distance
            buildVisuals(); 
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

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            
            // Remove from 3D scene
            scene.remove(planetMeshes[idx].mesh);
            
            // Remove from our logic arrays
            universeState.planets.splice(idx, 1);
            planetMeshes.splice(idx, 1);
            
            // Refresh UI cards to update numbering/indices
            updateUI();
        });
    });

    // Speed / Timing slider
    document.querySelectorAll('.speed-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].sp = parseFloat(e.target.value);
        });
    });

    // Eccentricity shape slider
    document.querySelectorAll('.ecc-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].e = parseFloat(e.target.value);
            buildVisuals(); // Re-draw orbit line path changes instantly
        });
    });

    // Tilt Angle Offset slider
    document.querySelectorAll('.tilt-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            universeState.planets[idx].tilt = parseFloat(e.target.value);
            buildVisuals(); // Re-draw rotated paths instantly
        });
    });
}
// ==========================================
// 5. INTERACTIVE UI BUTTONS
// ==========================================
document.getElementById('add-planet-btn').addEventListener('click', () => {
    const colors = ['#ff4444', '#44ff88', '#4488ff', '#ffcc44', '#cc44ff'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const lastDistance = universeState.planets.length > 0 ? universeState.planets[universeState.planets.length - 1].d : 10;

    // Add exactly ONE new planet dataset
    universeState.planets.push({
        s: Math.random() * 1.5 + 0.5,     
        d: lastDistance + (Math.random() * 5 + 8), 
        c: randomColor,                    
        sp: 0.01,                          
        e: 0.0,                            
        tilt: 0.0                          
    });

    // Refresh the visuals and UI sidebars safely
    buildVisuals();
    updateUI(); 
});

document.getElementById('share-btn').addEventListener('click', saveToURL);

// ==========================================
// 6. THE ANIMATION LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    planetMeshes.forEach((p, idx) => {
        const pData = universeState.planets[idx];
        if (!pData) return;

        // Progress the timing position along the track
        p.angle += pData.sp; 

        // Compute actual 3D positioning using the same math as the line loop
        const a = pData.d;
        const b = a * Math.sqrt(1 - pData.e * pData.e);
        const focusShift = a * pData.e;

        let x = Math.cos(p.angle) * a - focusShift;
        let z = Math.sin(p.angle) * b;

        // Apply tilt offset rotation live
        p.mesh.position.x = x * Math.cos(pData.tilt) - z * Math.sin(pData.tilt);
        p.mesh.position.z = x * Math.sin(pData.tilt) + z * Math.cos(pData.tilt);
        
        p.mesh.rotation.y += 0.01; 
    });

    controls.update();
    renderer.render(scene, camera);
}

// Window resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Run!
initUniverse();
animate();