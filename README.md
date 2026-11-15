# ResearchOS

ResearchOS is a financial research and market-intelligence monorepo. **TradeScope is the current working research workstation.** The Java API provides legacy research services and optional versioned metric snapshot storage; the Next frontend and Python prototype remain separate applications. This is not yet one fully integrated, multi-user product.

See the [integration strategy and delivery gates](docs/RESEARCHOS_INTEGRATION_STRATEGY.md) for what should be shared now, migrated next and consolidated later. The [TradeScope feature inventory](apps/tradescope/docs/FEATURE_STATUS.md) distinguishes implemented behavior from the remaining roadmap.

## Prerequisites

- **Node.js 22.16+** for TradeScope; no Java, Docker or Python is required for the standalone workstation.
- **Java 21** and **Gradle 8.5** or the supplied Windows wrapper for the optional backend API.
- **Docker Desktop** for the optional local PostgreSQL/pgvector database; Redis is available in Compose but is not a complete worker system.
- **Python 3.10+** for the optional ML prototype.

## Applications and local ports

| Application | Local address | Current role |
|---|---|---|
| `apps/tradescope` | `http://127.0.0.1:8000` | Node research workstation: source adapters, monitoring, metrics, screens, alerts and investigations |
| `apps/api` | `http://127.0.0.1:8080` | Java legacy research API and optional authenticated dated-metric snapshot storage |
| `apps/web` | `http://localhost:3000` | Next.js shell and legacy company page; no TradeScope workspace migration yet |
| `apps/ml` | `http://127.0.0.1:8001` | Optional Python document/query/similarity prototype |
| PostgreSQL | `127.0.0.1:5432` | Local database with pgvector |
| Redis | `127.0.0.1:6379` | Local service declared in Compose; durable scheduling/notification workers remain pending |

Node and Python use different ports. The Java document service reads `researchos.ml.origin`, also configurable through `RESEARCHOS_ML_ORIGIN`; its default is `http://127.0.0.1:8001`.

## Start TradeScope

In Windows PowerShell, from the repository root:

```powershell
cd apps/tradescope
node --version
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm.cmd start
```

Open **http://127.0.0.1:8000**. Configure authorized market-data credentials and the SEC contact declaration locally for sourced data; missing inputs remain unavailable. The Monitor's labeled synthetic replay can open without provider credentials.

If PowerShell cannot find `npm.cmd`, ensure Node is installed and its installation directory is on `PATH`, then reopen the terminal. Downloading another source ZIP does not install Node. A GitHub ZIP has no Git metadata; use a real clone for `git fetch`/`git switch` updates.

When replacing an extracted ZIP, stop the old server and preserve `apps/tradescope/.env` and the entire `.local-data` directory. See [TradeScope setup](apps/tradescope/README.md) and [monitoring/Atlas/storage setup](apps/tradescope/docs/MONITORING_ATLAS_STORAGE.md).

## Other ResearchOS applications

Run services in separate terminals. Each command block starts from the repository root. The optional Java bridge persists research snapshots; cases, screens, alerts and schedules still use local JSON until their repositories migrate.

### 1. Start Infrastructure
Start PostgreSQL for the Java API. Start Redis separately only when a feature actually consumes it.

```bash
docker compose up -d postgres
```

### 2. Backend (API)
The backend is a Spring Boot application on port 8080. Its configured datasource must match the local database. On Windows:

```powershell
cd apps/api
.\gradlew.bat bootRun --args="--server.address=127.0.0.1"
```

On Linux/macOS with Gradle available, use `gradle bootRun --args='--server.address=127.0.0.1'` from `apps/api`. The optional `/api/research/v1` bridge requires a matching private `RESEARCH_API_TOKEN` in the Java process and Node server environment. Spring does not automatically read TradeScope's `.env`. Follow the [bridge setup guide](apps/tradescope/docs/MONITORING_ATLAS_STORAGE.md); the service token is not end-user authentication and does not protect unrelated legacy endpoints.

### 3. Frontend (Web)
The frontend is a Next.js application on port 3000. Its current company route uses the legacy Java DTOs, whose metric units differ from TradeScope's dated observations. The [integration strategy](docs/RESEARCHOS_INTEGRATION_STRATEGY.md) defines the compatibility gate before migration.

```bash
cd apps/web
# Install dependencies (first time only)
npm ci
# Run development server
npm run dev
```

### 4. Machine Learning (ML)
The optional Python prototype runs on **port 8001**, allowing it to coexist with TradeScope. Set `RESEARCHOS_ML_ORIGIN` in the Java process if it runs at another origin.

```bash
cd apps/ml
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

The current Python implementation uses random embeddings, a fixed natural-language screen response and hardcoded similarity examples. These are prototype behaviors, not validated prediction or production evidence retrieval. The Java document upload pipeline is also separate from TradeScope's cited SEC filing reader.

## Project Structure

- `apps/tradescope`: Working local market-intelligence workstation and source adapters.
- `apps/api`: Spring Boot legacy services and versioned research snapshot API.
- `apps/web`: Next.js shell and legacy company frontend.
- `apps/ml`: Python document/query/similarity prototype.
- `docker-compose.yml`: Local PostgreSQL/pgvector and Redis configuration.
- `docs/RESEARCHOS_INTEGRATION_STRATEGY.md`: Shared-domain ownership, migration milestones and completion gates.

## Verification

Run `npm.cmd test` and `npm.cmd run build:static` from `apps/tradescope` on Windows (`npm` on other platforms). The static build packages allowlisted browser assets only; it does not run APIs, schedules or database synchronization. Run the Java Gradle tests from `apps/api`; database integration checks require an explicitly configured disposable test database.

Release evidence and provider limits are recorded in the [feature inventory](apps/tradescope/docs/FEATURE_STATUS.md), [requirements mapping](apps/tradescope/docs/NEXT_RESEARCH_INTELLIGENCE.md) and [v0.9 verification](apps/tradescope/docs/V09_VERIFICATION.md). Keep real keys, service tokens and private local stores out of Git, screenshots and shared archives. The local setup is not a public authenticated deployment or a validated forecasting product.
