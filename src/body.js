import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const circumference = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const abdominalBoundaries = [0, .18, .33, .47, .59, .70, .80, .90, 1];

function abdominalPhase(progress) {
  const segment = progress >= 1 ? 7 : Math.max(0, abdominalBoundaries.findIndex(boundary => boundary > progress) - 1);
  return segment + (progress - abdominalBoundaries[segment]) / (abdominalBoundaries[segment + 1] - abdominalBoundaries[segment]);
}

function grain(horizontal, vertical) {
  const value = Math.sin(horizontal * 127.1 + vertical * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function angularDistance(first, second) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

export function bodyPigment(part, progress, angle, monarch) {
  const dorsal = angularDistance(angle, 0);
  const ventral = angularDistance(angle, Math.PI);
  const lateral = Math.abs(dorsal - Math.PI / 2);
  let pale = 0;
  if (part === 'thorax') {
    if (monarch) {
      for (const [height, azimuth, length, width] of [
        [.13, .65, .065, .30], [.29, .77, .05, .16],
        [.24, 1.65, .06, .24], [.44, 1.72, .055, .23],
        [.64, 1.82, .052, .22], [.80, 1.64, .045, .22],
        [.32, 2.45, .048, .22], [.54, 2.52, .055, .20], [.77, 2.60, .055, .23]
      ]) {
        const distance = Math.abs((progress - height) / length) ** 1.6 + Math.abs((dorsal - azimuth) / width) ** 1.7;
        pale = Math.max(pale, clamp((1 - distance) * 5, 0, 1));
      }
      if (progress > .20 && progress < .77) pale = Math.max(pale, clamp(1 - dorsal / .045, 0, 1) * .65);
    } else {
      pale = .27 * Math.exp(-(((ventral - .65) / .32) ** 2)) + .10 * Math.exp(-((lateral / .7) ** 2));
    }
  } else if (part === 'abdomen') {
    const segment = abdominalPhase(progress);
    const margin = Math.exp(-(((segment % 1 - .91) / .085) ** 2));
    if (monarch) {
      const irregularity = .055 * Math.sin(progress * 79 + angle * 8);
      pale = clamp(.82 * Math.exp(-(((ventral - .57 - irregularity) / .23) ** 4)) + margin * .62 * Math.exp(-((ventral / 1.7) ** 4)), 0, 1);
      pale *= progress > .08 && progress < .94 ? 1 : .25;
      pale *= .64 + grain(Math.floor(progress*270), Math.floor(angle*75)) * .36;
      if (dorsal < .9) pale = margin * .12 * (progress > .45 ? 1 : .2);
    } else {
      pale = .18 * Math.exp(-((ventral / 1.4) ** 2)) + margin * .035;
    }
  } else if (part === 'head') {
    pale = monarch
      ? clamp(1 - ((progress - .31) / .16) ** 2 - ((dorsal - .72) / .35) ** 2, 0, 1)
      : .28 * Math.exp(-(((dorsal - 1.65) / .45) ** 2));
  } else if (part === 'palpus') {
    pale = progress > .16 && progress < .80 ? Math.exp(-((lateral / .48) ** 4)) * (monarch ? .9 : .55) : 0;
  }
  const base = new THREE.Color(monarch ? 0x201b1b : 0x3b3428);
  return base.lerp(new THREE.Color(monarch ? 0xd9d5c2 : 0xaca080), pale);
}

function scaleMaterial(part, monarch) {
  const width = ['head', 'root', 'palpus'].includes(part) ? 128 : 256;
  const height = width * 2;
  const pixels = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(width * height * 4);
  for (let vertical = 0; vertical < height; vertical++) {
    for (let horizontal = 0; horizontal < width; horizontal++) {
      const progress = vertical / (height - 1);
      const angle = horizontal / (width - 1) * circumference;
      const noise = grain(Math.floor(horizontal / 2), Math.floor(vertical / 4));
      const color = bodyPigment(part, progress + (noise - .5) * .012, angle + (noise - .5) * .035, monarch);
      color.multiplyScalar(.73 + noise * .50).convertLinearToSRGB();
      const offset = (vertical * width + horizontal) * 4;
      pixels.set([color.r * 255, color.g * 255, color.b * 255, 255], offset);
      const ridges = 95 + noise * 85 + 24 * Math.cos(vertical * Math.PI / 2);
      relief.set([ridges, ridges, ridges, 255], offset);
    }
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.DataTexture(relief, width, height);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: .0015, roughness: .91 });
}

function sampleProfile(profile, progress) {
  const position = progress * (profile.length - 1);
  const index = Math.min(profile.length - 2, Math.floor(position));
  const blend = THREE.MathUtils.smoothstep(position - index, 0, 1);
  return profile[index].map((value, component) => {
    if (index === profile.length - 2 && profile.at(-1)[1] <= .003 && (component === 1 || component === 2)) {
      return THREE.MathUtils.lerp(profile.at(-1)[component], value, Math.sqrt(1 - (position - index) ** 2));
    }
    return THREE.MathUtils.lerp(value, profile[index + 1][component], component === 0 ? position - index : blend);
  });
}

function facetRelief() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const horizontal = (column + (Math.floor(row / 4) % 2) * 2) % 4 / 4 - .5;
      const vertical = row % 4 / 4 - .5;
      const height = 128 + 65 * Math.max(0, 1 - 3 * (horizontal * horizontal + vertical * vertical));
      pixels.set([height,height,height,255], (row * size + column) * 4);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function surfacePoint(profile, progress, angle, segmented = false) {
  const [vertical, radius, depth, center] = sampleProfile(profile, progress);
  const groove = segmented ? 1 - .035 * Math.exp(-(((abdominalPhase(progress) % 1 - .94) / .065) ** 2)) : 1;
  return new THREE.Vector3(Math.sin(angle) * radius * groove, vertical, center + Math.cos(angle) * depth * groove);
}

function shell(parent, name, profile, material, segmented = false, rows = 64, columns = 40) {
  const positions = [], coordinates = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      positions.push(...surfacePoint(profile, row / rows, column / columns * circumference, segmented));
      coordinates.push(column / columns, row / rows);
      if (row < rows && column < columns) {
        const start = row * (columns + 1) + column;
        indices.push(start, start + columns + 1, start + 1, start + 1, start + columns + 1, start + columns + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function coat(parent, name, profile, part, monarch, count, length) {
  const positions = [], colors = [];
  for (let index = 0; index < count; index++) {
    const progress = .06 + grain(index, 3) * .87;
    const angle = grain(index, 7) * circumference;
    const root = surfacePoint(profile, progress, angle, part === 'abdomen');
    const normal = new THREE.Vector3(Math.sin(angle), .1, Math.cos(angle)).normalize();
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const width = .0007 + grain(index, 13) * .0008;
    const reach = length * (.45 + grain(index, 17) * .55);
    const tip = root.clone().addScaledVector(normal, reach * .42).add(new THREE.Vector3(0, -reach, 0));
    const color = bodyPigment(part, progress, angle, monarch).multiplyScalar(.85 + grain(index, 19) * .6);
    for (const vertex of [root.clone().addScaledVector(tangent, width), root.clone().addScaledVector(tangent, -width), tip]) {
      positions.push(...vertex);
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
  mesh.name = name;
  parent.add(mesh);
}

function ellipsoid(parent, name, scale, position, material, geometry) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function curvedTube(parent, name, points, radius, material, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 7, false), material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function articulatedLeg(parent, name, points, radii, material) {
  const sections = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = new THREE.Vector3(...points[index]);
    const end = new THREE.Vector3(...points[index + 1]);
    const direction = end.clone().sub(start);
    const section = new THREE.CylinderGeometry(radii[index + 1], radii[index], direction.length(), 8, 1);
    section.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
    section.translate(...start.add(end).multiplyScalar(.5));
    sections.push(section);
  }
  const mesh = new THREE.Mesh(mergeGeometries(sections), material);
  sections.forEach(section => section.dispose());
  mesh.name = name;
  mesh.userData.joints = points;
  parent.add(mesh);
  return mesh;
}

export function createBody(specimen, monarch, wingRoots) {
  const body = new THREE.Group();
  body.name = 'head-thorax-abdomen';
  body.userData.reconstruction = 'photo-constrained; depth and pose approximate';
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const eyeGeometry = new THREE.SphereGeometry(1, 32, 24);
  const dark = new THREE.MeshStandardMaterial({ color: monarch ? 0x201b1d : 0x40382c, roughness: .78 });
  const horn = new THREE.MeshStandardMaterial({ color: monarch ? 0x433b35 : 0x857153, roughness: .83 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: monarch ? 0x30232d : 0x272724, roughness: .66, bumpMap: facetRelief(), bumpScale: .00035 });
  const thoraxProfile = [
    [.245, .045, .055, .005], [.19, .09, .088, .005], [.10, .12, .12, .008],
    [-.015, .137, .135, .006], [-.14, .126, .119, -.005], [-.25, .103, .10, -.012], [-.355, .065, .071, -.02]
  ].map(([vertical, radius, depth, center]) => [vertical, radius * (monarch ? 1 : .88), depth, center]);
  const abdomenProfile = Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16;
    const radius = monarch
      ? [.071,.076,.079,.083,.087,.091,.094,.095,.094,.09,.085,.076,.065,.053,.044,.033,.002][index]
      : [.062,.067,.073,.078,.079,.077,.074,.071,.067,.063,.058,.051,.044,.035,.027,.020,.002][index];
    return [-.31 - progress * specimen.body.abdomen, radius, radius * .82, -.021 - .015 * Math.sin(progress * Math.PI)];
  });
  const headProfile = [[.432,.008,.01,.0],[.40,.05,.056,.0],[.355,.071,.068,.0],[.30,.065,.063,.0],[.25,.048,.048,.0],[.22,.036,.04,.0]];
  shell(body, 'continuous-thorax', thoraxProfile, scaleMaterial('thorax', monarch));
  const abdomen = shell(body, 'segmented-abdomen', abdomenProfile, scaleMaterial('abdomen', monarch), true, 96, 40);
  abdomen.userData.visibleSegments = 8;
  shell(body, 'head', headProfile, scaleMaterial('head', monarch), false, 40, 32);
  coat(body, 'thoracic-scale-coat', thoraxProfile, 'thorax', monarch, 5800, monarch ? .024 : .031);
  coat(body, 'abdominal-scale-coat', abdomenProfile, 'abdomen', monarch, 1700, .014);
  coat(body, 'head-scale-coat', headProfile, 'head', monarch, 600, .014);
  const rootMaterial = scaleMaterial('root', monarch);
  const palpusMaterial = scaleMaterial('palpus', monarch);
  for (const side of [-1, 1]) {
    const tegula = new THREE.Group();
    tegula.name = `scaled-wing-root-${side}`;
    body.add(tegula);
    for (const part of ['fore', 'hind']) {
      const sideName = side < 0 ? 'left' : 'right';
      const point = specimen[part][sideName].dorsal[0];
      const anchor = wingRoots?.[`${sideName}-${part}`] || [
        (point[0] - specimen.center[0]) / specimen.pixelsPerUnit,
        (specimen.center[1] - point[1]) / specimen.pixelsPerUnit + (part === 'fore' ? -.045 : .03),
        part === 'fore' ? .03 : .005
      ];
      const length = Math.abs(anchor[0]) + .015 - .07;
      if (length < .055) continue;
      const rootProfile = [[0,.075,.055,0],[-length*.55,.039,.023,0],[-length,.016,.006,0],[-length-.008,0,0,0]];
      const attachment = new THREE.Group();
      attachment.name = `${part}-basal-attachment`;
      attachment.position.set(side*.07,anchor[1],anchor[2]-.004);
      attachment.rotation.z = side*Math.PI/2;
      attachment.userData.wingAnchor = anchor;
      tegula.add(attachment);
      shell(attachment, 'basal-cover', rootProfile, rootMaterial, false, 24, 20);
      coat(attachment, 'basal-scales', rootProfile, 'root', monarch, 350, .013);
    }
    const eye = ellipsoid(body, `compound-eye-${side}`, [monarch ? .044 : .041,.061,.057], [side*(monarch ? .065 : .057),.356,-.006], eyeMaterial, eyeGeometry);
    eye.rotation.y = side * .18;
    ellipsoid(body, `antennal-socket-${side}`, [.021,.022,.022], [side*.042,.417,.023], dark, sphere);
    const antennaEnd = new THREE.Vector3(side * specimen.body.antennaSpread, .36 + specimen.body.antenna, .017);
    const tangent = antennaEnd.clone().sub(new THREE.Vector3(side*.04,.43,.02)).normalize();
    const clubBase = antennaEnd.clone().addScaledVector(tangent, -.074);
    curvedTube(body, `antenna-${side}`, [[side*.043,.421,.023],[side*specimen.body.antennaSpread*.38,.68,.027],clubBase.toArray()], .0048, dark);
    const club = ellipsoid(body, `antenna-club-${side}`, [.012,.049,.011], antennaEnd.clone().addScaledVector(tangent, -.036).toArray(), dark, sphere);
    club.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), tangent);
    const palpusProfile = [[.452,.001,.001,-.084],[.425,.008,.011,-.085],[.375,.017,.021,-.078],[.322,.014,.019,-.066],[.285,.006,.008,-.051]];
    const palpus = new THREE.Group();
    palpus.name = `palpus-${side}`;
    palpus.position.x = side*.035;
    body.add(palpus);
    shell(palpus, 'palpus-scales', palpusProfile, palpusMaterial, false, 32, 20);
    coat(palpus, 'palpus-fringe', palpusProfile, 'palpus', monarch, 220, .011);
    const root = [side*.058,.179,-.079];
    ellipsoid(body, `coxa-fore-${side}`, [.018,.030,.020], root, dark, sphere);
    const foreleg = articulatedLeg(body, `reduced-foreleg-${side}`, [root,[side*.103,.104,-.166],[side*.09,.225,-.198],[side*.062,.277,-.171]], [.013,.011,.008,.004], dark);
    foreleg.userData.reduced = true;
    for (let brush = 0; brush < 7; brush++) {
      const vertical = .19 + brush*.011;
      curvedTube(body, `foreleg-brush-${side}-${brush}`, [[side*.09,vertical,-.195],[side*.102,vertical+.012,-.207]], .0012, horn, 2);
    }
    for (const [pair, rootHeight, kneeHeight, ankleHeight] of [['middle',-.035,.075,-.48],['hind',-.235,-.44,-.90]]) {
      const points = [[side*.085,rootHeight,-.082],[side*.14,rootHeight-.027,-.15],[side*.29,kneeHeight,-.30],[side*.40,ankleHeight,-.39]];
      const radii = [.020,.018,.013,.008];
      for (let segment = 1; segment <= 5; segment++) {
        points.push([side*(.40-segment*.013),ankleHeight-segment*.028,-.39-segment*.010]);
        radii.push(.007-segment*.0008);
      }
      ellipsoid(body, `coxa-${pair}-${side}`, [.019,.034,.023], points[0], dark, sphere);
      const leg = articulatedLeg(body, `walking-leg-${pair}-${side}`, points, radii, dark);
      leg.userData.walking = true;
      for (const jointIndex of [1,2,3]) {
        ellipsoid(body, `joint-${pair}-${side}-${jointIndex}`, Array(3).fill(radii[jointIndex]*1.08), points[jointIndex], dark, sphere);
      }
      const last = points.at(-1);
      for (const clawSide of [-1,1]) curvedTube(body, `claw-${pair}-${side}-${clawSide}`, [last,[last[0]+clawSide*.007,last[1]-.01,last[2]-.005],[last[0]+clawSide*.006,last[1]-.015,last[2]+.004]], .0017, horn, 5);
    }
  }
  const coil = [[0,.364,-.070],[0,.350,-.112]];
  for (let index = 0; index <= 96; index++) {
    const angle = index/96 * Math.PI*4.3;
    const radius = .049 - index/96*.038;
    coil.push([0,.285+Math.cos(angle)*radius,-.143-Math.sin(angle)*radius]);
  }
  const proboscis = curvedTube(body, 'coiled-proboscis', coil, .0048, horn, 112);
  proboscis.userData.coilPlane = 'sagittal-yz';
  return body;
}
