# Technology Radar

## Adopt (Preferred choices)
- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.x with strict mode
- **Package Manager**: Yarn 4.x
- **HTTP Framework**: Express.js 4.x
- **Database (embedded)**: SQLite via better-sqlite3
- **Cache/PubSub**: Redis 7.x
- **Frontend Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **CSS**: Tailwind CSS
- **State Management**: React Query (@tanstack/react-query) for server state
- **Containerization**: Docker with Docker Compose

## Trial (Acceptable for new projects)
- **ORM**: Drizzle ORM (if SQL abstraction needed)
- **Validation**: Zod 4.x
- **WebSocket**: ws library (native Node.js)
- **Markdown Rendering**: react-markdown

## Assess (Evaluate before using)
- **Full-text search**: SQLite FTS5 extension
- **Task queues**: BullMQ with Redis
- **Monitoring**: OpenTelemetry

## Hold (Avoid for new work)
- **npm**: Use Yarn instead
- **JavaScript**: Use TypeScript instead
- **Webpack**: Use Vite instead
- **REST alternatives**: Stick with REST for now; avoid GraphQL unless justified
- **MongoDB**: Use SQLite or PostgreSQL instead
