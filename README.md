# Atlas of Distributed Approximation

[Open the atlas](https://talessseed.github.io/approximation-atlas/) · [GitHub repository](https://github.com/Talessseed/approximation-atlas)

A compact academic reference, with a secondary visual explorer, for distributed approximation algorithms and lower bounds. Results are grouped by round complexity, with separate groups for universal constant bounds and Parameter-dependent rounds. Other groups cover log-star rounds, explicit degree/weight dependence, logarithmic, polylogarithmic, and other trade-offs. Within each regime, entries are grouped by problem and ordered by publication year, newest first. Graph class, variant/benchmark, model, randomness and result type resolve ties within the same year. Paper and result IDs resolve ties, so source-file insertion order never changes the display. Problems are ordered by their number of distinct source publications, highest first, with alphabetical ties. Each indexed publication counts once per canonical problem; computed reductions and folklore do not add publications. These counts and the problem order stay fixed when filters change. The sidebar, Explorer and problem selectors share this order. Other controls put year or problem first. The Problem sort also orders each entire problem block newest first, across round complexities. Approximation expressions are not automatically ranked across different settings.

The design draws on [Timothé Picavet’s homepage](https://github.com/Talessseed/talessseed.github.io); the reference structure is inspired by [Florian Schager’s Atlas](https://github.com/florian-schager/atlas). This is a separate implementation, not a fork.

Reference text and formulas use a 120% scale, with an 18px root in place of the original 15px baseline. A small masthead replaces the introductory hero; coverage counts and the site description are in the Guide. Controls use short labels with full accessible names, and secondary explanations expand on demand. On larger screens, counts, exports and SOTA/constant-ratio filters share one row. The reference table fits the remaining viewport below its controls, updating after resizing or opening filter explanations. Settings, mathematical qualifications and source caveats remain visible in each result.

The Reference tab uses the available window width, with 20px outer margins, or 10px on compact screens. Other tabs use the earlier centered layout, capped at 1480px, with narrower reading widths for the Bibliography (1000px) and Guide (780px). The header and footer follow the active tab’s outer margins. Responsive breakpoints accommodate the larger controls. Printing keeps the original 15px baseline. SVG graph coordinates and label fonts retain their own units; the default focus zoom is increased to keep graph labels proportionally larger without disturbing their layout.

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

- Search problems, authors, graph classes, guarantees and parameter-dependent bounds, including ASCII math such as `epsilon`, `delta`, `1+epsilon` and `log-star`.
- Filter by problem, graph family, model, randomness, result type, round regime, curated SOTA status, matching upper/lower bounds and parameter-independent approximation ratios. The graph filter includes upper bounds on containing classes and certified lower bounds on contained classes; exact-stated-family mode is also available.
- Collapsible mobile filters, expandable explanations and a reference table that uses the remaining screen height, with sticky column headings. Adjacent rows for the same problem share a block-style left bracket and separator lines; regions follow current filters and sorting, split at round-regime headings, and remain visible during horizontal scrolling.
- Optional model implications, with opposite directions for upper and lower bounds.
- One shared setting for graph class, weights, fixed parameters and essential assumptions; result details retain constructions, proofs, sources and preprint labels. SOTA and Tight badges add only restrictions narrower than that setting.
- Round labels distinguish universal `Constant` from parameter-dependent `f(Δ, ε)`. Mathematical symbols have result-specific explanations on hover, keyboard focus and touch; explicit round counts remain separate.
- MathJax 4.1.3 formulas, including graph-class notation in settings, result details, comparisons, diagrams and graph-class selectors. The engine and TeX glyphs are bundled locally for offline use.
- Independent Tight · ratio, Tight · rounds and Tight · up to constants labels backed by matching upper/lower sources, with graph/model/parameter scope checks and linked counterparts.
- Muted blue-green SOTA rows for manually checked best-known or tight results, with the exact setting, evidence and check date.
- Original LOCAL and CONGEST SVG badges: a muted graph behind an infinity or bandwidth bottleneck symbol.
- Compare up to four results without implying that incomparable settings have a ranking.
- Share filters or a result via URL fragments; bibliography queries and explorer result types also survive navigation and browser history. No backend is involved.
- Copy a source citation with the BibTeX button beside each result arrow. Export visible results as CSV or their unique source citations as BibTeX; the bibliography view also exports all paper records.
- Explore the problem × round-regime matrix, the focused graph-class diagram and the full problem network. The class view separates contained classes, the selected class and containing classes. Drag either diagram with a mouse or touch, zoom, fit the view, or center the selected node. Recognized names in free-text search use both inclusion networks, including combined queries such as `planar MDS`.
- Open the Reductions tab for algorithm recipes, transformed instances, simulation costs, approximation changes and automatically computed applications, including chains of reductions.
- Download a correction template for a result. No submission or external message is sent.
- Responsive layout, keyboard navigation, native accessible dialogs and reduced-motion support.

## Scope and sources

The initial literature map is [Feuilloley, *Bibliography of distributed approximation beyond bounded degree*, arXiv:2001.08510v4](https://arxiv.org/abs/2001.08510), supplemented by foundational general/bounded-degree work, selected recent arXiv papers, and recent work by Timothé Picavet and its citation trail.

The full audit of [Picavet’s thesis](https://timothepicavet.fr/others/thesis.pdf) adds the pathwidth-two excluded-minor factor-50 theorem, bounded-degeneracy anonymous vertex cover, distance-k domination on planar and Euler-genus-bounded graphs, earlier explicit constant-factor tradeoffs, the local apex-genus extension, and the elementary exact algorithm for excluded paths. Two missing KMW16 lower bounds were checked against the original paper. Statements already represented by a published theorem are indexed once. The [thesis coverage audit](research/thesis-coverage-2026-11-16.json) records theorem locations, duplicate mappings, hypotheses and unresolved source notation; conjectures are not recorded as proved bounds.

This is a curated catalog, **not an exhaustive survey**. SOTA annotations form a literature-backed Pareto frontier by graph class and complete round complexity, independent of visible rows. They may certify an optimal factor, optimal dependence on n for fixed parameters, or a best-known tradeoff; each annotation states which. Unmarked results are not necessarily superseded. The bibliography records all 42 sections of Feuilloley’s survey. Some records are supporting exact symmetry-breaking algorithms, earlier versions, or references awaiting full theorem extraction. They are kept in the bibliography without fabricated approximation rows. `research/*-coverage.txt` records remaining gaps and interpretation details.

“Primary source checked” means a recorded claim was located in the paper’s abstract, theorem, or official author/conference abstract; it does not mean the proof was independently verified. Theorem numbers are included only when checked. Publication years refer to the cited version and are not guaranteed to be the earliest announcement.

For minimization, a factor ρ means cost ≤ ρ OPT. For maximization, `1 − ε` is a retained fraction of OPT; ratios above one use OPT/value. Explicit assumptions disambiguate other conventions. The label `Constant` is reserved for a universal bound, independent of n and the stated structural and accuracy parameters. Bounds independent of n only for fixed parameters appear under Parameter-dependent rounds as `f(parameters)` or an explicit formula. Approximation factors and round complexities retain their own parameter dependence separately. Constants hidden in log-star and slower asymptotic bounds may depend on the stated fixed parameters. Degree-dependent algorithms are listed separately. A lower-bound row states an impossible or necessary guarantee, not an achievable algorithm.

The approximation column shows only the factor, omitting “of OPT”. A separate MathJax `OPT_f` marker identifies guarantees against the fractional optimum, including integral outputs with that stronger comparison. Explicit source wording and verified `fractionalBenchmarks` entries in `round-labels.json` determine `approximationBenchmark`; fractional output alone is not used to infer it. The same renderer and benchmark metadata are used in result details, comparisons and computed reductions. CSV retains the original expression, factor-only display and benchmark. Guarantees against total weight `w(V)` and proof inequalities keep their full expressions.

Ratio lower bounds use mathematical notation: “No (α)-approximation” displays as `> α`, while “No ratio < α” displays as `≥ α`, preserving whether the threshold itself is allowed. Accuracy terms remain explicit. The reviewed asymptotic-order lower bound displays as `Ω(...)`. Necessary-round lower bounds retain the target guarantee, such as `1 − ε`, with their round complexity in the adjacent cell. This formatting is applied after notation normalization and before reduction compilation; original source expressions remain in `approximation` and reduction provenance.

Use **algorithm** and **round complexity** in interface text and result descriptions. Keep **upper bound** and **lower bound** for mathematical bounds, and preserve published titles and internal identifiers.

**Constant ratio** selects stated approximation guarantees independent of every structural, size and accuracy parameter. It is separate from the round filter and SOTA: factor 50 in f(t) rounds qualifies, while 7+ε and 2t−1 do not. Numerical fractions and arithmetic are recognized; a bare universal constant requires explicit review. The flag is recomputed after reductions substitute instance parameters. An explicitly certified specialization can also qualify: selecting Planar displays the minor-density algorithm at a=3 as factor 7, retaining its fractional benchmark. No numerical factor is inferred merely by choosing an unspecified accuracy. CSV preserves the source guarantee and constant flag alongside query-specific fields; shared links and history retain the toggle.

## Graph-class network

`dist/data/graph-classes.json` is the single source for class nodes, aliases, certified inclusion edges, references, exact source-class scopes and visible input prerequisites. Canonical display aliases in the same file standardize names throughout the table, details, comparisons, sorting, exports and network. Original wording is retained as `graphClassSource` when it differs, while all restrictions and symbols remain explicit. Source class definitions map explicitly to graph nodes; directed edges record certified inclusions, including inclusions into General. The browser traverses this declarative network transitively when a query runs. No per-article class-inclusion links or substring classifications are needed to establish applicability.

For upper bounds, a target class must reach the source class through subset-to-superset edges. For lower bounds, the source witness class must reach the target using only edges explicitly certified for lower transfer. Edges involving an unspecified choice of excluded minor or other incompatible family parameters can disable lower transfer. Fixed parameter choices and all other theorem conditions remain in force. Graph inclusion alone does not alter the stated round complexity; transformed-instance costs are computed separately by the reductions engine described below.

For example, Planar reaches fixed-genus, minor-free, sub-logarithmic expansion, bounded expansion, bounded-depth-one density, bounded-arboricity and general-graph algorithms. Its network also tracks local embeddability and locally nice genus. Separate nodes preserve triangle-free, high-girth, incidence, bounded-degree and supplied-input restrictions. Bounded Euler genus and bounded orientable genus remain distinct. Unit-disk connects to polynomial neighborhood-independence growth, with no inferred sparse-family inclusion.

The excluded-minor pathwidth condition is represented separately from the input graph’s pathwidth: K₂,t-minor-free and Pₜ-minor-free classes reach `H-minor-free; pw(H) ≤ 2`. The K₂,t edge records the semantic binding `excluded-minor = K₂,t`; source results explicitly declare which symbol has that role. Thus H=K₂,t is applied to an excluded-minor parameter without changing an unrelated H used for arbitrary minors. The same typed edge supports reviewed SOTA coverage. Local apex-genus is also separate from global apex-genus; different radius-r balls may use different apex deletion sets, so the local condition does not imply a globally excluded minor. These inclusions retain their parameter substitutions and lower-transfer restrictions. Explorer boxes grow with wrapped labels and their edges meet the vertical centers.

The Explorer shows the selected class in yellow, with contained classes to its left and containing classes to its right. Selecting a node changes focus; **Show compatible bounds** opens the reference view. Typing a recognized class such as `planar` in search applies the same logic and retains other terms (for example `planar matching`). Supplied inputs remain visible prerequisites. Inherited rows show their inclusion path and acquire target-class SOTA status only through an explicit scope certificate. Filtered CSV exports retain the requested class, transfer path, prerequisites and whether SOTA applies to that query, alongside the original theorem fields.

Both diagrams use the shared dependency-free `network-layout.js` and `network.js` modules. The class diagram restores the focused three-column view: contained classes, the selected class, and containing classes. Solid arrows are direct inclusions; dashed arrows summarize real paths through intermediate classes. These display summaries never change the underlying inclusion data or bound/SOTA computation. Labels wrap completely, and node heights grow to fit them. The problem diagram retains its complete deterministic layered graph, including disconnected components and every recorded direct relationship.

Select an edge to highlight it and read its conditions and sources in a small panel. Transitive class links show every intermediate inclusion. Problem links distinguish certified transfers, formulations and LP relaxations. Tab to an edge and use Enter or Space to open its details; Escape or the close button clears selection. The panel scrolls independently of the graph.

Drag or scroll inside either graph to pan; an ordinary click still selects a node. Shift-wheel pans horizontally, and Ctrl-wheel zooms around the pointer. Use +/− to zoom, **Fit graph** to fit the current diagram, or **Center selection** for readable labels near the focus. Arrow keys pan and Home/0 fits. Scrolling outside the graphs moves the page. Keyboard focus reveals offscreen nodes, cameras persist across view changes, and printing shows the current diagram. Each contained/containing class column is vertically centered on the selected class; its heading remains visible while panning.

## Folklore baselines

`dist/data/folklore.json` contains five documented elementary baselines: unweighted MDS on pseudoforests, including forests (factor 3, one round), general MDS (factor Δ+1, zero rounds), K1,t-minor-free MDS (factor t, zero rounds), positive-degree regular vertex cover (factor 2, zero rounds), and unit-disk vertex cover (factor 6, one round; zero if local degree is initially known). Each is tagged `attribution: folklore` and supplies an algorithm, proof sketch, MathJax proof formula, source and initial-information assumptions. The citation and year identify documentation, not discovery credit. These entries receive a visible Folklore label, remain searchable with `folklore`, and carry their provenance through CSV exports. Their ratios are unweighted guarantees. The cited paper documents the forest rule; its broader pseudoforest scope is explicitly marked as an elementary derivation with a star-assignment proof. Isolated vertices and isolated edges are handled separately.

The elementary graph tests exhaust all labeled trees through six vertices and all simple graphs through five vertices, check feasibility against exact optima (including all 676 pseudoforests through five vertices, 337 with cycles), and include negative controls showing why tree and regularity assumptions matter. Folklore status does not imply SOTA status.

Euler genus consistently uses `g`, and approximation accuracy/slack uses `ε`, in labels, guarantees, round functions and parameter keys. The semantic symbol policy lives in `dist/data/round-labels.json` under `symbols`; `parameterRoles` supplies bindings for statements outside named constant bounds. Only symbols bound to an accuracy role are renamed; failure probabilities, success-tail exponents and structural parameters retain their own symbols. source expressions remain unchanged, and renamed prose retains its original value in `parametersSource` (or the corresponding `*Source` field). CSV includes these source fields and `notationChanges`. Orientable genus and girth remain separate concepts.

## Problem network

`dist/data/problems.json` defines problem scopes, aliases, typed formulation/relaxation edges, source references and per-result scope corrections. The generated catalog retains original category wording as `problemSource` when normalization changes it. Fractional domination, fractional matching, client domination, capacitated matching and distance-based covering tasks have distinct scopes; an integral output compared against fractional OPT remains integral.

Parameterized problem names show their defining parameter in the table, details, comparison and exports: for example `Distance-k dominating set`, `Distance-r vertex cover`, `2-domination (outside the solution)` and `Vertex-disjoint H-packing`. Distance rows preserve the radius symbol used in their bounds. Per-node naming templates and explicit `resultParameters` in `problems.json` keep these names consistent without splitting the underlying problem scope; previous names remain aliases for filters and shared links. CSV records the parameter symbol and meaning as `problemParameter` and `problemParameterName`.

`Distance-r vertex cover` and `Distance-r connected vertex cover` have independent problem definitions, filters, table regions and Explorer entries. Their source records use these categories directly. Previous connected-distance names remain aliases, and the original classification is retained in provenance fields.

A problem query includes algorithms for certified general formulations, and lower bounds for certified special cases. The certified specialization rules preserve the physical graph and objective: ordinary/total/client domination specialize integral local covering, and fractional domination specializes fractional local covering. The details give candidate-set and cost substitutions. Client domination includes a setup round for request labels unless those labels are initially supplied; unchanged exact lower-bound transfer is disabled for that edge. The checkbox **Use problem reductions** hides computed consequences and shows original source rows; shared links persist this choice. Problem queries use the compiled target rows, so an explanatory formulation path cannot bypass the engine’s guards. SOTA status transfers to a different problem only with an explicit specialization certificate. CSV includes `queryProblem`, `problemTransfer` and `problemReductionPath` alongside graph-class provenance.

Other edges are explanatory: MDS is set cover via closed neighborhoods, while its fractional relaxation is a covering LP. LP solutions do not automatically yield integral solutions. Incidence and line-graph transformations may change graph classes or message requirements. A descriptive formulation arrow does not itself import a bound; a separate certified reduction recipe must instantiate the simulation, approximation factor and parameters. The build performs those certified computations automatically. In particular, planar K4 has the nonplanar closed-neighborhood incidence graph K4,4. The explorer distinguishes certified transfers, formulations and LP relaxations, with sources and conditions. Matrix and sidebar counts use the same certified matching as their catalog drill-down; one bound can appear under more than one target problem.

The problem graph draws every recorded relationship with its own endpoints. Green lines show certified direct transfer; dash-dot reduction lines change the approximation ratio or round complexity. Dashed formulations and dotted pink LP relaxations provide context. Select an edge for its conditions and recipe. Changing the result type updates the transfer labels without changing graph topology. Reciprocal edges use separate selectable lanes.

## Reusable reductions engine

On connected unweighted inputs, a connected-MDS α-approximation gives an ordinary-MDS 3α-approximation in the same rounds: return its vertex set and use OPT_CDS≤3 OPT_MDS−2. This is a compiled factor-changing recipe, not an unchanged-ratio problem inclusion. The converse connector is stored separately: four extra LOCAL rounds and the independently checked multiplier 1+2∇₁, specialized to 7 on planar graphs and 3 on pseudoforests. Its recipe records the source’s stronger intermediate size claim and the P9 clarification. See the [two-direction audit](research/cds-implications-audit-2026-11-16.json).

`sourceGuards` checks the objective, reviewed weight condition, output kind and benchmark. `weightCondition` comes from exact variant/profile classifications; unknown weights do not pass an unweighted rule. Typed `inputConditions` reference shared setting facts and survive same-graph composition. Graph-changing recipes reject such guarded domains unless separately certified. Multipliers may have graph-family certificates, selected through the class inclusion network. Source statements and benchmarks remain in provenance; target benchmarks, model conversions and multiplier certificates are explicit. Neither SOTA/Tight nor lower-bound transfers are inherited through these factor changes.

`dist/data/reductions.json` defines reusable algorithm recipes; `scripts/derive.py` applies their certified `engine` rules during `scripts/build.py`. An arrow `from → to` means that the problem in `from` uses an algorithm for `to`. The Reductions view shows the recipe, its transformed graph and parameters, source, conditions and computed applications.

The generated catalog separates `sourceResults`, the canonical theorem records extracted from papers, from `results`, which contains those records plus computed consequences. Add a new paper and its theorem records to the source files, assign their problem and graph scopes, and rebuild: every compatible rule applies without adding article IDs or per-article reduction links. The engine also composes acyclic chains of recipes until no compatible consequence remains; a problem node cannot recur within a chain. For example, a compatible covering-LP algorithm produces fractional vertex cover, then integral vertex cover through threshold rounding, with the simulation time and factor-two loss composed explicitly. Fractional domination does not become integral domination without a certified rounding rule.

Each recipe has a stable `id`, `from`/`to` problem-node IDs, a `kind`, a display `status`, supported `models`, `runtime`, `guarantee`, transformed `instance`, `conditions`, and a primary `source` with a URL and location. The file’s top-level `notation` dictionary supplies TeX for the displayed formulas. Optional `examples` point to illustrative source records; they do not control eligibility. A descriptive recipe without an `engine` rule generates no bounds. `conditional` recipes can have engine rules: their generated results retain every condition rather than silently discharging it.

An engine certificate specifies:

- `mode`: `identity`, `simulation`, `rounding` or `parameters`.
- `sourceScopes`: compatible algorithm problem-node IDs, matched against each record’s canonical `problemScope`.
- `graphMap`: `"same"`, or a map from the algorithm’s graph-scope ID to the resulting physical graph-scope ID. Missing mappings prohibit that application.
- `substitutions`: exact symbolic instance substitutions in the source guarantee and round expression. For example, neighborhood set cover uses `n=2n`, `Δ=Δ+1`, and `f=k=Δ+1`; edge incidence uses `n=n+m` and `m=2m`. Neighborhood incidence has `m=n+2m`. The symbols on the left belong to the input instance, and those on the right to the resulting problem instance.
- `cost`: `T`, `2T`, `T+1`, `T+4`, `O(T)` or `O(T+1)`, with `T` evaluated on that transformed instance; `factor`: `identity`, `double`, or `multiply` with a reviewed `multiplier` expression and optional graph-family bounds.
- `targetVariant`: `preserve` or `Unweighted`, plus `upper`/`lower` direction flags and explicit `assumptions`.

For example, this engine block makes the neighborhood-set-cover recipe reusable for future compatible set-cover papers:

```json
"engine": {
  "mode": "simulation",
  "sourceScopes": ["set-cover"],
  "graphMap": {
    "incidence": "general",
    "bounded-incidence": "general",
    "general": "general"
  },
  "substitutions": {"n": "2n", "m": "n+2m", "Δ": "Δ+1", "f": "Δ+1", "k": "Δ+1"},
  "cost": "2T",
  "factor": "identity",
  "targetVariant": "preserve",
  "upper": true,
  "lower": false,
  "assumptions": ["Retain source input conventions and supply all required global parameters."]
}
```

That block belongs inside a complete, sourced recipe. It deliberately omits `planar-incidence`: closed-neighborhood incidence does not preserve planarity. In contrast, the vertex-cover incidence construction subdivides edges and can use a certified `planar-incidence → planar` mapping. The line-graph recipe currently certifies unrestricted general-graph LOCAL algorithms only. Its exact substitutions are `n=m`, `m=m_L`, and `Δ=Δ_L`, where `m_L=Σ_v binom(deg(v),2)` counts line-graph edges for simple input graphs and `Δ_L=max_{uv∈E}(deg(u)+deg(v)−2)`; the inequality `Δ_L≤2Δ−2` remains a note, not a substitution into an arbitrary nonmonotone bound.

The engine substitutes variable tokens, including implicit products and Greek subscripts, without rewriting TeX control names or prose. Named constant-round parameters are instantiated through their `roundParameters` metadata. It preserves symbolic expressions and does not simplify nested Big-O terms or optimize accuracy parameters. A single-runtime recipe does not compose a source expression containing separate total/awake metrics. Source coefficient encodings, weight restrictions, identifiers, randomness, initial information and any required global knowledge remain assumptions on the transformed instance. Symbols not instantiated by a rule keep their source meaning on the input instance; they are not silently identified with parameters of the resulting physical graph.

Only primary-checked records without a source caveat or unresolved claim are eligible. Result models must be supported by the recipe; an upper-bound CONGEST or Anonymous algorithm may be simulated in LOCAL when the recipe supports LOCAL, with the conversion recorded. This does not infer CONGEST support from LOCAL. Lower bounds transfer in the reverse direction only for certified same-graph, identity-factor, zero-overhead (`T`) rules, retaining the exact model.

Generated rows have `verification: "derived"`, stable IDs, `sourceResultId`, `parentResultId`, a goal-to-algorithm `reductionPath`, per-step conditions, and `sourceMath` retaining the original formulas. Their paper ID, URL, year, objective and probability convention remain those of the base source. Source variant descriptions are identified as such; explicit unweighted specializations are labeled separately. Original assumptions and parameters remain verbatim alongside the instantiated reduction conditions. Derived provenance certifies how a bound was obtained; it does not certify literature SOTA. SOTA and dominance annotations are not inherited. A separately curated certificate for an exact target setting may support a scoped highlight.

## Add or correct data

The source records are `dist/data/sparse.json`, `dist/data/general.json`, `dist/data/picavet.json`, and `dist/data/folklore.json`. Each has `papers` and `results` arrays. The generated `catalog.json` and `catalog.js` should not be edited by hand. Their `sourceResults`/`results` split is generated too; write extracted theorem records only in the source files.

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

Allowed models: `LOCAL`, `CONGEST`, `Anonymous`, `SUPPORTED`. Use assumptions for broadcast, port-numbering and message-size refinements. Allowed randomness: `Deterministic`, `Randomized`, `Unspecified`. Allowed regimes: `constant`, `parameter`, `logstar`, `degree`, `logarithmic`, `polylog`, `other`. Lower bounds have `bound: "lower"`. When a later work identifies a proof issue, add `status: "claimed"`, a visible `caveat`, and a `caveatUrl`. These fields are preserved in CSV exports. Secondary-only transcriptions must use `verification: "survey"` and make the verification limit explicit.

Add a TeX mapping for each new guarantee and round complexity in `dist/data/notation.json`; the build rejects missing mappings. Keep the plain-text fields for search, CSV and accessible fallback. The locally bundled MathJax renderer caches SVG expressions and reuses them after filtering.

For a new article, add its paper and theorem records, TeX mappings, and explicit source problem/class scopes in `problems.json` and `graph-classes.json`. Prefer the existing canonical instance symbols in reusable formulas, and record their meanings and any restricted domains. Existing reduction rules will then discover compatible records at build time; add a recipe only when introducing a new mathematical reduction, not when adding another article using an existing one. Inspect the generated assumptions and transformed parameters before accepting the build output.

For a new graph class, add a node with a stable ID, label, aliases and description to `graph-classes.json`, then add each exact source wording to `scopes`. Use `displayAliases` when several source spellings should share one display name. Add sourced inclusion edges with `subset`, `superset`, `reason`, a `lower` transfer flag and a reference; keep supplied-coloring, girth, connectivity or other restrictions explicit. Paths are traversed transitively, so a new subclass only needs the certified direct edges that establish its position, not links to every article or every ancestor. Set `lower: false` where a family inclusion does not justify the reverse lower-bound query. Add source-specific input prerequisites when required. A graph transformation needs its own certified `engine.graphMap` entry; ordinary graph inclusion does not prove that the transformation preserves the new class.

Readable parameter-dependent round names are curated in `dist/data/round-labels.json`. Expression-wide names can be overridden for an individual result. Approximation dependencies are recorded independently in `approximationResults`; `universalConstants` explicitly reviews each bare `O(1)` field, and the build rejects a new bare constant without either this review or named dependencies. Variable round budgets without named-function labels are listed in `parameterRounds`. The builder always displays the mathematical parameter symbols, for example `f(∇₁)`, `f(Δ, ε)` and `f(ρ, b, ε)`, even when a symbol has not appeared earlier in the row. The `introduced` metadata records that context independently. Descriptions appear on hover, keyboard focus and touch. When a source uses f as its expansion function, the unspecified outer bound uses F, for example `F(r, f)` or `F(k, f(k))`, so the two functions stay distinct. The build generates `roundsDisplay`, `approximationDisplay` and `roundParameters` alongside the original source fields. The generated `parameter` regime immediately after `constant` separates these n-independent functions and explicit variable budgets from universal constants; `roundClassSource` retains the original regime when changed. CSV exports include both forms, and search matches the readable names. Never assign a symbol a global meaning: for example, `d` denotes maximum average degree in one result and asymptotic dimension in another; ASW26’s `b` bounds the positive integer cost of each candidate vertex or set; that meaning is available from the symbol’s explanation. A parameter-dependent approximation factor must be written explicitly even when its algorithm uses a universal constant number of rounds. Lower-bound impossibilities remain labeled as impossibilities.

The build rejects parameter-dependent `O_{…}(1)` in displayed approximation formulas, including products generated by reductions. Declare its semantic dependencies in `approximationResults` to obtain `f(...)` automatically. Parameter-free additive terms such as `24g + O(1)` keep their explicit form.

Graph-class prose and mathematical notation share the presentation registry `dist/data/graph-notation.json`. Explicit fragments identify the mathematical expressions without changing class names, identifiers or source wording. The compiler builds reusable parts for labels, descriptions, inclusion evidence, prerequisites and condition facts; long source explanations use the same compact fragments at display time. Tests compare client and compiler rendering and protect ordinary prose and parameter meanings. Add notation here when introducing a new mathematical graph-class expression. The two graph-class selectors use keyboard-accessible MathJax options while retaining their native values and change events. Options are rendered when opened and cached for subsequent use.

Every universal upper-bound `O(1)` source also needs a round-count audit in `dist/data/round-counts.json`. The registry distinguishes source-stated counts, unchanged schedules under reanalysis, conservative phase counts, unspecified totals and inaccessible full algorithms. Verified counts replace only `roundsDisplay`; raw source rounds stay intact. A conservative schedule uses `≤`, with its derivation, initial-information convention and primary links shown in result details and retained in CSV as `roundCountEvidence`. Never treat a number of phases or greedy iterations as the total without accounting for the communication inside them. Counts attached to a source algorithm are stripped during derivation, since a transformation may change its cost. Universal lower-bound budgets are unaffected. The [complete audit](research/explicit-round-counts-2026-11-16.json) records the remaining unknown totals.

Opening a result or comparing entries shows the most explicit checked round complexity while the table keeps compact expressions such as `f(g)` and `polylog n`. The reviewed expansions are stored in `dist/data/round-details.json`, with TeX, source locations, explanations and local parameter definitions. A full asymptotic expression still allows absolute hidden constants; reconstructed phase counts are identified as upper bounds. A partial composition involving an unspecified control function is labeled **Partial expansion**. If no finer expression has been extracted, or the checked source leaves its dependence implicit, the details say so. These are distinct cases. Lower-bound budgets retain their quantifiers: for example, an impossibility for every fixed-parameter budget displays “Any T(r, ε) independent of n”, rather than an algorithm runtime.

The builder compiles `roundComplexityDetails` for every record, preserves it in CSV, and applies the existing reduction substitutions and communication costs to the expanded expression automatically. A reviewed explicit expression can set `displayInTable: true` to refine its compact display while preserving the original source statement; the build rejects this for implicit dependence or impossibility budgets. When a bound includes definitions or domain restrictions, store the runtime in `expression` and the attached text in `suffix`, each with `formula` and `tex`. The compiler assembles the display; reductions substitute both parts but apply their communication cost only to the runtime. Keep both compact and detailed bounds when adding a checked expansion; do not add article-specific reduction cases or infer a polynomial exponent. The initial [parameter audit](research/explicit-parameter-rounds-2026-11-16.json) and [polylogarithmic audit](research/explicit-polylog-rounds-2026-11-16.json) cover 25 source results. The [K₂,t/pathwidth-two audit](research/k2t-pw2-sota-2026-11-16.json) corrects the factor-50 algorithms to O(t) using the thesis’s explicit linear-runtime analysis. APRSU10 dominating set has a documented four-round implementation with the supplied weak two-colouring; Δ affects its ratio.

Related theorem records can be cross-linked using `relatedResults` (result IDs); the build validates these references. The table and details identify these as related results, preserving differences such as pure path powers versus path powers with endpoint leaves. Thesis records use `type: "phdthesis"` and a `school` field for proper BibTeX export.

SOTA evidence lives in the `sota-*.json` annotation files; `sota-frontier.json` separately records the policy, certified dominance comparisons and SOTA scope transfers. There are 45 reviewed annotations, 40 active frontier points and 12 certified comparisons. A point is removed only when another is no worse on all eight dimensions—problem/output, graph class, approximation, complete rounds, communication model, randomness, benchmark and input assumptions—and strictly better on at least one. Comparisons include parameter substitutions and evidence. The build rejects cycles, incomplete certificates, unknown or duplicate IDs, secondary-only evidence, and unresolved source caveats.

`algorithmSpecializations` stores reviewed identities between a broader algorithm family and an original implementation on a parameterized subclass. A scope transfer and a family-coverage comparison reference the same certificate. Validation requires a shared algorithm family, matching outputs/model/benchmark, an explicit parameterized inclusion and a checked runtime. `effectiveRounds` uses the original implementation only in the certified setting; source fields stay intact and CSV adds query-specific round metadata. For the factor-50 dominating-set theorem, H=K₂,t uses the original Algorithm 5 control function, radii and O(t) schedule; the broader family retains f(H) elsewhere. The original entry is labelled **Covered by broader theorem** and keeps its citation. Strictness is the larger family of excluded-minor settings, with no claimed runtime improvement. Its K₂,t SOTA specialization retains the reviewed t≥49 qualification. See the [source audit](research/k2t-pw2-sota-2026-11-16.json).

Exact round counts and full parameter functions remain separate: one round is not identified with an unspecified constant, and k versus 3k is a real tradeoff. Two unspecified universal constant bounds can be compared only at their stated asymptotic level. A bound such as `f(g)` remains a function of g in every SOTA comparison; fixing genus for an individual graph class does not establish a universal bound over genus. Comparisons of approximation factors and round complexities each retain their full parameter dependence and any required parameter substitutions. Conditional parameter comparisons are displayed without globally pruning the entire family. Scoped badges expose restricted parameter domains. Unknown comparisons are not treated as equal or automatically promoted to SOTA.

The build rejects a dominance certificate over a fixed numerical round budget unless the better bound has a verified numerical budget no larger. In particular, the unspecified ASW constant does not suppress the six-round planar factor-52 result. Its improved analysis does certify domination over the original six-round factor 130 and the six-round factor 205. An unpruned result still needs a separate literature review before receiving a SOTA badge.

For example, the planar factor-seven point is covered by the identical minor-density protocol at a=3 on a strictly larger class. That broader row has an explicit Planar scope certificate. The bounded-genus factor-seven result uses integral OPT and does not replace the stronger planar fractional-OPT guarantee. A zero-round regular-graph VC point survives slower general-graph exact-2 algorithms. The full BEKS18 accuracy tradeoff covers its inverse-polylogarithmic-accuracy corollary; the newly indexed BEKS19 full tradeoff and exact-2 logarithmic bound then dominate the older weighted-cover points. All input conventions are explicit. Both exact-k and 3k high-girth domination points remain highlighted. Filtering out a dominating result never restores an old highlight.

CSV exports retain source/global `frontierStatus`, `dominatedBy`, full `dominanceEvidence`, query-specific status/scope and SOTA evidence. Lower-bound tightness annotations are kept separate from achievable algorithms. Recheck current literature before adding or renewing an annotation; lack of a known catalog dominator is not evidence of literature SOTA.

Keep distinct objectives, weight settings, graph restrictions, algorithms and lower bounds in separate rows. Do not infer CONGEST support from a LOCAL theorem. Do not promote a maximal independent set routine to a maximum-independent-set approximation without a justified reduction. Preserve fixed structural parameters and probability guarantees. Register new problem nodes, aliases and exact source scopes in `problems.json`; the interface derives its problem list from that data.

### Shared settings and certificate conditions

`dist/data/conditions.json` stores reviewed facts with stable IDs, exact variant classifications, per-result setting profiles and condition references for SOTA, scope transfers and each Tight application. `scripts/conditions.py` compiles these into `catalog.conditions` and each result's `setting`. Reviewed implication edges record when one condition already entails another; presentation never removes restrictions by matching prose. Setting groups state graph/weights, parameters, assumptions and further details once. Conditions shared by all displayed badges appear once; distinct domains such as integer a≥2 for SOTA and integer a≥1 for Tight remain separate. Constructions and proof explanations belong in details. Original source fields remain available in a collapsed disclosure and in exports.

Every new certificate or application needs an explicit condition review, including an empty list when its scope adds no restriction. The build rejects unknown IDs, implication cycles and missing reviews. New source rows without a specialized profile preserve their exact variant and assumptions rather than guessing their meaning. For factor 50 on K₂,t-minor-free graphs, t≥2 belongs to the algorithm's setting; t≥49 belongs only to the conservative SOTA annotation. The density substitution a=(t+1)/2 applies for every t≥2. The restricted 3≤t≤9 range in ASW26 concerns K_t-minor-free graphs and the different coefficient 2t−3; see the [source audit](research/k2t-50-sota.txt).

Facts may include optional `parts`: a list of plain strings and `{ "math": "notation key" }` segments. The compiler requires their concatenation to equal the readable label and validates every math key. The shared renderer typesets these short expressions with MathJax while the surrounding text can wrap normally. Plain labels remain suitable for search and CSV. For locally embeddable domination, the row states the excluded depth-1 minor K₃,t, t≥3, and the known integer bound c≥∇₁(G). The source polynomial stays in c: the algorithm takes an integer upper bound as input, whereas ∇₁(G) can be fractional. Details define the density and the valid supplied choice c=⌈∇₁(G)⌉. See the [parameter audit](research/locally-embeddable-parameters-2026-11-16.json).

### Tight upper and lower bounds

`dist/data/tight-bounds.json` records reviewed matching-bound certificates independently of SOTA. Each states the matched quantity, exact/asymptotic/threshold meaning, parameter domain, primary upper/lower evidence and explicit graph/problem/model applications. A counterpart can be in the catalog or linked directly to its theorem. The build rejects missing sources, unknown IDs/scopes, wrong bound directions, caveated claims and unreviewed copied flags.

Badges say **Tight · ratio**, **Tight · rounds** or **Tight · up to constants**. The last label means that the upper and lower bounds differ by at most a constant factor. Visible scope text retains restrictions such as integer density, nonplanar excluded minors or k ∈ {3,4,5,6}. Result details link both sources and matching catalog entries; comparisons and CSV include the same evidence and query-specific status. Approaching an optimal limiting ratio alone is not labeled tight.

Tightness can remain true for a dominated point, and a best-known point need not be tight. The graph, problem and model of the current query must be explicitly certified: an outerplanar lower bound inherited by Planar or General does not acquire a matching upper bound there. Reductions do not inherit Tight automatically; the local-covering-to-MDS log-star consequence has its own reviewed application. New articles must provide matching evidence before receiving the label.

The **Tight** checkbox filters to explicit matching-bound certificates for the selected problem, graph class and model. It includes upper and lower bounds, and combines independently with SOTA, Constant ratio and round filters. A shared URL retains it as `tight=1`; reloads, view navigation, filtered exports and Reset use the same state. Short hover descriptions explain the three controls; full scopes remain on results and their evidence.

### Parameter definitions and hover explanations

`dist/data/parameters.json` gives explicit definitions by source result ID. There is no global meaning for a reused letter: d can denote maximum average degree, degeneracy or asymptotic dimension; g can denote genus, odd girth or an expansion function. `scripts/parameters.py` combines these reviewed entries with named-bound and problem-parameter metadata, and compiles `parameterDefinitions` for source results, computed reductions and reduction recipes. Descriptions and mathematical TeX are validated; CSV exports include the definitions, and searching descriptive names still finds their symbolic bounds. New articles can inherit explanations from their declared named parameters and supply explicit definitions for additional symbols.

Hover targets follow MathJax’s mathematical identifiers and subscripts, rather than replacing formula text. Parameter symbols in named functions and result settings have the same contextual explanations. Explanations also appear on keyboard focus and touch, support Escape dismissal, and stay within the screen or open dialog. They remain informational terms rather than command buttons. Mathematical expressions, source fields and exact reduction substitutions are preserved. The integer local-density bound c remains distinct from the possibly fractional ∇₁(G). The distance-k comparison constant is C, matching the primary theorem, rather than the earlier lower-case transcription.

## Validate and build

Requires Python 3 and Node.js 18+. No third-party packages.

```sh
npm run check
```

This validates field types, models, regimes, unique IDs, references and source URLs, rebuilds the offline data bundle, checks JavaScript syntax and static HTML integrity, and runs semantic tests for graph/problem transfer, fractional/integral scope guards, model implications, ordering, author search, SOTA and CSV provenance/escaping. The builder reports current source-result, derived-result and recipe counts; these are computed rather than maintained in this document.

```sh
python3 scripts/build.py  # only validate/rebuild data
node scripts/catalog.test.cjs  # print individual semantic checks
python3 scripts/test_derive.py  # reusable engine and future-article regression tests
python3 scripts/test_conditions.py  # shared settings and per-certificate restrictions
node scripts/reductions.test.cjs  # reduction matching and application checks
```

The derivation tests inject an arbitrary new paper rather than using article-ID allowlists. They check chained LP/rounding applications, exact instance substitutions, model and graph guards, source provenance, lower-bound direction, named parameters and the absence of unearned SOTA labels.

The browser bundle is compact and shares source records with the complete result list; the JSON download remains readable and complete. A standalone bundle test verifies that both contain identical data. Reference rows retain their rendered MathJax formulas when sorting or filtering within the same setting. Changing the graph/problem setting or model rebuilds the rows, so specialized guarantees and badges are refreshed. Math layout reads and updates are batched, and hidden tabs are typeset when opened.

## Hosting

The complete site is the `dist/` directory. It can be served by any static host, including GitHub Pages. All paths are relative, so a repository subpath works.

### GitHub Pages

1. Put the contents of this `approximation-atlas/` project directory at the root of your GitHub repository, including `.github/workflows/pages.yml`.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`, or run **Deploy static atlas to GitHub Pages** from the Actions tab. If your default branch has another name, update the workflow's branch filter.

The included workflow validates the data and code, checks interactions at a repository subpath, and deploys only `dist/`. It follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). No server, API key, runtime plugin, OpenAI account, or Sites service is needed on GitHub Pages. Only `dist/` is published.

For branch-based Pages instead, copy the **contents** of `dist/` to your publishing branch's root or `docs/` directory. A `.nojekyll` file is included. The site uses hash-based navigation, so no SPA rewrite or custom 404 page is needed. Both a domain root and a project URL such as `https://username.github.io/repository/` are supported.

## Verification

The “Reading the atlas” guide introduces the communication models, round complexity, approximation ratios, graph-class inclusions, reductions and best known results with short definitions and examples. Its terminology follows Picavet’s published PODC 2025 and PODC 2026 papers, linked in the guide.


The build, source validation, JavaScript syntax, HTML integrity, semantic tests and DOM interaction smoke tests pass. The DOM checks cover filtering, model implications, empty states, source caveats, citation copying, comparisons, explorer drill-down, bibliography, CSV export and navigation. The MathJax checks render every notation using the actual bundled engine, verify accessible labels, exercise repeated filters and dialogs, and reject external resource requests at both a repository subpath and a file URL. The simulated DOM tests are supplemented by real headless Chrome checks and reviewed screenshots. Browser checks cover native dialogs, focus restoration, Back/Forward, clipboard success and failure, downloads, sticky headings, print styles, subpath/file URLs, and widths of 320, 390, 768 and 1440 pixels. Running the optional browser checks generates version details, reports and screenshots under `qa/`; these local artifacts are excluded from Git and from the published site. The site can also be opened offline via `dist/index.html`.

Optional DOM checks use jsdom 26, installed separately from the dependency-free website:

```sh
ATLAS_JSDOM=/path/to/node_modules/jsdom node scripts/dom-smoke.cjs
ATLAS_JSDOM=/path/to/node_modules/jsdom node scripts/math-select.test.cjs
ATLAS_JSDOM=/path/to/node_modules/jsdom node scripts/math-smoke.cjs
ATLAS_JSDOM=/path/to/node_modules/jsdom ATLAS_TEST_URL="file://$PWD/dist/index.html" node scripts/math-smoke.cjs
```

Optional browser checks use Playwright and axe-core, installed outside the website:

```sh
npm install --prefix /tmp/atlas-qa --no-save --ignore-scripts playwright@1.65.1 axe-core@4.11.0
ATLAS_PLAYWRIGHT=/tmp/atlas-qa/node_modules/playwright \
ATLAS_AXE=/tmp/atlas-qa/node_modules/axe-core/axe.min.js \
ATLAS_BROWSER=/usr/bin/google-chrome \
node scripts/browser-qa.cjs
```

`scripts/setting-browser-qa.cjs` uses the same browser environment for focused checks of canonical settings, certificate restrictions, the constant-ratio filter, Planar factor-seven specialization and CSV/BibTeX exports.

`scripts/network-browser-qa.cjs` checks complete graph coverage, mouse/touch dragging, accidental-click suppression, zoom, keyboard controls, focus visibility, resizing, typed edges, drill-down and offline use. `scripts/network-layout.test.cjs` covers graph geometry, determinism, disconnected components, cycles and long labels without browser dependencies.

`npm run test:network-edges` checks selectable relationships, direct/transitive source details, problem transfer types, keyboard and touch selection, independent panel scrolling, preserved dragging/wheel controls, accessibility and offline use.

`npm run test:performance` uses `ATLAS_PLAYWRIGHT` and `ATLAS_BROWSER` to benchmark loading, filters, search and tab changes at desktop/mobile widths. It starts its own local server and writes `qa/performance-current.json`. Timings include MathJax completion and two animation frames; compare runs on the same machine/browser. Optional arguments are a static directory, report path and label, for example `npm run test:performance -- /path/to/dist /tmp/timing.json candidate`.

`scripts/scale-browser-qa.cjs` checks proportional type/control sizes, the available page width, all views across compact to ultrawide screens, long formulas, four-result comparisons, graph interactions and the screen/print scale transition.

With the same environment variables, `npm run test:overflow` checks every reference cell, the explorer matrix, all reduction recipes and applications, long-formula result/comparison dialogs, keyboard scrolling, resizing and print containment. It writes `qa/overflow-report.json`. Wide formulas scroll within their own cells rather than overlapping adjacent content.

Use your installed Chrome path for `ATLAS_BROWSER`. The suite starts its own temporary local server and an isolated headless browser, then closes both. It writes screenshots and a JSON report into `qa/`, outside the deployed site. It needs permission to bind a loopback port and launch Chrome; it does not require restarting Codex or configuring an MCP server. Automated accessibility checks complement manual review and do not certify full WCAG compliance.

The supplied bibliography PDF and TeX source were downloaded into `research/` for local reference. These original source archives are ignored by Git and not included in the deployed site.

## MathJax distribution

`dist/vendor/mathjax/tex-svg.js` is the unmodified `tex-mml-svg-mathjax-tex.js` combined bundle from `@mathjax/mathjax-tex-font@4.1.3`. Its SVG glyphs are included, so no font CDN is required. See the adjacent Apache 2.0 license and upstream notice. Formula text remains accessible through ARIA labels; the optional MathJax speech-worker and menu features are disabled to keep this distribution self-contained.
