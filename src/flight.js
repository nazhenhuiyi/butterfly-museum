import * as THREE from 'three';

export const SHOT_DURATION = 24;
export const ENTRY_DURATION = 2.8;
export const RETURN_DURATION = .85;
const fullTurn = Math.PI * 2;
const worldUp = new THREE.Vector3(0, 1, 0);

export function smoothBlend(value) {
  const progress = THREE.MathUtils.clamp(value, 0, 1);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

export function atlasFov(aspect) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(2.9, 3.4 / aspect) / 8.7));
}

export function blendCameraPosition(from, to, target, progress) {
  const initialOffset = from.cameraPosition.clone().sub(from.target);
  const finalOffset = to.cameraPosition.clone().sub(to.target);
  const distance = THREE.MathUtils.lerp(initialOffset.length(), finalOffset.length(), progress);
  const rotation = new THREE.Quaternion().setFromUnitVectors(initialOffset.normalize(), finalOffset.normalize());
  rotation.slerp(new THREE.Quaternion(), 1 - progress);
  return initialOffset.applyQuaternion(rotation).multiplyScalar(distance).add(target);
}

function pathPoint(phase) {
  return new THREE.Vector3(2.1 * Math.sin(phase), .25 * Math.sin(phase * 2) + .14 * Math.cos(phase), 1.4 * Math.cos(phase) + .18 * Math.sin(phase * 2));
}

export function sampleFlight(seconds, monarch = false, aspect = 1) {
  const time = ((seconds % SHOT_DURATION) + SHOT_DURATION) % SHOT_DURATION;
  const phase = time / SHOT_DURATION * fullTurn;
  const cycles = (monarch ? 3 : 2.5) * time + .16 * Math.sin(phase);
  const stroke = cycles - Math.floor(cycles);
  const downstroke = stroke < .42;
  const strokeProgress = downstroke ? stroke / .42 : (stroke - .42) / .58;
  const ease = (1 - Math.cos(strokeProgress * Math.PI)) / 2;
  const upper = 1.16 + .035 * Math.sin(phase);
  const lower = -.43 + .025 * Math.cos(phase * 2);
  const wingAngle = downstroke ? THREE.MathUtils.lerp(upper, lower, ease) : THREE.MathUtils.lerp(lower, upper, ease);
  const wingFlex = .065 * Math.sin(fullTurn * stroke - .3) * (1 - .15 * Math.cos(phase));
  const forward = new THREE.Vector3(2.1 * Math.cos(phase), 0, -1.4 * Math.sin(phase) + .36 * Math.cos(phase * 2)).normalize();
  const right = forward.clone().cross(worldUp).normalize();
  const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, forward, worldUp));
  const pitch = .13 + .045 * Math.cos(fullTurn * stroke + .2) + .025 * Math.sin(phase);
  const bank = -.15 + .045 * Math.cos(phase * 2);
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bank));
  const position = pathPoint(phase);
  position.y += .06 * Math.sin(fullTurn * stroke);
  const azimuth = Math.PI * .76 + .55 * Math.sin(phase - .35);
  const elevation = .77 + .09 * Math.sin(phase + .5);
  const distance = 9.3 - .65 * Math.sin(phase - .5);
  const cameraOffset = forward.clone().multiplyScalar(Math.cos(azimuth) * Math.cos(elevation))
    .addScaledVector(right, Math.sin(azimuth) * Math.cos(elevation)).addScaledVector(worldUp, Math.sin(elevation)).multiplyScalar(distance);
  const cameraPosition = pathPoint(phase - .42 / SHOT_DURATION * fullTurn).add(cameraOffset);
  const target = pathPoint(phase).addScaledVector(forward, .35 + .18 * Math.sin(phase))
    .addScaledVector(right, .30 * Math.sin(phase + .8)).addScaledVector(worldUp, .28);
  return {
    position, orientation, cameraPosition, target, wingAngle, wingFlex,
    fov: atlasFov(aspect) * (1 + .025 * Math.sin(phase)),
    phase: time < 5 ? '掠起' : time < 12 ? '侧后跟随' : time < 19 ? '弧线环绕' : '舒展回环',
    pitch, bank, time
  };
}

export class FlightClock {
  constructor() { this.reset(); }
  reset() {
    this.mode = 'atlas';
    this.paused = false;
    this.elapsed = 0;
    this.lastTimestamp = null;
  }
  enter(reduce = false) {
    this.reset();
    this.mode = 'flight';
    this.paused = reduce;
  }
  pause() { this.paused = true; this.lastTimestamp = null; }
  resume() { this.paused = false; this.lastTimestamp = null; }
  returning() {
    this.mode = 'returning';
    this.elapsed = 0;
    this.resume();
  }
  tick(timestamp, visible = true) {
    if (!visible || this.mode === 'atlas' || this.paused) { this.lastTimestamp = null; return this.elapsed; }
    if (this.lastTimestamp !== null) {
      const delta = timestamp - this.lastTimestamp;
      if (delta >= 0 && delta <= 250) this.elapsed += delta / 1000;
    }
    this.lastTimestamp = timestamp;
    return this.elapsed;
  }
}

export function setWingPose(wings, angle, flex = 0) {
  wings.forEach((wing, index) => {
    wing.rotation.y = (index === 0 ? 1 : -1) * angle;
    wing.traverse(object => {
      if (object.material?.userData.wingFlex) object.material.userData.wingFlex.value = flex;
    });
  });
}

export function createFlightAtmosphere() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    const radius = Math.hypot((column - size / 2) / (size / 2), (row - size / 2) / (size / 2));
    const alpha = Math.exp(-radius * radius * 6) * Math.max(0, 1 - radius) * 255;
    pixels.set([255,255,255,alpha], (row * size + column) * 4);
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const group = new THREE.Group();
  group.name = 'flight-depth-lights';
  for (const [horizontal, vertical, depth, scale, color] of [
    [-6,2,-8,7,0x62979e], [6,1,-7,6,0xb6a579], [7,4,5,8,0x8aa8a4],
    [-7,-2,7,6,0x4d717b], [0,-5,-10,8,0x829b95], [2,6,9,7,0xa79a7b]
  ]) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, opacity: .11, depthWrite: false, toneMapped: false }));
    sprite.position.set(horizontal, vertical, depth);
    sprite.scale.setScalar(scale);
    group.add(sprite);
  }
  group.visible = false;
  return group;
}
