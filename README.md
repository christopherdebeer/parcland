# 🌲 parc.land

[![Run Tests](https://github.com/christopherdebeer/parcland/actions/workflows/tests.yml/badge.svg)](https://github.com/christopherdebeer/parcland/actions/workflows/tests.yml)
[![Deploy to Pages](https://github.com/christopherdebeer/parcland/actions/workflows/deploy.yml/badge.svg)](https://github.com/christopherdebeer/parcland/actions/workflows/deploy.yml)

Interactive canvas-based diagramming application.

Created with **websim.ai** and exported from https://websim.ai/@c15r/parc-land/144 using backend in **val.town** https://www.val.town/v/c15r/parcland_backpack and https://www.val.town/v/c15r/replicate_base

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage
```

Test coverage reports are automatically generated in the `coverage/` directory.

### Available Scripts

- `npm run dev` - Start development server with Vite
- `npm test` - Run Jest test suite
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Lint source code with ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## CI/CD

- **Tests** run automatically on all pull requests and pushes to main
- **Deployment** to GitHub Pages happens automatically on push to main (after tests pass)
- Failed tests will block deployment to production
