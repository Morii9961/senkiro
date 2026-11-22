/**
 * Reproducible Rolling Stock GLB Binary Asset & Catalog Builder
 *
 * Uses Vite SSR module loader (zero extra dependencies) to execute our TypeScript 3D rolling stock
 * builders and Khronos glTF 2.0 binary serializer in Node.js, producing:
 *  - `data/rolling-stock-catalog.json`
 *  - `public/assets/rolling-stock/*.glb` (Lead Car, Intermediate Car, and 3-Car Consist for all 3 series)
 *  - `public/assets/rolling-stock/manifest.json`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const rs = await vite.ssrLoadModule('/src/three/rollingStock/index.ts');

    const {
      LIST_ROLLING_STOCK_SPECS,
      buildRollingStockCatalogDataset,
      createTrainConsist,
      serializeObject3DToGlb,
      inspectGlbBinary,
      parseGlbBufferWithThreeLoader,
    } = rs;

    // 1. Write data/rolling-stock-catalog.json
    const catalog = buildRollingStockCatalogDataset();
    const dataDir = path.join(projectRoot, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const catalogPath = path.join(dataDir, 'rolling-stock-catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    console.log(`[GLB Builder] Wrote catalog: ${catalogPath}`);

    // 2. Build & validate .glb binary files for all 3 series
    const outDir = path.join(projectRoot, 'public', 'assets', 'rolling-stock');
    fs.mkdirSync(outDir, { recursive: true });

    const manifestEntries = [];

    for (const spec of LIST_ROLLING_STOCK_SPECS) {
      const consist = createTrainConsist({
        id: `export-${spec.seriesId}`,
        seriesId: spec.seriesId,
        carCount: 3,
        initialLod: 'high',
        lodMode: 'high',
      });

      const leadCar = consist.cars[0];
      const midCar = consist.cars[1];
      const perf = consist.getPerformanceMetrics();

      const targets = [
        {
          kind: 'lead_car',
          fileName: `${spec.seriesId}-lead.glb`,
          publicPath: spec.glbAssetPaths.leadCar,
          obj: leadCar.group,
          trianglesHigh: leadCar.getTriangleCount('high'),
          trianglesMed: leadCar.getTriangleCount('medium'),
          trianglesLow: leadCar.getTriangleCount('low'),
        },
        {
          kind: 'intermediate_car',
          fileName: `${spec.seriesId}-mid.glb`,
          publicPath: spec.glbAssetPaths.intermediateCar,
          obj: midCar.group,
          trianglesHigh: midCar.getTriangleCount('high'),
          trianglesMed: midCar.getTriangleCount('medium'),
          trianglesLow: midCar.getTriangleCount('low'),
        },
        {
          kind: 'preview_consist_3car',
          fileName: `${spec.seriesId}-consist.glb`,
          publicPath: spec.glbAssetPaths.previewConsist,
          obj: consist.group,
          trianglesHigh: perf.lodTrianglesByTier.high,
          trianglesMed: perf.lodTrianglesByTier.medium,
          trianglesLow: perf.lodTrianglesByTier.low,
        },
      ];

      for (const t of targets) {
        const glbBytes = serializeObject3DToGlb(t.obj, { includeOnlyVisible: true });
        const inspection = inspectGlbBinary(glbBytes);
        if (!inspection.validMagic || inspection.version !== 2) {
          throw new Error(`GLB validation failed for ${t.fileName}`);
        }

        // Verify Three.js official GLTFLoader parses the generated binary buffer cleanly
        const parsed = await parseGlbBufferWithThreeLoader(glbBytes);
        if (!parsed.scene || parsed.scene.children.length === 0) {
          throw new Error(`Three.js GLTFLoader parse check failed for ${t.fileName}`);
        }

        const outPath = path.join(outDir, t.fileName);
        fs.writeFileSync(outPath, glbBytes);

        manifestEntries.push({
          seriesId: spec.seriesId,
          entityId: spec.id,
          nameJa: spec.names.ja,
          nameEn: spec.names.en,
          kind: t.kind,
          fileName: t.fileName,
          publicPath: t.publicPath,
          byteLength: glbBytes.byteLength,
          sizeKb: Number((glbBytes.byteLength / 1024).toFixed(2)),
          gltfVersion: '2.0',
          nodeCount: inspection.nodeCount,
          meshCount: inspection.meshCount,
          materialCount: inspection.materialCount,
          trianglesByLod: {
            high: t.trianglesHigh,
            medium: t.trianglesMed,
            low: t.trianglesLow,
          },
        });

        console.log(
          `[GLB Builder] Built & verified ${t.fileName}: ${(glbBytes.byteLength / 1024).toFixed(1)} KB | Nodes:${inspection.nodeCount} | Meshes:${inspection.meshCount} | Mats:${inspection.materialCount} | Tris(L0/L1/L2): ${t.trianglesHigh}/${t.trianglesMed}/${t.trianglesLow}`,
        );
      }

      consist.dispose();
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      generator: 'SENKIRO Lab Rolling Stock GLB Builder v2.0',
      license: 'MIT / CC BY 4.0',
      spatialScale: '1_unit_equals_1_meter',
      totalAssets: manifestEntries.length,
      assets: manifestEntries,
    };

    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`[GLB Builder] Wrote manifest: ${manifestPath}`);
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
