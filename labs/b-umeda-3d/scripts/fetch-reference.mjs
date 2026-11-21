import { readFile, mkdir, writeFile } from 'node:fs/promises'
const sources = JSON.parse(
  await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'),
)
const id = process.argv[2],
  source = sources.find((s) => s.id === id)
if (!source?.url?.startsWith('https://'))
  throw Error('Supply a registered HTTPS source ID from SOURCES.md')
const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) })
if (!response.ok) throw Error('Source unavailable: HTTP ' + response.status)
const root = new URL('../data/raw/', import.meta.url)
await mkdir(root, { recursive: true })
const ext = response.headers.get('content-type')?.includes('pdf')
  ? 'pdf'
  : 'txt'
await writeFile(
  new URL(id.split(':').at(-1) + '.' + ext, root),
  new Uint8Array(await response.arrayBuffer()),
)
console.log('Saved for private inspection in ignored data/raw/.')
