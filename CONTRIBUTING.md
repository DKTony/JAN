# Contributing to JAN

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/DKTony/JAN.git
   cd JAN
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your GEMINI_API_KEY
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Branch Strategy

- **`main`** - Production branch (protected)
- **`develop`** - Integration branch for features
- **`feature/*`** - Feature branches

## Pull Request Process

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug in component"
   git commit -m "docs: update README"
   ```

3. Push and create a Pull Request:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Ensure CI checks pass (lint, type-check, build)

5. Request review from maintainers

## CI/CD Pipeline

The CI pipeline runs on every push and PR to `main`:

| Job | Description |
|-----|-------------|
| **Lint** | TypeScript type checking (`tsc --noEmit`) |
| **Build** | Production build (`npm run build`) |
| **Security** | npm audit for vulnerabilities |

## Code Style

- TypeScript strict mode
- No `any` types (use proper typing)
- Follow existing patterns in the codebase
- Keep components focused and single-responsibility

## Testing

Currently, the project doesn't have a test suite. Contributions to add testing are welcome!

Suggested testing stack:
- Vitest for unit tests
- Playwright for E2E tests
