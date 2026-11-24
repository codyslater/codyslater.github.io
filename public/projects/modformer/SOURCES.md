# ModFormer project page — public sources and number trace

Gathered 20261124. Everything here is public; nothing comes from the manuscript draft or the
figure canvas.

## Sources used

| Source | URL | Status |
|---|---|---|
| Code repo | https://github.com/nygctech/ModFormer | public (README, CLI.md, assets, notebooks) |
| Weights | https://doi.org/10.5281/zenodo.24300574 | public, CC BY-NC 4.0, published 2026-11-17 |
| Data and figure source tables | https://doi.org/10.5281/zenodo.24300820 | public, CC BY-NC 4.0, published 2026-11-17 |
| AI x Biology Summit agenda | https://aisummit2026.nygenome.org/agenda | public listing, Oct 21 2026, no abstract or recording |
| CS's RNA essay | /writing/2025-05-12-rna-and-neural-computation/ | on the site |

## Not found as public (do not cite)

- bioRxiv preprint: no DOI, no Europe PMC hit, no Crossref hit as of 20261124. The repo cites it
  as "bioRxiv (2026)" with no link. Page therefore carries no paper link.
- AGBT 2027 program or abstract: not posted yet.
- "Grounding RNA prediction models in structure and function" (Irving Institute, Oct 2026): no
  public listing.
- NYGC news page, poster or social post about ModFormer: none found.
- GEO GSE355083 (named in the Zenodo data description): the accession page was behind a captcha
  when checked, so its public status is unconfirmed. Not linked from the page.

## Numbers on the page and where each comes from

All from the public figure source tables in `figure_source_data.zip` of Zenodo record 24300820.

| Number on page | Table | Row |
|---|---|---|
| Benchmark AUCs and site counts (Alu 729, InoDREAM 17,956, invertebrates 1,678, mouse 21,667) | `extended_data/ed1b_auc_by_benchmark.csv` | one row per method and benchmark |
| Mean AUC across the four benchmarks (ModFormer 0.9198, AdarEdit 0.7726) | `extended_data/ed1c_auc_summary.csv` | `mean_auc` |
| ModFormer worst benchmark 0.832 (invertebrates) | `extended_data/ed1c_auc_summary.csv` | `worst_auc` |
| Zero-shot vs fine-tuned AUC and Spearman per test set | `main/fig2_cells.csv` | `metric, test_set, model, state, value` |
| Invertebrate AUC 0.748 to 0.819; Spearman 0.479 to 0.657 | `main/fig2_cells.csv` | ModFormer, invertebrates |
| Neuro-2a zero-shot AUC 0.961 | `main/fig2_cells.csv` | ModFormer, Neuro-2a, zero-shot |
| Eight fine-tuning sources | `extended_data/ed2b_finetune_mix.csv` | eight rows |
| Training-set sizes and splits | `extended_data/ed2a_datasets.csv` | per dataset |

Architecture facts (RiNALMo embedding, ViennaRNA folding, 64-nt anchor plus pairing partner,
24 Pairformer blocks, the two output columns, seed 1313, licenses) all come from the repo README
and CLI.md.

## Media in this folder

Derived from the repo's own public assets with ffmpeg (`cover.gif`, `cli_demo.gif`, `fig2-4.png`,
`logo.svg`). The figure PNGs are white-background, so they need a light card on the dark theme.
