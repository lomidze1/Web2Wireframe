---
name: new-feature
description: Add a new feature with proper planning and implementation
---

# New Feature Skill

ახალი ფიჩერის დამატება სრული workflow-ით.

## Workflow

### Phase 1: Interview (REQUIRED)

**სანამ კოდს დაწერ**, გამოიყენე `AskUserQuestion` tool რომ დააზუსტო:

1. **Scope**: რა სერვის(ებ)ში უნდა დაემატოს?
2. **Requirements**: რა არის მინიმალური მოთხოვნები?
3. **Edge Cases**: რა შეიძლება არასწორად წავიდეს?
4. **Integration**: External services? Database changes?
5. **Verification**: როგორ დავტესტოთ?

### Phase 2: Plan

შექმენი implementation plan:

```markdown
## Feature: [Name]

### Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Files to Create/Modify
- `path/to/file1.ts` - Description
- `path/to/file2.tsx` - Description

### Implementation Steps
1. Step 1
2. Step 2

### Testing Strategy
- Unit tests for...
- Integration test for...
```

### Phase 3: Implement

1. Create/modify files following existing patterns
2. Run type-check after each significant change
3. Keep changes minimal and focused

### Phase 4: Verify

```bash
npm run type-check
npm run lint
# Manual testing if UI changes
```

### Phase 5: Commit

```bash
git add [specific-files]
git commit -m "feat: [feature name]

- Detail 1
- Detail 2

Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Anti-Patterns to Avoid

❌ Don't jump to coding without understanding requirements
❌ Don't add features beyond what was asked
❌ Don't add unnecessary abstractions
❌ Don't refactor unrelated code
❌ Don't add comments for self-evident code
