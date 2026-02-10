---
name: deploy-check
description: Pre-deployment checklist validation
disable-model-invocation: true
---

# Deploy Check Skill

Deployment-ის წინ გასაშვები ჩეკლისტი.

## Usage

```
/deploy-check
/deploy-check Website_Frontend
/deploy-check --production
```

## Checklist

### 1. Build Verification
```bash
npm run build:all
npm run type-check
npm run lint
```

### 2. Environment Variables
- [ ] All required env vars documented
- [ ] No secrets in codebase
- [ ] Production URLs configured

### 3. Security
- [ ] CORS origins restricted to production domains
- [ ] Rate limiting enabled
- [ ] Session secrets are strong
- [ ] No debug logs in production

### 4. Performance
- [ ] Images optimized
- [ ] Bundle size acceptable
- [ ] Database indexes created

### 5. Service-Specific

#### Website_Frontend
- [ ] Build output clean
- [ ] All routes working
- [ ] Assets loading

#### Website_Backend
- [ ] Health endpoint responding
- [ ] Resend API key valid
- [ ] Session storage configured

#### Plugin_Backend
- [ ] MongoDB connection working
- [ ] Puppeteer dependencies installed
- [ ] vercel.json configured

#### License_Backend
- [ ] Auth tokens configured
- [ ] CORS origins set

#### Browser_Extension
- [ ] Manifest version correct (V3)
- [ ] Permissions minimal and documented
- [ ] Icons in all sizes (16, 48, 128)
- [ ] Build output in dist/
- [ ] No console.logs in production
- [ ] chrome.debugger permissions declared

## Output

```markdown
## Deploy Check Results

### ✅ Passed
- Build successful
- Type check passed
- Lint passed

### ⚠️ Warnings
- Bundle size increased by 15%

### ❌ Failed
- Missing RESEND_API_KEY in production
```
