import { useEffect, useRef, useState } from 'react'
import * as T from 'three'
import { vehicleSeries } from '../../data/manual/vehicles'
import { station } from '../model'
import { buildVehicleBody } from './vehicles'
import './vehicle-preview.css'

const samples = [...vehicleSeries, null]
const categories = {
  commuter: { ja: '通勤形', en: 'Commuter' },
  rapid: { ja: '近郊形', en: 'Rapid' },
  'limited-express': { ja: '特急形', en: 'Limited express' },
  subway: { ja: '地下鉄', en: 'Subway' },
  other: { ja: 'その他', en: 'Other' },
}

export function VehiclePreview() {
  const gallery = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(0)
  const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ja'
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en

  useEffect(() => {
    let renderer: T.WebGLRenderer
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    } catch {
      setRendered(-1)
      return
    }
    const scene = new T.Scene()
    const sunlight = new T.DirectionalLight(0xfff6e2, 2.3)
    sunlight.position.set(5, 8, 6)
    scene.add(new T.HemisphereLight(0xe7f3ff, 0x777b74, 1.85), sunlight)
    const unit = new T.BoxGeometry()
    const material = new T.MeshStandardMaterial({ roughness: 0.82 })
    const dummy = new T.Object3D()
    const color = new T.Color()

    function paint(
      context: CanvasRenderingContext2D, body: ReturnType<typeof buildVehicleBody>,
      x: number, y: number, width: number, height: number,
    ) {
      const mesh = new T.InstancedMesh(unit, material, body.parts.length)
      for (const [index, part] of body.parts.entries()) {
        dummy.position.set(...part.center)
        dummy.scale.set(...part.size)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        mesh.setColorAt(index, color.set(part.color))
      }
      const aspect = width / height
      const half = Math.max(0.62, (body.length * 0.51 + 0.14) / aspect)
      const camera = new T.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.05, 160)
      camera.position.set(3.0, 2.8, 7.2)
      camera.lookAt(0, 0.39, 0)
      renderer.setSize(width * 2, height * 2, false)
      scene.add(mesh)
      renderer.render(scene, camera)
      context.drawImage(renderer.domElement, x, y, width, height)
      scene.remove(mesh)
      mesh.dispose()
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
    unit.dispose()
    material.dispose()
    renderer.dispose()
    setRendered(count)
  }, [])

  return (
    <main className="vehicle-preview" data-testid="vehicle-preview" data-rendered={rendered} lang={lang}>
      <h1>{t('車体プレビュー', 'Vehicle appearance preview')}</h1>
      <p>{t('外観は模式表現です。左は先頭車、右は編成例です。',
        'Schematic appearance. The end car is shown on the left and an example consist on the right.')}</p>
      {rendered === -1 && <p role="status">{t('3D プレビューは利用できません。', '3D preview is unavailable.')}</p>}
      <div className="vehicle-preview-grid" ref={gallery}>
        {samples.map((series) => {
          const label = series?.names[lang] ?? t('車種未確認（汎用車体）', 'Vehicle unverified · generic body')
          const operator = station.operators.find(({ id }) => id === series?.operatorId)?.names[lang]
          const cars = series?.formations[0]?.cars
          return (
            <article key={series?.id ?? 'unknown'}>
              <div className="vehicle-preview-title">
                <h2>{label}</h2>
                {series && <span>{t('代表例', 'Representative')}</span>}
              </div>
              <p>{[operator, series?.category ? categories[series.category][lang] : null].filter(Boolean).join(' · ') ||
                t('運営会社未確認', 'Operator unverified')}</p>
              <canvas width={430} height={116} aria-label={label} />
              <p className="vehicle-preview-formation">
                {cars ? t(cars + ' 両の編成例', cars + '-car documented example') : t('編成未確認', 'Formation unverified')}
              </p>
            </article>
          )
        })}
      </div>
    </main>
  )
}
