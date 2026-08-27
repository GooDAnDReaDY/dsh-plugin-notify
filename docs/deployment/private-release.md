# Private package release

The source of truth is the canonical Gitea repository. A release is created
from merged `main`, tagged with the next patch version, published to GitHub
Packages, mirrored to the private GitHub repository, and then installed by
exact version in the DSH web profile. The release workflow records the
artifact, health checks, and cleanup in the linked Gitea issue.

Production must never refer to a DEV path, worktree, or local package artifact.
