import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
export function installedBrowser() {
  return [process.env.SENKIRO_CHROMIUM,chromium.executablePath(),
    process.env.ProgramFiles+'/Google/Chrome/Application/chrome.exe',
    process.env['ProgramFiles(x86)']+'/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&existsSync(p))
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&!installedBrowser()){
  const cli=fileURLToPath(new URL('../node_modules/playwright/cli.js',import.meta.url))
  process.exit(spawnSync(process.execPath,[cli,'install','chromium'],{stdio:'inherit'}).status??1)
}
