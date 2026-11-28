import { nameIn } from '../domain/language'
import { useEffect, useRef, useState } from 'react'
import * as T from 'three'
import { vehicleSeries } from '../../data/manual/vehicles'
import { station } from '../model'
import { createVehicleGeometries } from './vehicleGeometry'
import { buildVehicleBody, type VehiclePart, type VehicleShape } from './vehicles'
import './vehicle-preview.css'

const samples = [...vehicleSeries, null]
const categories = {
  commuter: { ja: '通勤形', en: 'Commuter', zh: '通勤列车' },
  rapid: { ja: '近郊形', en: 'Rapid', zh: '近郊列车' },
  'limited-express': { ja: '特急形', en: 'Limited express', zh: '特急列车' },
  subway: { ja: '地下鉄', en: 'Subway', zh: '地铁' },
  other: { ja: 'その他', en: 'Other', zh: '其他' },
}

export function VehiclePreview() {
  const gallery = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(0)
  const requested = new URLSearchParams(location.search).get('lang')
  const lang = requested === 'en' || requested === 'zh' ? requested : 'ja'
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en

  useEffect(() => {
    let renderer: T.WebGLRenderer
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    } catch {
      setRendered(-1)
      return
    }
    const scene = new T.Scene()
    const sunlight = new T.DirectionalLight(0xffffff, 2.0)
    sunlight.position.set(5, 8, 6)
    scene.add(new T.HemisphereLight(0xf1f6ff, 0x777777, 1.70), sunlight)
    const geometries = createVehicleGeometries()
    const material = new T.MeshStandardMaterial({ roughness: 0.82 })
    const dummy = new T.Object3D()
    const color = new T.Color()

    function paint(
      context: CanvasRenderingContext2D, body: ReturnType<typeof buildVehicleBody>,
      x: number, y: number, width: number, height: number,
    ) {
      const grouped = new Map<VehicleShape, VehiclePart[]>()
      for (const part of body.parts) {
        const group = grouped.get(part.shape) ?? []
        group.push(part)
        grouped.set(part.shape, group)
      }
      const meshes = [...grouped].map(([shape, parts]) => {
        const mesh = new T.InstancedMesh(geometries.get(shape)!, material, parts.length)
        for (const [index, part] of parts.entries()) {
          dummy.position.set(...part.center)
          dummy.scale.set(...part.size)
          dummy.rotation.y = part.facing < 0 ? Math.PI : 0
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
          mesh.setColorAt(index, color.set(part.color))
        }
        return mesh
      })
      const aspect = width / height
      const half = Math.max(0.62, (body.length * 0.51 + 0.14) / aspect)
      const camera = new T.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.05, 160)
      camera.position.set(3.0, 2.8, 7.2)
      camera.lookAt(0, 0.39, 0)
      renderer.setSize(width * 2, height * 2, false)
      scene.add(...meshes)
      renderer.render(scene, camera)
      context.drawImage(renderer.domElement, x, y, width, height)
      scene.remove(...meshes)
      for (const mesh of meshes) mesh.dispose()
    }

    let count = 0
    gallery.current!.querySelectorAll('canvas').forEach((canvas, index) => {
      const context = canvas.getContext('2d')
      if (!context) return
      const series = samples[index]
      paint(context, buildVehicleBody(series, 4.5, 1), 0, 0, 272, 116)
      paint(context, buildVehicleBody(series, 35, series?.formations[0]?.cars ?? null), 248, 29, 182, 76)
      count++
    })
    for (const geometry of geometries.values()) geometry.dispose()
    material.dispose()
    renderer.dispose()
    setRendered(count)
  }, [])

  return (
    <main className="vehicle-preview" data-testid="vehicle-preview" data-rendered={rendered} lang={lang}>
      <h1>{t('車体プレビュー', 'Vehicle appearance preview', '车体外观预览')}</h1>
      <p>{t('公開資料を参考にした模式表現です。左は先頭車、右は編成例です。未確認の編成は参考用に車体を並べています。',
        'Schematic models from published references. A cab car is shown on the left. Unverified consists on the right use repeated sample cars.', '按公开资料制作的示意模型。左侧是头车，右侧是编组示例。未核实编组的车辆仅用于展示。')}</p>
      {rendered === -1 && <p role="status">{t('3D プレビューは利用できません。', '3D preview is unavailable.', '无法显示 3D 预览。')}</p>}
      <div className="vehicle-preview-grid" ref={gallery}>
        {samples.map((series) => {
          const label = nameIn(series?.names, lang) ?? t('車種未確認（汎用車体）', 'Vehicle unverified · generic body', '车型未核实 · 通用车体')
          const operator = nameIn(station.operators.find(({ id }) => id === series?.operatorId)?.names, lang)
          const cars = series?.formations[0]?.cars
          return (
            <article key={series?.id ?? 'unknown'}>
              <div className="vehicle-preview-title">
                <h2>{label}</h2>
                {series && <span>{t('代表例', 'Representative', '代表车型')}</span>}
              </div>
              <p>{[operator, series?.category ? categories[series.category][lang] : null].filter(Boolean).join(' · ') ||
                t('運営会社未確認', 'Operator unverified', '运营商未核实')}</p>
              <canvas width={430} height={116} aria-label={label} />
              <p className="vehicle-preview-formation">
                {cars ? t(cars + ' 両の編成例', cars + '-car documented example', cars + ' 节编组示例') : t('編成未確認', 'Formation unverified', '编组未核实')}
              </p>
            </article>
          )
        })}
      </div>
    </main>
  )
}
