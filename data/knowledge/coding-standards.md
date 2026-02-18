# Coding Standards

## Language
- TypeScript with `strict: true` for all code
- ES2022+ features are acceptable
- Use `import`/`export` (ESM), not `require`

## Naming Conventions
- **Files**: kebab-case (`user-service.ts`)
- **Classes/Interfaces/Types**: PascalCase (`UserService`, `CreateUserRequest`)
- **Functions/Variables**: camelCase (`getUserById`, `isActive`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Database columns**: snake_case (`created_at`, `user_id`)

## Code Style
- Prefer `const` over `let`; never use `var`
- Use early returns to reduce nesting
- Keep functions under 50 lines when possible
- One export per file for major components; utility files may export multiple items

## Error Handling
- Use typed errors with descriptive messages
- Always handle Promise rejections
- Log errors with context (what operation failed, what input caused it)
- Never swallow errors silently

## Testing
- Write unit tests for business logic
- Write integration tests for API endpoints
- Use descriptive test names: "should return 404 when user not found"
- Test both happy path and error cases

## Security
- Never commit secrets or credentials
- Validate all external input
- Use parameterized queries for database access
- Sanitize output to prevent XSS
