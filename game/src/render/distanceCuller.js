// Draw-distance culling for the tiled static city. Every tile mesh built with a `cullDistance`
// is hidden once its nearest edge is further than that from the camera, so street clutter,
// lamp posts and rooftop units vanish at range while facades and palms stay on the skyline.
// The camera frustum and the sun's shadow frustum do the rest.

export class DistanceCuller {
  constructor() {
    this.items = [];
  }

  /** Collect every mesh under `root` that carries userData.cullDistance. */
  collect(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.userData.cullDistance) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.geometry.boundingSphere;
      const c = s.center.clone().applyMatrix4(o.matrixWorld);
      const r = s.radius * o.matrixWorld.getMaxScaleOnAxis();
      this.items.push({ mesh: o, x: c.x, z: c.z, r, far: o.userData.cullDistance });
    });
  }

  update(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const it of this.items) {
      const d = Math.hypot(it.x - cx, it.z - cz) - it.r;
      it.mesh.visible = d < it.far;
    }
  }
}
