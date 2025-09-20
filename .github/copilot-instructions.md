# Copilot Instructions for Daily CodeArts

## Code Generation Requirements

When generating code for this project, follow these strict guidelines:

1. **绝对不要生成示例代码** - Never generate example code or usage examples
2. **不要生成说明文档** - Do not generate documentation or explanation comments
3. **除非明确说明，不要生成测试用例** - Do not generate test cases unless explicitly requested

Focus solely on production code implementation without examples, documentation, or tests unless specifically requested.

## Architecture Overview

This is a **Huawei Cloud CodeArts API client** built with TypeScript/Node.js. The codebase evolved from a generic API client to a specialized Huawei Cloud integration with IAM token authentication.

### Key Architectural Patterns

**Automatic Token Management**:

- Tokens cached in memory with 5-minute expiry buffer
- Automatic refresh on 401 responses via response interceptors
- Headers auto-injected: `X-Auth-Token` and `X-Project-Id`

## Development Workflows

### Environment Setup

```bash
cp .env.example .env  # Configure Huawei Cloud credentials
npm run dev          # Uses ts-node, no build step needed
```

### Code Quality Pipeline

```bash
npm run check   # format:check + lint + build (pre-commit validation)
npm run fix     # format + lint:fix (auto-fixes)
```

## Key Files for AI Context

- **`src/services/api.service.ts`**: Complete token lifecycle and API calling patterns
- **`src/types/index.ts`**: Huawei Cloud API contract definitions
- **`.env.example`**: All supported configuration options
