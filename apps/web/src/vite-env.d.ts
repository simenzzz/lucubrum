/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_TIMEOUT_SECONDS?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_EXERCISE_MASTERY_CAP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
