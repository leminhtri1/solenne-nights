// The drivable graph of Solenne and the meshes that pave it. Nodes are intersections, edges
// are two-way streets with one lane each way (right-hand traffic). Signals at four-way
// junctions alternate north-south and east-west green on one city-wide cycle.
import * as THREE from 'three';
import {
  GRID_LINES, GRID_COUNT, ROAD_WIDTH, LANE_OFFSET, SIDEWALK, BRIDGE, ISLAND_RING,
} from './cityLayout.js';
import { MeshBuilder } from '../render/meshBuilder.js';
import { roadTexture, intersectionTexture } from '../render/proceduralTextures.js';

export const SIGNAL_CYCLE = 18;

export class RoadNetwork {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.buildGraph();
  }

  addNode(x, z, kind = 'junction') {
    const node = { id: this.nodes.length, x, z, links: [], kind, signal: false };
    this.nodes.push(node);
    return node;
  }

  link(a, b, kind = 'street') {
    const edge = { id: this.edges.length, a: a.id, b: b.id, kind, length: Math.hypot(b.x - a.x, b.z - a.z) };
    this.edges.push(edge);
    a.links.push({ node: b.id, edge: edge.id });
    b.links.push({ node: a.id, edge: edge.id });
    return edge;
  }

  gridNode(i, j) { return this.nodes[i * GRID_COUNT + j]; }

  buildGraph() {
    for (let i = 0; i < GRID_COUNT; i += 1) {
      for (let j = 0; j < GRID_COUNT; j += 1) this.addNode(GRID_LINES[i], GRID_LINES[j]);
    }
    for (let i = 0; i < GRID_COUNT; i += 1) {
      for (let j = 0; j < GRID_COUNT; j += 1) {
        if (i + 1 < GRID_COUNT) this.link(this.gridNode(i, j), this.gridNode(i + 1, j), GRID_LINES[j] === -300 ? 'avenue' : 'street');
        if (j + 1 < GRID_COUNT) this.link(this.gridNode(i, j), this.gridNode(i, j + 1), GRID_LINES[i] === 500 || GRID_LINES[i] === 0 ? 'avenue' : 'street');
      }
    }
    for (const n of this.nodes) n.signal = n.links.length === 4;
    // Halcyon Causeway and the Isla Verano ring road.
    const shore = this.nodes.find((n) => n.x === 500 && n.z === BRIDGE.z);
    const r = ISLAND_RING;
    const west = this.addNode(r.minX, BRIDGE.z);
    const nw = this.addNode(r.minX, r.minZ, 'corner');
    const ne = this.addNode(r.maxX, r.minZ, 'corner');
    const se = this.addNode(r.maxX, r.maxZ, 'corner');
    const sw = this.addNode(r.minX, r.maxZ, 'corner');
    this.link(shore, west, 'bridge');
    this.link(west, nw); this.link(nw, ne); this.link(ne, se); this.link(se, sw); this.link(sw, west);
  }

  /** Signal state for travel along an axis: 'green' | 'amber' | 'red'. */
  static signalFor(axis, clock) {
    const t = ((clock % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
    const half = SIGNAL_CYCLE / 2;
    const nsPhase = t < half;
    const inPhase = axis === 'z' ? nsPhase : !nsPhase;
    if (!inPhase) return 'red';
    const local = nsPhase ? t : t - half;
    return local > half - 2 ? 'amber' : 'green';
  }

  /** Point on the right-hand lane travelling from node `from` to node `to`, t in [0,1]. */
  lanePoint(from, to, t, out = { x: 0, z: 0 }) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    out.x = from.x + dx * t - fz * LANE_OFFSET;
    out.z = from.z + dz * t + fx * LANE_OFFSET;
    return out;
  }

  nearestNode(x, z, filter = null) {
    let best = null, bestD = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** The edge whose centre line passes closest to (x, z), with the projection fraction. */
  nearestEdge(x, z) {
    let best = null, bestD = Infinity, bestT = 0;
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bestD) { bestD = d; best = e; bestT = t; }
    }
    return { edge: best, t: bestT, distance: Math.sqrt(bestD) };
  }

  /** Breadth-first route of node ids from a to b (used by police and GPS). */
  route(fromId, toId) {
    const prev = new Map([[fromId, -1]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      if (id === toId) break;
      for (const l of this.nodes[id].links) {
        if (!prev.has(l.node)) { prev.set(l.node, id); queue.push(l.node); }
      }
    }
    if (!prev.has(toId)) return [];
    const path = [];
    for (let id = toId; id !== -1; id = prev.get(id)) path.push(id);
    return path.reverse();
  }

  /** Merged asphalt and junction meshes. */
  createMeshes() {
    const group = new THREE.Group();
    const roads = new MeshBuilder();
    const junctions = new MeshBuilder();
    const plane = new THREE.PlaneGeometry(1, 1);
    const half = ROAD_WIDTH / 2;
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const len = e.length - ROAD_WIDTH;
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      const y = e.kind === 'bridge' ? 0.62 : 0.03;
      const m = new THREE.Matrix4().makeTranslation(cx, y, cz)
        .multiply(new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .multiply(new THREE.Matrix4().makeScale(ROAD_WIDTH, len, 1));
      roads.addGeometry(plane, m, 0xffffff, (u, v) => [u, v * len / ROAD_WIDTH]);
    }
    for (const n of this.nodes) {
      const m = new THREE.Matrix4().makeTranslation(n.x, 0.035, n.z)
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .multiply(new THREE.Matrix4().makeScale(ROAD_WIDTH + 0.02, ROAD_WIDTH + 0.02, 1));
      junctions.addGeometry(plane, m, n.links.length >= 3 ? 0xffffff : 0xdddddd);
    }
    this.roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.78, metalness: 0.0 });
    const jMat = new THREE.MeshStandardMaterial({ map: intersectionTexture(), roughness: 0.78, metalness: 0.0 });
    this.junctionMaterial = jMat;
    const roadMesh = new THREE.Mesh(roads.build(), this.roadMaterial);
    const jMesh = new THREE.Mesh(junctions.build(), jMat);
    roadMesh.receiveShadow = jMesh.receiveShadow = true;
    group.add(roadMesh, jMesh);
    group.add(this.createSignalMeshes());
    return group;
  }

  /**
   * Signal poles at each four-way junction. The lamp heads facing north-south traffic share
   * one material and those facing east-west another, so a whole city's lights change by
   * swapping two colours.
   */
  createSignalMeshes() {
    const group = new THREE.Group();
    const poles = new MeshBuilder();
    const nsHeads = new MeshBuilder();
    const ewHeads = new MeshBuilder();
    const off = ROAD_WIDTH / 2 + 1.5;
    this.signalSpots = [];
    for (const n of this.nodes) {
      if (!n.signal) continue;
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const px = n.x + sx * off, pz = n.z + sz * off;
        poles.addCylinder(px, 3, pz, 0.15, 0.2, 6, 0x2a2d33, 6);
        poles.addBox(px - sx * 3.5, 5.8, pz, 7, 0.25, 0.25, 0x2a2d33);
        poles.addBox(px - sx * 6, 5.2, pz, 0.6, 1.6, 0.6, 0x1c1e22);
        poles.addBox(px, 5.2, pz - sz * 0.6, 0.6, 1.6, 0.6, 0x1c1e22);
        // lamp faces: arm head serves traffic along z, pole head serves traffic along x
        nsHeads.addBox(px - sx * 6, 5.2, pz - sz * 0.31, 0.45, 0.45, 0.05, 0xffffff);
        ewHeads.addBox(px - sx * 0.31, 5.2, pz - sz * 0.6, 0.05, 0.45, 0.45, 0xffffff);
        this.signalSpots.push({ x: px - sx * 6, z: pz - sz * 0.4, axis: 'z' }, { x: px - sx * 0.4, z: pz - sz * 0.6, axis: 'x' });
      }
    }
    const poleMesh = new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
    poleMesh.castShadow = true;
    this.nsMaterial = new THREE.MeshBasicMaterial({ color: 0x33ff66, toneMapped: false });
    this.ewMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333, toneMapped: false });
    group.add(poleMesh, new THREE.Mesh(nsHeads.build(), this.nsMaterial), new THREE.Mesh(ewHeads.build(), this.ewMaterial));
    return group;
  }

  /** Recolour the signal heads for the current cycle time. */
  updateSignals(clock) {
    const tint = { green: 0x33ff77, amber: 0xffb020, red: 0xff2a2a };
    this.nsMaterial.color.setHex(tint[RoadNetwork.signalFor('z', clock)]);
    this.ewMaterial.color.setHex(tint[RoadNetwork.signalFor('x', clock)]);
  }

  /** Wet-look asphalt after dark: smoother, so the sky and neon reflect. */
  setWetness(w) {
    for (const m of [this.roadMaterial, this.junctionMaterial]) {
      m.roughness = 0.78 - 0.38 * w;
      m.metalness = 0.4 * w;
      m.envMapIntensity = 1 - 0.75 * w;
    }
  }
}
