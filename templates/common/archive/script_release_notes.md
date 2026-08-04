# Release Notes

*Scratchpad and archive for GitHub Releases. Copy the Release Title and Release Notes block directly into the GitHub Releases form.*

---

## How to cut a release zip

`git archive` builds a zip straight from a git ref, and its `--prefix` flag controls the folder name baked into the archive — this is how to get a `{{NAME}}/` root folder instead of the `{{NAME}}-main/` GitHub's own "Download ZIP" button produces (which is why the README's install instructions currently have to tell users to manually rename it).

```
git archive --format=zip --prefix={{NAME}}/ -o {{NAME}}-v1.0.0.0.zip HEAD
```

- Swap `HEAD` for a tag (e.g. `v1.0.1.0`) once tags are actually being created, so the zip always matches the tagged release rather than whatever's currently checked out.
- Bump the output filename's version to match each release.
- Note: this only works once the v1.1.0.0 tag actually exists (git tag v1.1.0.0 on the commit you want, then git push origin v1.1.0.0 if you want it on GitHub too) — running it against a tag that doesn't exist yet fails with something like fatal: v1.1.0.0 is not a valid tree.

```
git archive --format=zip --prefix={{NAME}}/ -o {{NAME}}-v1.1.0.0.zip v1.1.0.0
```

When publishing to GitHub Releases, upload the resulting zip as a release asset and add a line to the release body naming it, e.g.: *"📦 Download the current release (`{{NAME}}-v{version}.zip`) from the **Assets** section below."*

## GiTHub Repo Link Syntax

Markdown link syntax is [link text](path#anchor). GitHub auto-generates anchors from headings by lowercasing the text, replacing spaces with hyphens, and stripping punctuation.

For your README's ## Installation heading, the anchor is #installation:

Same repo, another file (e.g. from this Release Notes file): [Installation Instructions](README.md#installation)
Full GitHub URL (e.g. to paste into a GitHub Release description): [Installation Instructions](https://github.com/edjohnson100/{{NAME}}#installation)
If you want to link to a more specific subsection instead, the slug follows the same rule:

### Manual Installation Options → #manual-installation-options
#### Option 1: Install in the Default Fusion Directory → #option-1-install-in-the-default-fusion-directory (the colon gets dropped)

# Release Note Archive Starts Here

---

## v1.0.0.0 -- Unreleased
- Initial scaffold from the Fusion_Scripts template.
