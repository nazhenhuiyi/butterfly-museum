import * as THREE from 'three';

export function wingShape(hind, monarch) {
  const shape = new THREE.Shape();
  if (hind) {
    shape.moveTo(.07, .15);
    shape.bezierCurveTo(.7, .35, 1.9, .18, 2.04, -.55);
    shape.bezierCurveTo(2.15, -.9, 1.91, -1.38, 1.6, -1.53);
    shape.bezierCurveTo(1.4, -1.75, .95, -1.66, .75, -1.42);
    shape.bezierCurveTo(.35, -1.1, .17, -.58, .07, .15);
  } else if (monarch) {
    shape.moveTo(.08, .12);
    shape.bezierCurveTo(.6, .85, 1.9, 2.05, 2.54, 2.15);
    shape.bezierCurveTo(2.7, 2.12, 2.4, .78, 2.07, .25);
    shape.bezierCurveTo(1.67, -.17, .62, -.38, .08, .12);
  } else {
    shape.moveTo(.08, .12);
    shape.bezierCurveTo(.43, .78, 1.59, 1.8, 2.52, 1.95);
    shape.bezierCurveTo(2.76, 1.75, 2.57, .65, 2.27, .2);
    shape.bezierCurveTo(1.8, -.3, .7, -.48, .08, .12);
  }
  return shape;
}

function traceOutline(context, points) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

function wingTexture(shape, hind, monarch, anisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 2304;
  const context = canvas.getContext('2d');
  context.scale(512, 512);
  context.translate(0, 2.5);
  context.scale(1, -1);
  const outline = shape.getPoints(100);
  traceOutline(context, outline);
  context.save();
  context.clip();
  const gradient = context.createLinearGradient(.15, 0, 2.7, 1.6);
  if (monarch) {
    gradient.addColorStop(0, '#9e400f');
    gradient.addColorStop(.45, '#ffac32');
    gradient.addColorStop(1, '#ed761b');
  } else {
    gradient.addColorStop(0, '#062938');
    gradient.addColorStop(.24, '#076fbb');
    gradient.addColorStop(.53, '#3fdbf3');
    gradient.addColorStop(.75, '#198fdf');
    gradient.addColorStop(1, '#152744');
  }
  context.fillStyle = gradient;
  context.fillRect(0, -2, 3, 4.5);
  let seed = monarch ? 201 : 101;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let index = 0; index < 20000; index++) {
    const horizontal = random() * 3;
    const vertical = random() * 4.5 - 2;
    context.strokeStyle = random() > .5 ? '#ffffff19' : '#031b3525';
    context.lineWidth = .0016;
    context.beginPath();
    context.moveTo(horizontal, vertical);
    context.lineTo(horizontal + .008 + random() * .02, vertical + .006);
    context.stroke();
  }
  traceOutline(context, outline);
  context.lineJoin = 'round';
  context.strokeStyle = monarch ? '#191813' : '#111b29';
  context.lineWidth = monarch ? .26 : .23;
  context.stroke();
  const tips = hind
    ? [[1.95, -.46], [1.98, -.8], [1.8, -1.2], [1.51, -1.48], [1.16, -1.55], [.85, -1.39], [.58, -1.11]]
    : [[.85, .94], [1.24, 1.34], [1.66, 1.63], [2.13, 1.8], [2.52, 1.52], [2.47, 1.04], [2.3, .55], [1.94, .03], [1.48, -.17], [.97, -.14]];
  tips.forEach(([horizontal, vertical]) => {
    context.beginPath();
    context.moveTo(.13, .12);
    context.quadraticCurveTo(horizontal * .5, vertical * .32 + (hind ? -.12 : .16), horizontal, vertical);
    context.strokeStyle = monarch ? '#211c17' : '#0b3d69';
    context.lineWidth = monarch ? .047 : .018;
    context.stroke();
  });
  if (monarch && !hind) {
    context.beginPath();
    context.moveTo(.38, .4);
    context.bezierCurveTo(.8, .7, 1.25, 1.1, 1.55, .97);
    context.bezierCurveTo(1.61, .6, 1.05, .05, .38, .4);
    context.strokeStyle = '#211c17';
    context.lineWidth = .04;
    context.stroke();
  }
  const borderPoints = shape.getSpacedPoints(86);
  borderPoints.forEach((point, index) => {
    if (index % 2 || point.x < .7) return;
    const horizontal = point.x * .974;
    const vertical = point.y * .974;
    context.fillStyle = monarch ? '#fff4d9' : '#b3d8df';
    context.beginPath();
    context.ellipse(horizontal, vertical, monarch ? .027 : .018, monarch ? .02 : .012, .2, 0, Math.PI * 2);
    context.fill();
    if (monarch) {
      context.beginPath();
      context.ellipse(horizontal * .965, vertical * .965, .018, .014, .2, 0, Math.PI * 2);
      context.fill();
    }
  });
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function addEllipsoid(parent, scale, position, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

export function createButterfly(monarch, anisotropy) {
  const model = new THREE.Group();
  const wings = [];
  const wingAssets = [true, false].map(hind => {
    const shape = wingShape(hind, monarch);
    const geometry = new THREE.ShapeGeometry(shape, 64);
    const positions = geometry.attributes.position;
    const coordinates = [];
    for (let index = 0; index < positions.count; index++) {
      const horizontal = positions.getX(index);
      const vertical = positions.getY(index);
      coordinates.push(horizontal / 3, (vertical + 2) / 4.5);
      positions.setZ(index, Math.sin(horizontal * 1.3) * .065 + Math.sin(vertical * 3) * horizontal * .012);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      map: wingTexture(shape, hind, monarch, anisotropy), side: THREE.DoubleSide,
      roughness: monarch ? .65 : .34, metalness: monarch ? .02 : .22,
      iridescence: monarch ? 0 : .55, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 380]
    });
    return { geometry, material, hind };
  });
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.scale.x = side;
    wings.push(hinge);
    model.add(hinge);
    wingAssets.forEach(({ geometry, material, hind }) => {
      const wing = new THREE.Mesh(geometry, material);
      wing.position.z = hind ? -.10 : .10;
      if (monarch && hind) wing.scale.set(.91, .95, 1);
      hinge.add(wing);
    });
  }
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: monarch ? 0x292018 : 0x1c303b, roughness: .7 });
  addEllipsoid(model, [.125, .51, .11], [0, -.38, .06], bodyMaterial);
  addEllipsoid(model, [.15, .29, .14], [0, .13, .12], bodyMaterial);
  addEllipsoid(model, [.13, .14, .12], [0, .47, .14], bodyMaterial);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x626e64, roughness: .3 });
  const spotMaterial = new THREE.MeshStandardMaterial({ color: 0xe7dfcb, roughness: .7 });
  for (const side of [-1, 1]) {
    addEllipsoid(model, [.055, .065, .057], [side * .104, .49, .19], eyeMaterial);
    const antenna = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .07, .54, .15), new THREE.Vector3(side * .17, .82, .17),
      new THREE.Vector3(side * .3, 1.04, .16), new THREE.Vector3(side * .36, 1.09, .15)
    ]);
    model.add(new THREE.Mesh(new THREE.TubeGeometry(antenna, 24, .012, 7, false), bodyMaterial));
    addEllipsoid(model, [.027, .05, .023], [side * .36, 1.09, .15], bodyMaterial);
    for (let index = 0; index < 3; index++) {
      const leg = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * .09, .2 - index * .13, .02),
        new THREE.Vector3(side * .24, .1 - index * .16, -.12),
        new THREE.Vector3(side * .32, -.05 - index * .17, -.16)
      ]);
      model.add(new THREE.Mesh(new THREE.TubeGeometry(leg, 12, .009, 5, false), bodyMaterial));
      if (monarch) addEllipsoid(model, [.021, .028, .018], [side * .09, .2 - index * .13, .235], spotMaterial);
    }
  }
  if (!monarch) spotMaterial.dispose();
  model.rotation.set(-.12, .08, -.14);
  model.scale.setScalar(.88);
  model.position.y = -.4;
  return { model, wings };
}

export function disposeButterfly(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    if (object.material?.map) textures.add(object.material.map);
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
}
