import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapSpecies, wheelDirection, swipeDirection } from '../src/interaction.js';
import { species } from '../src/species.js';
import * as THREE from 'three';
import { wingShape, createWingGeometry, createBody, disposeButterfly, bindWingRoots } from '../src/butterfly.js';
import { morphology } from '../src/morphology.js';
import { bodyPigment } from '../src/body.js';
import { FlightClock, sampleFlight, SHOT_DURATION, setWingPose, blendCameraPosition } from '../src/flight.js';

test('进出镜头沿视线方向平滑插值，不从主体内部穿行', () => {
  for (const initialPosition of [[0,0,8.7], [0,0,-8.7], [8.7,0,0]]) {
    const initial = { cameraPosition: new THREE.Vector3(...initialPosition), target: new THREE.Vector3() };
    const pose = sampleFlight(2.8);
    for (let frame = 0; frame <= 100; frame++) {
      const progress = frame / 100;
      const target = initial.target.clone().lerp(pose.target, progress);
      const camera = blendCameraPosition(initial, pose, target, progress);
      assert.ok(camera.distanceTo(target) >= 8.69);
      if (!frame) assert.ok(camera.distanceTo(initial.cameraPosition) < 1e-12);
      if (frame === 100) assert.ok(camera.distanceTo(pose.cameraPosition) < 1e-12);
    }
  }
});

test('飞行24秒循环有限且位置、姿态、镜头与翅拍首尾连续', () => {
  for (const monarch of [false, true]) for (const aspect of [.5, 1, 1.8]) {
    for (let frame = 0; frame <= 1440; frame++) {
      const pose = sampleFlight(frame / 60, monarch, aspect);
      for (const key of ['position', 'orientation', 'cameraPosition', 'target']) assert.ok(pose[key].toArray().every(Number.isFinite));
      assert.ok(pose.fov > 0 && pose.fov < 100);
      assert.ok(Math.abs(pose.wingFlex) < .08);
    }
    const start = sampleFlight(0, monarch, aspect);
    const end = sampleFlight(SHOT_DURATION, monarch, aspect);
    for (const key of ['position', 'orientation', 'cameraPosition', 'target']) assert.deepEqual(start[key].toArray(), end[key].toArray());
    assert.equal(start.wingAngle, end.wingAngle);
    const before = sampleFlight(SHOT_DURATION - .0001, monarch, aspect);
    const after = sampleFlight(.0001, monarch, aspect);
    assert.ok(before.position.distanceTo(after.position) < .001);
    assert.ok(before.orientation.angleTo(after.orientation) < .001);
    assert.ok(before.cameraPosition.distanceTo(after.cameraPosition) < .001);
    assert.ok(Math.abs(before.wingAngle - after.wingAngle) < .001);
  }
});

test('飞行时钟帧率无关，暂停/隐藏/长停顿不跳时', () => {
  for (const rate of [30, 60, 120]) {
    const clock = new FlightClock();
    clock.enter();
    for (let frame = 0; frame <= rate * 24; frame++) clock.tick(frame * 1000 / rate);
    assert.ok(Math.abs(clock.elapsed - 24) < 1e-10);
    clock.pause(); clock.tick(30000); assert.ok(Math.abs(clock.elapsed - 24) < 1e-10);
    clock.resume(); clock.tick(40000); clock.tick(40100, false); clock.tick(90000);
    assert.ok(Math.abs(clock.elapsed - 24) < 1e-10);
    clock.tick(91000); assert.ok(Math.abs(clock.elapsed - 24) < 1e-10);
  }
});

test('双侧前后翅共享铰链，左右对称拍动并同步柔性', () => {
  const wings = [new THREE.Group(), new THREE.Group()];
  for (const wing of wings) for (let index = 0; index < 2; index++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    mesh.material.userData.wingFlex = { value: 0 };
    wing.add(mesh);
  }
  setWingPose(wings, 1.16, .03);
  assert.equal(wings[0].rotation.y, -wings[1].rotation.y);
  for (const wing of wings) for (const mesh of wing.children) assert.equal(mesh.material.userData.wingFlex.value, .03);
  setWingPose(wings, 0);
  for (const wing of wings) assert.equal(Math.abs(wing.rotation.y), 0);
});

test('新翅轴保留原静止坐标，根部覆盖随翅转动且基点保持胸内', () => {
  const model = new THREE.Group();
  const wings = [-1, 1].map(side => {
    const hinge = new THREE.Group();
    hinge.position.set(side * .07, 0, .02);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    wing.position.set(0, -.045, .025);
    hinge.add(wing);
    model.add(hinge);
    const root = new THREE.Group();
    root.name = `scaled-wing-root-${side}`;
    root.position.set(side * .07, .05, .02);
    model.add(root);
    return hinge;
  });
  bindWingRoots(model, wings);
  for (const [index, hinge] of wings.entries()) {
    assert.ok(hinge.children[0].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, -.045, .025)) < 1e-12);
    const root = model.getObjectByName(`scaled-wing-root-${index ? 1 : -1}`);
    assert.equal(root.parent, hinge);
    for (const angle of [-.43, 0, .6, 1.195]) {
      setWingPose(wings, angle);
      model.updateMatrixWorld(true);
      const base = root.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(base.x) < .08 && Math.abs(base.z) < .03);
    }
    setWingPose(wings, 0);
    model.updateMatrixWorld(true);
  }
});

test('完整镜头投影：两物种轮廓在横屏与窄屏安全画幅内', () => {
  for (const [name, specimen] of Object.entries(morphology)) {
    const points = [];
    for (const side of ['left', 'right']) for (const part of ['fore', 'hind']) {
      const geometry = createWingGeometry(specimen, part, side, 'dorsal');
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 18) {
        points.push({ side, position: new THREE.Vector3().fromBufferAttribute(positions, index).add(new THREE.Vector3(0, part === 'hind' ? .03 : -.045, part === 'fore' ? .025 : 0)) });
      }
      geometry.dispose();
    }
    for (const aspect of [.5, .65, 1.13, 1.8]) for (let frame = 0; frame <= 240; frame++) {
      const pose = sampleFlight(frame / 10, name === 'monarch', aspect);
      const camera = new THREE.PerspectiveCamera(pose.fov, aspect, .1, 60);
      camera.position.copy(pose.cameraPosition); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
      for (const point of points) {
        const axis = new THREE.Vector3(point.side === 'left' ? -.07 : .07, 0, .02);
        const position = point.position.clone();
        position.z += pose.wingFlex * Math.pow(THREE.MathUtils.smoothstep(Math.abs(position.x), .35, 2.8), 2) * ( .75 + .25 * Math.sin(position.y * 1.5));
        position.sub(axis).applyAxisAngle(new THREE.Vector3(0,1,0), point.side === 'left' ? pose.wingAngle : -pose.wingAngle).add(axis);
        position.applyQuaternion(pose.orientation).add(pose.position).project(camera);
        assert.ok(Math.abs(position.x) < .96 && Math.abs(position.y) < .96 && position.z > -1 && position.z < 1, `${name} ${aspect} ${frame / 10}: ${position.toArray()}`);
      }
    }
  }
});

test('两种标本循环切换，向前与向后均不越界', () => {
  assert.equal(wrapSpecies(0, 1, 2), 1);
  assert.equal(wrapSpecies(1, 1, 2), 0);
  assert.equal(wrapSpecies(0, -1, 2), 1);
  assert.equal(wrapSpecies(1, -1, 2), 0);
});
test('滚轮以主轴判断方向，兼容 Shift 映射为横向滚轮并忽略小抖动', () => {
  assert.equal(wheelDirection(0, 120), 1);
  assert.equal(wheelDirection(-120, 0), -1);
  assert.equal(wheelDirection(1, -100), -1);
  assert.equal(wheelDirection(3, 2), 0);
});
test('手势需要垂直位移，点击、短滑与横滑不切换', () => {
  const start = { horizontal: 100, vertical: 200 };
  assert.equal(swipeDirection(start, { horizontal: 105, vertical: 110 }), 1);
  assert.equal(swipeDirection(start, { horizontal: 105, vertical: 290 }), -1);
  assert.equal(swipeDirection(start, { horizontal: 100, vertical: 200 }), 0);
  assert.equal(swipeDirection(start, { horizontal: 105, vertical: 175 }), 0);
  assert.equal(swipeDirection(start, { horizontal: 205, vertical: 145 }), 0);
});
test('物种数据唯一且包含明确的科普限定', () => {
  assert.deepEqual(species.map(item => item.latin), ['Morpho menelaus', 'Danaus plexippus']);
  assert.match(species[0].text, /结构色/);
  assert.match(species[0].text2, /分别来自具名标本照片/);
  assert.match(species[0].representative, /雄性.*huebneri/);
  assert.match(species[1].variation, /2011.0.171/);
  assert.match(species[1].text, /北美部分种群/);
  assert.match(species[1].text, /并非所有/);
  for (const item of species) {
    for (const value of Object.values(item)) assert.ok(typeof value === 'string' && value.length > 0);
  }
});

test('参考链接按学名对应维基物种条目并保留可信来源', () => {
  assert.equal(species[0].wikipedia, 'https://en.wikipedia.org/wiki/Morpho_menelaus');
  assert.equal(species[1].wikipedia, 'https://en.wikipedia.org/wiki/Monarch_butterfly');
  assert.equal(species[0].reference, 'https://doi.org/10.1098/rspb.1999.0794');
  assert.equal(species[1].reference, 'https://www.fws.gov/species/monarch-danaus-plexippus');
});

test('四种翅形可三角化，几何坐标有限且在纹理范围内', () => {
  for (const monarch of [false, true]) {
    for (const hind of [false, true]) {
      const shape = wingShape(hind, monarch);
      const geometry = new THREE.ShapeGeometry(shape, 64);
      const positions = geometry.attributes.position;
      assert.ok(geometry.index.count >= 60);
      assert.ok(Math.abs(THREE.ShapeUtils.area(shape.getPoints(64))) > 1);
      for (let index = 0; index < positions.count; index++) {
        const horizontal = positions.getX(index);
        const vertical = positions.getY(index);
        assert.ok(Number.isFinite(horizontal) && Number.isFinite(vertical));
        assert.ok(horizontal >= 0 && horizontal <= 3);
        assert.ok(vertical >= -2.5 && vertical <= 2.5);
      }
      geometry.dispose();
    }
  }
  assert.notDeepEqual(wingShape(false, true).getPoints(64), wingShape(false, false).getPoints(64));
});

test('四翅两面独立配准，三角形法线一致，UV 不越界', () => {
  for (const specimen of Object.values(morphology)) {
    assert.notEqual(specimen.images.dorsal, specimen.images.ventral);
    for (const part of ['fore', 'hind']) {
      for (const side of ['left', 'right']) {
        assert.equal(specimen[part][side].dorsal.length, specimen[part][side].ventral.length);
        const dorsal = createWingGeometry(specimen, part, side, 'dorsal');
        const ventral = createWingGeometry(specimen, part, side, 'ventral');
        assert.notDeepEqual(dorsal.attributes.uv.array, ventral.attributes.uv.array);
        for (const geometry of [dorsal, ventral]) {
          assert.ok(geometry.attributes.position.count > 1000);
          assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
          assert.ok([...geometry.attributes.uv.array].every(value => value >= 0 && value <= 1));
          for (let index = 0; index < geometry.attributes.normal.count; index++) assert.ok(geometry.attributes.normal.getZ(index) > .98);
          geometry.dispose();
        }
      }
    }
  }
});

test('身体具有两条退化前足、四条步行足、棒状触角与八个可见腹节', () => {
  for (const monarch of [false, true]) {
    const model = createBody(morphology[monarch ? 'monarch' : 'morpho'], monarch);
    assert.equal(model.children.filter(child => child.userData.reduced).length, 2);
    assert.equal(model.children.filter(child => child.userData.walking).length, 4);
    assert.equal(model.getObjectByName('segmented-abdomen').userData.visibleSegments, 8);
    assert.equal(model.children.filter(child => child.name.startsWith('antenna-club')).length, 2);
    assert.ok(model.getObjectByName('coiled-proboscis'));
    for (const leg of model.children.filter(child => child.userData.reduced)) {
      leg.geometry.computeBoundingBox();
      assert.ok(leg.geometry.boundingBox.getSize(new THREE.Vector3()).length() < .3);
    }
    disposeButterfly(model);
  }
});

test('共享几何体、材质和纹理在标本销毁时各释放一次', () => {
  const model = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const texture = new THREE.Texture();
  const bumpMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, bumpMap });
  const counts = { geometry: 0, texture: 0, bumpMap: 0, material: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  texture.addEventListener('dispose', () => counts.texture++);
  bumpMap.addEventListener('dispose', () => counts.bumpMap++);
  material.addEventListener('dispose', () => counts.material++);
  model.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  disposeButterfly(model);
  assert.deepEqual(counts, { geometry: 1, texture: 1, bumpMap: 1, material: 1 });
});

test('身体表面为有限、确定性网格；贴附纹样和毛被保持预算', () => {
  for (const monarch of [false, true]) {
    const body = createBody(morphology[monarch ? 'monarch' : 'morpho'], monarch);
    let triangles = 0, meshes = 0;
    const textures = new Set();
    body.traverse(object => {
      if (!object.isMesh) return;
      meshes++;
      triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok([...attribute.array].every(Number.isFinite));
      assert.equal(object.material.transparent, false);
      for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
      assert.ok(!object.name.startsWith('thoracic-white-scale'));
    });
    assert.ok(triangles < 60000, `body triangles: ${triangles}`);
    assert.ok(meshes <= 75, `body draw calls: ${meshes}`);
    assert.ok([...textures].reduce((bytes, texture) => bytes + texture.image.data.byteLength, 0) < 3 * 1024 * 1024);
    for (const name of ['continuous-thorax', 'segmented-abdomen', 'head']) {
      const mesh = body.getObjectByName(name);
      assert.ok(mesh.material.map.isDataTexture);
      assert.ok(mesh.material.bumpMap.isDataTexture);
      mesh.geometry.computeBoundingBox();
    }
    const thorax = body.getObjectByName('continuous-thorax').geometry.boundingBox;
    const abdomen = body.getObjectByName('segmented-abdomen').geometry.boundingBox;
    const head = body.getObjectByName('head').geometry.boundingBox;
    assert.ok(thorax.intersectsBox(abdomen));
    assert.ok(thorax.intersectsBox(head));
    assert.ok(body.getObjectByName('compound-eye-1').material.bumpMap);
    for (const side of [-1, 1]) assert.ok(body.getObjectByName(`scaled-wing-root-${side}`));
    disposeButterfly(body);
  }
});

test('足节共用端点且从胸部起始，盘卷喙沿矢状面而非腹面装饰圆环', () => {
  for (const monarch of [false, true]) {
    const body = createBody(morphology[monarch ? 'monarch' : 'morpho'], monarch);
    for (const leg of body.children.filter(object => object.userData.walking)) {
      const joints = leg.userData.joints;
      assert.equal(joints.length, 9);
      assert.ok(joints[0][1] > -.3 && joints[0][1] < .1);
      assert.ok(Math.abs(joints[0][0]) < .1 && joints[0][2] < 0);
      assert.ok(joints.every((point, index) => index === 0 || new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...joints[index - 1])) > .005));
    }
    const coil = body.getObjectByName('coiled-proboscis');
    coil.geometry.computeBoundingBox();
    const size = coil.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x < .011 && size.y > .07 && size.z > .07);
    assert.equal(coil.userData.coilPlane, 'sagittal-yz');
    disposeButterfly(body);
  }
});

test('帝王蝶腹侧浅纹不复制到闪蝶；背腹色值与生成结果确定', () => {
  const ventral = bodyPigment('abdomen', .42, Math.PI - .57, true);
  const dorsal = bodyPigment('abdomen', .42, 0, true);
  const morpho = bodyPigment('abdomen', .42, Math.PI - .57, false);
  assert.ok(ventral.r > dorsal.r * 3 && ventral.r > morpho.r * 2);
  assert.deepEqual(ventral, bodyPigment('abdomen', .42, Math.PI - .57, true));
});

test('翅基按各翅根独立接合，连接片根端进入胸部、外端跨过翅面深度', () => {
  for (const monarch of [false, true]) {
    const specimen = morphology[monarch ? 'monarch' : 'morpho'];
    const roots = {};
    for (const side of ['left', 'right']) for (const part of ['fore', 'hind']) {
      const geometry = createWingGeometry(specimen, part, side, 'dorsal');
      const positions = geometry.attributes.position;
      let nearest = 0;
      for (let index = 1; index < positions.count; index++) if (Math.abs(positions.getX(index)) < Math.abs(positions.getX(nearest))) nearest = index;
      roots[`${side}-${part}`] = [positions.getX(nearest), positions.getY(nearest) + (part === 'fore' ? -.045 : .03), positions.getZ(nearest) + (part === 'fore' ? .025 : 0)];
      geometry.dispose();
    }
    const body = createBody(specimen, monarch, roots);
    body.updateMatrixWorld(true);
    let attachments = 0;
    body.traverse(object => {
      if (!object.userData.wingAnchor) return;
      attachments++;
      const [horizontal, vertical, depth] = object.userData.wingAnchor;
      const bounds = new THREE.Box3().setFromObject(object);
      assert.ok(bounds.containsPoint(new THREE.Vector3(horizontal, vertical, depth)));
      assert.ok(bounds.min.x < .13 && bounds.max.x > -.13);
    });
    assert.equal(attachments, monarch ? 4 : 1);
    disposeButterfly(body);
  }
});
