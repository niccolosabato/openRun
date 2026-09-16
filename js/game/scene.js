// Scena Three.js: pista infinita a 3 corsie, player, ostacoli e monete.
// Geometrie procedurali, nessun asset esterno.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { OBSTACLE, OBSTACLE_SHAPE } from './spawner.js';

const TRACK_WIDTH = 7.4;

const OBSTACLE_COLOR = {
  [OBSTACLE.LOW]: 0xff7a45,
  [OBSTACLE.HIGH]: 0x9b6bff,
  [OBSTACLE.BLOCK]: 0xc23b4b,
};

export class World {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.world.background);
    this.scene.fog = new THREE.Fog(
      CONFIG.world.background,
      CONFIG.world.fogNear,
      CONFIG.world.fogFar,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 500);
    this.camera.position.fromArray(CONFIG.camera.position);
    this.lookTarget = new THREE.Vector3().fromArray(CONFIG.camera.lookAt);
    this.camera.lookAt(this.lookTarget);
    this.cameraX = 0;

    this.obstacles = new Map();
    this.coins = new Map();

    this.addLights();
    this.buildTrack();
    this.buildPlayer();
    this.resize();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0x9dc4ff, 0x1a2233, 1.15));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(6, 14, 8);
    this.scene.add(sun);
  }

  buildTrack() {
    this.tiles = [];
    const { tileLength, tileCount } = CONFIG.world;

    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2436, roughness: 0.95 });
    const altMaterial = new THREE.MeshStandardMaterial({ color: 0x202b41, roughness: 0.95 });
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x3a5f9e });
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3f66 });

    for (let i = 0; i < tileCount; i++) {
      const tile = new THREE.Group();

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH, 0.4, tileLength),
        i % 2 === 0 ? baseMaterial : altMaterial,
      );
      base.position.y = -0.2;
      tile.add(base);

      for (const x of [-1.15, 1.15]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, tileLength), lineMaterial);
        line.position.set(x, 0.011, 0);
        tile.add(line);
      }

      for (const z of [-tileLength / 4, tileLength / 4]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH, 0.02, 0.16), stripeMaterial);
        stripe.position.set(0, 0.012, z);
        tile.add(stripe);
      }

      tile.position.z = -i * tileLength;
      this.scene.add(tile);
      this.tiles.push(tile);
    }
  }

  buildPlayer() {
    const height = CONFIG.player.standingHeight;
    const radius = 0.4;
    const length = height - radius * 2;

    const geometry = new THREE.CapsuleGeometry(radius, length, 6, 16);
    geometry.translate(0, height / 2, 0);

    this.playerMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, roughness: 0.35, metalness: 0.1 }),
    );
    this.playerMesh.position.set(0, 0, 0);
    this.scene.add(this.playerMesh);

    const shadowGeometry = new THREE.CircleGeometry(0.55, 24);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    this.shadow.position.y = 0.02;
    this.scene.add(this.shadow);
  }

  addObstacle(obstacle) {
    const shape = OBSTACLE_SHAPE[obstacle.type];
    const geometry = new THREE.BoxGeometry(shape.halfW * 2, shape.y1 - shape.y0, shape.halfD * 2);
    const material = new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLOR[obstacle.type],
      roughness: 0.5,
      emissive: OBSTACLE_COLOR[obstacle.type],
      emissiveIntensity: 0.18,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(obstacle.x, (shape.y0 + shape.y1) / 2, obstacle.z);
    this.scene.add(mesh);
    this.obstacles.set(obstacle.id, mesh);
  }

  syncObstacle(obstacle) {
    const mesh = this.obstacles.get(obstacle.id);
    if (mesh) mesh.position.z = obstacle.z;
  }

  removeObstacle(id) {
    const mesh = this.obstacles.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.obstacles.delete(id);
  }

  addCoin(coin) {
    const geometry = new THREE.TorusGeometry(0.28, 0.1, 8, 18);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffd24a,
      emissive: 0xffb300,
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(coin.x, coin.y, coin.z);
    this.scene.add(mesh);
    this.coins.set(coin.id, mesh);
  }

  syncCoin(coin) {
    const mesh = this.coins.get(coin.id);
    if (mesh) mesh.position.z = coin.z;
  }

  removeCoin(id) {
    const mesh = this.coins.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.coins.delete(id);
  }

  clearObjects() {
    for (const id of [...this.obstacles.keys()]) this.removeObstacle(id);
    for (const id of [...this.coins.keys()]) this.removeCoin(id);
  }

  updateTrack(dt, speed) {
    const { tileLength, tileCount, despawnZ } = CONFIG.world;
    const span = tileLength * tileCount;
    for (const tile of this.tiles) {
      tile.position.z += speed * dt;
      if (tile.position.z > despawnZ) tile.position.z -= span;
    }
  }

  updatePlayer(player) {
    const ratio = player.height / CONFIG.player.standingHeight;
    this.playerMesh.position.set(player.x, player.y, 0);
    this.playerMesh.scale.y = ratio;
    this.playerMesh.rotation.z = (player.x - player.targetX) * 0.12;

    this.shadow.position.set(player.x, 0.02, 0);
    const lift = Math.max(0, player.y);
    const shrink = 1 / (1 + lift * 0.5);
    this.shadow.scale.setScalar(shrink);
    this.shadow.material.opacity = 0.35 * shrink;
  }

  updateCamera(dt, playerX) {
    const target = playerX * CONFIG.camera.followX;
    this.cameraX += (target - this.cameraX) * Math.min(1, dt * 5);
    this.camera.position.x = this.cameraX;
    this.lookTarget.x = this.cameraX * 0.6;
    this.camera.lookAt(this.lookTarget);
  }

  spinCoins(time) {
    for (const mesh of this.coins.values()) {
      mesh.rotation.y = time * 3;
      mesh.rotation.z = Math.sin(time * 2) * 0.15;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
