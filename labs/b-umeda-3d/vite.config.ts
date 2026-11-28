import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/data/raw/**'],
    },
  },
  plugins: mode === 'local-timetable' ? [{
    name: 'local-official-timetable',
    configurePreviewServer(server) {
      server.middlewares.use('/local-official-timetable', async (request, response) => {
        if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${request.socket.localPort}` ||
            request.socket.localAddress !== '127.0.0.1' || request.socket.remoteAddress !== '127.0.0.1') {
          response.writeHead(404).end()
          return
        }
        try {
          const timetable = await readFile(new URL('./data/raw/official-timetable.json', import.meta.url))
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(timetable)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') server.config.logger.error(String(error))
          response.writeHead(404).end()
        }
      })
    },
  }] : [],
}))
