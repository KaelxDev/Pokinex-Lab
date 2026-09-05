# Security automation

This repository uses GitHub Actions and Dependabot to continuously review application dependencies and source code.

Planned security gates:

- dependency review on pull requests;
- npm audit for frontend dependencies;
- pip-audit for Python dependencies;
- CodeQL analysis for JavaScript/TypeScript and Python;
- weekly Dependabot updates for pip, npm, and GitHub Actions.
