#!/bin/bash

# Test Vercel Preview E2E Script
#
# This script helps run E2E tests against a Vercel preview deployment.
# It handles getting the preview URL from the PR and setting up environment variables.
#
# Usage:
#   ./scripts/test-vercel-preview.sh [PR_NUMBER] [--debug]
#
# Examples:
#   ./scripts/test-vercel-preview.sh 37           # Run tests for PR #37
#   ./scripts/test-vercel-preview.sh 37 --debug   # Run with debugger
#   ./scripts/test-vercel-preview.sh              # Use current branch's PR
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - VERCEL_AUTOMATION_BYPASS_SECRET environment variable or GitHub secret

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
PR_NUMBER="${1:-}"
DEBUG_MODE="${2:-}"

# Function to get PR number from current branch
get_pr_number() {
  if [ -n "$PR_NUMBER" ]; then
    echo "$PR_NUMBER"
    return
  fi

  # Try to get PR for current branch
  BRANCH=$(git branch --show-current)
  echo -e "${YELLOW}No PR number provided, detecting from branch: $BRANCH${NC}" >&2

  PR=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")

  if [ -z "$PR" ]; then
    echo -e "${RED}Error: Could not find PR for current branch${NC}" >&2
    echo -e "${YELLOW}Usage: $0 [PR_NUMBER] [--debug]${NC}" >&2
    exit 1
  fi

  echo "$PR"
}

# Function to get Vercel preview URL from PR
get_preview_url() {
  local pr_number=$1

  echo -e "${YELLOW}Fetching Vercel preview URL for PR #$pr_number...${NC}" >&2

  # Get PR comments
  PREVIEW_URL=$(gh pr view "$pr_number" --json comments --jq '.comments[].body' | \
    grep -oP 'https://parcland-git-[^"]+\.vercel\.app' | \
    head -1)

  if [ -z "$PREVIEW_URL" ]; then
    echo -e "${RED}Error: Could not find Vercel preview URL in PR comments${NC}" >&2
    echo -e "${YELLOW}Make sure the Vercel deployment has completed and commented on the PR${NC}" >&2
    exit 1
  fi

  echo "$PREVIEW_URL"
}

# Function to get bypass secret
get_bypass_secret() {
  if [ -n "$VERCEL_AUTOMATION_BYPASS_SECRET" ]; then
    echo "$VERCEL_AUTOMATION_BYPASS_SECRET"
    return
  fi

  # Try to get from GitHub secrets (requires appropriate permissions)
  SECRET=$(gh secret list 2>/dev/null | grep VERCEL_AUTOMATION_BYPASS_SECRET | awk '{print $1}' || echo "")

  if [ -z "$SECRET" ]; then
    echo -e "${RED}Error: VERCEL_AUTOMATION_BYPASS_SECRET not found${NC}" >&2
    echo -e "${YELLOW}Set it as an environment variable:${NC}" >&2
    echo -e "  export VERCEL_AUTOMATION_BYPASS_SECRET=your_secret_here" >&2
    exit 1
  fi

  echo "$SECRET"
}

# Main script
echo -e "${GREEN}=== Vercel Preview E2E Test Runner ===${NC}"
echo ""

# Get PR number
PR=$(get_pr_number)
echo -e "${GREEN}✓ Testing PR #$PR${NC}"

# Get preview URL
URL=$(get_preview_url "$PR")
echo -e "${GREEN}✓ Preview URL: $URL${NC}"

# Get bypass secret
if [ -n "$VERCEL_AUTOMATION_BYPASS_SECRET" ]; then
  echo -e "${GREEN}✓ Using VERCEL_AUTOMATION_BYPASS_SECRET from environment${NC}"
else
  echo -e "${YELLOW}⚠ VERCEL_AUTOMATION_BYPASS_SECRET not set in environment${NC}"
  echo -e "${YELLOW}  Tests may fail if Vercel deployment protection is enabled${NC}"
fi

echo ""
echo -e "${GREEN}Running E2E tests...${NC}"
echo ""

# Export environment variables
export VERCEL_PREVIEW_URL="$URL"

# Run tests
if [ "$DEBUG_MODE" == "--debug" ]; then
  echo -e "${YELLOW}Running in debug mode (headed browser with debugger)${NC}"
  npm run test:e2e:vercel:debug
else
  npm run test:e2e:vercel
fi

echo ""
echo -e "${GREEN}=== Tests Complete ===${NC}"
echo -e "${YELLOW}To view the test report, run:${NC}"
echo -e "  npx playwright show-report"
