import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createButterfly, disposeButterfly } from './butterfly.js';
import { species } from './species.js';
import { wrapSpecies, wheelDirection, swipeDirection } from './interaction.js';
import { FlightClock, sampleFlight, smoothBlend, atlasFov, blendCameraPosition, setWingPose, createFlightAtmosphere, ENTRY_DURATION, RETURN_DURATION } from './flight.js';
import './style.css';

const viewport = document.querySelector('#viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.querySelector('#motion');
let selected = 0;
const flight = new FlightClock();
let transition, returnView = 'dorsal', atmosphere, currentFlex = 0;
let renderer, scene, camera, controls, butterfly;
let wings = [];
let renderingAvailable = false;
let modelRequest = 0;

function updateMotion() {
  const active = flight.mode !== 'atlas';
  motionButton.textContent = !active ? '飞行观赏' : flight.paused ? '继续飞行' : '暂停飞行';
  motionButton.setAttribute('aria-pressed', String(active && !flight.paused));
  motionButton.disabled = !butterfly || flight.mode === 'returning';
  document.querySelector('#exit-flight').hidden = !active;
  for (const id of ['zoom-in', 'zoom-out']) document.getElementById(id).hidden = active;
  document.querySelector('#flight-status').textContent = !active ? '' : flight.mode === 'returning' ? '返回图谱' : flight.paused ? (reducedMotion.matches ? '减少动态已暂停 · 可主动继续' : '飞行已暂停') : '慢镜飞行 · Esc 返回图谱';
}
function snapshot() {
  return { position: butterfly.position.clone(), orientation: butterfly.quaternion.clone(), cameraPosition: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, wingAngle: wings[0]?.rotation.y || 0, wingFlex: currentFlex };
}
motionButton.addEventListener('click', () => {
  if (!butterfly || flight.mode === 'returning') return;
  if (flight.mode === 'atlas') {
    controls.enableDamping = false;
    controls.update();
    controls.enabled = false;
    transition = snapshot();
    flight.enter(reducedMotion.matches);
    updateObservation('flight');
  } else if (flight.paused) flight.resume(); else flight.pause();
  updateMotion();
});
document.querySelector('#exit-flight').addEventListener('click', () => setView('dorsal'));
document.addEventListener('visibilitychange', () => { flight.lastTimestamp = null; });
reducedMotion.addEventListener('change', event => {
  if (event.matches && flight.mode === 'flight') flight.pause();
  if (event.matches && flight.mode === 'returning') setView(returnView, true);
  if (controls && flight.mode === 'atlas') controls.enableDamping = !event.matches;
  updateMotion();
});
updateMotion();

function updateInformation() {
  const item = species[selected];
  document.documentElement.style.setProperty('--accent', item.color);
  document.querySelector('#current-number').textContent = `0${selected + 1}`;
  document.querySelector('#species-content').innerHTML = `
    <h2>${item.name}</h2><p class="latin">${item.latin}</p><p class="family">${item.representative}</p>
    <dl class="facts"><div><dt>分布区域</dt><dd>${item.habitat}</dd></div>
    <div><dt>体型印象</dt><dd>${item.size}</dd></div>
    <div><dt>翅面特征</dt><dd>${item.palette}</dd></div>
    <div><dt>生活方式</dt><dd>${item.habit}</dd></div></dl>
    <section class="story"><h3>${item.title}</h3><p>${item.text}</p><h3>${item.title2}</h3><p>${item.text2}</p></section>
    <p id="surface-observation" class="observation-note" aria-live="polite"></p>
    <details class="morphology-notes"><summary>标本依据与差异</summary><p>${item.variation}</p><p>四片翅依据同组背腹面照片分别配准；头胸腹与足为比例重建，厚度、关节角度与翅面微弯为展示近似，尚无三维扫描验证。未达到科研测量或独立鉴定精度。</p><p>身体鳞纹按各自 MHNT 高分辨率照片概括；微距补充只约束复眼、口器、鳞毛及足的空间关系，不移植未确认性别或亚种的体纹。小眼纹理与短毛是尺度示意，非显微测量。<a href="${item.bodyReference}" target="_blank" rel="noopener noreferrer">${item.bodyReferenceLabel} ↗</a></p><p>两种同属蛱蝶科：前足缩小、靠近胸部；中后足为四条主要步行足。</p><p><a href="${item.specimenDorsal}" target="_blank" rel="noopener noreferrer">MHNT 背面照片 ↗</a> · <a href="${item.specimenVentral}" target="_blank" rel="noopener noreferrer">腹面照片 ↗</a></p><p>标本摄影：Didier Descouens / Muséum de Toulouse，<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>；翅面裁切映射与轮廓配准属改编。<a href="/specimens/ATTRIBUTION.txt" target="_blank" rel="noopener noreferrer">完整署名与方法</a> · <a href="https://www.monarchwatch.org/biology/" target="_blank" rel="noopener noreferrer">形态说明</a> · <a href="https://genent.cals.ncsu.edu/insect-identification/order-lepidoptera/family-nymphalidae/" target="_blank" rel="noopener noreferrer">蛱蝶科前足</a></p></details>
    <nav class="sources" aria-label="${item.latin} 参考来源"><a href="${item.wikipedia}" target="_blank" rel="noopener noreferrer" aria-label="Wikipedia：${item.latin}（新窗口）">Wikipedia ↗</a><a href="${item.reference}" target="_blank" rel="noopener noreferrer">${item.referenceLabel} ↗</a></nav>`;
  viewport.setAttribute('aria-label', `${item.name} 3D蝴蝶。拖动旋转，滚轮或双指缩放，Shift 加滚轮或上下方向键切换展品，R 重置视角。`);
  viewport.title = '拖动旋转 · 滚轮或双指缩放 · Shift + 滚轮切换';
  updateObservation(viewport.dataset.view || 'dorsal');
}

async function replaceModel() {
  const request = ++modelRequest;
  const index = selected;
  if (butterfly) { scene.remove(butterfly); disposeButterfly(butterfly); }
  butterfly = null;
  wings = [];
  updateMotion();
  delete viewport.dataset.species;
  viewport.setAttribute('aria-busy', 'true');
  document.querySelector('#loading').hidden = false;
  try {
    const exhibit = await createButterfly(index === 1, renderer.capabilities.getMaxAnisotropy());
    if (request !== modelRequest || !renderingAvailable) { disposeButterfly(exhibit.model); return; }
    butterfly = exhibit.model;
    wings = exhibit.wings;
    butterfly.name = species[index].latin;
    scene.add(butterfly);
    viewport.dataset.species = butterfly.name;
    viewport.dataset.specimen = butterfly.userData.specimen;
    viewport.dataset.independentSurfaces = 'true';
  } catch (error) {
    if (request !== modelRequest || !renderingAvailable) return;
    document.querySelector('#fallback strong').textContent = '标本图片暂时无法加载';
    document.querySelector('#fallback p').textContent = '请刷新后重试。仍可切换物种、阅读科普与标本资料。';
    unavailable(error);
  } finally {
    if (request === modelRequest) {
      viewport.setAttribute('aria-busy', 'false');
      document.querySelector('#loading').hidden = true;
      updateMotion();
    }
  }
}

function updateObservation(view) {
  viewport.dataset.view = view;
  for (const name of ['dorsal', 'ventral', 'side']) {
    document.querySelector(`#view-${name}`).setAttribute('aria-pressed', String(view === name));
  }
  const note = document.querySelector('#surface-observation');
  if (note) note.textContent = view === 'flight' ? '飞行观赏：慢镜轨迹与翅拍为有参考的展示近似，不是该标本的实测运动。选择观察面即可返回静止图谱。' : species[selected][`${view}Observation`] || '自由观察：拖动比较两面，也可用背面、腹面快捷回到展开姿态。';
}

function setView(view, immediate = false) {
  if (!controls || !renderingAvailable) return;
  if (flight.mode !== 'atlas' && !immediate && !reducedMotion.matches && !document.hidden && butterfly) {
    transition = snapshot();
    returnView = view;
    flight.returning();
    updateMotion();
    return;
  }
  controls.enableDamping = false;
  controls.update();
  controls.reset();
  const position = view === 'ventral' ? [0, 0, -8.7] : view === 'side' ? [8.7, 0, 0] : [0, 0, 8.7];
  camera.position.set(...position).setLength(8.7);
  camera.up.set(0, 1, 0);
  camera.fov = atlasFov(camera.aspect);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.enabled = true;
  controls.update();
  controls.enableDamping = !reducedMotion.matches;
  flight.reset();
  butterfly?.position.set(0, 0, 0);
  butterfly?.quaternion.identity();
  setWingPose(wings, 0);
  currentFlex = 0;
  if (atmosphere) atmosphere.visible = false;
  updateMotion();
  updateObservation(view);
}
function resetView() { setView('dorsal'); }
for (const view of ['dorsal', 'ventral', 'side']) document.querySelector(`#view-${view}`).addEventListener('click', () => setView(view));
function selectSpecies(direction) {
  selected = wrapSpecies(selected, direction, species.length);
  updateInformation();
  document.querySelector('.information').scrollTop = 0;
  if (renderingAvailable) { setView('dorsal', true); replaceModel(); }
}
document.querySelector('#previous').addEventListener('click', () => selectSpecies(-1));
document.querySelector('#next').addEventListener('click', () => selectSpecies(1));
document.querySelector('#reset').addEventListener('click', resetView);
function zoom(factor) {
  if (!controls || !renderingAvailable || flight.mode !== 'atlas') return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
document.querySelector('#zoom-in').addEventListener('click', () => zoom(.85));
document.querySelector('#zoom-out').addEventListener('click', () => zoom(1.18));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && flight.mode !== 'atlas') { setView('dorsal'); return; }
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
  document.querySelector('#loading').hidden = true;
  viewport.setAttribute('aria-busy', 'false');
  for (const selector of ['#zoom-in', '#zoom-out', '#reset', '#motion', '#exit-flight', '#view-dorsal', '#view-ventral', '#view-side']) document.querySelector(selector).disabled = true;
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
  atmosphere = createFlightAtmosphere();
  scene.add(atmosphere);
  camera = new THREE.PerspectiveCamera(39, 1, .1, 60);
  camera.position.set(0, 0, 8.7);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = .1;
  controls.minDistance = 3.8;
  controls.maxDistance = 14;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .7;
  controls.saveState();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9c9991, 2.4));
  const key = new THREE.SpotLight(0xffffff, 65);
  key.position.set(-2, 4, 6);
  key.angle = .7;
  key.penumbra = 1;
  scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 55);
  rim.position.set(2, 2, -5);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffffff, 18);
  warm.position.set(-4, -2, 3);
  scene.add(warm);
  function resize() {
    const { width, height } = viewport.getBoundingClientRect();
    const previousFov = atlasFov(camera.aspect);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    if (transition) transition.fov *= atlasFov(camera.aspect) / previousFov;
    camera.fov = atlasFov(camera.aspect);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();
  renderingAvailable = true;
  replaceModel();
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable(); });
  renderer.setAnimationLoop(time => {
    flight.tick(time, !document.hidden);
    if (document.hidden) return;
    if (butterfly && flight.mode !== 'atlas') {
      const returning = flight.mode === 'returning';
      const pose = returning ? {
        position: new THREE.Vector3(), orientation: new THREE.Quaternion(),
        cameraPosition: new THREE.Vector3(...(returnView === 'ventral' ? [0,0,-8.7] : returnView === 'side' ? [8.7,0,0] : [0,0,8.7])),
        target: new THREE.Vector3(), fov: atlasFov(camera.aspect), wingAngle: 0, wingFlex: 0
      } : sampleFlight(flight.elapsed, selected === 1, camera.aspect);
      const blend = smoothBlend(flight.elapsed / (returning ? RETURN_DURATION : ENTRY_DURATION));
      butterfly.position.lerpVectors(transition.position, pose.position, blend);
      butterfly.quaternion.slerpQuaternions(transition.orientation, pose.orientation, blend);
      controls.target.lerpVectors(transition.target, pose.target, blend);
      camera.position.copy(blendCameraPosition(transition, pose, controls.target, blend));
      camera.fov = THREE.MathUtils.lerp(transition.fov, pose.fov, blend);
      camera.up.set(0,1,0);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      currentFlex = THREE.MathUtils.lerp(transition.wingFlex, pose.wingFlex, blend);
      setWingPose(wings, THREE.MathUtils.lerp(transition.wingAngle, pose.wingAngle, blend), currentFlex);
      atmosphere.visible = true;
      atmosphere.children.forEach(sprite => { sprite.material.opacity = .11 * (returning ? 1 - blend : blend); });
      if (returning && blend === 1) setView(returnView, true);
    } else controls.update();
    viewport.dataset.flightMode = flight.mode;
    viewport.dataset.flightPaused = String(flight.paused);
    viewport.dataset.flightTime = flight.elapsed.toFixed(4);
    viewport.dataset.modelPosition = butterfly?.position.toArray().join(',') || '';
    viewport.dataset.fov = camera.fov.toFixed(4);
    renderer.render(scene, camera);
    viewport.dataset.cameraDistance = camera.position.distanceTo(controls.target).toFixed(3);
    viewport.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(',');
    if (wings.length) viewport.dataset.wingAngle = wings[0].rotation.y.toFixed(5);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const view = direction.z > .985 ? 'dorsal' : direction.z < -.985 ? 'ventral' : Math.abs(direction.x) > .97 ? 'side' : 'oblique';
    if (flight.mode === 'atlas' && view !== viewport.dataset.view) updateObservation(view);
  });
} catch (error) { unavailable(error); }
