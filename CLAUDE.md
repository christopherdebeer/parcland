# Claude Development Guide

This document contains guidelines and workflows for Claude to follow when working on this repository.

## Vercel Preview Iteration Loop

This workflow enables quick iteration and validation of changes using Vercel preview deployments and Playwright automation.

### Prerequisites

- Vercel automatic deployment configured on branch push
- Playwright MCP tools available
- `VERCEL_AUTOMATION_BYPASS_SECRET` configured as GitHub repository secret
- Deployment protection bypass configured in `.github/workflows/claude.yml`

### Standard Iteration Workflow

Follow these steps for any change that needs Vercel preview validation:

#### 1. Implement Changes

Make your code changes locally on the feature branch.

#### 2. Commit and Push

```bash
git add <files>
git commit -m "Description of changes

Co-authored-by: <user-name> <user-email>"
git push origin <branch-name>
```

#### 3. Wait for Vercel Deployment

- Check PR comments or Vercel dashboard for deployment status
- Wait for "Ready" status (typically 1-2 minutes)
- Preview URL format: `https://parcland-git-<branch-slug>-<project-slug>.vercel.app`

#### 4. Access Preview with Playwright

Use query parameters to bypass Vercel deployment protection:

```
https://<preview-url>/?x-vercel-protection-bypass=${VERCEL_AUTOMATION_BYPASS_SECRET}&x-vercel-set-bypass-cookie=samesitenone
```

**Important**: The HTTP headers method in MCP config doesn't work reliably. Always append query parameters to the URL.

#### 5. Validate Changes

Perform validation checks appropriate to your changes:

**Visual Validation:**
```javascript
// Take screenshot to verify UI changes
await page.goto(previewUrlWithBypass);
await page.screenshot({ path: 'validation.png' });
```

**Console Validation:**
```javascript
// Check for expected console messages
const messages = await page.evaluate(() => {
  return console.messages.filter(m => m.includes('EXPECTED_PREFIX'));
});
```

**Functional Validation:**
```javascript
// Test interactive features
await page.click('[data-testid="button"]');
await page.waitForSelector('[data-testid="result"]');
```

#### 6. Document Results

Update your GitHub comment with:
- ✅ What works
- ⚠️ Any issues found
- Screenshot evidence if relevant
- Next steps if iteration needed

### Debug Features Available

Current debug features in the application (for reference/validation):

1. **Blue Debug Banner** (`src/index.html:28-37`):
   - Shows "🚀 Vercel Preview - Build: [timestamp]"
   - Located at top of page
   - Adjusts UI positioning

2. **Console Logs** (`src/main.ts:1291-1310`):
   - Prefix: `🚀 [VERCEL-PREVIEW]`
   - Logs: initialization, timestamp, user agent, URL, canvas ready

### Troubleshooting

**401 Authentication Error:**
- Ensure query parameters are appended to URL
- Verify `VERCEL_AUTOMATION_BYPASS_SECRET` is set in GitHub secrets
- Check that deployment protection is enabled in Vercel project settings

**Deployment Not Found:**
- Wait longer (deployments can take 1-3 minutes)
- Check Vercel dashboard for deployment status
- Verify branch was pushed successfully

**Playwright Connection Issues:**
- Ensure Playwright MCP is installed: `npx @playwright/mcp@latest`
- Check that browser is installed: use `mcp__playwright__browser_install`
- Verify network connectivity to Vercel

### Quick Reference Commands

```bash
# Check current branch
git branch --show-current

# View recent commits
git log --oneline -5

# Check Vercel deployment status (via gh cli if available)
gh pr view <pr-number> --json statusCheckRollup

# Test preview URL manually (with secret from environment)
curl "https://<preview-url>/?x-vercel-protection-bypass=${VERCEL_AUTOMATION_BYPASS_SECRET}&x-vercel-set-bypass-cookie=samesitenone"
```

### Best Practices

1. **Always validate before marking complete** - Don't assume deployment succeeded
2. **Screenshot visual changes** - Provides evidence and helps debugging
3. **Check console logs** - Verify expected behavior and catch errors
4. **Document findings** - Update GitHub comment with clear results
5. **Iterate quickly** - Small changes with fast validation cycles
6. **Clean up debug code** - Remove debug features before final PR merge

### Development Commands

```bash
# Install dependencies
npm install

# Run development server locally
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Run tests (if available)
npm test
```

## Repository Structure

```
parcland/
├── src/
│   ├── main.ts          # Main application entry
│   ├── index.html       # HTML template
│   └── ...
├── .github/
│   └── workflows/
│       └── claude.yml   # Claude CI/CD workflow
├── CLAUDE.md           # This file
└── README.md           # Project documentation
```

## Working with Claude

### Creating Issues

When creating issues for Claude to work on:
- Use `@claude` mention to trigger
- Be specific about requirements
- Reference files/functions with `file:line` format
- Include acceptance criteria

### Providing Feedback

Claude updates a single comment throughout the task. To provide feedback:
- Reply to Claude's comment with `@claude` mention
- Reference specific parts of the implementation
- Be clear about what needs to change

### Understanding Limitations

Claude cannot:
- Approve pull requests
- Submit formal GitHub PR reviews
- Modify `.github/workflows/` files (requires manual updates)
- Perform git operations beyond commit/push (no merge, rebase, etc.)

For workarounds, see the [Claude Code Action FAQ](https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md).
