import * as T from 'three'

export interface ShopWindow {
  center: T.Vector3
  across: T.Vector3
  width: number
  height: number
  design: number
}

// Original synthetic merchandise textures. No tenant names or operator imagery.
export function shopWindows(scene: T.Scene, redraw: () => void) {
  let disposed = false
  const texture = new T.TextureLoader().load(
    new URL('./shop-windows.jpg', import.meta.url).href,
    () => {
      if (!disposed) redraw()
    },
  )
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  const material = new T.MeshBasicMaterial({
    map: texture,
    side: T.DoubleSide,
    color: 0xfff1d9,
  })
  const mesh = new T.Mesh(new T.BufferGeometry(), material)
  mesh.visible = false
  scene.add(mesh)
  return {
    rebuild(panes: ShopWindow[]) {
      mesh.visible = panes.length > 0
      const positions: number[] = [],
        uv: number[] = [],
        faces: number[] = []
      for (const { center, across, width, height, design } of panes) {
        const start = positions.length / 3
        for (const [i, j] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const point = center.clone().addScaledVector(across, (i * width) / 2)
          positions.push(point.x, point.y + (j * height) / 2, point.z)
          uv.push(
            ((design % 2) + (i < 0 ? 0.003 : 0.997)) * 0.5,
            (1 - Math.floor(design / 2) + (j < 0 ? 0.003 : 0.997)) * 0.5,
          )
        }
        faces.push(start, start + 1, start + 2, start, start + 2, start + 3)
      }
      mesh.geometry.dispose()
      const geom = new T.BufferGeometry()
      geom.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
      geom.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
      geom.setIndex(faces)
      mesh.geometry = geom
    },
    dispose() {
      disposed = true
      scene.remove(mesh)
      mesh.geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
