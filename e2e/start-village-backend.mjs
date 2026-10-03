import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, mkdtemp, readdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'

// Run the existing artifact read-only, using the repository's H2 test profile
// settings. Do not build in the backend checkout or connect to a user's DB.
const backendJar = process.env.EDEN_E2E_BACKEND_JAR
if (!backendJar) {
  console.error('Village E2E: set EDEN_E2E_BACKEND_JAR to an existing Backend JAR containing the World API.')
  process.exit(1)
}
const h2Root = resolve(homedir(), '.m2/repository/com/h2database/h2')
const versions = await readdir(h2Root)
const version = versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
const h2Jar = process.env.EDEN_E2E_H2_JAR || resolve(h2Root, version, `h2-${version}.jar`)
await access(backendJar)
await access(h2Jar)
const runDirectory = await mkdtemp(resolve(tmpdir(), 'eden-village-e2e-'))
console.log(`Village E2E: backend-memory-interpretation artifact; isolated H2 and uploads in ${runDirectory}`)

const child = spawn('java', [
  `-Dloader.path=${h2Jar}`,
  '-cp', backendJar,
  'org.springframework.boot.loader.launch.PropertiesLauncher',
  '--server.address=127.0.0.1',
  '--server.port=18080',
  '--spring.profiles.active=test',
  '--spring.datasource.url=jdbc:h2:mem:eden_village_e2e;MODE=PostgreSQL;DB_CLOSE_DELAY=-1',
  '--spring.datasource.driver-class-name=org.h2.Driver',
  '--spring.datasource.username=sa',
  '--spring.datasource.password=',
  '--spring.jpa.hibernate.ddl-auto=create-drop',
  '--spring.flyway.enabled=false',
  '--app.cors.allowed-origins=http://127.0.0.1:5174',
  '--spring.main.banner-mode=off',
  '--logging.level.org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration=ERROR',
], {
  cwd: runDirectory,
  env: {
    ...process.env,
    JWT_SECRET: randomBytes(48).toString('hex'),
    EDEN_PHOTO_STORAGE_ROOT: resolve(runDirectory, 'photos'),
  },
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1) })
