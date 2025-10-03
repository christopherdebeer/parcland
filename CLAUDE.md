# Claude AI Assistant Guidelines

This document provides guidelines and workflows for Claude when working with the parcland repository.

## Repository Overview

Parcland is an interactive canvas-based diagramming application built with TypeScript and Vite.

## Development Workflow

### Standard Development Commands

```bash
npm run dev          # Start development server
npm test            # Run Jest test suite
npm run build       # Build for production
npm run lint        # Lint source code
npm run format      # Format code with Prettier
npm run type-check  # Check TypeScript types
```

## Vercel Preview Validation Flow

This repository uses Vercel for automatic preview deployments on branch pushes. The validation flow is configured to work with Vercel's deployment protection bypass mechanism.

### Prerequisites

1. **Environment Variable**: `VERCEL_AUTOMATION_BYPASS_SECRET` must be configured in GitHub Actions secrets
   - This secret is project-specific and generated in Vercel dashboard
   - Used to bypass deployment protection for automated testing

2. **MCP Configuration**: The Playwright MCP server is configured with bypass headers in `.github/workflows/claude.yml`:
   ```json
   {
     "playwright": {
       "command": "npx",
       "args": ["@playwright/mcp@latest"],
       "env": {
         "PLAYWRIGHT_EXTRA_HTTP_HEADERS": "{\"x-vercel-protection-bypass\":\"<SECRET>\",\"x-vercel-set-bypass-cookie\":\"samesitenone\"}"
       }
     }
   }
   ```

### Validation Workflow

When making changes that need Vercel preview validation:

1. **Make Code Changes**
   - Implement the required features or fixes
   - For visibility, consider adding debug features:
     - Console logs with `[VERCEL-PREVIEW]` prefix
     - Visual debug banners (e.g., in src/index.html or src/main.ts)

2. **Commit and Push**
   ```bash
   git add <files>
   git commit -m "descriptive message"
   git push origin <branch-name>
   ```

3. **Create Pull Request**
   - Use the GitHub UI or gh CLI to create a PR
   - Vercel will automatically deploy a preview

4. **Wait for Deployment**
   - Monitor the PR for Vercel deployment status
   - Wait for "Deployment succeeded" status
   - Preview URL format: `https://parcland-git-<branch-slug>-<project-slug>.vercel.app`

5. **Validate with Playwright**
   - Use `mcp__playwright__browser_navigate` to access the preview URL
   - Use `mcp__playwright__browser_snapshot` to capture the page state
   - Use `mcp__playwright__browser_console_messages` to check console logs
   - Verify expected changes are present

6. **Advanced Validation**
   - Use `mcp__playwright__browser_evaluate` to run JavaScript assertions
   - Use `mcp__playwright__browser_take_screenshot` for visual confirmation
   - Test interactive features with click/type/hover tools

### Example Validation Script

```javascript
// After navigating to preview URL:

// 1. Take a snapshot to see the page structure
await browser_snapshot()

// 2. Check console logs for debug messages
const messages = await browser_console_messages()
// Look for [VERCEL-PREVIEW] prefixed messages

// 3. Evaluate custom checks
await browser_evaluate({
  element: "page",
  function: `() => {
    // Check for debug banner
    const banner = document.querySelector('[data-debug-banner]')
    return {
      bannerPresent: !!banner,
      bannerText: banner?.textContent,
      timestamp: new Date().toISOString()
    }
  }`
})

// 4. Take a screenshot for visual confirmation
await browser_take_screenshot({
  filename: "preview-validation.png",
  fullPage: true
})
```

### Troubleshooting

**Authentication Errors (HTTP 401)**
- Verify `VERCEL_AUTOMATION_BYPASS_SECRET` is correctly set in GitHub secrets
- Check that the secret hasn't been regenerated in Vercel (this invalidates the old secret)
- Ensure the MCP configuration includes both headers: `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie`

**Deployment Not Found**
- Wait longer - Vercel deployments can take 1-3 minutes
- Check the PR for deployment status updates
- Verify the branch was pushed successfully

**Cookie Persistence Issues**
- The `x-vercel-set-bypass-cookie: samesitenone` header ensures cookies work across contexts
- Use this setting for iframe or complex navigation scenarios
- For simple testing, `x-vercel-set-bypass-cookie: true` may suffice

## CI/CD Pipeline

- **Tests**: Run automatically on all PRs and pushes to main
- **Deployment**: GitHub Pages deployment happens on push to main (after tests pass)
- **Vercel Previews**: Automatic deployment on all branch pushes
- **Claude Actions**: Triggered by `@claude` mentions in issues/PRs

## Code Style

- **TypeScript**: Strict type checking enabled
- **Formatting**: Prettier with repository config
- **Linting**: ESLint with configured rules
- **Testing**: Jest for unit and integration tests

## Best Practices

1. Always run tests before committing: `npm test`
2. Use TypeScript types - avoid `any` when possible
3. Add tests for new features or bug fixes
4. Keep commits focused and atomic
5. Use descriptive commit messages
6. Document validation steps in PR descriptions
