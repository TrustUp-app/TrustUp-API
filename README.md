<img width="4554" height="1139" alt="TrustUp-Banner" src="https://github.com/user-attachments/assets/ee412e56-c481-49d6-879f-bde52f2b178a" />

<div align="center">



![Stellar](https://img.shields.io/badge/Stellar-7D00FF?style=for-the-badge&logo=stellar&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)

[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-green?style=flat-square)](https://opensource.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green?style=flat-square&logo=node.js)](https://nodejs.org/)

**Off-chain orchestration layer for Buy Now Pay Later (BNPL) flows on Stellar Network**

[Features](#-features) • [Tech Stack](#-tech-stack) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📖 About

TrustUp API is a production-ready backend service that orchestrates BNPL (Buy Now Pay Later) transactions on the Stellar blockchain. Built with NestJS and Fastify, it provides a fast, scalable off-chain layer that enhances user experience while maintaining blockchain decentralization.

### Key Features

- 🔐 **Wallet-based Authentication** - Secure signature-based auth with JWT
- 💰 **BNPL Loan Management** - Create, track, and repay loans on-chain
- ⭐ **Reputation System** - On-chain reputation scoring with fast cache
- 🏪 **Merchant Integration** - Merchant registry and loan quotes
- 💧 **Liquidity Pool** - Investor deposits and withdrawals
- 📊 **Real-time Indexing** - Background jobs sync blockchain events
- 🔔 **Notifications** - Loan reminders and status updates
- 🚀 **Production Ready** - Comprehensive testing, logging, and monitoring

## 🛠 Tech Stack

**N20 · TS5 · NJS10/FST4 · SSDK11/SRPC · SBP15 · RDS7 · BMQ5 · ZOD3 · JWT10 · PIN8 · SNT8**

### Core Technologies

| Category | Technology | Version |
|----------|-----------|---------|
| **Runtime** | Node.js | 20 LTS |
| **Language** | TypeScript | 5.4 |
| **Framework** | NestJS | 10.3 |
| **HTTP Server** | Fastify | 4.28 |
| **Blockchain** | Stellar SDK | 11.2 |
| **Database** | Supabase (Postgres) | 15 |
| **Cache/Jobs** | Redis | 7 |
| **Queue** | BullMQ | 5.12 |
| **Validation** | Zod | 3.23 |
| **Auth** | JWT | 10.2 |
| **Logging** | Pino | 8.21 |
| **Monitoring** | Sentry | 8.14 |

### Blockchain Integration

- 🌟 **Stellar Network** - Mainnet & Testnet support
- 🔷 **Soroban** - Smart contract interactions
- 📡 **Horizon API** - Transaction queries
- 🔗 **Soroban RPC** - Contract state reading

## 📁 Project Structure

```
TrustUp-API/
├── src/
│   ├── main.ts                 # Application bootstrap
│   ├── app.module.ts           # Root module
│   ├── config/                 # Configuration (env, swagger)
│   ├── modules/                # API modules (auth, loans, reputation, etc.)
│   ├── blockchain/             # Stellar/Soroban clients
│   │   ├── stellar/            # Stellar network client
│   │   ├── soroban/            # Soroban RPC client
│   │   └── contracts/          # Contract clients (TypeScript wrappers)
│   ├── database/               # Supabase client and repositories
│   ├── jobs/                   # Background jobs (BullMQ)
│   └── common/                 # Shared utilities (guards, filters, utils)
├── test/
│   ├── unit/                   # Unit tests
│   ├── e2e/                    # End-to-end tests
│   ├── fixtures/               # Test data
│   └── helpers/                # Test helpers
├── docs/                       # Documentation
│   ├── architecture/           # Architecture documentation
│   ├── development/            # Development guides and standards
│   ├── setup/                  # Setup and configuration guides
│   └── api/                    # API reference
├── supabase/
│   └── migrations/             # Database migrations
├── CONTRIBUTING.md             # Contribution guidelines
├── ROADMAP.md                  # Development roadmap
├── SECURITY.md                 # Security policy
└── LICENSE                     # MIT License
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS or higher
- npm or yarn
- Redis (for jobs and cache)
- Supabase account and project

### Installation

```bash
# Clone the repository
git clone https://github.com/TrustUp-app/TrustUp-API.git
cd TrustUp-API

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure your .env file (see Configuration section)
```

### Configuration

1. **Supabase Setup**
   - Create a project at [supabase.com](https://supabase.com)
   - Get your credentials from Settings → API
   - Add to `.env`:
     ```env
     SUPABASE_URL=your_project_url
     SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

2. **Stellar Configuration**
   ```env
   STELLAR_NETWORK=testnet  # or mainnet
   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
   SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   ```

3. **Redis Setup**
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

4. **JWT Secrets**
   ```env
   JWT_SECRET=your_jwt_secret
   JWT_REFRESH_SECRET=your_refresh_secret
   ```

For complete setup instructions, see [Installation Guide](./docs/setup/installation.md) and [Contributing Guide](./CONTRIBUTING.md).

### Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm run start:prod

# The API will be available at http://localhost:4000/api/v1
```

### Database Migrations

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e

# Coverage report
npm run test:cov
```

## 📚 Documentation

Comprehensive documentation is organized into the following categories:

### 🏗 Architecture

- [Architecture Overview](./docs/architecture/overview.md) - System architecture and design principles
- [Blockchain Layer](./docs/architecture/blockchain-layer.md) - Stellar/Soroban integration
- [Database Schema](./docs/architecture/database-schema.md) - PostgreSQL database design

### 🚀 Getting Started

- [Installation Guide](./docs/setup/installation.md) - Step-by-step setup instructions
- [Environment Variables](./docs/setup/environment-variables.md) - Configuration reference
- [Supabase Setup](./docs/setup/supabase-setup.md) - Database setup guide

### 💻 Development

- [Naming Conventions](./docs/development/naming-conventions.md) - Code style and conventions
- [Controllers Structure](./docs/development/controllers-structure.md) - Controller patterns
- [Services Structure](./docs/development/services-structure.md) - Service layer patterns
- [DTO Standards](./docs/development/dto-standards.md) - Data transfer object patterns
- [Response Standards](./docs/development/response-standards.md) - API response formats
- [Error Handling](./docs/development/error-handling.md) - Error handling standards
- [Guards & Filters](./docs/development/guards-filters.md) - Authentication and validation
- [Logging Standards](./docs/development/logging-standards.md) - Logging best practices
- [Testing Structure](./docs/development/testing-structure.md) - Testing guidelines

### 📡 API Reference

- [API Endpoints](./docs/api/endpoints.md) - Complete API documentation
- [Roadmap](./ROADMAP.md) - Development phases and progress

### 🤝 Contributing

- [Contributing Guide](./CONTRIBUTING.md) - How to contribute to the project
- [Security Policy](./SECURITY.md) - Security guidelines and reporting vulnerabilities

### Interactive Documentation

Once the server is running, visit:
- **Swagger UI**: `http://localhost:4000/api/v1/docs`
- **Health Check**: `http://localhost:4000/api/v1/health`

## 🏗 Architecture Principles

- **🔗 On-chain is truth** - Blockchain is the source of truth
- **⚡ Fast UX** - Off-chain indexing for quick queries
- **🔒 Decentralized** - Users sign transactions, API doesn't hold keys
- **🧩 Modular** - Replaceable backend components
- **📊 Observable** - Comprehensive logging and monitoring
- **✅ Tested** - Unit, integration, and E2E tests

## 🔐 Security

- **Wallet Signature Authentication** - No password storage
- **JWT Tokens** - Secure access and refresh tokens
- **Helmet** - Security headers
- **Rate Limiting** - Throttler protection
- **Row Level Security** - Database-level access control
- **Input Validation** - Zod schema validation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for:

- Development setup
- Code style guidelines
- Testing requirements
- Pull request process

Check out the [Roadmap](./ROADMAP.md) to see what we're working on and find areas where you can contribute.

## 🙏 Acknowledgments

- [Stellar Development Foundation](https://www.stellar.org/) - For the amazing blockchain platform
- [NestJS](https://nestjs.com/) - For the excellent framework
- [Supabase](https://supabase.com/) - For the database infrastructure

## 📞 Support

- 📖 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/TrustUp-app/TrustUp-API/issues)
- 💬 [Discussions](https://github.com/TrustUp-app/TrustUp-API/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---
<!-- LEADERBOARD_START -->
## 🏆 Top 3 Contributors

<div align="center">

<table>
<tr>

<td align="center">
  <a href="https://github.com/BrayanMQ">
    <img src="https://avatars.githubusercontent.com/u/49928451?v=4" width="100px;" style="border-radius:50%;" alt="BrayanMQ"/><br />
    <sub><b>🥇 @BrayanMQ</b></sub><br />
    <sub>57 contributions</sub>
  </a>
</td>

<td align="center">
  <a href="https://github.com/actions-user">
    <img src="https://avatars.githubusercontent.com/u/65916846?v=4" width="100px;" style="border-radius:50%;" alt="actions-user"/><br />
    <sub><b>🥈 @actions-user</b></sub><br />
    <sub>48 contributions</sub>
  </a>
</td>

<td align="center">
  <a href="https://github.com/Jopsan-gm">
    <img src="https://avatars.githubusercontent.com/u/228767027?v=4" width="100px;" style="border-radius:50%;" alt="Jopsan-gm"/><br />
    <sub><b>🥉 @Jopsan-gm</b></sub><br />
    <sub>13 contributions</sub>
  </a>
</td>

</tr>
</table>
</div>

<!-- LEADERBOARD_END -->

---
<div align="center">

**Built with ❤️ for the Stellar ecosystem**

[![Stellar](https://img.shields.io/badge/Powered%20by-Stellar-7D00FF?style=flat-square)](https://www.stellar.org/)
[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-green?style=flat-square)](https://opensource.org/)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

</div>
