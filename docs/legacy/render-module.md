# Legacy `src/render` Module — Reading Guide

The **full technical analysis** (55 files, ~3,466 LOC, every external import traced) is in
[render-module-analysis.md](render-module-analysis.md). This page is a short guide to it
and to the source itself.

## Read the source directly

Location: `/home/mahdirazaqi/Projects/qtical-backend-node/src/render`

```
render/
├── render.module.ts
├── template/   template.service.ts, template.resolver.ts, schema/{template,template-asset}.schema.ts
├── job/        job.service.ts (core, ~588 LOC), job.controller.ts (worker REST),
│               job.resolver.ts, schema/{job,job-asset}.schema.ts, schema/job.enum.ts
├── file/       file.service.ts, file.controller.ts, schema/file.schema.ts
└── telegrambot/ telegrambot.service.ts (~650 LOC), telegrambot.update.ts,
                 telegrambot.guard.ts, telegrambot.dataset.ts, telegrambot-job.dataset.ts,
                 telegrambot.constant.ts
```

For **security- or correctness-sensitive** work, open the actual file — do not rely on
summaries.

## Analysis document — section index

| § | Topic |
|---|---|
| 0 | TL;DR — the module is a *control plane*, not a renderer |
| 1 | Complete file inventory + dead-code status |
| 2 | NestJS component inventory, guards, DI |
| 3 | Data models — `Template`, `TemplateAsset`, `Job`, `JobAsset`, `File`, enums |
| 4 | Relationships (and the lack of real FKs on job→file) |
| 5 | DTOs and the fact that `class-validator` decorators are **not wired to run** |
| 6 | Every REST + GraphQL endpoint, with auth status |
| 7 | Service logic, method by method (`JobService`, `TemplateService`, `FileService`, `TelegrambotService`) |
| 8 | End-to-end execution flows (create→render→deliver, Telegram, retry, cancel) |
| 9 | Database interaction patterns (no transactions, N+1-adjacent, sequential count) |
| 10 | External services (Mongo, Redis, ffmpeg, ImageMagick, Telegram, YouTube, disk) |
| 11 | Environment variables |
| 12 | Queues / events / async |
| 13 | The rendering lifecycle as implemented (post-processing only) |
| 14 | Error handling (swallowed / unhandled) |
| 15 | Authentication & authorization per surface |
| 16 | Constants / magic numbers (cap = 3, retry = 3 days, screenshot at 4s, …) |
| 17 | Dependency graph |
| 18 | **Business rules — explicit statements** (18 of them) |
| 19 | **Hidden / implicit behavior** |
| 20 / 22 | **Potential problems / technical debt** (Critical → Low) |
| 21 / 23 | Testing (there is none) / source-of-truth classification |
| 24 | Final architecture summary |

## How Studio uses this

- §18 (business rules) and §19 (implicit behavior) → the "keep / change / drop" decisions
  in [compatibility-matrix.md](compatibility-matrix.md).
- §20/§22 (problems) → [known-issues.md](known-issues.md) (the K-numbered list Studio must
  not reproduce).
- §3–§8 (models & flows) → the Studio [domain/](../domain/) pages, each with a
  "Part A — Legacy" section mirroring the analysis.
