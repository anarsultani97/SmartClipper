# SmartClipper web UI

React/TypeScript and Vite. Run npm run dev from the repository root. See [local setup](../../docs/development/local-development.md).

Features: guided/library/studio review directions, MP4 upload with progress/cancel, persisted project list/search, preparation status/retry, video preview, timeline selection/save, MP3 download.

API requests use a Vite /api proxy to the localhost FastAPI service. Server types are generated into src/generated/api.d.ts. Inter font assets are packaged locally; icons use lucide-react. CSS tokens and responsive layouts support small screens and reduced motion.

Unit tests: npm test. Browser journeys: npm run test:e2e. Build/type check: npm run build. Design review: /?review.

No AI suggestions or rendered shorts are simulated as working features.
