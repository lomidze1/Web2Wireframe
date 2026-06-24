---
name: interview-me
description: Gather requirements by interviewing the user before implementation
---

# Interview Me - Requirements Gathering

როდესაც მომხმარებელი ითხოვს ახალი ფუნქციის/ფიჩერის დამატებას, **აუცილებლად** გამოიკითხე AskUserQuestion tool-ით სანამ კოდს დაწერ.

## როდის გამოვიყენოთ

- ახალი ფიჩერის დამატება
- არსებული ფუნქციონალის ცვლილება
- API endpoint-ების დიზაინი
- UI/UX ცვლილებები
- არქიტექტურული გადაწყვეტილებები

## Interview Flow

### 1. Technical Implementation
- რა მიდგომა გვინდა? (მაგ: REST vs GraphQL, SSR vs CSR)
- რომელ სერვისში დაემატება? (Frontend/Backend/Plugin)
- არსებული კოდის პატერნები გამოვიყენოთ?

### 2. Edge Cases
- რა ხდება შეცდომის შემთხვევაში?
- Validation rules?
- Rate limiting?

### 3. Integration
- რა external services გვჭირდება?
- Authentication საჭიროა?
- Database schema ცვლილებები?

### 4. Testing & Verification
- როგორ დავტესტოთ?
- რა არის success criteria?

## Output

Interview-ის შემდეგ შექმენი SPEC.md ან დაამატე პირდაპირ plan-ში:
- მოკლე აღწერა
- Technical approach
- Files to modify
- Edge cases to handle
- Testing strategy

## Example Usage

```
მომხმარებელი: "დაამატე dark mode"

Codex: მოდით დავაზუსტოთ რამდენიმე დეტალი:

1. **Scope**: მხოლოდ Website_Frontend თუ Plugin_Frontend-იც?
2. **Persistence**: localStorage, cookie, თუ user account-ზე?
3. **Default**: system preference თუ light?
4. **Transition**: animation გვინდა toggle-ზე?
```
