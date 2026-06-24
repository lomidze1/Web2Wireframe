---
name: fix-issue
description: Fix a GitHub issue with proper workflow
disable-model-invocation: true
---

# Fix Issue Skill

GitHub issue-ის გადაჭრა სტანდარტული workflow-ით.

## Usage

```
/fix-issue 123
/fix-issue #45
```

## Workflow

1. **Analyze Issue**
   ```bash
   gh issue view $ARGUMENTS
   ```
   - წაიკითხე issue-ის აღწერა
   - გაარკვიე scope და მოთხოვნები

2. **Find Related Code**
   - Search codebase for relevant files
   - Understand existing implementation

3. **Plan Fix**
   - Identify root cause
   - List files to modify
   - Consider edge cases

4. **Implement**
   - Make minimal necessary changes
   - Follow existing patterns
   - Add comments only where logic isn't self-evident

5. **Verify**
   ```bash
   npm run type-check
   npm run lint
   npm test
   ```

6. **Commit**
   ```bash
   git add [specific-files]
   git commit -m "fix: [description] (#issue-number)"
   ```

7. **Create PR**
   ```bash
   gh pr create --title "Fix #$ARGUMENTS: [description]" --body "..."
   ```

## Commit Message Format

```
fix: short description (#123)

- Detail 1
- Detail 2

Co-Authored-By: Codex <noreply@anthropic.com>
```
