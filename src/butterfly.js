import * as THREE from 'three';
import { morphology } from './morphology.js';
import { createBody } from './body.js';
export { createBody } from './body.js';

export function wingShape(hind, monarch, side = 'right') {
  const specimen = morphology[monarch ? 'monarch' : 'morpho'];
  const points = specimen[hind ? 'hind' : 'fore'][side].dorsal.map(([horizontal, vertical]) => new THREE.Vector2(
    (horizontal - specimen.center[0]) / specimen.pixelsPerUnit,
    (specimen.center[1] - vertical) / specimen.pixelsPerUnit
  ));
  return new THREE.Shape(points);
}

function sampleOutline(points, pixels) {
  const center = points.reduce((sum, point) => sum.add(new THREE.Vector2(...point)), new THREE.Vector2()).divideScalar(points.length);
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point, 0)), true, 'centripetal');
  return curve.getPoints(points.length * 4).slice(0, -1).map(point => {
    const inward = center.clone().sub(new THREE.Vector2(point.x, point.y)).normalize();
    if (pixels) {
      for (let step = 0; step < 24; step++) {
        const offset = (Math.round(point.y) * pixels.width + Math.round(point.x)) * 4;
        if (!pixels.data.slice(offset, offset + 3).every(channel => channel > 228)) break;
        point.x += inward.x;
        point.y += inward.y;
      }
    }
    return [point.x + inward.x * 1.5, point.y + inward.y * 1.5];
  });
}

export function createWingGeometry(specimen, part, side, surface, pixels) {
  const outline = sampleOutline(specimen[part][side].dorsal, pixels?.dorsal);
  const skin = sampleOutline(specimen[part][side][surface], pixels?.[surface]);
  const contour = outline.map(([horizontal, vertical]) => new THREE.Vector2(
    (horizontal - specimen.center[0]) / specimen.pixelsPerUnit,
    (specimen.center[1] - vertical) / specimen.pixelsPerUnit
  ));
  const center = contour.reduce((sum, point) => sum.add(point), new THREE.Vector2()).divideScalar(contour.length);
  const textureCenter = skin.reduce((sum, point) => sum.add(new THREE.Vector2(...point)), new THREE.Vector2()).divideScalar(skin.length);
  const faces = contour.map((_, index) => [contour.length, index, (index + 1) % contour.length]);
  contour.push(center);
  skin.push(textureCenter.toArray());
  const positions = [], coordinates = [];
  const subdivisions = 6;
  function vertex(face, first, second) {
    const weights = [1 - first - second, first, second];
    const point = new THREE.Vector2();
    const uv = new THREE.Vector2();
    weights.forEach((weight, index) => {
      point.addScaledVector(contour[face[index]], weight);
      uv.addScaledVector(new THREE.Vector2(...skin[face[index]]), weight);
    });
    const camber = .018 * Math.sin(Math.abs(point.x) * 1.3) * Math.cos(point.y * 1.1);
    positions.push(point.x, point.y, camber + (surface === 'dorsal' ? .002 : -.002));
    coordinates.push(uv.x / specimen.dimensions[surface][0], 1 - uv.y / specimen.dimensions[surface][1]);
  }
  faces.forEach(face => {
    const first = contour[face[0]], second = contour[face[1]], third = contour[face[2]];
    if ((second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x) < 0) {
      [face[1], face[2]] = [face[2], face[1]];
    }
    for (let row = 0; row < subdivisions; row++) {
      for (let column = 0; column < subdivisions - row; column++) {
        vertex(face, row / subdivisions, column / subdivisions);
        vertex(face, (row + 1) / subdivisions, column / subdivisions);
        vertex(face, row / subdivisions, (column + 1) / subdivisions);
        if (column < subdivisions - row - 1) {
          vertex(face, (row + 1) / subdivisions, column / subdivisions);
          vertex(face, (row + 1) / subdivisions, (column + 1) / subdivisions);
          vertex(face, row / subdivisions, (column + 1) / subdivisions);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  geometry.computeVertexNormals();
  return geometry;
}


export async function createButterfly(monarch, anisotropy) {
  const specimen = morphology[monarch ? 'monarch' : 'morpho'];
  const results = await Promise.allSettled(Object.values(specimen.images).map(url => new THREE.TextureLoader().loadAsync(url)));
  if (results.some(result => result.status === 'rejected')) {
    results.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
    throw new Error('标本图片加载失败');
  }
  const textures = Object.fromEntries(['dorsal', 'ventral'].map((surface, index) => {
    const texture = results[index].value;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.name = `${specimen.id}-${surface}`;
    return [surface, texture];
  }));
  const pixels = Object.fromEntries(Object.entries(textures).map(([surface, texture]) => {
    const canvas = document.createElement('canvas');
    canvas.width = texture.image.width;
    canvas.height = texture.image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(texture.image, 0, 0);
    return [surface, context.getImageData(0, 0, canvas.width, canvas.height)];
  }));
  const model = new THREE.Group();
  model.userData.specimen = specimen.id;
  model.userData.independentSurfaces = true;
  const wings = [];
  const wingRoots = {};
  const materials = Object.fromEntries(['dorsal', 'ventral'].map(surface => [surface, new THREE.MeshBasicMaterial({
    map: textures[surface], side: surface === 'dorsal' ? THREE.FrontSide : THREE.BackSide, toneMapped: false
  })]));
  for (const material of Object.values(materials)) {
    material.userData.wingFlex = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.wingFlex = material.userData.wingFlex;
      shader.vertexShader = `uniform float wingFlex;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.z += wingFlex * pow(smoothstep(0.35, 2.8, abs(position.x)), 2.0) * (0.75 + 0.25 * sin(position.y * 1.5));`);
    };
    material.customProgramCacheKey = () => 'butterfly-distal-flex-v1';
  }
  for (const side of ['left', 'right']) {
    const hinge = new THREE.Group();
    hinge.name = `${side}-wing-hinge`;
    hinge.position.set(side === 'left' ? -.07 : .07, 0, .02);
    model.add(hinge);
    wings.push(hinge);
    for (const part of ['hind', 'fore']) {
      for (const surface of ['dorsal', 'ventral']) {
        const wing = new THREE.Mesh(createWingGeometry(specimen, part, side, surface, pixels), materials[surface]);
        wing.name = `${side}-${part}-${surface}`;
        wing.position.z = part === 'fore' ? .025 : 0;
        wing.position.y = part === 'hind' ? .03 : -.045;
        if (surface === 'dorsal') {
          const positions = wing.geometry.attributes.position;
          let nearest = 0;
          for (let index = 1; index < positions.count; index++) {
            if (Math.abs(positions.getX(index)) < Math.abs(positions.getX(nearest))) nearest = index;
          }
          wingRoots[`${side}-${part}`] = [positions.getX(nearest), positions.getY(nearest) + wing.position.y, positions.getZ(nearest) + wing.position.z];
        }
        wing.userData.surface = surface;
        hinge.add(wing);
      }
    }
  }
  model.add(createBody(specimen, monarch, wingRoots));
  bindWingRoots(model, wings);
  return { model, wings };
}

export function bindWingRoots(model, wings) {
  model.updateMatrixWorld(true);
  for (const [index, hinge] of wings.entries()) {
    for (const wing of hinge.children) wing.position.sub(hinge.position);
    model.updateMatrixWorld(true);
    hinge.attach(model.getObjectByName(`scaled-wing-root-${index === 0 ? -1 : 1}`));
  }
  model.updateMatrixWorld(true);
}

export function disposeButterfly(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    if (object.material) {
      for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
}
