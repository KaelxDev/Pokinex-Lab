# Security automation

This repository uses GitHub Actions and Dependabot to continuously review application dependencies and source code.

- Dependency Review checks pull requests for newly introduced vulnerable dependencies.
- `npm audit` checks production frontend dependencies for high-severity vulnerabilities.
- `pip-audit` checks Python runtime and development dependencies for known vulnerabilities.
- CodeQL analyzes the Python backend and JavaScript/TypeScript frontend.
- Dependabot checks pip, npm, and GitHub Actions dependencies weekly.

These checks complement the regular CI pipeline: functional tests validate behavior, while the security workflow validates the dependency and source-code security surface.
