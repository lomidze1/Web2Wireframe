---
name: code-review
description: Review code for quality, security, and consistency
disable-model-invocation: true
---

# Code Review Skill

კოდის რევიუ Web2Wireframe პროექტისთვის.

## Usage

```
/code-review [file-or-folder]
/code-review src/components/Header.tsx
/code-review Website_Backend/src/routes/
```

## Review Checklist

### Security
- [ ] No hardcoded secrets or API keys
- [ ] Input validation with Zod (backends)
- [ ] SQL/NoSQL injection protection
- [ ] XSS prevention
- [ ] CORS properly configured
- [ ] Rate limiting on public endpoints

### TypeScript/JavaScript
- [ ] Proper typing (no `any` unless justified)
- [ ] Error handling with try-catch
- [ ] Async/await patterns
- [ ] No memory leaks (cleanup in useEffect)

### React (Frontend)
- [ ] SCSS modules for styling
- [ ] Semantic HTML
- [ ] Accessibility (aria labels, keyboard nav)
- [ ] Responsive design

### Express (Backend)
- [ ] Middleware order correct
- [ ] Proper HTTP status codes
- [ ] Consistent error response format
- [ ] Logging for debugging

### MongoDB/Mongoose
- [ ] Indexes on frequently queried fields
- [ ] Schema validation
- [ ] Connection error handling

## Output Format

```markdown
## Code Review: [filename]

### ✅ Good
- Point 1
- Point 2

### ⚠️ Suggestions
- Suggestion 1 (line X)
- Suggestion 2 (line Y)

### 🚨 Issues
- Critical issue (line Z)
```
