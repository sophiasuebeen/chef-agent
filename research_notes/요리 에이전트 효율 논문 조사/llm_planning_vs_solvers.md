# LLM direct planning vs solver, planner, and verifier-loop architectures (notes as of 2026-11-06)

Reading conventions for all sections:
- Status tags: **[PR]** = peer-reviewed venue confirmed from arXiv metadata, proceedings, or ACL Anthology. **[PP]** = preprint, no venue located. **[UV]** = venue believed but not confirmed in this session.
- Numbers were taken from arXiv full text unless marked "search summary" (not read in the primary paper). arXiv HTML tables were flattened during extraction, so row or column labels I had to infer are marked "(labels inferred)".
- "Direct" means the LLM writes the plan. "Formalizer" means the LLM writes PDDL, SMT, or CP code and a solver finds the plan. "Verifier loop" means the LLM writes the plan and an external checker sends errors back.
- Dollar costs reflect API prices at each paper's date and do not transfer to today's prices.

## What are direct-LLM success rates on TravelPlanner, NATURAL PLAN, PlanBench, Blocksworld, and similar benchmarks, and how have newer reasoning models changed them?

### Takeaway
Reasoning models changed the picture sharply for classical PDDL planning: Gemini 3.1 Pro now out-solves the best classical baseline on satisficing coverage (245 vs 234 of 360). They did not do the same for multi-constraint natural-language planning, where the best recent TravelPlanner figures are about 11-43% depending on mode. Direct planning still has no correctness guarantee, stays far slower than a planner, and degrades with problem size on most benchmarks.

### Cited Findings

**Classical planning (PlanBench, Blocksworld, IPC)**

| Model (date) | Benchmark | Result | Source |
|---|---|---|---|
| GPT-4 (2023) | PlanBench Blocksworld | 206-214/600 (~34-36%) across prompt rows (labels inferred); later cited as 35% | [Valmeekam 2023](https://arxiv.org/abs/2305.15771); [Zuo 2024](https://arxiv.org/abs/2407.03321) |
| LLaMA 3.1 405B (2024) | Blocksworld zero-shot | 376/600 (62.6%, labels inferred; the companion paper's text says 62.5%), with performance described as dismal on obfuscated Mystery | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162); [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| o1-preview (Sep 2024) | Blocksworld zero-shot | 587/600 (97.8%), 40.43 s average | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| o1-mini (Sep 2024) | Blocksworld zero-shot | 340/600 (56.6%), 10.84 s average | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| o1-preview | Mystery / Randomized Mystery | 317/600 (52.8%), 83.37 s / 224/600 (37.3%), 111.11 s | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| o1-preview | Blocksworld, 110 instances with 20-40 step optimal plans | 23.63% | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| o1-preview / o1-mini | 55 Sokoban PDDL instances | 12.7% / 10.9% | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |
| Fast Downward (reference) | Same 600-instance sets | 600/600, 0.265 s average | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| Claude Haiku 4.5 (2026) | 102 IPC Blocksworld, 180 s budget | Direct 63.7%; step-wise agentic 66.7%; Fast Downward 85.3% (run once each) | [Göbel 2026](https://arxiv.org/abs/2603.06064) |

- Frontier coverage on 360 fresh IPC 2023 Learning Track tasks in 8 domains, validated with VAL, standard / obfuscated solved: Gemini 3.1 Pro 245 / 231, Gemini 3 Pro 233 / 203, GPT-5 205 / 152, DeepSeek-R1 157 / 93, GPT-4.1 20 / 0. Baselines on standard tasks: LAMA 204, DecStar 227, Scorpion Maidu 234 — [Corrêa 2026 v2](https://arxiv.org/abs/2511.09378).
- That result covers satisficing plans only. The authors state classical planners keep a decisive advantage on optimal planning, and that Gemini 3.1 Pro often identifies obfuscated domains from structure, which is a possible leakage route. The prompt also supplies PDDL domain and task files, two worked examples, and a pitfalls checklist — [Corrêa 2026 v2](https://arxiv.org/abs/2511.09378).
- Version discrepancy: a search summary of v1 lists Gemini 2.5 Pro at 155 standard tasks, while v2 lists 161 — [v1](https://arxiv.org/abs/2511.09378v1); [v2](https://arxiv.org/abs/2511.09378). Cite the version explicitly.
- Counter-evidence on horizon: SokoBench reports consistent degradation beyond 25 moves for reasoning models (DeepSeek R1, GPT-5 family, gpt-oss-120b), attributed by the authors to a counting and state-tracking weakness, as a hypothesis rather than a proof — [Monti 2026](https://arxiv.org/abs/2601.20856). Shojaee et al. report "complete accuracy collapse beyond certain complexities" on controlled puzzles — [Shojaee 2025](https://arxiv.org/abs/2506.06941). These conflict in tone with Corrêa 2026, which reports valid plans of over 200 steps. Domains and prompts differ.
- Resolved conflict: a figure of "10-12% for o1-preview" appears in [Monti 2026](https://arxiv.org/abs/2601.20856) and can look as though it contradicts the 97.8% Blocksworld result. It is the Sokoban result (12.7% / 10.9%), not Blocksworld — [Valmeekam 2024b](https://arxiv.org/abs/2410.02162). Monti also describes the LLM-Modulo component as an "external planner", while the source paper describes a verifier loop.
- Unsolvable problems: o1-preview on Randomized Mystery correctly flagged 16% of unsolvable cases, returned an empty plan in 5%, and answered with an invalid plan in 79% — [Valmeekam 2024a](https://arxiv.org/abs/2409.13373).
- Small-sample independent check: o1-preview had the highest feasible rate across domains in a small study; a search summary gives 100% / 60% / 40% for o1-preview, o1-mini, and GPT-4 on Blocksworld — [Wang 2024](https://arxiv.org/abs/2409.19924) (exact figures not re-read).
- Chain-of-thought does not generalize beyond a handful of blocks on GPT-4-era models unless prompts are highly problem-specific — [Stechly 2024](https://arxiv.org/abs/2405.04776). This is older evidence and predates inference-time reasoning.

**TravelPlanner (final pass rate, all constraints met). Do not compare across the "mode" column.**

| Model | Mode | Final pass | Source |
|---|---|---|---|
| GPT-4 | Tool-use, TwoStage, validation | 0.6% | [Xie 2024](https://arxiv.org/abs/2402.01622) |
| GPT-4-Turbo | Sole-planning, direct, validation (180) | 4.4% | [Gundawar 2024a](https://arxiv.org/abs/2405.20625); [Hao 2024](https://arxiv.org/abs/2404.11891) |
| GPT-4o / Claude 3.5 Sonnet / GPT-4o-mini | Sole-planning, direct | 8.33% / 4.44% / 2.78% | [Gundawar 2024b](https://arxiv.org/abs/2411.14484) |
| o1-preview | Sole-planning, 1-pass | 10.0% in one study, 11.7% in another | [Hao 2024](https://arxiv.org/abs/2404.11891); [Lee 2025](https://arxiv.org/abs/2501.09891) |
| DeepSeek-R1-671B | Reported as sole-planning comparator | 40% (cited in a paper promoting its own method; not independently verified) | [Zhang 2025](https://arxiv.org/abs/2510.14406) |
| o3 (high) / GPT-5 | Tool-use, official 1,000-query test split | 11.3% / 21.2% | [Zhu 2025](https://arxiv.org/abs/2509.25779) |
| Gemini 3 Pro Low | Plan generation from oracle information, minimal / moderate / rich context | 32% / 42% / 43% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |
| Gemini 3 Pro High | Same | 34% / 42% / 35% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |
| DeepSeek V3.2 | Same | 27% / 24% / 25% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |
| Claude Sonnet 4.5 | Same | 23% / 26% / 21% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |
| Qwen3 Max | Same | 21% / 17% / 19% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |
| GPT-5.2 | Same | 13% / 18% / 20% | [Zhang 2026](https://arxiv.org/abs/2605.03308) |

- [Zhang 2026](https://arxiv.org/abs/2605.03308) tests plan generation mainly in non-reasoning or low-reasoning modes, so its GPT-5.2 and Claude figures are not reasoning-model ceilings. The same paper finds extraction near-saturated on TravelPlanner (Gemini 3 Pro F1 0.98, Exact Match 0.88). Its harder TripCraft benchmark falls to 1-15% in plan generation.
- Secondary conflict: a news report gives GPT-4o 7.8% and o1-preview 15.6%, which I did not trace to a primary table — [The Decoder](https://the-decoder.com/?p=18213).

**NATURAL PLAN**

| Model | Trip | Meeting | Calendar | Source |
|---|---|---|---|---|
| GPT-3.5 (5-shot, 2024) | 7.3% | 19.1% | 19.9% | [Zheng 2024](https://arxiv.org/abs/2406.04520) |
| GPT-4 | 31.1% | 47.0% | 41.2% | [Zheng 2024](https://arxiv.org/abs/2406.04520) |
| GPT-4o | 3.7% | 45.2% | 43.7% | [Zheng 2024](https://arxiv.org/abs/2406.04520) |
| Gemini 1.5 Flash | 25.6% | 23.9% | 34.3% | [Zheng 2024](https://arxiv.org/abs/2406.04520) |
| Gemini 1.5 Pro | 34.8% | 39.1% | 48.9% | [Zheng 2024](https://arxiv.org/abs/2406.04520) |
| o1-preview (1-pass) | 36.2% | 44.2% | not in this table | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| o1-mini | - | - | 94% | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |

- All models fall below 5% at 10-city trip planning — [Zheng 2024](https://arxiv.org/abs/2406.04520). o1-preview gets 4% on the 10-city set — [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) (labels inferred).
- For DeepSeek-R1, Qwen3-32B, o3-mini-high, and GPT-5, calendar scheduling is described as the easiest and saturated domain, and these models fail quickly with complexity elsewhere. Exact values appear only in figures — [Amonkar 2025](https://arxiv.org/abs/2505.13252).

**Cooking and asynchronous tasks (closest to the kitchen)**
- Robotouille (grounded kitchen simulator): GPT-4o ReAct reached 47% on synchronous and 11% on asynchronous tasks. Only 9.1% of asynchronous successes were optimal, versus 55.3% of synchronous successes — [Gonzalez-Pumariega 2025](https://arxiv.org/abs/2502.05227).
- On the same Robotouille tasks in 2026, direct generation with Gemini-3-Flash, GPT-5-mini, DeepSeek-V4-Flash, and Qwen3.6-35B scored 0.0% simulator success, largely from low-level navigation and state bookkeeping — [Zhang 2026b](https://arxiv.org/abs/2606.00981).
- ParaCook (Overcooked-inspired, multi-agent, parallel cooking): GPT-5 averaged 65.0% (Easy 80.8, Medium 69.2, Hard 45.0). Gemini-2.5-Pro got 47.4%, DeepSeek-V3.2-Exp 45.3%, Claude-Opus-4.1 13.1%, Qwen3 2.2%. Humans had perfect success. On abstracted planning tasks, top LLMs were within 1-7% of optimum — [Zhang 2025b](https://arxiv.org/abs/2510.11608).
- AsyncHow (GPT-4, LLaMA-2 era): LLMs did poorly without illustrations of the task-solving process and degraded drastically with complexity, even with graph prompting (PLaG) — [Lin 2024](https://arxiv.org/abs/2402.02805).

### Inferences
- Reasoning model gains are large where the domain is clean and formal, and much smaller where the task mixes many soft and arithmetic constraints. This reading is mine and is not a controlled test.
- The 2024 "LLMs cannot plan" results are outdated as statements about frontier models on classical domains. They remain informative on verification, guarantees, and cost.
- For a kitchen, the abstraction level looks more important than the model: the same model family moves from 0% on Robotouille to high accuracy on abstracted task graphs ([Zhang 2026b](https://arxiv.org/abs/2606.00981)). Those benchmarks differ, so this is suggestive only.

### Gaps
- I found no single table running o3, GPT-5.x, Claude Opus 4.x, and Gemini 3.x on TravelPlanner sole-planning under one protocol. Figures for those models in the table use different modes.
- I found no primary NATURAL PLAN numeric table for GPT-5.x or Gemini 3.x; [Amonkar 2025](https://arxiv.org/abs/2505.13252) reports figures only.
- Non-comparable metrics: TravelPlanner tool-use vs sole-planning vs oracle context; NATURAL PLAN 5-shot vs later prompts; PlanBench static instances vs fresh IPC tasks; coverage vs optimal plan accuracy.

### Sources
- Xie, Zhang, Chen, Zhu, Lou, Tian, Xiao, Su. *TravelPlanner*. ICML 2024 [PR]. https://arxiv.org/abs/2402.01622
- Zheng, Mishra, Zhang, Chen, et al. *NATURAL PLAN*. 2024, arXiv:2406.04520 [PP]. https://arxiv.org/abs/2406.04520
- Valmeekam, Marquez, Olmo, Sreedharan, et al. *PlanBench*. NeurIPS 2023 D&B [PR]. https://arxiv.org/abs/2206.10498
- Valmeekam, Marquez, Sreedharan, Kambhampati. *On the Planning Abilities of LLMs*. NeurIPS 2023 [PR]. https://arxiv.org/abs/2305.15771
- Valmeekam, Stechly, Kambhampati. *LLMs Still Can't Plan; Can LRMs?* 2024, arXiv:2409.13373 [PP]. https://arxiv.org/abs/2409.13373
- Valmeekam, Stechly, Gundawar, Kambhampati. *Planning in Strawberry Fields*. 2024, arXiv:2410.02162 [PP; Monti 2026 cites a 2025 version, venue not confirmed]. https://arxiv.org/abs/2410.02162
- Corrêa, Pereira, Seipp. *Frontier LLMs Rival State-of-the-Art Planners* (v1 title: *The 2025 Planning Performance of Frontier LLMs*). 2025-26, arXiv:2511.09378 [PP]. https://arxiv.org/abs/2511.09378
- Göbel, Lorang, Zips, Glück. *Agentic LLM Planning via Step-Wise PDDL Simulation*. 2026, arXiv:2603.06064 [PP]. https://arxiv.org/abs/2603.06064
- Monti, Nicolini, Pellegrini, Staiano, Lepri. *SokoBench*. 2026, arXiv:2601.20856 [PP]. https://arxiv.org/abs/2601.20856
- Shojaee, Mirzadeh, Alizadeh, Horton, Bengio, Farajtabar. *The Illusion of Thinking*. NeurIPS 2025 [PR]. https://arxiv.org/abs/2506.06941
- Wang, Li, Bhatt, Xi, et al. *On the Planning Abilities of OpenAI's o1 Models*. 2024, arXiv:2409.19924 [PP]. https://arxiv.org/abs/2409.19924
- Stechly, Valmeekam, Kambhampati. *Chain of Thoughtlessness?* NeurIPS 2024 [PR]. https://arxiv.org/abs/2405.04776
- Zhu, Jiang, Sang, Tang, et al. *Planner-R1*. 2025, arXiv:2509.25779 [PP]. https://arxiv.org/abs/2509.25779
- Zhang, Wang, Xiao, Li, et al. *IMAGINE*. 2025, arXiv:2510.14406 [PP]. https://arxiv.org/abs/2510.14406
- Zhang, Ye, Hua, Cao, Shao, Li, Guo. *Revisiting the Travel Planning Capabilities of LLMs*. 2026, arXiv:2605.03308 [PP]. https://arxiv.org/abs/2605.03308
- Gonzalez-Pumariega, Yean, Sunkara, Choudhury. *Robotouille*. ICLR 2025 [PR]. https://arxiv.org/abs/2502.05227
- Zhang (Shiqi), Ma, Xu, Cao, et al. *ParaCook*. 2025, arXiv:2510.11608 [PP]. https://arxiv.org/abs/2510.11608
- Lin, La Malfa, Hofmann, Yang, Cohn, Pierrehumbert. *Graph-enhanced LLMs in Asynchronous Plan Reasoning*. ICML 2024 [PR, per arXiv comment]. https://arxiv.org/abs/2402.02805

## How much do formalizers and solver hand-offs improve results, and where do they fail?

### Takeaway
Solver hand-offs give large gains over direct planning when the schema is templated or the target interface is easy to write. TravelPlanner goes from 4-10% direct to about 93% with SMT, and asynchronous cooking-style tasks reach 94% with CP-SAT against 81.7% direct. With 2025-26 reasoning models the advantage is no longer automatic: formalizers lost to direct solving in most model-dataset pairs in one direct comparison. The choice of target language and the use of an intermediate representation can matter as much as the model, and the main failure is silently wrong constraints, not syntax.

### Cited Findings

**Most relevant head-to-head: async planning with shared resources (2026)** — all from [Zhang 2026b](https://arxiv.org/abs/2606.00981) [PP]

| Setting | Direct planner | PDDL2.1 + OPTIC | CP-SAT |
|---|---|---|---|
| AsyncPlan-XXL, average plan accuracy | 81.7% | 30.8% | 94.0% |
| AsyncPlan-XXL, 5 actions | 97.5% | weakest throughout | 93.5% |
| AsyncPlan-XXL, 100 actions | 44.5% | 9.0% | 82.5% |
| Robo Challenge (140 cooking-themed tasks), offline | ~50% | ~50% | >96% on every split |
| Online Robo Challenge (mid-execution events), one-shot | 20.2% | 0.4% | 41.6% |
| Same, state-aware repair of affected constraints | - | - | 81.6% (CI 78.8-84.1) |
| Original Robotouille, simulator success | 0.0% | 10.0% | 0.0% |

- Models: Gemini-3-Flash, GPT-5-mini, DeepSeek-V4-Flash, Qwen3.6-35B. Plan accuracy requires gold coverage, durations, precedence, and optimal makespan.
- At 5 actions the direct planner beats CP-SAT; the crossover comes with scale. At 100 actions the direct planner ranges from about 80% to about 10% across models, while CP-SAT stays above 90% for three of four.
- A stronger model closes the gap: GPT-5.6 Sol reaches 98.0% as planner, 98.0% with CP-SAT, and 93.2% with PDDL2.1. CP-SAT already lifts Gemini-3-Flash and DeepSeek-V4-Flash to about 97%.
- Writing the formal language is the main loss for PDDL2.1: 34.7% of outputs are unparsable and only 16.7% of specifications verify, against 93.9% for CP-SAT and 79.1% for planner outputs.
- With a model-extracted task graph compiled deterministically, PDDL2.1 and CP-SAT reach 81.6% and 81.5%. With gold graphs, both reach 100%. Graph extraction is the shared remaining bottleneck.
- Online repair: one-shot accuracy ranges from almost nothing to about 70% across models, while repair stays within about two points across models.
- Authors' caveats: benchmarks are controlled and synthetic, with clean identifiers.

**Formalizer pipelines vs direct on planning**

| Work (models) | Benchmark | Direct | Solver hand-off | Source |
|---|---|---|---|---|
| Hao 2024 (GPT-4, Claude 3 Opus, Mistral-Large) | TravelPlanner | GPT-4 4.4%, o1-preview 10.0% | Claude 3 93.3% validation, best 93.9% test; Mistral-Large 66.7% | [Hao 2024](https://arxiv.org/abs/2404.11891) |
| LLMFP (GPT-4o, Claude 3.5 Sonnet) | 9 planning domains, optimal rate | best baseline direct o1-preview | 83.7% / 86.8%, reported as +37.6% / +40.7% over it | [Hao 2024b](https://arxiv.org/abs/2410.12112) |
| LLM+P (GPT-4, 2023) | Blocksworld | 15 (30) | 90 | [Liu 2023](https://arxiv.org/abs/2304.11477) |
| LLM+P | Grippers | 35 (50) | 95 (100) | [Liu 2023](https://arxiv.org/abs/2304.11477) |
| LLM+P | Storage | 0 (25) | 85 | [Liu 2023](https://arxiv.org/abs/2304.11477) |
| LLM+P | Barman / Termes / Floortile | 0 / 0 / 0 | 20 (100) / 20 / 0 | [Liu 2023](https://arxiv.org/abs/2304.11477) |
| NeSy agent (DeepSeek) | ChinaTravel, three subsets | about 1/10 on human queries | 52.6% / 37.0% / 23.3% | [Shao 2024](https://arxiv.org/abs/2412.13682) |

- LLM+P parentheses are printed in Table I; I did not confirm whether they mean feasible vs optimal. LLM+P assumes human-provided domain PDDL and in-context examples, and its failures are mostly mis-specified problem files such as missing initial conditions — [Liu 2023](https://arxiv.org/abs/2304.11477).
- On unsatisfiable queries, Hao's SMT framework repairs 81.6% and 91.7% across two datasets, which direct and verifier approaches do not naturally provide — [Hao 2024](https://arxiv.org/abs/2404.11891).
- ChinaTravel cites Hao's result as 97% against 4% LLM-only, whereas the current Hao abstract says 93.9%. This is probably a version difference, which I did not confirm — [Shao 2024](https://arxiv.org/abs/2412.13682); [Hao 2024](https://arxiv.org/abs/2404.11891). The move from templated to human queries is what cuts accuracy.
- LLMFP: PDDL code-generation baselines "almost always" failed on multi-step tasks, and SMT was unstable across models, with Claude gaining 18.2% while GPT-4o performed poorly. On Mystery Blocksworld LLMFP stayed at 77.7% (GPT-4o) and 98.0% (Claude) — [Hao 2024b](https://arxiv.org/abs/2410.12112).

**Where formalizers lose or fail**
- Amonkar et al. tested 6 LLMs on 4 domains and found the formalizer underperformed direct solving in 15 of 24 model-dataset combinations per the abstract. The body says 12 of 16 for reasoning models and 4 of 8 for non-reasoning models, which sums to 16, so the two statements do not match. Trip Planning formalizers consistently underperformed direct — [Amonkar 2025](https://arxiv.org/abs/2505.13252).
- In the same study, formalizer accuracy on the top 20% most constrained problems was less than half of the 20% least constrained in 10 of 12 combinations. 95% of Qwen3's semantic errors came from wrongly defined constraints. Reasoning chains frequently "reason like a solver", with less than 75% (Qwen3) and less than 50% (DeepSeek-R1) primarily code-related, and some programs hard-coded the answer, which defeats verifiability — [Amonkar 2025](https://arxiv.org/abs/2505.13252).
- Huang & Zhang: strong models (GPT-4o, o3-mini, DeepSeek-R1) can formalize entire PDDL, Gemma-2 and Llama-3.1 cannot; formalizers often win "though not always"; natural-sounding descriptions hurt; syntax errors hit weak models, semantic errors hit all — [Huang 2024](https://arxiv.org/abs/2412.09879).
- Kagitha et al. (QwQ-32B, Qwen3-32B, gpt-oss-120b, GLM-4.5-Air): single-generation direct vs PDDL has no clear winner (3 vs 5 of 8). Multi-stage pipelines with intermediate representations and revision were best in 6 of 8. Constrained decoding was hit or miss (38 vs 36% on Blocksworld, zero on Logistics). Direct performance halves at about 20 blocks and hits zero near 50, while direct PDDL generation loses no more than about 20% — [Kagitha 2025](https://arxiv.org/abs/2505.14763).
- Silent errors: of GPT-4o PDDL outputs, 96.1% parse and 94.4% are solvable, but only 24.8% are semantically correct. A solver or validator alone would pass most wrong outputs — [Zuo 2024](https://arxiv.org/abs/2407.03321).
- SokoBench: giving LRMs PDDL tools with a fixed expert domain gives only modest gains, and only GPT-5-mini worked reliably. Others had limited tool ability, incoherent PDDL, or failed to stop calling tools — [Monti 2026](https://arxiv.org/abs/2601.20856).
- Logic solvers: Logic-LM reported +39.2% over standard prompting and +18.4% over CoT on 5 datasets — [Pan 2023](https://arxiv.org/abs/2305.12295). SatLM reported +23% over program-aided LMs on GSM-Sys, 84.8% on GSM with self-consistency, and new best results on LSAT and BoardgameQA, and it can abstain on unsat or ambiguous specs — [Ye 2023](https://arxiv.org/abs/2305.09656). Both use 2023-era models. Newer testing is mixed: SMT autoformalization gave +34.8% on ProofWriter but -44.5% on FOLIO across o3-mini, DeepSeek-R1, DeepSeek-v3, and Gemini Flash 2.0 and Lite — [Ganguly 2025](https://arxiv.org/abs/2505.20047).

**Verifier loops (LLM-Modulo and evolutionary search)**

| Model | Benchmark | Direct | After loop | Source |
|---|---|---|---|---|
| GPT-3.5-Turbo | TravelPlanner | 0% | 5%, max 10 iterations | [Gundawar 2024a](https://arxiv.org/abs/2405.20625) |
| GPT-4-Turbo | TravelPlanner | 4.4% | 20.6% | [Gundawar 2024a](https://arxiv.org/abs/2405.20625) |
| GPT-4o | TravelPlanner / Trip / Meeting / Calendar | 8.33 / 3.43 / 49.1 / 56.1% | 23.89 / 40.0 / 59.8 / 83.3% | [Gundawar 2024b](https://arxiv.org/abs/2411.14484) |
| Claude 3.5 Sonnet | Same | 4.44 / 39.43 / 57.1 / 72.9% | 25.0 / 47.0 / 69.5 / 88.8% | [Gundawar 2024b](https://arxiv.org/abs/2411.14484) |
| GPT-4o-mini | Same | 2.78 / 6.18 / 32.8 / 36.9% | 15.0 / 12.06 / 51.9 / 61.6% | [Gundawar 2024b](https://arxiv.org/abs/2411.14484) |
| o1-preview | Blocksworld 20+ steps / Sokoban / TravelPlanner / 10-city Trip | 23.63 / 12.7 / 10 / 4% | 98.2 / 43.6 / 65 / 15.5% | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |
| o1-mini | TravelPlanner / 10-city Trip | 1.67 / 1% | 41.11 / 3.5% | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) (labels inferred) |
| Gemini 1.5 Flash, Mind Evolution | TravelPlanner / Trip / Meeting (val) | 5.6 / 20.6 / 20.8% | 95.6 / 96.2 / 85.0% | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Flash + Pro fallback, Mind Evolution | TravelPlanner / Trip / Meeting (test) | - | 99.9 / 99.6 / 98.2% | [Lee 2025](https://arxiv.org/abs/2501.09891) |

- Mind Evolution uses no formal solver but requires a programmatic solution evaluator — [Lee 2025](https://arxiv.org/abs/2501.09891). Its results are the strongest evidence that a good verifier plus search can compete with a solver hand-off.
- The checker must be external. Self-critique does not substitute: LLMs did not reliably self-verify on reasoning and planning tasks in GPT-4-era work — [Stechly 2024b](https://arxiv.org/abs/2402.08115). Critic subsets also matter: with GPT-3.5, all critics gave 5% vs 1.1% for JSON-only — [Gundawar 2024a](https://arxiv.org/abs/2405.20625).
- Chain-of-thought, ReAct, and Reflexion on TravelPlanner with GPT-3.5-Turbo reach only 0%, 0.6%, and 0% — [Gundawar 2024a](https://arxiv.org/abs/2405.20625).

**CP, MiniZinc, and OR generation benchmarks (metric is correct model or solution, not plan feasibility)**
- DCP-Bench-Open (164 problems, models including gpt-5.1-2025-11-13, gpt-oss-120b, DeepSeek-V3.2, Qwen3-Coder, Kimi-K2): zero-shot peak by interface was MiniZinc 57.3% (Qwen3-Coder), CPMpy about 70.1% (gpt-5.1, DeepSeek-V3.2), OR-Tools 75.0% (gpt-oss-120b), 71.3% (gpt-5.1). Sampling (k=10) with self-verification (up to 10 iterations) reached up to 91% with gpt-5.1, where 13 of 15 remaining failures were modelling errors. On hidden instances for a 23-problem subset, gpt-5.1 falls from 78.3% single-instance to 60.9% multi-instance. Self-verification effects on modelling errors were mixed; Kimi's nearly doubled — [Michailidis 2025](https://arxiv.org/abs/2506.06052).
- That paper's v3 supersedes the earlier CP-Bench figures (about 65% Python, about 50% MiniZinc, 70% best), which appear in older summaries — [Michailidis 2025](https://arxiv.org/abs/2506.06052).
- Text2Zinc (GPT-4): basic prompting gave 19.04% execution and 6.34% solution accuracy; best solution accuracy was 25.39% with CoT plus examples. Solution accuracy was typically 30-50% of execution accuracy — [Singirikonda 2025](https://arxiv.org/abs/2503.10642).
- ConstraintLLM (solving accuracy; Qwen2.5-Coder-32B fine-tuned, GPT-4o, DeepSeek-V3): on IndusCP (140 tasks, averaging 240.14 constraints and 101.24 variables vs 4.25 and 2.02 for NL4OPT per a search summary), GPT-4o CoT 26.5%, GPT-4o RAG 33.5%, GPT-4o with the framework minus ToT 49.8%; DeepSeek-V3 38.5 / 51.0 / 57.8%; ConstraintLLM-32B with ToT 51.3%. On NL4OPT, the same system reaches 99.26% and CoT baselines 82-85% — [Shi 2025](https://arxiv.org/abs/2510.05774). Non-reasoning models only; authors' claims of 2x are unreplicated.
- NL4Opt competition (2022): top sub-task 1 F1 0.939 and sub-task 2 accuracy about 0.899 (second figure inferred from table order) — [Ramamonjison 2023](https://arxiv.org/abs/2303.08233).
- OptiMUS (GPT-4): 78.8% NL4OPT, 66.7% ComplexOR, 72.0% NLP4LP, reported as beating Chain-of-Experts — [AhmadiTeshnizi 2024](https://arxiv.org/abs/2402.10172).
- OptiMUS-0.3 (2026 revision), NLP4LP Easy / Hard / case studies / IndustryOR: standard o3 62.7 / 42.4 / 28.6 / 44.0; OptiMUS GPT-4o 78.2 / 38.5 / 42.9 / 37.0; OptiMUS o3 79.9 / 75.4 / 28.6 / 46.0; ORLM fine-tune 85.7 / 72.9 / 0.0 / 38.0; o3 standard on NL4OPT is 97.3%. The authors conclude architecture matters more than model — [AhmadiTeshnizi 2024b](https://arxiv.org/abs/2407.19633). However, o3 with and without the framework ties on case studies at 28.6%, on only seven instances.
- Benchmark cleaning shifts these results: Opt-Verifier reports OptiMUS on cleaned sets at 76.2 NL4Opt, 46.8 ComplexOR, 45.2 IndustryOR (search summary) — [Opt-Verifier](https://arxiv.org/abs/2605.29556).
- Direct vs code on this benchmark family: ConstraintBench states existing benchmarks mainly test solver-code generation, and it tests direct solving only, so its results are not a head-to-head — [Tso 2026](https://arxiv.org/abs/2602.22465).

### Inferences
- A plausible ranking for scheduling-shaped work is CP-SAT or Python CP API, then MiniZinc, then PDDL. Evidence: [Zhang 2026b](https://arxiv.org/abs/2606.00981) (CP-SAT far above PDDL2.1) and [Michailidis 2025](https://arxiv.org/abs/2506.06052) (Python-based above MiniZinc). These are different tasks, so the ordering is a reasonable guess and has not been tested in one study.
- Direct planning wins at small sizes on strong models; solver hand-off wins as size grows, as weaker models are used, or when constraints must hold exactly.
- Fix the output contract: having the LLM emit a small validated JSON task graph, with a deterministic compiler to CP-SAT, appears to remove most language-writing failures. Remaining errors are extraction errors, and those need a separate check.
- Solver success is not evidence of correctness; Planetarium and Amonkar both show wrong but executable models. A kitchen system should check returned schedules against a simulator, independently of the model.

### Gaps
- No study located compares all of CP-SAT generation, a verifier loop, and direct planning on the same benchmark with costs; [Zhang 2026b](https://arxiv.org/abs/2606.00981) omits a verifier-loop arm and per-task cost in the sections I read.
- Amonkar's numeric results are in figures only, and I could not extract exact percentages.
- No MiniZinc generation evidence located for Claude 4.x or Gemini 3.x under a shared protocol.
- I searched for ORQA and found no primary results. Song et al. (2026), the source of OptiMUS-0.3's o3 NL4OPT figure, was not located.

### Sources
- Zhang (Jiayi), Yin, Zhou, Zhang (Li). *Robust Asynchronous Planning via Auto-Formalization*. 2026, arXiv:2606.00981v2 [PP]. https://arxiv.org/abs/2606.00981
- Hao, Chen, Zhang, Fan. *LLMs Can Solve Real-World Planning Rigorously with Formal Verification Tools*. 2024, arXiv:2404.11891 [UV: later work cites it as 2025, venue not confirmed]. https://arxiv.org/abs/2404.11891
- Hao, Zhang, Fan. *Planning Anything with Rigor (LLMFP)*. 2024, arXiv:2410.12112 [UV]. https://arxiv.org/abs/2410.12112
- Liu, Jiang, Zhang, Liu, Zhang, Biswas, Stone. *LLM+P*. 2023, arXiv:2304.11477 [UV]. https://arxiv.org/abs/2304.11477
- Shao, Zhang, Yang, Chen, et al. *ChinaTravel*. ICLR 2026 [PR, per arXiv comment]. https://arxiv.org/abs/2412.13682
- Amonkar, Kayan, Lai, Le Bras, Zhang. *A Reality Check of Language Models as Formalizers on CSPs* (v1 title: *Natural Language Planning via Coding and Inference Scaling*). 2025, arXiv:2505.13252 [PP]. https://arxiv.org/abs/2505.13252
- Huang, Zhang. *On the Limit of Language Models as Planning Formalizers*. ACL 2025 [PR]. https://arxiv.org/abs/2412.09879
- Kagitha, Sun, Desai, Zhu, et al. *Unifying Inference-Time Planning Language Generation*. 2025, arXiv:2505.14763 [PP]. https://arxiv.org/abs/2505.14763
- Zuo, Velez, Li, Littman, et al. *Planetarium*. NAACL 2025 [PR]. https://arxiv.org/abs/2407.03321
- Pan, Albalak, Wang, Wang. *Logic-LM*. 2023, arXiv:2305.12295 [UV]. https://arxiv.org/abs/2305.12295
- Ye, Chen, Dillig, Durrett. *SatLM*. 2023, arXiv:2305.09656 [UV]. https://arxiv.org/abs/2305.09656
- Ganguly, Singh, Sankar, Zhang, et al. *Grammars of Formal Uncertainty*. 2025, arXiv:2505.20047 [PP]. https://arxiv.org/abs/2505.20047
- Kambhampati, Valmeekam, Guan, Verma, et al. *LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks*. 2024, arXiv:2402.01817 [UV]. https://arxiv.org/abs/2402.01817
- Gundawar, Verma, Guan, Valmeekam, et al. *Robust Planning with LLM-Modulo: Travel Planning*. 2024, arXiv:2405.20625 [PP]. https://arxiv.org/abs/2405.20625
- Gundawar, Valmeekam, Verma, Kambhampati. *Robust Planning with Compound LLM Architectures*. 2024, arXiv:2411.14484 [PP]. https://arxiv.org/abs/2411.14484
- Lee, Fischer, Wu, Marwood, et al. *Evolving Deeper LLM Thinking (Mind Evolution)*. 2025, arXiv:2501.09891 [PP]. https://arxiv.org/abs/2501.09891
- Stechly, Valmeekam, Kambhampati. *On the Self-Verification Limitations of LLMs*. 2024, arXiv:2402.08115 [UV]. https://arxiv.org/abs/2402.08115
- Michailidis, Tsouros, Guns. *DCP-Bench-Open* (earlier: *CP-Bench*). 2025, arXiv:2506.06052v3 [under review per arXiv comment]. https://arxiv.org/abs/2506.06052
- Singirikonda, Kadioglu, Uppuluri. *Text2Zinc*. 2025, arXiv:2503.10642 [UV: AAAI 2025 materials located, track not confirmed]. https://arxiv.org/abs/2503.10642
- Shi, Liu, Zhang, Shi, et al. *ConstraintLLM*. EMNLP 2025 [PR]. https://arxiv.org/abs/2510.05774
- Ramamonjison, Yu, Li, Li, et al. *NL4Opt Competition*. 2023, arXiv:2303.08233 [UV]. https://arxiv.org/abs/2303.08233
- AhmadiTeshnizi, Gao, Udell. *OptiMUS*. ICML 2024 per a search summary [UV]. https://arxiv.org/abs/2402.10172
- AhmadiTeshnizi, Gao, Brunborg, Talaei, et al. *OptiMUS-0.3*. 2024-26, arXiv:2407.19633v4 [PP]. https://arxiv.org/abs/2407.19633
- *Opt-Verifier*. 2026, arXiv:2605.29556 [PP; only a search summary was read, authors not recorded]. https://arxiv.org/abs/2605.29556

## What do scheduling-specific LLM studies show?

### Takeaway
Direct scheduling on frontier models is now often feasible on simple job-shop instances and can be near optimal, but it stays unreliable on project scheduling, crew assignment, and larger problems, and no model exceeds about 30% joint feasibility and optimality across a broad set. Fine-tuned small LLMs beat dispatching rules but are far from solver quality. I found no paper that directly compares LLM-written CP-SAT code with direct LLM schedules on standard JSSP makespan.

### Cited Findings

**ConstraintBench: direct solving, 10 OR domains, 20 tasks each, Gurobi ground truth, 1 trial per task** — [Tso 2026](https://arxiv.org/abs/2602.22465) (v1 read; v2 exists)

| Model (reasoning high or extended thinking) | Feasible | Mean optimality if feasible | Within 0.1% of optimum, all tasks |
|---|---|---|---|
| GPT-5.2-pro | 65.0% | 95.2% | 30.5% |
| GPT-5.2 | 64.0% | 93.8% | 21.0% |
| Claude Opus 4.6 | 49.0% | 96.0% | 21.5% |
| Claude Opus 4.5 | 50.5% | 94.0% | 12.5% |
| o4-mini | 50.5% | 89.0% | 8.5% |
| Gemini 3 Pro Preview | 44.5% | 94.8% | 8.5% |

- Job shop, feasible / within 0.1% of optimum: GPT-5.2-pro 95 / 70%, GPT-5.2 80 / 40%, Opus 4.6 80 / 40%, Opus 4.5 80 / 35%, Gemini 3 Pro 65 / 5%, o4-mini 60 / 15%.
- Project planning average feasibility was 8.3%, and crew assignment 0.8%. Bin packing was 26.7%, and vehicle routing 41.7%.
- Failure modes across 4,314 violations: structural misunderstanding (duration errors), entity hallucination (nonexistent bins), specific rule failures (time windows, rest rules), and budget near-misses. Self-reported objectives were often wrong.
- Errors: 18 of 22 errors were token exhaustion, and 13 of 22 errors came from Opus 4.6, which penalizes it. Authors note a direct mode is not the recommended production approach.

**SCHEDBench: direct only, no tools, 1,132 instances, JSPLib, PSPLib, ITC-2007, INRC-I, NSPLib, CP-SAT scoring** — [Sharma 2026](https://arxiv.org/abs/2608.00991) (v1 read; v2 labeled EMNLP 2026 Findings)
- Full-variation feasibility: GPT-5.5 55.9%, Gemini 3 Flash Preview 29.5%, Qwen3.5-27B 25.0%, Qwen3.5-397B 24.3%, Qwen3.5-122B 14.3%, Claude Sonnet 4.6 12.8%; remaining models about 3.7-8.9%; average 15.2%. Tested at default inference with greedy decoding, not extended reasoning.
- GPT-5.5 falls from 84.0% on plain rendering to 61.5% under variation on a matched 470 instances. Constraint reordering shifts violation rates beyond seed noise for five models, and the authors call constraint order "a latent control variable".
- Median / mean optimality gap on feasible outputs: GPT-5.5 4.3% / 747.1%; Qwen3.5-397B 8.3% / 243.2%; Qwen3.5-27B 12.5% / 311.2%; Gemini 3 Flash 18.2% / 95.1%; Claude Opus 4.6 56.2% / 197.6%; GPT-5.4 227.5% / 893.1%.
- By family: INRC Easy 97.0%, INRC Hard 1.7%, RCPSP-SM Hard 0.3%. GPT-5.5 is near-perfect on JSP at all difficulties while most other models solve few or none.
- Conflict: Opus 4.6 reaches 80% JSP feasibility in ConstraintBench, while SCHEDBench reports most non-GPT-5.5 models solving few or no JSP instances. Thinking settings and instance sizes differ, so these are not comparable — [Tso 2026](https://arxiv.org/abs/2602.22465); [Sharma 2026](https://arxiv.org/abs/2608.00991).

**Fine-tuned JSSP**
- LLMs can Schedule (Phi-3-Mini, 120k supervised examples, sampling): comparable to other neural approaches, zero-shot unsatisfactory — [Abgaryan 2024](https://arxiv.org/abs/2408.06993).
- Starjob (Llama 3.1 8B, 4-bit RsLoRA, about 130k examples with OR-Tools labels capped at 300 s, about 70 hours of training, 20 samples per inference): average gap 21.69% on Taillard vs L2D 29.54, MOPNR 42.99, FDD/WKR 46.77, MWKR 55.29, SPT 60.57. On DMU, 22.14% vs L2D 37.50 — [Abgaryan 2025](https://arxiv.org/abs/2503.01877). Gaps are to best-known bounds, and the comparison does not include a CP solver.

**LLM-written heuristics and other**
- HeuriGym (9 problems, LLM writes heuristic programs, up to 10 verifier-feedback rounds): valid-solution rate rose from 53.2% to 74.8% for o4-mini-high and 44.0% to 73.4% for DeepSeek-R1. Quality peaked at QYI 0.62 for Gemini-2.5-Pro, about 60% as effective as expert solutions — [Chen 2025](https://arxiv.org/abs/2506.07972).
- REALM-Bench (14 problems including JSSP variants): appendices show GPT-4o, Claude 3.7, and DeepSeek R1 wrong on a first attempt and correct on a second in a sample case. Leaderboard tables exist for DMU, TA, ABZ, SWV, and YN, but I did not extract their values. Authors also promote their own ALAS system — [Geng 2025](https://arxiv.org/abs/2502.18836).
- MindAgent/CuisineWorld: a virtual kitchen where GPT-4-0613 dispatched 2-4 agents; reports collaboration scores rather than optimality — [Gong 2023](https://arxiv.org/abs/2309.09971).
- LLM-designed RCPSP priority rules and constraint-model reformulation exist as active work, but I did not extract results — [Luo 2026](https://arxiv.org/abs/2609.03754); [Michailidis 2026](https://arxiv.org/abs/2607.28268).

**Requested names**
- "Can LLMs schedule": the closest located title is *LLMs can Schedule* ([Abgaryan 2024](https://arxiv.org/abs/2408.06993)).
- "ReStructured evaluation": not located after several searches. I cannot verify that it exists under that name.

### Inferences
- Feasibility is the bottleneck for direct scheduling, not quality once feasible. So a verifier is required, and a retry or solver path is needed if the system must always finish.
- Heavy-tailed gaps (GPT-5.5's median 4.3% vs mean 747%) mean average gap misleads. Report median and p95 makespan ratio on the kitchen benchmark.
- Crew and project-type constraints look hardest in ConstraintBench, and they resemble kitchen shared-resource and precedence structures. That analogy is mine and has not been tested on kitchen instances.
- Fine-tuning for direct scheduling looks like a poor fit for a kitchen: 70 hours of training still gives a roughly 22% gap on benchmarks where exact or CP methods are available for labels.

### Gaps
- No primary LLM-vs-CP optimality comparison was located that uses LLM-written CP-SAT code on JSPLib or Taillard. SCHEDBench lists this as future work.
- ConstraintBench and SCHEDBench do not report latency.
- No study located measures LLM scheduling on kitchens with both makespan and cost.

### Sources
- Tso, Schmittou, Huynh, Hutchins. *ConstraintBench*. 2026, arXiv:2602.22465 [PP]. https://arxiv.org/abs/2602.22465
- Sharma, Sharma. *SCHEDBench*. 2026, arXiv:2608.00991, EMNLP 2026 Findings per arXiv comment [UV: proceedings not checked]. https://arxiv.org/abs/2608.00991
- Abgaryan, Harutyunyan, Cazenave. *LLMs can Schedule*. 2024, arXiv:2408.06993 [PP]. https://arxiv.org/abs/2408.06993
- Abgaryan, Cazenave, Harutyunyan. *Starjob*. 2025, arXiv:2503.01877 [UV: LION20 and LM4Plan copies located]. https://arxiv.org/abs/2503.01877
- Chen, Wang, Cai, Hu, et al. *HeuriGym*. ICLR 2026 [PR, per arXiv comment]. https://arxiv.org/abs/2506.07972
- Geng, Chang. *REALM-Bench*. 2025, arXiv:2502.18836 [PP]. https://arxiv.org/abs/2502.18836
- Gong, Huang, Ma, Vo, et al. *MindAgent*. 2023, arXiv:2309.09971 [UV]. https://arxiv.org/abs/2309.09971
- Luo, Vanhoucke, Coelho. *Automated Priority Rule Design for RCPSP*. 2026, arXiv:2609.03754 [PP]. https://arxiv.org/abs/2609.03754
- Michailidis, Tsouros, Dang, Guns. *LLM-Guided Evolutionary Search for Constraint Model Reformulation*. 2026, arXiv:2607.28268 [PP]. https://arxiv.org/abs/2607.28268

## What are per-task costs (LLM calls, tokens, latency), including agent frameworks?

### Takeaway
The most efficient pattern in reported data is few LLM calls that produce a reusable model or code, with a local solver doing the search. Solvers typically run in seconds to tens of seconds at almost no cost, though hard cases can time out. Verifier loops cost one to two orders of magnitude more calls but can be cheap on small models. Reasoning models used directly cost the most per success. Reliable head-to-head cost data is scarce, and old dollar figures no longer map to current prices.

### Cited Findings

| Architecture | Model, benchmark | Success | Calls | Tokens | Time | Cost | Source |
|---|---|---|---|---|---|---|---|
| Classical planner | Fast Downward, PlanBench | 100% | 0 | 0 | 0.265 s | about free | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| Direct, reasoning | o1-preview, Blocksworld | 97.8% | 1 | not reported | 40.43 s | $42.12 per 100 instances | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| Direct, reasoning | o1-mini, Blocksworld | 56.6% | 1 | not reported | 10.84 s | $3.69 per 100 | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| Direct, non-reasoning | GPT-4o, PlanBench | see source | 1 | not reported | not reported | $0.65 per 100 | [Valmeekam 2024a](https://arxiv.org/abs/2409.13373) |
| Direct | Haiku 4.5, Blocksworld | 63.7% | not reported | 28,488 per run; 44,705 per solution | up to 180 s | not reported | [Göbel 2026](https://arxiv.org/abs/2603.06064) |
| Step-wise agentic | Haiku 4.5, Blocksworld | 66.7% | not reported | 169,864 per run; 254,796 per solution (5.7x) | up to 180 s | not reported | [Göbel 2026](https://arxiv.org/abs/2603.06064) |
| Direct, 1-pass | Gemini 1.5 Flash, TravelPlanner | 5.6% | 1 | 0.009M in, 0.001M out | - | $0.001 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Direct, 1-pass | o1-preview, TravelPlanner | 11.7% | 1 | 0.008M in, 0.008M out | - | $0.601 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Best-of-N | Flash, TravelPlanner | 55.6% | 472 | 4.44M in, 0.47M out | - | $0.47 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Sequential revision | Flash, TravelPlanner | 82.8% | 280 | 35.53M in, 0.29M out | - | $2.75 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Evolutionary search + evaluator | Flash, TravelPlanner | 95.6% | 174 | 3.10M in, 0.18M out | - | $0.29 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| Evolutionary + evaluator | Flash, Meeting Planning | 85.0% | 406 | 5.35M in, 0.41M out | - | $0.52 | [Lee 2025](https://arxiv.org/abs/2501.09891) |
| LLM-Modulo | o1-preview, TravelPlanner | 10 to 65% | up to 10 iterations | not reported | - | $431.75 for the set | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) (labels inferred) |
| LLM-Modulo | o1-mini, TravelPlanner | 1.67 to 41.11% | up to 10 iterations | not reported | - | $97.17 for the set | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) (labels inferred) |
| LLM-Modulo | o1-preview, 10-city Trip (200) | 4 to 15.5% | 4 iterations | not reported | - | $535.49 for the set | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |
| LLM-Modulo | GPT-4o-mini, Calendar | 97% | 50 iterations | not reported | - | $2.48 for the set | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |
| Direct, reasoning | o1-mini, Calendar | 94% | 1 | not reported | - | $2.70 for the set | [Valmeekam 2024b](https://arxiv.org/abs/2410.02162) |
| SMT formalizer | GPT-4, TravelPlanner val | GPT-4 rate not extracted; best model (Claude 3) 93.3% | multiple | not reported | 245.66 s total; solver 38.39 s average | $0.74 per query | [Hao 2024](https://arxiv.org/abs/2404.11891) |
| Direct, reasoning | ConstraintBench six models | 44.5-65% feasible | 1 | up to 64k output | not reported | $0.50-3.00 per task | [Tso 2026](https://arxiv.org/abs/2602.22465) |
| Direct, LLM frontier | GPT-5, DeepSeek-R1 at Corrêa v1 | 205 and 157 of 360 | 1 per task | not read | R1 above 30 min in a few cases | about $100.47 and $9.13 total (search summary) | [Corrêa v1](https://arxiv.org/abs/2511.09378v1) |

- Hao's solver timed out at the 30-minute cap on 1.3% of 1,180 queries — [Hao 2024](https://arxiv.org/abs/2404.11891).
- LLMFP wall time: Direct GPT-4o averages 3.2 s on multi-constraint tasks, while Direct o1-preview took 104.2 s on one coffee task. LLMFP was shorter than o1-preview direct on multi-constraint problems — [Hao 2024b](https://arxiv.org/abs/2410.12112).
- In formalizer mode, reasoning models used fewer tokens than as solvers, except Qwen3 on Zebra, and Python used fewer than SMT — [Amonkar 2025](https://arxiv.org/abs/2505.13252) (figures only).
- SCHEDBench total usage was about 490M input and 920M output tokens across 13 models, with median context of about 13.8k tokens — [Sharma 2026](https://arxiv.org/abs/2608.00991).
- Code-once approach: Thought of Search reports 100% accuracy across 4 problem sets with only a few LLM calls, and compares that with published methods using about 100-200 calls for other tasks — [Katz 2024](https://arxiv.org/abs/2404.11833). AutoToS removes the human, with average feedback calls per domain of 2.0-5.8 for GPT-4o (24 Game 3.4, PrOntoQA 2.6, Sokoban 2.2, Crossword 5.8, Blocksworld 2.0) and 4.8-10 for GPT-4o-mini — [Cao 2024](https://arxiv.org/abs/2408.11326). Calls are per domain, not per instance. These are simple puzzle domains with human-designed unit tests.

**Agent frameworks**
- ReAct (PaLM-540B): ALFWorld best trial 71%, worst 48%, vs Act 45% and BUTLER 37%; WebShop 40.0% vs Act 30.1% and IL 29.1%. Token and cost figures were not found in the text I read — [Yao 2022](https://arxiv.org/abs/2210.03629).
- Reflexion: +22% absolute on ALFWorld over 12 learning steps, which needs repeated trials on the same task and an evaluator. No per-task cost located — [Shinn 2023](https://arxiv.org/abs/2303.11366).
- StateFlow, ALFWorld (GPT-3.5-Turbo, average of 3 attempts; cost unit as printed): ReAct 55.5% at $6.6; ALFChat (3 agents) 67.7% at $6.1; StateFlow 83.3% at $2.6. StateFlow + Reflexion goes from 84.3% to 94.8% after 6 iterations, at much lower added cost than ReAct + Reflexion — [Wu 2024](https://arxiv.org/abs/2403.11322).
- Plan-and-execute proxy: on InterCode SQL with GPT-3.5, Plan & Solve 47.68% at 2.38 with 4.31 turns, and ReAct 50.68% at 17.7 with 5.58 turns (labels inferred; unit likely dollars) — [Wu 2024](https://arxiv.org/abs/2403.11322). Original Plan-and-Solve work tested text-prompting on GPT-3 and does not report per-task costs — [Wang 2023](https://arxiv.org/abs/2305.04091).
- CoPS on Llama 3.1: ALFWorld after 10 trials over 134 tasks, CoPS 94, Reflexion 86, RAP 70 (8b model). WebShop, Reflexion 30, RAP 42, LATS 24 to 32. LATS generated 1,555,365 tokens vs 314,336 for CoPS on the 8b model — [Yang 2024](https://arxiv.org/abs/2410.16670).
- SayCan (PaLM, 101 tasks, kitchen robot): 84% planning and 74% execution in a mock kitchen; real kitchen -3 points planning and -14 points execution. Generative baseline 74% and no-value-function 67% planning. Affordance scoring gives feasibility filtering at the skill level, and I found no token or call cost in the text I read — [Ahn 2022](https://arxiv.org/abs/2204.01691).
- Robotouille: closed-loop ReAct beats open-loop approaches in that benchmark at 47% / 11% (GPT-4o), with cost analysis in an appendix I did not extract — [Gonzalez-Pumariega 2025](https://arxiv.org/abs/2502.05227).
- A vendor blog claims self-critique patterns can use 50x single-pass tokens without measured sources, so treat it as weak — [Tian Pan blog](https://tianpan.co/blog/2026/04/12/the-planning-tax-why-your-agent-spends-more-tokens-thinking-than-doing).

### Inferences

**Suggested kitchen architecture, untested on the reader's simulator.** These are inferences from different benchmarks, not measured results.

1. Treat the kitchen's rules as a fixed, human-written CP-SAT model (interval variables, no-overlap or cumulative for stations, precedence for dependencies). This follows the per-domain logic of [Katz 2024](https://arxiv.org/abs/2404.11833) and the gold-graph 100% result in [Zhang 2026b](https://arxiv.org/abs/2606.00981).
2. Use the LLM only to turn orders into a small validated task graph or JSON, and consider a cheap model first. [Zhang 2026b](https://arxiv.org/abs/2606.00981) shows a good interface lets weaker models approach strong ones, and [Zhang 2026](https://arxiv.org/abs/2605.03308) shows extraction is near-saturated on simple constraint sets.
3. Validate each schedule in the simulator. On an extraction error, return the violation to the LLM, as in LLM-Modulo.
4. On a mid-run event, patch affected constraints and re-solve, not regenerate: 81.6% vs 41.6% in [Zhang 2026b](https://arxiv.org/abs/2606.00981).
5. Keep navigation and low-level movement outside the LLM, since Robotouille-level bookkeeping scores about 0% in [Zhang 2026b](https://arxiv.org/abs/2606.00981). A deterministic controller is the obvious candidate.
6. Fall back to a direct reasoning model or evaluator-driven search only for tasks the formal model cannot express, such as ambiguous requests.

Expected effect, as an estimate: if rules are fixed, per-order cost is one or two small-model calls plus a local solve, likely well below any architecture in the table. This has not been measured in a kitchen, so run a small bake-off of direct, verifier-loop, and CP-SAT on 50-100 kitchen instances, logging success, makespan gap, calls, tokens, and latency.

Other inferences:
- Calculated per-query figures, assuming 180 TravelPlanner validation queries: o1-preview LLM-Modulo about $2.40 per query and about $3.69 per success at 65%. This is my arithmetic with an assumed denominator. On Mind Evolution, 174 calls at $0.29 gives about $0.30 per success at 95.6%, which suggests search on a cheap model beat a reasoning model loop at 2024-25 prices.
- ReAct-style step-wise agents did not earn their cost on a fully observed planning problem in [Göbel 2026](https://arxiv.org/abs/2603.06064) (+3 points at 5.7x tokens). Closed-loop is more valuable with partial observability or stochastic events, as Robotouille suggests.
- Reflexion's multi-trial model suits a resettable simulator better than a live run, because each retry replays a full task.

### Gaps
- No per-task token or latency data was found for ReAct, Reflexion, or SayCan in the primary papers' text I read. Numbers exist only in follow-ups using other models.
- No current-price comparison was located. o1-era dollar figures are outdated, and costs for GPT-5.x, Claude 4.x, and Gemini 3.x are mostly unreported per task.
- Zhang 2026b's cost per task was not found in the sections I read, despite being the most relevant study.
- StateFlow cost units and whether they are per run or per set were not confirmed. Some table labels are inferred from flattened text.

### Sources
- Katz, Kokel, Srinivas, Sohrabi. *Thought of Search*. NeurIPS 2024 [PR]. https://arxiv.org/abs/2404.11833
- Cao, Katz, Kokel, Srinivas, et al. *Automating Thought of Search*. 2024, arXiv:2408.11326 [UV]. https://arxiv.org/abs/2408.11326
- Yao, Zhao, Yu, Du, et al. *ReAct*. ICLR 2023 [PR, arXiv comment says ICLR version; year from the ICLR cycle]. https://arxiv.org/abs/2210.03629
- Shinn, Cassano, Berman, Gopinath, et al. *Reflexion*. 2023, arXiv:2303.11366 [UV]. https://arxiv.org/abs/2303.11366
- Ahn, Brohan, Brown, Chebotar, et al. *Do As I Can, Not As I Say (SayCan)*. 2022, arXiv:2204.01691 [UV]. https://arxiv.org/abs/2204.01691
- Wang, Xu, Lan, Hu, et al. *Plan-and-Solve Prompting*. ACL 2023 [PR]. https://arxiv.org/abs/2305.04091
- Wu, Yue, Zhang, Wang, et al. *StateFlow*. 2024, arXiv:2403.11322 [UV]. https://arxiv.org/abs/2403.11322
- Yang, Zhao, Gu, Zhou. *CoPS*. 2024, arXiv:2410.16670 [UV]. https://arxiv.org/abs/2410.16670
- Tian Pan blog, *The Planning Tax*. 2026, non-peer-reviewed, weak evidence. https://tianpan.co/blog/2026/04/12/the-planning-tax-why-your-agent-spends-more-tokens-thinking-than-doing
