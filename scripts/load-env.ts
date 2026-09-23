/**
 * Скрипты запускаются вне Next, поэтому .env читаем сами. Провайдер смотрит
 * в process.env только в момент вызова, так что порядок импортов роли не играет.
 */

import fs from "node:fs"
import path from "node:path"

export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file)
    if (!fs.existsSync(full)) continue
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^["']|["']$/g, "")
    }
  }
}
