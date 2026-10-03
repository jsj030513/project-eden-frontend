import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// The legacy default (localhost:8080) may point at a backend without World API.
// Keep real signup/login, API setup and browser requests on the Village artifact.
const frontend = fileURLToPath(new URL('..', import.meta.url))
const playwright = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const child = spawn(process.execPath, [
  playwright,
  'test',
  '--config=e2e/village-live.config.js',
  ...process.argv.slice(2),
], { cwd: frontend, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
