# DESIGN_CONSTRAINTS.md

## Purpose
This file defines architectural and implementation constraints that **all Pull Requests must follow**. The AI Code Review workflow will inject these rules into the review process.

## Design Constraints

### 1. Code Quality
- No placeholder implementations (e.g., `// TODO: implement later`)
- No dead code or commented-out blocks
- All new functions must have JSDoc comments
- Use TypeScript strict mode when applicable

### 2. Security
- No hardcoded secrets, API keys, or credentials
- All user input must be validated
- Use parameterized queries for database operations
- No eval() or Function() constructors with user input

### 3. Testing
- New logic must include unit tests
- Integration tests required for API endpoints
- Test coverage should not decrease

### 4. Documentation
- README.md must be updated if public API changes
- Breaking changes must be documented in CHANGELOG.md
- Complex algorithms must include inline comments

### 5. Dependencies
- No direct dependencies on deprecated packages
- New dependencies must be justified in PR description
- Lock file must be updated

### 6. Architecture
- Follow existing patterns in the codebase
- No circular dependencies between modules
- Database migrations must be reversible

### 7. Performance
- No O(n²) or worse algorithms without justification
- Large lists must use pagination
- Database queries must be optimized (use EXPLAIN)

## Review Process
If any constraint is violated:
- **CRITICAL severity**: Block merge (REQUEST_CHANGES)
- **WARNING severity**: Allow merge with comments (APPROVE with warnings)
