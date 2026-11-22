import { useEffect, useRef, useState } from 'react'
import * as T from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Language, Place } from './domain/types'
import type { Step } from './domain/graph'
import { floors, nodes, station, sites, inSite } from './model'
import { sample } from './providers/service'

import { shopWindows, type ShopWindow } from './shopWindows'
import { signage, type Board } from './signage'
import { architecturalMaterial, Finish } from './surfaces'
import {
  osakaShed,
  terminalRoof,
  concourseWalls,
  undergroundPlatform,
  passageEdges,
  passengerCeiling,
  plazaTree,
} from './buildings'
import * as architecture from './architecture'

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
  eye: string | null
  shell: boolean
  siteId: string | null
  onReset: () => void
  onInspect: (id: string) => void
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
    gl.shadowMap.enabled = true
    gl.shadowMap.type = T.PCFSoftShadowMap
    gl.shadowMap.autoUpdate = false
    gl.domElement.tabIndex = 0
    box.prepend(gl.domElement)
    const world = new T.Scene(),
      camera = new T.OrthographicCamera(-55, 55, 40, -40, 0.1, 800)
    const controls = new OrbitControls(camera, gl.domElement)
    const eyeCamera = new T.PerspectiveCamera(62, 1, 0.05, 360)
    let yaw = 0,
      pitch = 0
    function aim() {
      eyeCamera.rotation.set(pitch, yaw, 0, 'YXZ')
    }
    const activeCamera = () => (propsNow?.eye ? eyeCamera : camera)
    controls.minZoom = 0.55
    controls.maxZoom = 5
    controls.maxPolarAngle = 1.44
    controls.minPolarAngle = 0.15
    controls.mouseButtons = {
      LEFT: T.MOUSE.ROTATE,
      MIDDLE: T.MOUSE.PAN,
      RIGHT: T.MOUSE.PAN,
    }
    world.add(new T.HemisphereLight(0xf3f6ff, 0xc9bdad, 1.72))
    const sun = new T.DirectionalLight(0xfff3dd, 2.15)
    sun.position.set(-44, 98, 48)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, {
      left: -100,
      right: 100,
      top: 85,
      bottom: -85,
      near: 0.5,
      far: 240,
    })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.normalBias = 0.022
    sun.shadow.bias = -0.00017
    world.add(sun)
    const unit = new T.BoxGeometry(),
      material = architecturalMaterial()
    const signs = signage()
    const dummy = new T.Object3D(),
      labels: Label[] = []
    let owners: string[] = []
    let group: T.InstancedMesh | null = null,
      propsNow: Props,
      lastReset = -1,
      lastZoom = -1,
      lastFloor: number | null = null,
      frame = 0
    const shopDisplay = shopWindows(world, draw)
    const view = new T.Vector3(53, 67, 116),
      right = new T.Vector3(view.z, 0, -view.x).normalize()
    const up = view.clone().normalize().cross(right).normalize()
    let bounds = { center: new T.Vector3(), width: 90, height: 70 }
    function fit(p: Props) {
      const corners: T.Vector3[] = []
      for (const n of station.places) {
        if (!inSite(n, p.siteId)) continue
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
      if (
        p.shell &&
        p.floor === null &&
        (!p.siteId || p.siteId === 'sk:station:jr-osaka')
      ) {
        for (const x of [-23, 24])
          for (const z of [-16, 16])
            corners.push(
              new T.Vector3(x, (p.spread ? 9 : 5) + 7.4 + (15 - z) * 0.2, z),
            )
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
      const lens = activeCamera()
      lens.updateMatrixWorld()
      gl.domElement.dataset.view = propsNow.eye ? 'interior' : 'overview'
      gl.domElement.dataset.zoom = String(lens.zoom)
      const placed: { x: number; y: number; w: number }[] = []
      for (const label of labels) {
        const v = label.position.clone().project(lens),
          x = ((v.x + 1) * w) / 2,
          y = ((1 - v.y) * h) / 2
        const width = label.el.offsetWidth || 80
        const visible =
          !propsNow.eye &&
          v.z >= -1 &&
          v.z <= 1 &&
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
      gl.render(world, lens)
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
        bounds.height * 1.1,
        (bounds.width * 1.08 * h) / w,
      )
      camera.left = (-height * w) / h / 2
      camera.right = -camera.left
      camera.top = height / 2
      camera.bottom = -height / 2
      camera.updateProjectionMatrix()
      eyeCamera.aspect = w / h
      eyeCamera.updateProjectionMatrix()
      gl.setSize(w, h)
      draw()
    }
    function rebuild(p: Props) {
      const refit =
        !propsNow ||
        propsNow.floor !== p.floor ||
        propsNow.spread !== p.spread ||
        propsNow.siteId !== p.siteId ||
        propsNow.shell !== p.shell
      const previous = propsNow?.route[propsNow.step]?.link.id
      const current = p.route[p.step]
      const oldEye = propsNow?.eye
      propsNow = p
      controls.enabled = !p.eye
      world.background = p.eye ? new T.Color(0xb5bdbe) : null
      world.fog = p.eye ? new T.FogExp2(0xb5bdbe, 0.018) : null
      if (p.eye && (p.eye !== oldEye || refit)) {
        const place = nodes.get(p.eye)!
        const alongX = place.size[0] >= place.size[1]
        const inset = Math.min(9, Math.max(...place.size) * 0.37)
        eyeCamera.position.set(
          place.point[0] + (alongX ? -inset : 0.24),
          floors.get(place.levelId)!.ordinal * (p.spread ? 9 : 5) + 1.78,
          place.point[1] + (alongX ? 0.24 : inset),
        )
        yaw = alongX
          ? -Math.PI / 2 + 0.055
          : place.id.startsWith('sk:platform:hk-')
            ? 0.38
            : 0.045
        pitch = -0.025
        aim()
        eyeCamera.zoom = 1
        eyeCamera.updateProjectionMatrix()
      }
      owners = []
      let owner = ''
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
      const panes: ShopWindow[] = []
      const boards: Board[] = []
      const finishes: number[] = []
      let finish: number = Finish.metal
      const plate = 0xb8b9b4,
        rim = 0xd4d2c5,
        hall = 0xddccb1,
        steel = 0x686963
      const routeColor = 0xff870c,
        selected = 0xe14815
      const gap = p.spread ? 9 : 5
      const visible = (n: Place) =>
        inSite(n, p.siteId) &&
        (p.floor !== null
          ? floors.get(n.levelId)!.ordinal === p.floor
          : !current ||
            n.levelId === current.from.levelId ||
            n.levelId === current.to.levelId)
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
        surface = finish,
      ) {
        finishes.push(surface)
        owners.push(owner)
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
        stationName = false,
      ) {
        const el = document.createElement('span')
        el.className = 'pin' + (active ? ' active' : '')
        if (stationName) el.classList.add('station-pin')
        el.dataset.owner = owner
        el.textContent = text
        box.appendChild(el)
        labels.push({ position, text, priority, el })
      }
      for (const n of station.places.filter(visible)) {
        if (n.kind === 'Landing') continue
        owner = n.id
        const [w, d] = n.size,
          at = pos(n)
        const deckLevel = at.clone().add(new T.Vector3(0, 0.09, 0))
        const flights = station.links
          .filter((e) => e.kind === 'Stairs' || e.kind === 'Escalator')
          .flatMap((e) => {
            const a = nodes.get(e.from)!,
              b = nodes.get(e.to)!
            const [upper, lower] = pos(a).y > pos(b).y ? [a, b] : [b, a]
            return upper.levelId === n.levelId
              ? [{ top: pos(upper), foot: pos(lower) }]
              : []
          })
        finish = n.kind === 'Platform' ? Finish.concrete : Finish.tile
        architecture.deck(
          n,
          deckLevel,
          flights,
          n.kind === 'Platform' ? plate : n.zone === 'unpaid' ? hall : rim,
          block,
        )
        finish = Finish.metal
        if (
          p.eye &&
          p.shell &&
          (n.id === 'sk:concourse:hk-headhall' ||
            n.id.includes('whity-') ||
            (n.kind === 'Platform' && floors.get(n.levelId)!.ordinal < 0))
        )
          passengerCeiling(n, at, block)
        if (n.id === 'sk:concourse:whity-izumi' && p.shell)
          plazaTree(at, block, beam)
        if (n.kind === 'Platform') {
          const landings = station.places
            .filter((s) => s.kind === 'Landing' && s.levelId === n.levelId)
            .map((s) => pos(s))
          architecture.platformFittings(
            n,
            at,
            landings,
            block,
            (position, alongX) =>
              boards.push({ position, alongX, platform: n.id }),
          )
          const sides: (-1 | 1)[] =
            n.boarding?.trackSides ??
            (n.id.endsWith('jr-11')
              ? [1]
              : n.id.endsWith('metro-1')
                ? [-1]
                : [-1, 1])
          if (p.shell && floors.get(n.levelId)!.ordinal < 0)
            undergroundPlatform(n, at, sides, block)
          if (!current && p.floor === null && n.id.endsWith('21-22')) {
            label(
              pos(n, 2.5),
              p.lang === 'ja'
                ? 'JR うめきた地下ホーム'
                : 'JR Umekita platforms',
              -1,
              false,
              true,
            )
          }
          if (
            !current &&
            p.floor === null &&
            (n.id.endsWith('jr-11') || n.id.endsWith('metro-1'))
          ) {
            const metro = n.id.endsWith('metro-1')
            label(
              pos(n, 3.2),
              metro
                ? p.lang === 'ja'
                  ? '御堂筋線 梅田'
                  : 'Midosuji · Umeda'
                : p.lang === 'ja'
                  ? 'JR 大阪駅'
                  : 'JR Osaka Station',
              -1,
              false,
              true,
            )
          }
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
          for (const side of sides) {
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
            finish = Finish.tactile
            slat(
              0,
              side * (breadth / 2 - 0.22),
              0.385,
              length - 0.25,
              0.19,
              0.04,
              0xe8ba56,
            )
            const track = side * (breadth / 2 + 0.54)
            finish = Finish.ballast
            slat(0, track, -0.47, length, 1.12, 0.12, 0x786e61)
            finish = Finish.metal
            slat(
              0,
              side * (breadth / 2 - 0.075),
              0.374,
              length - 0.04,
              0.1,
              0.022,
              0xe3ddd1,
            )
            if (n.boarding?.terminalEnd) {
              const end = n.boarding.terminalEnd * (length / 2 - 0.42)
              slat(end, track, -0.05, 0.25, 0.85, 0.44, 0x4f5150)
              slat(end, track, 0.18, 0.18, 0.71, 0.13, 0xba9b62)
            }
            for (let x = -length / 2 + 0.3; x < length / 2; x += 0.62)
              slat(x, track, -0.35, 0.14, 0.98, 0.12, 0x716a60)
            for (const shift of [-0.32, 0.32])
              slat(0, track + shift, -0.22, length, 0.085, 0.17, steel)
          }
          const number =
            n.boarding?.label ??
            n.id
              .split(':')
              .pop()!
              .replace(/^(jr|metro)-/, '')
              .replace('-', ' · ')
          const end = pos(n, 1.03)
          if (alongX) end.x += w * 0.37
          else end.z += d * 0.32
          label(end, number, 1)
          labels[labels.length - 1].el.classList.add('platform-pin')
          labels[labels.length - 1].el.title = n.names[p.lang]
          labels[labels.length - 1].el.style.setProperty(
            '--stripe',
            n.serviceLineIds?.includes('sk:line:midosuji')
              ? '#b44041'
              : n.id.endsWith('jr-1-2')
                ? '#b95436'
                : '#537986',
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
          const openings = station.links
            .filter((e) => e.from === n.id || e.to === n.id)
            .flatMap((e) => {
              const other = pos(nodes.get(e.from === n.id ? e.to : e.from)!)
              const samples = Math.ceil(at.distanceTo(other))
              return Array.from({ length: samples + 1 }, (_, i) =>
                at.clone().lerp(other, i / Math.max(1, samples)),
              )
            })
          if (n.id !== 'sk:concourse:hk-outer') {
            if (p.shell)
              concourseWalls(n, deckLevel, openings, block, panes, !!p.eye)
            else architecture.hallRails(n, deckLevel, openings, block)
          }
          if (
            n.id === 'sk:concourse:hk-headhall' &&
            p.shell &&
            p.floor === null &&
            !current
          )
            terminalRoof(n, at, block, beam)
          if (!current || n.id === current.from.id || n.id === current.to.id)
            label(pos(n, 1), n.names[p.lang], 2)
        }
      }
      if (
        p.shell &&
        p.floor === null &&
        !current &&
        (!p.siteId || p.siteId === 'sk:station:jr-osaka')
      ) {
        owner = 'sk:station:jr-osaka'
        osakaShed(gap, block, beam)
      }
      if (!current) {
        for (const site of station.context) {
          const anchor = nodes.get(site.anchorId)!
          const here = visible(anchor)
            ? anchor
            : station.places.find(
                (n) => n.kind !== 'Landing' && inSite(n, site.id) && visible(n),
              )
          if (!here) continue
          owner = site.id
          label(pos(here, 2.65), site.names[p.lang], -2, false, true)
        }
      }
      if (!current && p.floor === null) {
        const anchors: Record<string, string> = {
          '3F': 'jr-bridge',
          中2F: 'jr-sakura-mezz',
          '1F': 'jr-central-south',
          B1F: 'umekita-out',
          B2F: 'jr-23-24',
          '2F': 'jr-1-2',
        }
        for (const [name, suffix] of Object.entries(anchors)) {
          const n = station.places.find(
            (k) =>
              k.id.endsWith(':' + suffix) &&
              floors.get(k.levelId)!.label === name,
          )
          if (!n || !visible(n)) continue
          owner = n.id
          const corner = pos(n, 0.75)
          corner.x -= n.size[0] * 0.46
          corner.z += n.size[1] * 0.41
          label(corner, name, 0)
          labels[labels.length - 1].el.classList.add('floor-pin')
        }
      }
      const activeIds = new Set(p.route.map((s) => s.link.id))
      const liftStops = new Set<string>()
      for (const e of station.links) {
        owner = e.id
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
        if (e.kind === 'Elevator') {
          architecture.lift(
            start,
            end,
            va && !liftStops.has(a.id),
            vb && !liftStops.has(b.id),
            block,
            beam,
            va && vb,
          )
          liftStops.add(a.id)
          liftStops.add(b.id)
        }
        if (va && vb) {
          if (e.kind === 'Stairs' || e.kind === 'Escalator')
            architecture.stairs(
              e,
              start,
              end,
              block,
              beam,
              active ? (focus ? selected : routeColor) : undefined,
            )
          if (e.kind === 'Passage' || e.kind === 'Gate') {
            const deckOffset = new T.Vector3(0, -0.23, 0)
            const covered = station.places.some(
              (n) =>
                n.levelId === a.levelId &&
                n.kind !== 'Landing' &&
                [a, b].every(
                  (v) =>
                    Math.abs(v.point[0] - n.point[0]) <= n.size[0] / 2 &&
                    Math.abs(v.point[1] - n.point[1]) <= n.size[1] / 2,
                ),
            )
            const dx = Math.abs(end.x - start.x),
              dz = Math.abs(end.z - start.z)
            const fraction = (n: Place) =>
              n.kind === 'Landing'
                ? 0
                : Math.min(
                    dx ? n.size[0] / (2 * dx) : Infinity,
                    dz ? n.size[1] / (2 * dz) : Infinity,
                    1,
                  )
            const t1 = fraction(a),
              t2 = 1 - fraction(b)
            if (!covered && t2 > t1) {
              const openStart = start.clone().lerp(end, t1),
                openEnd = start.clone().lerp(end, t2)
              finish = Finish.tile
              architecture.horizontalSpan(
                openStart.clone().add(deckOffset),
                openEnd.clone().add(deckOffset),
                e.kind === 'Gate' ? 3.8 : 1.85,
                0.32,
                a.zone === 'unpaid' ? hall : rim,
                block,
              )
              finish = Finish.metal
              if (
                p.shell &&
                e.kind === 'Passage' &&
                e.from !== e.to &&
                e.from.startsWith('sk:concourse:') &&
                e.to.startsWith('sk:concourse:') &&
                start.y < 0
              )
                passageEdges(openStart, openEnd, 1.85, block)
            }
            if (e.kind === 'Gate') {
              architecture.gate(start, end, block)
              if (!focus)
                label(
                  mid.clone().add(new T.Vector3(0, 2.7, 0)),
                  e.names[p.lang],
                  active ? 1 : 2,
                  active,
                )
            }
          }
          if (active && e.kind !== 'Stairs' && e.kind !== 'Escalator') {
            const offset = new T.Vector3(0, start.y === end.y ? 0.1 : 0.5, 0)
            const c = focus ? selected : routeColor
            if (start.y === end.y)
              architecture.horizontalSpan(
                start.clone().add(offset),
                end.clone().add(offset),
                focus ? 0.51 : 0.34,
                0.07,
                c,
                block,
              )
            else
              beam(
                start.clone().add(offset),
                end.clone().add(offset),
                0.28,
                0.28,
                c,
              )
            if (focus && current && start.y === end.y) {
              const forward = pos(current.to)
                .sub(pos(current.from))
                .setY(0)
                .normalize()
              const side = new T.Vector3(forward.z, 0, -forward.x)
              const tip = pos(current.from, 0.64).lerp(
                pos(current.to, 0.64),
                0.82,
              )
              for (const sign of [-1, 1])
                architecture.horizontalSpan(
                  tip
                    .clone()
                    .addScaledVector(forward, -0.49)
                    .addScaledVector(side, sign * 0.29),
                  tip,
                  0.13,
                  0.08,
                  0xffe2a0,
                  block,
                )
            }
          }
        }
        if (
          !current &&
          va !== vb &&
          (e.kind === 'Stairs' || e.kind === 'Escalator')
        ) {
          const landing = va ? start : end
          architecture.stairs(
            e,
            landing,
            landing.clone().lerp(va ? end : start, 0.3),
            block,
            beam,
          )
        }
        if (active && (e.kind === 'Elevator' || focus))
          label(
            (va && vb ? mid : va ? start : end)
              .clone()
              .add(new T.Vector3(0, 1.5, 0)),
            current?.link.id === e.id && current.from.id !== e.from
              ? current.to.names[p.lang]
              : e.names[p.lang],
            focus ? -2 : 0,
            true,
          )
      }
      shopDisplay.rebuild(panes)
      signs.rebuild(boards, world)
      unit.dispose()
      unit.setAttribute(
        'finish',
        new T.InstancedBufferAttribute(new Float32Array(finishes), 1),
      )
      group = new T.InstancedMesh(unit, material, matrices.length)
      matrices.forEach((m, i) => {
        group!.setMatrixAt(i, m)
        group!.setColorAt(i, colors[i])
      })
      group.castShadow = true
      group.receiveShadow = true
      gl.shadowMap.needsUpdate = true
      world.add(group)
      labels.sort((a, b) => a.priority - b.priority)
      if (
        (previous && !current) ||
        refit ||
        lastReset !== p.reset ||
        lastFloor !== p.floor
      ) {
        reset()
        lastReset = p.reset
        lastFloor = p.floor
      }
      if (lastZoom !== p.zoom.tick) {
        const lens = activeCamera()
        lens.zoom = T.MathUtils.clamp(lens.zoom * p.zoom.factor, 0.55, 5)
        lens.updateProjectionMatrix()
        lastZoom = p.zoom.tick
      }
      size()
      if (current && (previous !== current.link.id || refit)) {
        const a = pos(current.from, 0.6),
          b = pos(current.to, 0.6)
        controls.target.copy(a).lerp(b, 0.5)
        const span = b.clone().sub(a)
        // Look up the flight from its lower landing so the treads remain legible.
        const lowerSide = span
          .clone()
          .multiplyScalar(span.y > 0 ? -1 : 1)
          .setY(0)
          .normalize()
        const sideView = new T.Vector3(lowerSide.z, 0, -lowerSide.x)
          .multiplyScalar(36)
          .addScaledVector(lowerSide, 68)
        sideView.y = 82
        const flight =
          current.link.kind === 'Stairs' || current.link.kind === 'Escalator'
        camera.position.copy(controls.target).add(flight ? sideView : view)
        const desiredHeight = Math.max(
          10,
          Math.abs(span.dot(up)) + 6,
          ((Math.abs(span.dot(right)) + 8) * box.clientHeight) /
            Math.max(1, box.clientWidth),
        )
        camera.zoom = T.MathUtils.clamp(
          (camera.top - camera.bottom) / desiredHeight,
          0.65,
          5,
        )
        camera.updateProjectionMatrix()
        controls.update()
        draw()
      }
      gl.domElement.dataset.focus = current?.link.id ?? ''
    }
    let pressed: { x: number; y: number } | null = null
    let drag: { x: number; y: number } | null = null
    let moved = false
    const pointerMove = (e: PointerEvent) => {
      if (!drag || !propsNow.eye) return
      yaw -= (e.clientX - drag.x) * 0.005
      pitch = T.MathUtils.clamp(
        pitch - (e.clientY - drag.y) * 0.005,
        -1.35,
        1.35,
      )
      moved ||=
        !!pressed &&
        Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 5
      drag = { x: e.clientX, y: e.clientY }
      aim()
      draw()
    }
    const wheel = (e: WheelEvent) => {
      if (!propsNow.eye) return
      e.preventDefault()
      eyeCamera.zoom = T.MathUtils.clamp(
        eyeCamera.zoom * Math.exp(-e.deltaY * 0.001),
        0.6,
        3,
      )
      eyeCamera.updateProjectionMatrix()
      draw()
    }
    const pointerDown = (e: PointerEvent) => {
      pressed = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
      moved = false
      if (propsNow.eye && pressed) {
        drag = { ...pressed }
        gl.domElement.setPointerCapture(e.pointerId)
      }
    }
    const pointerUp = (e: PointerEvent) => {
      drag = null
      if (
        moved ||
        !pressed ||
        !group ||
        Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 5
      )
        return
      pressed = null
      for (const { el } of labels) {
        if (el.style.visibility !== 'visible') continue
        const r = el.getBoundingClientRect()
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom &&
          el.dataset.owner
        ) {
          propsNow.onInspect(el.dataset.owner)
          return
        }
      }
      const r = gl.domElement.getBoundingClientRect()
      const ray = new T.Raycaster()
      ray.setFromCamera(
        new T.Vector2(
          (2 * (e.clientX - r.left)) / r.width - 1,
          1 - (2 * (e.clientY - r.top)) / r.height,
        ),
        activeCamera(),
      )
      const hit = ray.intersectObject(group, false)[0]
      if (hit?.instanceId !== undefined)
        propsNow.onInspect(owners[hit.instanceId])
    }
    const cancel = () => {
      drag = null
      pressed = null
    }
    gl.domElement.addEventListener('pointercancel', cancel)
    gl.domElement.addEventListener('pointermove', pointerMove)
    gl.domElement.addEventListener('wheel', wheel, { passive: false })
    gl.domElement.addEventListener('pointerdown', pointerDown)
    gl.domElement.addEventListener('pointerup', pointerUp)
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
        if (propsNow.eye) {
          yaw -= x * 0.07
          pitch = T.MathUtils.clamp(pitch - z * 0.07, -1.35, 1.35)
          aim()
          draw()
          return
        }
        camera.position.x += x
        controls.target.x += x
        camera.position.z += z
        controls.target.z += z
      } else if (ev.key === '+' || ev.key === '-') {
        ev.preventDefault()
        const lens = activeCamera()
        lens.zoom = T.MathUtils.clamp(
          lens.zoom * (ev.key === '+' ? 1.2 : 1 / 1.2),
          0.55,
          5,
        )
        lens.updateProjectionMatrix()
      } else if (ev.key.toLowerCase() === 'r') propsNow.onReset()
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
      gl.domElement.removeEventListener('wheel', wheel)
      gl.domElement.removeEventListener('pointermove', pointerMove)
      gl.domElement.removeEventListener('pointercancel', cancel)
      gl.domElement.removeEventListener('pointerdown', pointerDown)
      gl.domElement.removeEventListener('pointerup', pointerUp)
      gl.domElement.removeEventListener('keydown', keyboard)
      controls.dispose()
      labels.forEach((l) => l.el.remove())
      group?.dispose()
      shopDisplay.dispose()
      signs.dispose()
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
