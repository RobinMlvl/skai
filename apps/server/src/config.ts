import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  dataDir: string;
  typesafeApiKey: string | null;
  webDevPort: number;
}

const expandHome = (path: string) => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const port = Number(env.SKAI_PORT ?? 4317);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`Invalid SKAI_PORT: ${env.SKAI_PORT}`);
  return {
    port,
    dataDir: expandHome(env.SKAI_DATA_DIR?.trim() || "~/.skai"),
    typesafeApiKey: env.TYPESAFE_API_KEY?.trim() || null,
    webDevPort: 5173,
  };
}

export const allowedHosts = (config: Config) => [
  `127.0.0.1:${config.port}`,
  `localhost:${config.port}`,
  `127.0.0.1:${config.webDevPort}`,
  `localhost:${config.webDevPort}`,
];
