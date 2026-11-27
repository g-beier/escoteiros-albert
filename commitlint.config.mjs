// Conventional Commits, checked by the commit-msg hook (.husky) and by CI on PR titles
// (squash merge: the PR title becomes the commit on main). See CONTRIBUTING.md.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // optional scope; when present, one of the areas of the monorepo
    "scope-enum": [2, "always", ["gestao", "financeiro", "inventario", "ui", "institucional", "db", "e2e", "deps"]],
  },
};
