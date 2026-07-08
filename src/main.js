import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { getSession, initAuthUI, onAuthStateChange, signOut } from './auth.js';
import { initBillingUI, getBillingStatus, updateTierBadge } from './billing.js';
import { setTier, applyTierGating } from './tierGate.js';
import { initChat } from './chat.js';

// ── Auth Flow ─────────────────────────────────────────────
async function initApp() {
    initAuthUI();
    initBillingUI();

    const session = await getSession();

    if (!session) {
        // Show auth modal
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.classList.remove('hidden');
        return;
    }

    // User is logged in — proceed
    await startApp();
}

let appStarted = false;
async function startApp() {
    if (appStarted) return;
    appStarted = true;

    // Load billing status and set tier
    try {
        const billing = await getBillingStatus();
        window.lumaDailyCount = billing.dailyMessageCount || 0;
        setTier(billing.tier || 'free');
        updateTierBadge(billing.tier || 'free');
    } catch (e) {
        console.error('Billing status error:', e);
        setTier('free');
        updateTierBadge('free');
    }

    // Initialize chat
    initChat();

    // Apply tier gating after chat initializes (so archetype cards exist)
    setTimeout(() => applyTierGating(), 100);

    // Init 3D scene
    init3D();
}

// Listen for auth changes
onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.classList.add('hidden');
        await startApp();
    } else if (event === 'SIGNED_OUT') {
        window.location.reload();
    }
});

// Logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await signOut();
        window.location.reload();
    });
}

// ── 3D Scene ──────────────────────────────────────────────
function init3D() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1, 0);
    controls.maxPolarAngle = Math.PI / 2 + 0.2;
    controls.minDistance = 1;
    controls.maxDistance = 5;
    controls.enablePan = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 5, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8b5cf6, 0.5);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    // Emotion-driven lighting
    window.addEventListener('emotionsChanged', (e) => {
        const { afinidad, enojo } = e.detail;
        const enojoFactor = enojo / 100;
        const baseLightIntensity = 1.2 - (enojoFactor * 0.8);
        const colorHex = new THREE.Color().setHSL(0.0, 1.0, 1.0 - (enojoFactor * 0.5));
        dirLight.color.copy(colorHex);
        dirLight.intensity = baseLightIntensity;

        const afFactor = afinidad / 100;
        const fillHex = new THREE.Color().setHSL(0.8, afFactor, 0.5);
        fillLight.color.copy(fillHex);
        fillLight.intensity = 0.2 + (afFactor * 0.6);
    });

    window.addEventListener('userTyping', (e) => {
        const len = Math.min(e.detail.length, 100);
        const typingFactor = len / 100;
        dirLight.position.set(5 - (typingFactor * 2), 5, 5 + (typingFactor));
    });

    // Load 3D model
    const loader = new GLTFLoader();
    const modeloUrl = '/avatar.glb';
    let currentModel = null;

    function saveModelToDB(file) {
        const request = indexedDB.open("ParejaDB", 1);
        request.onupgradeneeded = e => e.target.result.createObjectStore("models");
        request.onsuccess = e => {
            e.target.result.transaction("models", "readwrite").objectStore("models").put(file, "customModel");
        };
    }

    function loadModelFromDB(callback, fallback) {
        const request = indexedDB.open("ParejaDB", 1);
        request.onupgradeneeded = e => e.target.result.createObjectStore("models");
        request.onsuccess = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("models")) return fallback();
            const tx = db.transaction("models", "readonly");
            const getReq = tx.objectStore("models").get("customModel");
            getReq.onsuccess = () => getReq.result ? callback(getReq.result) : fallback();
            getReq.onerror = fallback;
        };
        request.onerror = fallback;
    }

    function loadGLTF(url) {
        loader.load(url, (gltf) => {
            if (currentModel) scene.remove(currentModel);
            currentModel = gltf.scene;
            currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(currentModel);
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            currentModel.position.x += (0 - center.x);
            currentModel.position.y += (0.5 - center.y);
            currentModel.position.z += (0 - center.z);
        }, undefined, () => {
            if (currentModel) scene.remove(currentModel);
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.2, metalness: 0.8 });
            currentModel = new THREE.Mesh(geometry, material);
            currentModel.position.y = 1;
            currentModel.castShadow = true;
            scene.add(currentModel);
        });
    }

    loadModelFromDB((file) => {
        loadGLTF(URL.createObjectURL(file));
    }, () => {
        loadGLTF(modeloUrl);
    });

    const modelUpload = document.getElementById('model-upload');
    if (modelUpload) {
        modelUpload.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                saveModelToDB(file);
                loadGLTF(URL.createObjectURL(file));
            }
        });
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        if (currentModel) {
            currentModel.position.y += Math.sin(Date.now() * 0.001) * 0.0005;
        }
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, { passive: true });
}

// Boot
initApp();
