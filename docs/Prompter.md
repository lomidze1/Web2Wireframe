# Prompter.md — Claude-სთვის სწორი პრომპტის წერის გზამკვლევი

წყარო: [Anthropic Prompt Engineering Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)

ეს ფაილი არის reference. გამოიყენე როცა:
- Claude Code-ში agent-ს პრომპტს უწერ
- Anthropic API-ით app-ს აშენებ
- ChatGPT/Gemini/სხვა LLM-ისთვის პრომპტს ამზადებ
- კოლეგას უხსნი როგორ ესაუბროს AI-ს

---

## 1. Core Principles (აუცილებელი 5)

| # | წესი | მოკლე ახსნა |
|---|------|--------------|
| 1 | **Be clear & direct** | LLM არ კითხულობს გონებას. დაწერე ისე, თითქოს ახალ თანამშრომელს უხსნი. |
| 2 | **Provide context** | რატომ აკეთებ ამას? ვინ წაიკითხავს output-ს? რა constraint-ები გაქვს? |
| 3 | **Use examples (multishot)** | 3-5 მაგალითი > 1000 სიტყვა instruction. |
| 4 | **Structure with XML tags** | `<task>`, `<context>`, `<example>` — Claude trained-ია XML-ზე. |
| 5 | **Let Claude think** | რთული tasks-ისთვის სთხოვე "think step by step" ან `<thinking>` tag. |

---

## 2. XML Tag-ები (Claude-ის სასურველი ფორმატი)

Claude **სპეციალურად დატრენილია** XML tag-ებზე. ეს **არ არის** stylistic preference — ეს არის parsing reliability boost.

### სტანდარტული tag-ები

```xml
<task>
რა უნდა გააკეთო — ერთი წინადადება.
</task>

<context>
Background information. რატომ. ვინ არის audience.
</context>

<input>
ფაქტობრივი data რომელზეც უნდა იმუშავოს.
</input>

<example>
<input>...</input>
<output>...</output>
</example>

<constraints>
- Limit 1
- Limit 2
</constraints>

<output_format>
JSON / Markdown / plain text / specific schema
</output_format>

<thinking>
(Claude-ის reasoning area — სთხოვე ჩაწეროს აქ)
</thinking>
```

### რეალური მაგალითი

```xml
<task>
შეაჯამე ეს PR description Slack-სთვის (max 3 bullet points).
</task>

<context>
Audience: ჩვენი backend ინჟინრები. PR ცვლის DB schema-ს.
Tone: ტექნიკური, მაგრამ მოკლე. ემოჯი არ გვინდა.
</context>

<input>
{PR_DESCRIPTION_HERE}
</input>

<output_format>
Slack-flavored markdown, 3 bullet points, თითო max 15 სიტყვა.
</output_format>
```

### რატომ XML, არა JSON/YAML

- JSON-ში escaping აჩხუბრებს quote-ებს long text-ში
- YAML indentation-sensitive — error-prone
- XML — visually obvious boundaries, no escape hell

---

## 3. ფუნდამენტური ტექნიკები

### 3.1 Clarity Test

**ცუდი:** "გააუმჯობესე ეს კოდი"
**კარგი:** "გადააწერე ეს ფუნქცია TypeScript strict mode-ში. `any` დაუშვებელია. error handling გადააქციე Result<T,E> pattern-ად. function name შეინარჩუნე."

**Test:** წაიკითხე პრომპტი ხმამაღლა. თუ ერთი ინტერპრეტაცია ვერ ამოიცანი — გაარჩიე.

### 3.2 Multishot Prompting (Examples)

**არასწორი:**
> Extract dates from text.

**სწორი:**
```xml
<task>Extract dates and return ISO format.</task>

<example>
<input>"Meeting on March 5th at 3pm"</input>
<output>2026-03-05</output>
</example>

<example>
<input>"Next Tuesday"</input>
<output>UNRESOLVED (relative date)</output>
</example>

<example>
<input>"05/03/2026"</input>
<output>2026-03-05 (assumed DD/MM)</output>
</example>

<input>{ACTUAL_TEXT}</input>
```

**Rule of thumb:** 3-5 დივერსიული მაგალითი. Edge case-ები აუცილებლად ჩართე.

### 3.3 Chain of Thought (CoT)

რთული task-ისთვის სთხოვე ფიქრი step-by-step:

```xml
<task>
გადაწყვიტე უნდა გამოვუშვათ თუ არა PR production-ში.
</task>

<instructions>
1. ჯერ ჩაწერე <thinking> tag-ში:
   - რას ცვლის PR?
   - რა რისკი არსებობს?
   - უკან როგორ გავაბრუნებთ?
2. შემდეგ <answer> tag-ში: GO / NO-GO + ერთი წინადადება.
</instructions>
```

CoT ხელს უწყობს **complex reasoning, math, code review, decision-making**-ში.
**ნუ გამოიყენებ** simple lookup/extraction tasks-ში — overhead-ია.

### 3.4 Role Assignment (System Prompt)

```xml
<role>
You are a senior security engineer reviewing code for OWASP Top 10 issues.
Focus on: injection, broken auth, sensitive data exposure.
Ignore: code style, formatting, naming.
</role>
```

Role aligns Claude-ის priorities. გამოიყენე როცა გინდა consistent perspective.

### 3.5 Prefilling Response

Claude API-ში შეგიძლია მისცე response-ის დასაწყისი:

```
User: შენი task...
Assistant: <answer>
```

ეს force-ავს Claude-ს დაიწყოს `<answer>`-ით — useful structured output-ისთვის.

### 3.6 Chain Complex Prompts (Decomposition)

რთული task დაშალე **ცალკე call-ებად**:

```
Call 1: Extract relevant data from document → output structured JSON
Call 2: Analyze that JSON → output recommendations
Call 3: Format recommendations as email
```

ერთი mega-prompt < სამი focused prompt.

### 3.7 Long Context (100K+ tokens)

წესი: **დიდი დოკუმენტი ჯერ, query შემდეგ.**

```xml
<documents>
<document index="1">
<source>file1.md</source>
<content>...50K tokens...</content>
</document>
<document index="2">
<source>file2.md</source>
<content>...30K tokens...</content>
</document>
</documents>

<query>
ახლა, ამ დოკუმენტებზე დაყრდნობით, უპასუხე: ...
</query>
```

რატომ: Claude attention-ი ბოლო ნაწილს უკეთ ფიქსირდება (recency bias). Query bottom-ში დადე.

---

## 4. Templates (კოპირებადი)

### 4.1 Code Generation

```xml
<task>
დაწერე {LANGUAGE} ფუნქცია რომელიც {WHAT_IT_DOES}.
</task>

<requirements>
- Input: {INPUT_TYPE}
- Output: {OUTPUT_TYPE}
- Error handling: {STRATEGY}
- Style: {existing project conventions}
</requirements>

<example_usage>
{CODE EXAMPLE OF HOW IT WILL BE CALLED}
</example_usage>

<constraints>
- No external dependencies
- TypeScript strict mode
- Must pass {EXISTING_TEST_FILE}
</constraints>
```

### 4.2 Code Review

```xml
<role>
Senior {STACK} engineer. Focus on correctness bugs, not style.
</role>

<task>
Review the following diff. Report only high-confidence issues.
</task>

<diff>
{GIT_DIFF}
</diff>

<output_format>
For each issue:
- File:line
- Severity: critical / high / medium
- Issue: one sentence
- Fix: one sentence
</output_format>
```

### 4.3 Refactor

```xml
<task>
Refactor {FILE} to {GOAL}.
</task>

<constraints>
- Behavior MUST stay identical (tests pass)
- Don't touch unrelated files
- Don't add new abstractions unless needed
</constraints>

<current_code>
{CODE}
</current_code>

<verification>
Run: {TEST_COMMAND}
</verification>
```

### 4.4 Debugging

```xml
<task>
Diagnose this error.
</task>

<error>
{STACK_TRACE}
</error>

<context>
- რა ვაკეთებდი როცა მოხდა: {ACTION}
- რა მოლოდინი მქონდა: {EXPECTED}
- რა მოხდა: {ACTUAL}
- რა უკვე ვცადე: {ATTEMPTED_FIXES}
</context>

<relevant_code>
{CODE}
</relevant_code>

<instructions>
1. <thinking>-ში ჩაატარე root cause analysis
2. <hypothesis>-ში დაასახელე ყველაზე სავარაუდო მიზეზი
3. <fix>-ში მომიყვანე exact code change
</instructions>
```

---

## 5. Claude Code-სპეციფიკური წესები (Agent პრომპტებისთვის)

თუ პრომპტს Claude Code agent-ისთვის წერ (Agent tool / sub-agent):

### 5.1 Self-Contained Context

Agent **ვერ ხედავს** მთავარი conversation-ის history-ს. ჩაუთვალე ეს:

❌ "Based on what we discussed, fix the bug"
✅ "Fix the null check missing at `src/auth.ts:42`. The function `validateToken()` crashes when `token === undefined` because line 42 reads `token.split(...)`. Add early return when token is falsy."

### 5.2 File Paths + Line Numbers

ყოველთვის მიუთითე exact location:

❌ "Update the auth middleware"
✅ "Update `packages/api/src/middleware/auth.ts:67-89` — replace HMAC validation block with constant-time comparison using `crypto.timingSafeEqual()`."

### 5.3 Don't Delegate Understanding

ცუდი პრაქტიკაა agent-ს უთხრა "research-ის შემდეგ implement-ი". ეს არის შენი job. Agent-ის task იყოს **დისკრეტული, აღსრულებადი**.

❌ "Investigate the issue and fix it"
✅ "The issue is X (we already confirmed). Apply this specific fix at `file.ts:Y`."

### 5.4 Expected Output Specification

```xml
<deliverable>
Report under 200 words. Format:
- Status: PASS / FAIL / PARTIAL
- Files changed: list
- Tests run: count + result
- Blockers: list (if any)
</deliverable>
```

---

## 6. Antipatterns (რას **ნუ** გააკეთებ)

| Antipattern | რატომ ცუდია | რა გააკეთო |
|-------------|--------------|------------|
| "Improve this code" | Vague — Claude აიღებს რანდომ მიმართულებას | Specify: performance / readability / type safety |
| "Don't do X" (negative only) | LLM-ები პოზიტიური instruction-ით უკეთ მუშაობენ | "Do Y" instead of "Don't do X" |
| 5000-word system prompt | Context dilution, ღირებული tokens | Compress to 500 words, ჩადე example-ები |
| "Be creative" | Unmeasurable | "Generate 5 distinct approaches, then pick best" |
| Mixing many tasks in one prompt | Confusion + low quality on each | Chain prompts (3.6) |
| No examples for structured output | Format drift | 2-3 example outputs **always** |
| "Are you sure?" follow-up | Sycophancy trigger — Claude flip-ავს position-ს | Ask "what's the strongest counterargument?" |

---

## 7. Quick Checklist (პრომპტის გაგზავნამდე)

```
☐ Task ერთი წინადადებით ნათელია?
☐ Context მოცემულია (audience, why, constraints)?
☐ Example მინიმუმ 1 ჩავაბი (structured output-ისთვის)?
☐ XML tag-ებით სტრუქტურირებულია?
☐ Output format სპეციფიცირებულია?
☐ Long content — query ბოლოშია?
☐ Agent-ისთვის — self-contained (file paths + line numbers)?
☐ Antipattern-ი არ ჩავუშვი (vague verbs, negative-only)?
```

---

## 8. რესურსები

- [Anthropic Prompt Engineering Overview](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Use XML Tags](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Chain of Thought](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought)
- [Multishot Prompting](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting)
- [Long Context Tips](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [System Prompts](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
