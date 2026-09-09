import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapSpecies, wheelDirection, swipeDirection } from '../src/interaction.js';
import { species } from '../src/species.js';
import * as THREE from 'three';
import { wingShape, disposeButterfly } from '../src/butterfly.js';

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
  assert.match(species[0].text2, /不模拟腹面/);
  assert.match(species[1].text, /北美部分种群/);
  assert.match(species[1].text, /并非所有/);
  for (const item of species) {
    for (const value of Object.values(item)) assert.ok(typeof value === 'string' && value.length > 0);
  }
});

test('四种翅形可三角化，几何坐标有限且在纹理范围内', () => {
  for (const monarch of [false, true]) {
    for (const hind of [false, true]) {
      const shape = wingShape(hind, monarch);
      const geometry = new THREE.ShapeGeometry(shape, 64);
      const positions = geometry.attributes.position;
      assert.ok(geometry.index.count > 100);
      assert.ok(Math.abs(THREE.ShapeUtils.area(shape.getPoints(64))) > 1);
      for (let index = 0; index < positions.count; index++) {
        const horizontal = positions.getX(index);
        const vertical = positions.getY(index);
        assert.ok(Number.isFinite(horizontal) && Number.isFinite(vertical));
        assert.ok(horizontal >= 0 && horizontal <= 3);
        assert.ok(vertical >= -2 && vertical <= 2.5);
      }
      geometry.dispose();
    }
  }
  assert.notDeepEqual(wingShape(false, true).getPoints(64), wingShape(false, false).getPoints(64));
});

test('共享几何体、材质和纹理在标本销毁时各释放一次', () => {
  const model = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const counts = { geometry: 0, texture: 0, material: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  texture.addEventListener('dispose', () => counts.texture++);
  material.addEventListener('dispose', () => counts.material++);
  model.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  disposeButterfly(model);
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1 });
});
