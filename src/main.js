import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createButterfly, disposeButterfly } from './butterfly.js';
import { species } from './species.js';
import { wrapSpecies, wheelDirection, swipeDirection } from './interaction.js';
import './style.css';

const viewport = document.querySelector('#viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.querySelector('#motion');
let selected = 0;
let paused = reducedMotion.matches;
let renderer, scene, camera, controls, butterfly;
let wings = [];
let renderingAvailable = false;
let animationTime = 0;
let previousTime = null;

function updateMotion() {
  motionButton.textContent = paused ? '开启扇翅' : '暂停扇翅';
  motionButton.setAttribute('aria-pressed', String(paused));
}
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
reducedMotion.addEventListener('change', event => {
  paused = event.matches;
  if (controls) controls.enableDamping = !event.matches;
  updateMotion();
});
updateMotion();

function updateInformation() {
  const item = species[selected];
  document.documentElement.style.setProperty('--accent', item.color);
  document.querySelector('#family').textContent = '蛱蝶科';
  document.querySelector('#current-number').textContent = `0${selected + 1}`;
  document.querySelector('#specimen-number').textContent = `SPECIMEN 00${selected + 1}`;
  document.querySelector('#species-content').innerHTML = `
    <p class="species-index">0${selected + 1} / ${item.label}</p>
    <h2>${item.name}</h2><p class="latin">${item.latin}</p><p class="tagline">${item.tagline}</p>
    <dl class="facts"><div><dt>分布区域</dt><dd>${item.habitat}</dd></div>
    <div><dt>体型印象</dt><dd>${item.size}</dd></div>
    <div><dt>翅面特征</dt><dd>${item.palette}</dd></div>
    <div><dt>生活方式</dt><dd>${item.habit}</dd></div></dl>
    <section class="story"><h3>${item.title}</h3><p>${item.text}</p><h3>${item.title2}</h3><p>${item.text2}</p></section>`;
  viewport.setAttribute('aria-label', `${item.name} 3D蝴蝶。拖动旋转，滚轮缩放，上下方向键切换展品。`);
}

function replaceModel() {
  if (butterfly) { scene.remove(butterfly); disposeButterfly(butterfly); }
  const exhibit = createButterfly(selected === 1, renderer.capabilities.getMaxAnisotropy());
  butterfly = exhibit.model;
  wings = exhibit.wings;
  butterfly.name = species[selected].latin;
  scene.add(butterfly);
  viewport.dataset.species = butterfly.name;
}

function resetView() {
  if (!controls || !renderingAvailable) return;
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.reset();
  controls.enableDamping = damping;
}
function selectSpecies(direction) {
  selected = wrapSpecies(selected, direction, species.length);
  updateInformation();
  document.querySelector('.information').scrollTop = 0;
  if (renderingAvailable) { replaceModel(); resetView(); }
}
document.querySelector('#previous').addEventListener('click', () => selectSpecies(-1));
document.querySelector('#next').addEventListener('click', () => selectSpecies(1));
document.querySelector('#reset').addEventListener('click', resetView);
function zoom(factor) {
  if (!controls || !renderingAvailable) return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
document.querySelector('#zoom-in').addEventListener('click', () => zoom(.85));
document.querySelector('#zoom-out').addEventListener('click', () => zoom(1.18));
document.addEventListener('keydown', event => {
  if (event.target.closest('.information') || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectSpecies(event.key === 'ArrowDown' ? 1 : -1);
  }
  if (event.target === viewport && (event.key === '+' || event.key === '=')) zoom(.85);
  if (event.target === viewport && event.key === '-') zoom(1.18);
  if (event.target === viewport && event.key.toLowerCase() === 'r') resetView();
});

let lastWheelSwitch = -Infinity;
viewport.addEventListener('wheel', event => {
  if (!event.shiftKey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const direction = wheelDirection(event.deltaX, event.deltaY);
  if (direction && performance.now() - lastWheelSwitch > 500) {
    selectSpecies(direction);
    lastWheelSwitch = performance.now();
  }
}, { capture: true, passive: false });

let swipeStart = null;
let suppressClickUntil = 0;
const navigation = document.querySelector('.exhibit-nav');
navigation.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  swipeStart = { vertical: event.clientY, horizontal: event.clientX, pointerId: event.pointerId };
  navigation.setPointerCapture(event.pointerId);
});
navigation.addEventListener('pointerup', event => {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
  const direction = swipeDirection(swipeStart, { vertical: event.clientY, horizontal: event.clientX });
  if (direction) {
    selectSpecies(direction);
    suppressClickUntil = performance.now() + 500;
  } else {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target?.closest('#previous')) selectSpecies(-1);
    if (target?.closest('#next')) selectSpecies(1);
    suppressClickUntil = performance.now() + 500;
  }
  swipeStart = null;
});
navigation.addEventListener('pointercancel', () => { swipeStart = null; });
navigation.addEventListener('click', event => {
  if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
}, true);

function unavailable(error) {
  renderingAvailable = false;
  renderer?.setAnimationLoop(null);
  if (controls) controls.enabled = false;
  if (renderer) renderer.domElement.hidden = true;
  document.querySelector('#fallback').hidden = false;
  for (const selector of ['#zoom-in', '#zoom-out', '#reset', '#motion']) document.querySelector(selector).disabled = true;
  if (error) console.warn('3D gallery unavailable:', error);
}

updateInformation();
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  viewport.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(39, 1, .1, 60);
  camera.position.set(0, 0, 8.7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = .1;
  controls.minDistance = 5.4;
  controls.maxDistance = 14;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .7;
  controls.saveState();
  scene.add(new THREE.HemisphereLight(0xc5e9ff, 0x172333, 2));
  const key = new THREE.SpotLight(0xe5f6ff, 100);
  key.position.set(-2, 4, 6);
  key.angle = .7;
  key.penumbra = 1;
  scene.add(key);
  const rim = new THREE.PointLight(0x1598e0, 28);
  rim.position.set(4, -1, 2);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffd4a8, 18);
  warm.position.set(-4, -2, 3);
  scene.add(warm);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.905, 128), new THREE.MeshBasicMaterial({ color: 0x385057, transparent: true, opacity: .25, side: THREE.DoubleSide }));
  ring.position.z = -1;
  scene.add(ring);
  function resize() {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(2.9, 3.4 / camera.aspect) / 8.7));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();
  renderingAvailable = true;
  replaceModel();
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable(); });
  renderer.setAnimationLoop(time => {
    const delta = previousTime === null ? 0 : Math.min(time - previousTime, 50);
    previousTime = time;
    if (!paused && !document.hidden) animationTime += delta;
    wings.forEach((wing, index) => {
      wing.rotation.y = (index === 0 ? -1 : 1) * (Math.sin(animationTime * .0015) * .085 + .055);
    });
    controls.update();
    renderer.render(scene, camera);
    viewport.dataset.cameraDistance = camera.position.distanceTo(controls.target).toFixed(3);
    viewport.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(',');
    viewport.dataset.wingAngle = wings[0].rotation.y.toFixed(5);
  });
} catch (error) { unavailable(error); }
