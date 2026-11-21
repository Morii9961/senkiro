import { useEffect, useRef, useState } from 'react'
import * as T from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Language, Place } from './domain/types'
import type { Step } from './domain/graph'
import { floors, nodes, station } from './model'
import { sample } from './providers/service'

interface Props {
  lang: Language
  dark: boolean
  floor: number | null
  spread: boolean
  route: Step[]
  step: number
  reset: number
  zoom: { tick: number; factor: number }
  example: boolean
  onFallback: () => void
}
type Label = {
  position: T.Vector3
  text: string
  priority: number
  el: HTMLSpanElement
}
export function Scene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const update = useRef<((p: Props) => void) | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const box = host.current!
    let gl: T.WebGLRenderer
    try {
      gl = new T.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    gl.setPixelRatio(Math.min(devicePixelRatio, 2))
    gl.domElement.tabIndex = 0
    box.prepend(gl.domElement)
    const world = new T.Scene(),
      camera = new T.OrthographicCamera(-55, 55, 40, -40, 0.1, 800)
    const controls = new OrbitControls(camera, gl.domElement)
    controls.minZoom = 0.55
    controls.maxZoom = 5
    controls.maxPolarAngle = 1.44
    controls.minPolarAngle = 0.15
    controls.mouseButtons = {
      LEFT: T.MOUSE.ROTATE,
      MIDDLE: T.MOUSE.PAN,
      RIGHT: T.MOUSE.PAN,
    }
    world.add(new T.HemisphereLight(0xffffff, 0xd1d9d8, 2.05))
    const sun = new T.DirectionalLight(0xfff7df, 2.3)
    sun.position.set(-28, 64, 36)
    world.add(sun)
    const unit = new T.BoxGeometry(),
      material = new T.MeshStandardMaterial({
        roughness: 0.74,
        metalness: 0.08,
      })
    const dummy = new T.Object3D(),
      labels: Label[] = []
    let group: T.InstancedMesh | null = null,
      propsNow: Props,
      lastReset = -1,
      lastZoom = -1,
      lastFloor: number | null = null,
      frame = 0
    const view = new T.Vector3(-39, 40, 90),
      right = new T.Vector3(view.z, 0, -view.x).normalize()
    const up = view.clone().normalize().cross(right).normalize()
    let bounds = { center: new T.Vector3(), width: 90, height: 70 }
    function fit(p: Props) {
      const corners: T.Vector3[] = []
      for (const n of station.places) {
        const order = floors.get(n.levelId)!.ordinal
        if (p.floor !== null && p.floor !== order) continue
        for (const dx of [-1, 1])
          for (const dz of [-1, 1]) {
            corners.push(
              new T.Vector3(
                n.point[0] + dx * (n.size[0] / 2 + 1.7),
                order * (p.spread ? 9 : 5),
                n.point[1] + dz * (n.size[1] / 2 + 1.7),
              ),
            )
          }
      }
      const xs = corners.map((v) => v.dot(right)),
        ys = corners.map((v) => v.dot(up))
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys)
      const center = right
        .clone()
        .multiplyScalar((maxX + minX) / 2)
        .addScaledVector(up, (maxY + minY) / 2)
      return { center, width: maxX - minX, height: maxY - minY }
    }
    function reset() {
      controls.target.copy(bounds.center)
      camera.position.copy(controls.target).add(view)
      camera.zoom = 1
      camera.updateProjectionMatrix()
      controls.update()
    }
    function draw() {
      if (!propsNow) return
      const w = box.clientWidth,
        h = box.clientHeight
      const placed: { x: number; y: number; w: number }[] = []
      for (const label of labels) {
        const v = label.position.clone().project(camera),
          x = ((v.x + 1) * w) / 2,
          y = ((1 - v.y) * h) / 2
        const width = label.el.offsetWidth || 80
        const visible =
          (label.priority <= 1 ||
            camera.zoom > (label.priority === 2 ? 1.35 : 2.3) ||
            propsNow.floor !== null) &&
          x > width / 2 + 4 &&
          x < w - width / 2 - 4 &&
          y > 18 &&
          y < h - 16 &&
          !placed.some(
            (p) =>
              Math.abs(p.x - x) < (p.w + width) / 2 + 5 &&
              Math.abs(p.y - y) < 24,
          )
        label.el.style.visibility = visible ? 'visible' : 'hidden'
        if (visible) {
          label.el.style.transform =
            'translate(' + x + 'px,' + y + 'px) translate(-50%,-100%)'
          placed.push({ x, y, w: width })
        }
      }
      gl.render(world, camera)
      gl.domElement.dataset.frame = String(++frame)
      gl.domElement.dataset.calls = String(gl.info.render.calls)
      gl.domElement.dataset.triangles = String(gl.info.render.triangles)
    }
    function size() {
      if (!propsNow) return
      const w = Math.max(1, box.clientWidth),
        h = Math.max(1, box.clientHeight)
      const height = Math.max(
        28,
        bounds.height * 1.18,
        (bounds.width * 1.15 * h) / w,
      )
      camera.left = (-height * w) / h / 2
      camera.right = -camera.left
      camera.top = height / 2
      camera.bottom = -height / 2
      camera.updateProjectionMatrix()
      gl.setSize(w, h)
      draw()
    }
    function rebuild(p: Props) {
      const refit =
        !propsNow || propsNow.floor !== p.floor || propsNow.spread !== p.spread
      propsNow = p
      if (refit) bounds = fit(p)
      gl.domElement.setAttribute(
        'aria-label',
        p.lang === 'ja' ? '駅構内の三次元図' : 'Interactive station model',
      )
      labels.splice(0).forEach((l) => l.el.remove())
      if (group) {
        world.remove(group)
        group.dispose()
      }
      const matrices: T.Matrix4[] = [],
        colors: T.Color[] = []
      const plate = p.dark ? 0x618d94 : 0x75a9a9,
        rim = p.dark ? 0xb2c6bd : 0xc6d8cb
      const hall = p.dark ? 0x8c8880 : 0xd4c9b0,
        steel = p.dark ? 0x657781 : 0x667b7e
      const routeColor = 0xff870c,
        selected = 0xe14815
      const gap = p.spread ? 9 : 5
      const visible = (n: Place) =>
        p.floor === null || floors.get(n.levelId)!.ordinal === p.floor
      const pos = (n: Place, h = 0) =>
        new T.Vector3(
          n.point[0],
          floors.get(n.levelId)!.ordinal * gap + h,
          n.point[1],
        )
      function block(
        at: T.Vector3,
        w: number,
        h: number,
        d: number,
        color: number,
        rotation?: T.Quaternion,
      ) {
        dummy.position.copy(at)
        dummy.scale.set(w, h, d)
        dummy.quaternion.copy(rotation ?? new T.Quaternion())
        dummy.updateMatrix()
        matrices.push(dummy.matrix.clone())
        colors.push(new T.Color(color))
      }
      function beam(
        a: T.Vector3,
        b: T.Vector3,
        width: number,
        depth: number,
        color: number,
      ) {
        const delta = b.clone().sub(a)
        if (delta.length() < 0.01) return
        block(
          a.clone().lerp(b, 0.5),
          width,
          delta.length(),
          depth,
          color,
          new T.Quaternion().setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            delta.normalize(),
          ),
        )
      }
      function label(
        position: T.Vector3,
        text: string,
        priority: number,
        active = false,
      ) {
        const el = document.createElement('span')
        el.className = 'pin' + (active ? ' active' : '')
        el.textContent = text
        box.appendChild(el)
        labels.push({ position, text, priority, el })
      }
      for (const n of station.places.filter(visible)) {
        if (n.kind === 'Landing') continue
        const [w, d] = n.size,
          at = pos(n)
        block(
          at,
          w,
          0.72,
          d,
          n.kind === 'Platform' ? plate : n.zone === 'unpaid' ? hall : rim,
        )
        if (n.kind === 'Platform') {
          if (p.example && n.id === sample.platformId)
            label(
              pos(n, 3),
              (p.lang === 'ja' ? 'サンプル' : 'EXAMPLE') +
                ' · +' +
                sample.delayMinutes +
                ' min',
              -3,
              true,
            )
          // Abstract safety strips, rails and sleepers. Spacing is an illustration convention.
          const alongX = w > d,
            length = Math.max(w, d),
            breadth = Math.min(w, d)
          for (const side of [-1, 1]) {
            const offset = (x: number, lateral: number, y: number) =>
              at
                .clone()
                .add(
                  new T.Vector3(alongX ? x : lateral, y, alongX ? lateral : x),
                )
            const slat = (
              x: number,
              z: number,
              y: number,
              length: number,
              width: number,
              h: number,
              color: number,
            ) =>
              block(
                offset(x, z, y),
                alongX ? length : width,
                h,
                alongX ? width : length,
                color,
              )
            slat(
              0,
              side * (breadth / 2 - 0.22),
              0.385,
              length - 0.25,
              0.11,
              0.04,
              0xffdb78,
            )
            if (
              (n.id.endsWith('11') && side === -1) ||
              (n.id === 'sk:platform:metro-1' && side === 1)
            )
              continue
            const track = side * (breadth / 2 + 0.8)
            for (let x = -length / 2 + 0.5; x < length / 2; x += 1.35)
              slat(x, track, -0.43, 0.32, 1.4, 0.19, steel)
            for (const shift of [-0.42, 0.42])
              slat(0, track + shift, -0.23, length, 0.11, 0.2, steel)
          }
          label(
            pos(n, 1.1),
            n.names[p.lang],
            n.id.endsWith('3-4') || n.id.endsWith('21-22') ? 1 : 2,
          )
        } else if (n.id === 'sk:entrance:surface-crossing') {
          for (let x = -1.7; x <= 1.7; x += 0.7)
            block(
              at.clone().add(new T.Vector3(x, 0.4, 0)),
              0.26,
              0.05,
              2.4,
              0xf5f1d7,
            )
        } else if (n.kind === 'Concourse' && !n.id.includes('landing')) {
          // Low parapets cue the long axis of a hall without asserting an enclosure.
          if (w >= 5 || d >= 5)
            block(
              at.clone().add(new T.Vector3(-w / 2 + 0.12, 0.62, 0)),
              0.18,
              0.7,
              d,
              rim,
            )
          label(pos(n, 1), n.names[p.lang], 2)
        }
      }
      const activeIds = new Set(p.route.map((s) => s.link.id))
      for (const e of station.links) {
        const a = nodes.get(e.from)!,
          b = nodes.get(e.to)!,
          va = visible(a),
          vb = visible(b)
        if (!va && !vb) continue
        const start = pos(a, 0.46),
          end = pos(b, 0.46),
          mid = start.clone().lerp(end, 0.5)
        const active = activeIds.has(e.id),
          focus = p.route[p.step]?.link.id === e.id
        if (va && vb) {
          if (e.kind === 'Elevator') {
            const h = Math.abs(end.y - start.y)
            for (const x of [-0.66, 0.66])
              for (const z of [-0.66, 0.66])
                beam(
                  start.clone().add(new T.Vector3(x, 0, z)),
                  end.clone().add(new T.Vector3(x, 0, z)),
                  0.13,
                  0.13,
                  steel,
                )
            block(mid, 1.16, Math.min(h, 2), 1.16, plate)
          } else if (e.kind === 'Stairs' || e.kind === 'Escalator') {
            for (let i = 0; i < 12; i++)
              block(start.clone().lerp(end, i / 11), 1.1, 0.23, 1.05, steel)
          } else {
            const covered = station.places.some(
              (n) =>
                n.kind !== 'Landing' &&
                n.levelId === a.levelId &&
                [a, b].every(
                  (v) =>
                    Math.abs(v.point[0] - n.point[0]) <= n.size[0] / 2 &&
                    Math.abs(v.point[1] - n.point[1]) <= n.size[1] / 2,
                ),
            )
            if (!covered)
              beam(start, end, e.kind === 'Gate' ? 1.5 : 1.3, 0.22, rim)
            if (e.kind === 'Gate') {
              for (const z of [-0.8, 0, 0.8])
                block(
                  mid.clone().add(new T.Vector3(0, 0.52, z)),
                  0.95,
                  0.85,
                  0.32,
                  0x34565b,
                )
              label(
                mid.clone().add(new T.Vector3(0, 1.3, 0)),
                e.names[p.lang],
                active ? 1 : 2,
                active,
              )
            }
          }
          if (active)
            beam(
              start.clone().add(new T.Vector3(0, 0.95, 0)),
              end.clone().add(new T.Vector3(0, 0.95, 0)),
              focus ? 0.62 : 0.4,
              focus ? 0.62 : 0.4,
              focus ? selected : routeColor,
            )
        }
        if (!va || !vb || active) {
          for (const n of [a, b].filter(visible))
            block(
              pos(n, 1.32),
              active ? 0.9 : 1,
              0.24,
              active ? 0.9 : 1,
              active ? routeColor : steel,
            )
        }
        if (active && (e.kind === 'Elevator' || focus))
          label(
            (va && vb ? mid : va ? start : end)
              .clone()
              .add(new T.Vector3(0, 1.5, 0)),
            e.names[p.lang],
            focus ? -2 : 0,
            true,
          )
      }
      group = new T.InstancedMesh(unit, material, matrices.length)
      matrices.forEach((m, i) => {
        group!.setMatrixAt(i, m)
        group!.setColorAt(i, colors[i])
      })
      world.add(group)
      labels.sort((a, b) => a.priority - b.priority)
      if (refit || lastReset !== p.reset || lastFloor !== p.floor) {
        reset()
        lastReset = p.reset
        lastFloor = p.floor
      }
      if (lastZoom !== p.zoom.tick) {
        camera.zoom = T.MathUtils.clamp(camera.zoom * p.zoom.factor, 0.55, 5)
        camera.updateProjectionMatrix()
        lastZoom = p.zoom.tick
      }
      size()
    }
    const keyboard = (ev: KeyboardEvent) => {
      const delta: { [key: string]: [number, number] } = {
        ArrowLeft: [-2, 0],
        ArrowRight: [2, 0],
        ArrowUp: [0, -2],
        ArrowDown: [0, 2],
      }
      if (delta[ev.key]) {
        ev.preventDefault()
        const [x, z] = delta[ev.key]
        camera.position.x += x
        controls.target.x += x
        camera.position.z += z
        controls.target.z += z
      } else if (ev.key === '+' || ev.key === '-') {
        ev.preventDefault()
        camera.zoom = T.MathUtils.clamp(
          camera.zoom * (ev.key === '+' ? 1.2 : 1 / 1.2),
          0.55,
          5,
        )
        camera.updateProjectionMatrix()
      } else if (ev.key.toLowerCase() === 'r') reset()
      else return
      if (!controls.update()) draw()
    }
    controls.addEventListener('change', draw)
    gl.domElement.addEventListener('keydown', keyboard)
    const observer = new ResizeObserver(size)
    observer.observe(box)
    update.current = rebuild
    return () => {
      update.current = null
      observer.disconnect()
      controls.dispose()
      labels.forEach((l) => l.el.remove())
      group?.dispose()
      material.dispose()
      unit.dispose()
      gl.dispose()
      gl.domElement.remove()
    }
  }, [])
  useEffect(() => {
    update.current?.(props)
  }, [props])
  return (
    <div className="scene" ref={host}>
      {failed && (
        <button className="fallback" onClick={props.onFallback}>
          {props.lang === 'ja'
            ? 'WebGL利用不可 · 平面図を開く'
            : 'WebGL unavailable · Open floor plan'}
        </button>
      )}
    </div>
  )
}
