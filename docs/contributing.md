# Contributing Guide

## Prerequisites

- Node.js 20 LTS or higher
- npm or yarn
- Git
- Supabase account and project

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd TrustUp-API
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure the following variables:

```env

# ===========================================
# SUPABASE CONFIGURATION
# ===========================================

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ===========================================
# PORT
# ===========================================

PORT=4000
```

### 4. Supabase Setup

This project uses **Supabase remote instance only**. You must have a Supabase project set up.

1. **Create or access your Supabase project** at [supabase.com](https://supabase.com)

2. **Get your project credentials**:
   - Go to your project → Settings → API
   - Copy the following:
     - **Project URL** → `SUPABASE_URL`
     - **anon public key** → `SUPABASE_ANON_KEY`
     - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

3. **Update your `.env` file** with the credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

4. **Access Supabase Dashboard**: Go to your project dashboard on supabase.com

### 5. Database Migrations

**Note**: Migrations require Supabase CLI. Install it and login:

```bash
npm install -g supabase
supabase login
```

#### Link Your Project

```bash
supabase link --project-ref your-project-ref
```

You can find your project ref in your Supabase project settings.

#### Create a New Migration

```bash
supabase migration new migration_name
```

This creates a new file in `supabase/migrations/` with timestamp format: `YYYYMMDDHHMMSS_migration_name.sql`

#### Apply Migrations to Remote

```bash
supabase db push
```

This applies migrations to your remote Supabase project.

#### Revert a Migration

```bash
supabase migration repair --status reverted migration_name
```

### 6. Redis Setup

If you need Redis for local development:

#### Using Docker

```bash
docker run -d -p 6379:6379 redis:7
```

#### Using Homebrew (macOS)

```bash
brew install redis
brew services start redis
```

### 7. Run the Application

#### Development Mode

```bash
npm run start:dev
```

The API will be available at `http://localhost:4000`

#### Production Build

```bash
npm run build
npm run start:prod
```

## Development Workflow

### Running Tests

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format
```

## Project Structure

See [Architecture Documentation](./architecture.md) for detailed information about the project structure.

## Standards and Conventions

Please review the following documents before contributing:

- [Naming Conventions](./naming-conventions.md)
- [Controllers Structure](./controllers-structure.md)
- [Services Structure](./services-structure.md)
- [Response Standards](./response-standards.md)
- [Error Handling](./error-handling.md)
- [Logging Standards](./logging-standards.md)
- [DTO Standards](./dto-standards.md)
- [Testing Structure](./testing-structure.md)

## Common Issues

### Supabase Connection Error

- Verify credentials in `.env` match your Supabase project settings
- Check that your Supabase project is active
- Ensure you're using the correct project URL and keys
- Verify your project is linked: `supabase link --project-ref your-project-ref`

### Redis Connection Error

- Ensure Redis is running: `redis-cli ping`
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`

### Port Already in Use

- Change `PORT` in `.env` to a different port
- Or kill the process using port 4000

## Getting Help

- Check existing documentation in `docs/`
- Review code examples in the codebase
- Open an issue for questions or problems
