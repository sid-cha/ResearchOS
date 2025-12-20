# ResearchOS

A Financial Research & Market Intelligence Operating System.

## Prerequisites

- **Docker Desktop** (for Database and Redis)
- **Java 21+** (for Backend API)
- **Node.js 18+** (for Frontend Web App)
- **Python 3.10+** (for ML Services)

## Quick Start

### 1. Start Infrastructure
Run the database and caching services using Docker.

```bash
docker compose up -d
```

### 2. Backend (API)
The backend is a Spring Boot application running on port 8080.

```bash
cd apps/api
# Run with Gradle
# Note: If global gradle is not found, use your local installation path
gradle bootRun
```

### 3. Frontend (Web)
The frontend is a Next.js application running on port 3000.

```bash
cd apps/web
# Install dependencies (first time only)
npm install
# Run development server
npm run dev
```

### 4. Machine Learning (ML)
Python services for embeddings and analysis running on port 8000.

```bash
cd apps/ml
pip install -r requirements.txt
uvicorn main:app --reload
```

## Project Structure

- `apps/api`: Spring Boot Backend
- `apps/web`: Next.js Frontend
- `apps/ml`: Python ML Services
- `docker-compose.yml`: Infrastructure configuration