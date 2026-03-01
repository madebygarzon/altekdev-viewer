# ALTEKDev Viewer — SKU & Quotations Explorer

Full-stack web tool for querying SKUs and quotation history from PostgreSQL, with both API endpoints and a lightweight React interface.

## Why this project stands out
- Practical internal-tool product with clear operational utility.
- Strong backend data handling with validation and schema controls.
- Clean API + UI combination for real business users.

## Tech Stack
- **Backend:** Node.js, Express, TypeScript, `pg`, Zod
- **Frontend:** React 18 + Bootstrap
- **Database:** PostgreSQL
- **Deployment:** Docker Compose

## Core Features
- Paginated SKU search
- SKU detail view
- Quotation list + filters
- Quotation detail with line items
- Order intake endpoint (`POST /api/orders`)
- Multi-schema support via environment configuration

## Run Locally
```bash
npm install
npm run dev
```

## Docker
```bash
docker compose up --build
```

## Environment Variables
- `DATABASE_URL` (required)
- `ALLOWED_ORIGIN`
- `ALLOWED_SCHEMAS`
- `PORT`

## Business Impact
Improves access to commercial/operational data for quoting and decision-making, with lower lookup friction for teams.

## Author
**Carlos Garzón**
