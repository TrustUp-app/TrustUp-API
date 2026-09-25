# TrustUp API Documentation

Welcome to the TrustUp API documentation. This guide provides comprehensive information about the architecture, development standards, API reference, and setup instructions.

## 📚 Documentation Index

### 🏗 Architecture

Learn about the system design, blockchain integration, and database structure.

- **[Architecture Overview](./architecture/overview.md)**
  System architecture, design principles, and high-level component overview

- **[Blockchain Layer](./architecture/blockchain-layer.md)**
  Stellar and Soroban integration, smart contract interactions, transaction handling

- **[Database Schema](./architecture/database-schema.md)**
  PostgreSQL schema, tables, relationships, indexes, and migrations

---

### 🚀 Getting Started

Get up and running with the TrustUp API.

- **[Installation Guide](./setup/installation.md)**
  Step-by-step installation instructions, prerequisites, and initial setup

- **[Environment Variables](./setup/environment-variables.md)**
  Complete reference for all environment configuration options

- **[Supabase Setup](./setup/supabase-setup.md)**
  Database setup, migrations, and Supabase configuration

- **[E2E Testing Guide](./setup/e2e-testing.md)**
  Running the end-to-end suite, prerequisites, isolation rules, and CI opt-in

---

### 💻 Development

Standards and guidelines for contributing to the codebase.

- **[Naming Conventions](./development/naming-conventions.md)**
  Code style, naming patterns, and file organization

- **[Controllers Structure](./development/controllers-structure.md)**
  Controller patterns, routing, and request handling

- **[Services Structure](./development/services-structure.md)**
  Service layer architecture, business logic organization

- **[DTO Standards](./development/dto-standards.md)**
  Data transfer object patterns and validation

- **[Response Standards](./development/response-standards.md)**
  API response formats and consistency guidelines

- **[Error Handling](./development/error-handling.md)**
  Error handling strategies, custom exceptions, and error responses

- **[Guards & Filters](./development/guards-filters.md)**
  Authentication guards, validation, and request filtering

- **[Logging Standards](./development/logging-standards.md)**
  Logging best practices, structured logging, and log levels

- **[Testing Structure](./development/testing-structure.md)**
  Testing guidelines, unit tests, integration tests, and E2E tests

---

### 📡 API Reference

Complete API endpoint documentation.

- **[API Endpoints](./api/endpoints.md)**
  Detailed reference for all API endpoints, request/response formats, and examples

---

### 🗺 Project Planning

Roadmap and contribution information.

- **[Roadmap](../ROADMAP.md)**
  Development phases, issues, and progress tracking

- **[Contributing Guide](../CONTRIBUTING.md)**
  How to contribute, development workflow, and pull request process

- **[Security Policy](../SECURITY.md)**
  Security best practices, vulnerability reporting, and compliance

---

## 🎯 Quick Links

### For New Contributors

1. Read [Installation Guide](./setup/installation.md)
2. Review [Architecture Overview](./architecture/overview.md)
3. Check [Contributing Guide](../CONTRIBUTING.md)
4. Browse [Roadmap](../ROADMAP.md) for open issues

### For API Users

1. See [API Endpoints](./api/endpoints.md)
2. Check [Environment Variables](./setup/environment-variables.md)
3. Review [Error Handling](./development/error-handling.md)

### For Developers

1. Follow [Naming Conventions](./development/naming-conventions.md)
2. Read [Controllers Structure](./development/controllers-structure.md)
3. Review [Testing Structure](./development/testing-structure.md)
4. Understand [Blockchain Layer](./architecture/blockchain-layer.md)

---

## 📖 Documentation Structure

```
docs/
├── README.md                           # This file
├── architecture/                       # Architecture documentation
│   ├── overview.md                     # System architecture
│   ├── blockchain-layer.md             # Stellar/Soroban integration
│   └── database-schema.md              # Database design
├── setup/                              # Setup guides
│   ├── installation.md                 # Installation instructions
│   ├── environment-variables.md        # Configuration reference
│   ├── supabase-setup.md               # Database setup
│   └── e2e-testing.md                  # End-to-end test runbook
├── development/                        # Development standards
│   ├── naming-conventions.md           # Code style
│   ├── controllers-structure.md        # Controller patterns
│   ├── services-structure.md           # Service patterns
│   ├── dto-standards.md                # DTO patterns
│   ├── response-standards.md           # Response formats
│   ├── error-handling.md               # Error handling
│   ├── guards-filters.md               # Auth and validation
│   ├── logging-standards.md            # Logging practices
│   └── testing-structure.md            # Testing guidelines
└── api/                                # API reference
    └── endpoints.md                    # Endpoint documentation
```

---

## 🔍 Finding What You Need

### By Topic

- **Setting up the project?** → [Installation Guide](./setup/installation.md)
- **Understanding the system?** → [Architecture Overview](./architecture/overview.md)
- **Writing code?** → [Development Standards](./development/)
- **Using the API?** → [API Endpoints](./api/endpoints.md)
- **Contributing?** → [Contributing Guide](../CONTRIBUTING.md)
- **Security questions?** → [Security Policy](../SECURITY.md)

### By Role

**Backend Developer**
- [Architecture Overview](./architecture/overview.md)
- [Controllers Structure](./development/controllers-structure.md)
- [Services Structure](./development/services-structure.md)
- [Testing Structure](./development/testing-structure.md)

**Blockchain Developer**
- [Blockchain Layer](./architecture/blockchain-layer.md)
- [Architecture Overview](./architecture/overview.md)

**Frontend/Mobile Developer**
- [API Endpoints](./api/endpoints.md)
- [Error Handling](./development/error-handling.md)
- [Response Standards](./development/response-standards.md)

**DevOps Engineer**
- [Installation Guide](./setup/installation.md)
- [Environment Variables](./setup/environment-variables.md)
- [Database Schema](./architecture/database-schema.md)

**Project Manager**
- [Roadmap](../ROADMAP.md)
- [Architecture Overview](./architecture/overview.md)

---

## 🤝 Contributing to Documentation

Documentation improvements are always welcome! If you find errors, outdated information, or areas that need clarification:

1. Open an issue describing the problem
2. Submit a pull request with fixes
3. Follow the same markdown style as existing docs
4. Keep explanations clear and concise

---

## 📞 Support

If you can't find what you're looking for:

- 🐛 [Open an Issue](https://github.com/TrustUp-app/TrustUp-API/issues)
- 💬 [Join Discussions](https://github.com/TrustUp-app/TrustUp-API/discussions)
- 📧 Contact the team

---

*Last Updated: 2026-02-13*
