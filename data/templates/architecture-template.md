# System Architecture: {Project Name}

## Document Info
- **Author**: Architect Agent
- **Date**: {date}
- **Status**: Draft | Review | Approved

## 1. System Overview
### Context
{High-level description of what the system does and how it fits into the broader ecosystem}

### Architecture Style
{Monolith | Microservices | Serverless | Event-driven | etc.}

## 2. Component Design

### Component: {Name}
- **Responsibility**: {what it does}
- **Technology**: {language, framework}
- **Interfaces**: {APIs exposed}
- **Dependencies**: {other components it relies on}

## 3. Data Model

### Entity: {Name}
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| {field} | {type} | {constraints} | {description} |

### Relationships
- {Entity A} → {Entity B}: {relationship type and description}

## 4. API Contracts

### {Endpoint}
- **Method**: GET | POST | PUT | DELETE
- **Path**: {/api/resource}
- **Request Body**: {schema}
- **Response**: {schema}
- **Auth**: {requirements}

## 5. Infrastructure & Deployment

### Deployment Topology
{Description of how components are deployed}

### Environment Requirements
- **Runtime**: {Node.js, Python, etc.}
- **Database**: {PostgreSQL, Redis, etc.}
- **External Services**: {APIs, SaaS tools}

## 6. Security Considerations
- **Authentication**: {method}
- **Authorization**: {method}
- **Data Encryption**: {at rest, in transit}
- **Input Validation**: {approach}

## 7. Cross-Cutting Concerns
- **Logging**: {approach}
- **Monitoring**: {tools, metrics}
- **Error Handling**: {strategy}
- **Caching**: {strategy}

## 8. ADR References
- ADR-001: {title} — See `adrs/adr-001-{slug}.md`
