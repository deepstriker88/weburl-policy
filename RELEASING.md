# Releasing

## First release

The initial npm release is intentionally performed through the API Factory explicit human approval gate

The release must pass:

- behavioral tests
- release-tree validation
- npm package-name availability
- GitHub repository-name availability
- Product CI
- explicit `MERGE_AND_PUBLISH_PUBLIC` approval

## Future releases with npm trusted publishing

After the first npm release exists, configure npm trusted publishing for:

- provider: GitHub Actions
- owner: `deepstriker88`
- repository: `weburl-policy`
- workflow filename: `publish.yml`
- allowed action: direct `npm publish`

Then future releases can use the repository's `Publish to npm` workflow without a long-lived npm token

The workflow uses a GitHub-hosted runner with `id-token: write`, Node 24, tests before publish, and npm's OIDC trusted-publishing path
