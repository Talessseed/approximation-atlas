# Atlas of Distributed Approximation

A compact academic reference, with a secondary visual explorer, for distributed approximation algorithms and lower bounds. The default ordering is constant rounds, log-star rounds, explicit degree/weight dependence, logarithmic, polylogarithmic, and other trade-offs.

The design draws on [Timothé Picavet’s homepage](https://github.com/Talessseed/talessseed.github.io); the reference structure is inspired by [Florian Schager’s Atlas](https://github.com/florian-schager/atlas). This is a separate implementation, not a fork.

## Open the site

Open `dist/index.html` directly in a browser. All scripts, styles and catalog data are local: no package installation, CDN, account, server, or network is required to use the interface. Paper links need internet access.

Alternatively, with Python 3:

```sh
npm run dev
# http://localhost:8765
```

Or without npm:

```sh
python3 -m http.server 8765 --directory dist
```

## Features

- Search problems, authors, graph classes, guarantees and parameter-dependent bounds.
- Filter by problem, stated graph family, model, randomness, result type and round regime.
- Optional model implications, with opposite directions for upper and lower bounds.
- Source details, assumptions, fixed parameters and preprint labels for every recorded result.
- Compare up to four results without implying that incomparable settings have a ranking.
- Share filters or a result via URL fragments; no backend is involved.
- Export the visible results as CSV or all bibliography records as BibTeX.
- Explore the problem × round-regime matrix and graph-family inclusion chain.
- Download a correction template for a result. No submission or external message is sent.
- Responsive layout, keyboard navigation, native accessible dialogs and reduced-motion support.

## Scope and sources

The initial literature map is [Feuilloley, *Bibliography of distributed approximation beyond bounded degree*, arXiv:2001.08510v4](https://arxiv.org/abs/2001.08510), supplemented by foundational general/bounded-degree work, selected recent arXiv papers, and recent work by Timothé Picavet and its citation trail.

This is a curated catalog, **not an exhaustive survey or an automatically established state of the art**. The bibliography records all 42 sections of Feuilloley’s survey. Some records are supporting exact symmetry-breaking algorithms, earlier versions, or references awaiting full theorem extraction. They are kept in the bibliography without fabricated approximation rows. `research/*-coverage.txt` records remaining gaps and interpretation details.

“Primary source checked” means a recorded claim was located in the paper’s abstract, theorem, or official author/conference abstract; it does not mean the proof was independently verified. Theorem numbers are included only when checked. Publication years refer to the cited version and are not guaranteed to be the earliest announcement.

For minimization, a factor ρ means cost ≤ ρ OPT. For maximization, `1 − ε` is a retained fraction of OPT; ratios above one use OPT/value. Explicit assumptions disambiguate other conventions. Constant and log-star regimes hold with the stated auxiliary parameters fixed. Degree-dependent algorithms are listed separately. A lower-bound row states an impossible or necessary guarantee, not an achievable algorithm.

## Add or correct data

The source records are `dist/data/sparse.json`, `dist/data/general.json`, and, when present, `dist/data/picavet.json`. Each has `papers` and `results` arrays. The generated `catalog.json` and `catalog.js` should not be edited by hand.

Paper fields:

```json
{
  "id": "stable-paper-key",
  "title": "Exact paper title",
  "authors": "First Author; Second Author",
  "year": 2026,
  "venue": "arXiv preprint",
  "url": "https://arxiv.org/abs/...",
  "doi": "optional DOI",
  "notes": "Optional version / scope information"
}
```

Result fields:

```json
{
  "id": "stable-result-key",
  "problem": "Dominating set",
  "variant": "Unweighted",
  "objective": "min",
  "graphClass": "Precise graph class",
  "model": "LOCAL",
  "randomization": "Deterministic",
  "bound": "upper",
  "approximation": "Source-checked guarantee",
  "rounds": "Full source-checked bound",
  "roundClass": "constant",
  "parameters": "Which parameters are fixed, and their allowed ranges",
  "assumptions": "IDs, coloring, weights, preprocessing, success probability, etc.",
  "paperId": "stable-paper-key",
  "theorem": "Checked theorem number or Abstract",
  "summary": "Concise original description",
  "verification": "primary",
  "sourceUrl": "https://...",
  "year": 2026
}
```

Allowed models: `LOCAL`, `CONGEST`, `Anonymous`, `SUPPORTED`. Use assumptions for broadcast, port-numbering and message-size refinements. Allowed randomness: `Deterministic`, `Randomized`, `Unspecified`. Allowed regimes: `constant`, `logstar`, `degree`, `logarithmic`, `polylog`, `other`. Lower bounds have `bound: "lower"`. When a later work identifies a proof issue, add `status: "claimed"`, a visible `caveat`, and a `caveatUrl`. These fields are preserved in CSV exports. Secondary-only transcriptions must use `verification: "survey"` and make the verification limit explicit.

Keep distinct objectives, weight settings, graph restrictions, algorithms and lower bounds in separate rows. Do not infer CONGEST support from a LOCAL theorem. Do not promote a maximal independent set routine to a maximum-independent-set approximation without a justified reduction. Preserve fixed structural parameters and probability guarantees. Add new problem names freely; the interface derives its problem list from the data.

## Validate and build

Requires Python 3 and Node.js 18+. No third-party packages.

```sh
npm run check
```

This validates field types, models, regimes, unique IDs, references and source URLs, rebuilds the offline data bundle, checks JavaScript syntax and static HTML integrity, and runs semantic tests for filtering, model implications, ordering, author search and CSV escaping.

```sh
python3 scripts/build.py  # only validate/rebuild data
node scripts/catalog.test.cjs  # print individual semantic checks
```

## Hosting

The complete site is the `dist/` directory. It can be served by any static host, including GitHub Pages. All paths are relative, so a repository subpath works.

### GitHub Pages

1. Put the contents of this `approximation-atlas/` project directory at the root of your GitHub repository, including `.github/workflows/pages.yml`.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`, or run **Deploy static atlas to GitHub Pages** from the Actions tab. If your default branch has another name, update the workflow's branch filter.

The included workflow validates the data and code, checks interactions at a repository subpath, and deploys only `dist/`. It follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). No server, API key, runtime plugin, OpenAI account, or Sites service is needed on GitHub Pages. The `.openai/hosting.json` file is used only for an optional Sites deployment and is outside `dist/`.

For branch-based Pages instead, copy the **contents** of `dist/` to your publishing branch's root or `docs/` directory. A `.nojekyll` file is included. The site uses hash-based navigation, so no SPA rewrite or custom 404 page is needed. Both a domain root and a project URL such as `https://username.github.io/repository/` are supported.

A private Sites project is configured in `.openai/hosting.json`. Reuse its existing project identity for updates; do not register a replacement. Sites publication uses the source synchronization and deployment workflow. The current deployment status is reported by the Sites service.

## Verification limitations

The build, source validation, JavaScript syntax, HTML integrity, semantic tests and DOM interaction smoke tests pass. The DOM checks cover filtering, model implications, empty states, source caveats, citation copying, comparisons, explorer drill-down, bibliography, CSV export and navigation. These are simulated DOM tests, not a visual browser check. No connected browser surface is available, so rendered layout and real-browser behavior remain unverified. The site can also be opened offline via `dist/index.html`.

Optional DOM checks use jsdom 26, installed separately from the dependency-free website:

```sh
ATLAS_JSDOM=/path/to/node_modules/jsdom node scripts/dom-smoke.cjs
```

The supplied bibliography PDF and TeX source were downloaded into `research/` for local reference. These original source archives are ignored by Git and not included in the deployed site.
