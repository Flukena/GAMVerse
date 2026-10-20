import { Group, Matrix4, type Object3D } from "three";

/**
 * Opt-in transform cache for a completed, static model subtree. Root transforms
 * remain editable. Call invalidate() after changing a descendant transform or
 * attaching content below a descendant; direct add/remove calls invalidate it.
 * Characters, moving doors, vehicles and previews must use ordinary Groups.
 */
export class StaticSceneGroup extends Group {
  private readonly cachedWorldMatrix = new Matrix4();
  private readonly nextWorldMatrix = new Matrix4();
  private invalidated = true;

  invalidate() {
    this.invalidated = true;
  }

  override add(...objects: Object3D[]) {
    super.add(...objects);
    this.invalidate();
    return this;
  }

  override remove(...objects: Object3D[]) {
    super.remove(...objects);
    this.invalidate();
    return this;
  }

  override updateMatrixWorld(_force?: boolean) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) this.nextWorldMatrix.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.nextWorldMatrix.copy(this.matrix);

    // Scene.updateMatrixWorld forces descendants every frame. Only the actual
    // world transform or explicit content invalidation warrants that work here.
    if (!this.invalidated && this.cachedWorldMatrix.equals(this.nextWorldMatrix)) return;
    super.updateMatrixWorld(true);
    this.cachedWorldMatrix.copy(this.matrixWorld);
    this.invalidated = false;
  }
}
