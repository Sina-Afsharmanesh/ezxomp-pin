import { homedir } from 'os'
import { join } from 'path'

// W7 state isolation: the web app's state root is OMP-scoped via
// GSD_WEB_STATE_DIR (set by the launcher); the legacy GSD_HOME/~/.gsd root is
// only a fallback for direct upstream-style runs.
export const appRoot =
	process.env.GSD_WEB_STATE_DIR || (process.env.OMP_HOME ? join(process.env.OMP_HOME, 'gsd-web') : join(homedir(), '.omp', 'gsd-web')) || join(homedir(), '.gsd')
export const agentDir = join(appRoot, 'agent')
export const sessionsDir = join(appRoot, 'sessions')
export const authFilePath = join(agentDir, 'auth.json')
export const webPidFilePath = join(appRoot, 'web-server.pid')
export const webPreferencesPath = join(appRoot, 'web-preferences.json')
