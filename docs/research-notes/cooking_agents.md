# LLM and Learning Agents in Cooking and Kitchen Environments: Published Results and Efficiency

Evidence tags used on every entry:
- **[PDF]** = I extracted and read the relevant passages or tables from the primary paper's text.
- **[Snippet]** = I saw only a search-result summary, abstract, or aggregator text. Treat these as unverified.
- **[Peer]** = a peer-reviewed venue, confirmed by a proceedings or journal page or by the paper itself.
- **[Preprint]** = arXiv, with no venue confirmed in this session. Some may have been published since.
- **[Recent]** = first posted in 2026.

PDF text extraction can garble table layout. I re-read each table quoted below, but anything load-bearing should be checked against the PDF.

## What do papers using Overcooked and related environments report?

### Takeaway
LLMs score competitively in Overcooked only when they pick high-level skills and something else executes them, and when the game waits for the model. Under real-time play, a plain finite-state machine beat every LLM controller tested as a standalone fast or slow agent (DPT-Agent). Almost no paper reports call counts, and latency figures are not comparable across papers.

### Cited Findings

**ProAgent** (Zhang, Yang, Hu, et al.; AAAI 2024; arXiv:2308.11339) [PDF][Peer, per arXiv "AAAI'24 camera-ready" note]
- Average reward when paired with all other algorithms, 5 episodes per pair, as Player 0 (ProAgent vs best baseline). Standard errors are large. — [ProAgent](https://arxiv.org/abs/2308.11339)
  - Cramped Room: 197.3 vs 196.3 (FCP)
  - Asymmetric Advantages: 228.7 vs 201.3 (COLE)
  - Coordination Ring: 175.3 vs 168.8 (COLE)
  - Forced Coordination: 49.7 vs 44.7 (FCP)
  - Counter Circuit: 126.3 vs 95.5 (COLE)
- As Player 1 it loses in two layouts: Cramped Room 194.2 vs FCP 196, and Forced Coordination 31 vs PBT 61.7. Standard errors on Forced Coordination are about ±30-46. — [ProAgent](https://arxiv.org/abs/2308.11339)
- Against human proxy models, the abstract reports an average improvement "exceeding 10%" over the state of the art. — [ProAgent](https://arxiv.org/abs/2308.11339)
- The LLM chooses skills. A built-in Best-First Search controller turns them into low-level actions, so this is not a per-tick LLM controller. — [ProAgent](https://arxiv.org/abs/2308.11339)
- I found no latency or query counts in the paper text (a keyword search for "latency" returned nothing). A later paper measures ProAgent at 12.72-23.40 minutes of runtime; see SyncPlan below.

**LLM-Coordination** (Agashe, Fan, Reyna, Wang; Findings of NAACL 2025; arXiv:2310.03903) [PDF][Peer]
- Same-type pairs in Overcooked-AI, reported in layout order CR / AA / Ring / FC / CC. — [LLM-Coordination](https://arxiv.org/html/2310.03903v2)
  - GPT-4-turbo: 173.3 / 260.0 / 140.0 / 180.0 / 160.0
  - GPT-4o: 160 / 166.66 / 66.66 / 120 / 160
  - GPT-3.5-turbo: 33.3 / 46.6 / 40 / 66.6 / 53.3
  - PBT: 216.9 / 190.1 / 173.8 / 169.5 / 140.1
  - Self-Play (PPO): 198.8 / 167.2 / 190.8 / 151.9 / 122.3
- **Internal tension:** the prose says GPT-4-turbo agents "outperform or match" RL "across all layouts". Its own table has RL ahead on CR (216.9 vs 173.3) and Ring (190.8 vs 140.0). The table caption says 3 of 5 scenarios. — [LLM-Coordination](https://arxiv.org/html/2310.03903v2)
- With human-proxy partners, GPT-4-turbo scored 160 | 160 on CR, 180 | 200 on AA, 160 | 140 on Ring, 120 | 80 on FC, and 140 | 100 on CC. It beats BC and PPO_BC and generally matches HSP, except on AA, where HSP scored 300.3 | 217.1. — [LLM-Coordination](https://arxiv.org/html/2310.03903v2)
- The authors say the capable models "require substantial computational resources, making them less suitable for real-time applications". They also skipped explicit Theory-of-Mind reasoning on Overcooked because of "latency and cost constraints". — [LLM-Coordination](https://aclanthology.org/2025.findings-naacl.448.pdf)
- A search summary gave ~8.36 s chain-of-thought latency, but I did not find that number in the arXiv PDF text. **Unverified**; do not cite without checking the ACL version.

**HLA, Hierarchical Language Agent** (Liu, Yu, Gao, et al.; AAMAS 2024; arXiv:2312.15224) [PDF][Peer]
- Latency, mean (sd), for the No-Executor, Slow-Mind-Only, Fast-Mind-Only, and full HLA agents. — [HLA](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1219.pdf)
  - Macro action: n/a / 4.16 s (1.01) / 2.30 s (1.81) / **1.07 s (0.22)**
  - Atomic action: 0.71 s / 0.61 s / 0.28 s / **0.08 s**
- HLA has 74.3% lower macro latency than Slow-Mind-Only and 53.5% lower than Fast-Mind-Only. — [HLA](https://arxiv.org/pdf/2312.15224)
- The No-Executor agent (LLM picks atomic actions directly) "fails to complete basic tasks, such as picking up things", misses all soup orders, and gets the minimum score of -20. — [HLA](https://arxiv.org/pdf/2312.15224)
- Slow-Mind-Only "often overcooks dishes due to its high response latency". This is a direct latency-to-quality failure under real-time play. — [HLA](https://arxiv.org/pdf/2312.15224)
- Game scores appear in a figure, so I could not extract exact values. The study is human-AI with language commands, which differs from the reader's setting.

**DPT-Agent** (Zhang, Wang, et al.; arXiv:2502.11882; 2025) [PDF][Preprint]
- Single agent, Counter Circuit, real-time, 20 games. Interquartile mean scores from Appendix G. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)
  - **FSM: 65.00, score efficiency 5.59, latency ~0 s**
  - GPT-4o: 46.00 at 0.91 s
  - GPT-4o-mini: 24.50 at 0.78 s
  - Qwen2.5-14b: 31.50 at 1.59 s
  - Llama3.3-70b: -5.00 at 4.38 s
  - o3-mini: -20.50 at 5.10 s
  - DeepSeek-R1-70b: -42.50 at 6.69 s
- The paper states that "all agents perform worse than the FSM agent". Reasoning models with long chain-of-thought had lower score efficiency and overall scores than many smaller models. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)
- Hybrid (FSM + LLM writing code-as-policy) vs ReAct, averaged across 17 model configurations with rule-based partners. Overall score: **DPT-Agent 44.23** and w/o ToM 46.63, vs ReAct 15.48 and Reflexion 11.77. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)
- The biggest swing is on slow models: o3-mini-high goes from -43.00 (ReAct) to 65.83 (DPT-Agent). The hybrid is not uniformly better: GPT-4o scored 35.67 under ReAct vs 18.67 under full DPT-Agent, and 39.50 w/o ToM. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)
- These hybrid scores come from a rule-based-partner setting, so they should not be compared with the FSM's 65.00 from the single-agent test.
- With humans, DPT-Agent vs ReAct was 111.53 vs 99.03 on New Counter Circuit and 160.63 vs 115.00 on New Asymmetric Advantages. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)

**SyncPlan** (You, Zhu, et al.; arXiv:2608.01652; Aug 2026) [PDF][Preprint][Recent]
- Task Achievement Rate and Real-Time across four settings: Standard Coordination / Dynamic Coordination / Dynamic Ring / Dynamic symmetric. — [SyncPlan](https://arxiv.org/pdf/2608.01652)

| Method | TAR (%) | Real-Time |
|---|---|---|
| Greedy | 40.6 / 58.5 / 22.6 / 96.2 | 0.26-0.40 s |
| PBT | 92.0 / 88.7 / 96.2 / 98.1 | 0.22-0.27 s |
| FCP | 91.0 / 74.0 / 91.0 / 94.3 | 0.24-1.27 s |
| A-ToM (2nd order) | 86.0 / 62.3 / 76.0 / 94.3 | 3.52-7.05 h |
| Collab | 79.5 / 63.0 / 50.7 / 95.9 | 5.25-6.37 h |
| ProAgent | 88.0 / 65.0 / 59.0 / 94.0 | 12.72-23.40 min |
| DPT-Agent | 91.3 / 71.5 / 69.3 / 96.3 | 38.15 min-1.15 h |
| **SyncPlan (full)** | **96.1 / 93.0 / 88.3 / 100** | **4.32-8.80 s** |
| SyncPlan w/o SFT (RL training kept) | 92.2 / 88.4 / 76.5 / 100 | 11.04-25.26 s |
| SyncPlan w/o RL (SFT kept) | 94.8 / 88.8 / 76.9 / 92.2 | 5.38-9.55 s |

- SyncPlan averages +12.2 percentage points over the strongest LLM baseline at under 0.05% of its wall-clock runtime. — [SyncPlan](https://arxiv.org/pdf/2608.01652)
- Author-run comparison, and SyncPlan is fine-tuned (SFT + planning RL). Baselines were not independently replicated.

**Co-π-tree** (Zhang, Liang, Zou, Wang, Wu; arXiv:2606.08596; 2026) [PDF, partial][Preprint][Recent]
- Reports +35.4% average reward over the baseline average, **-77.7% LLM queries, and -97.1% test-time latency**. The query and latency reductions are relative to the mean of two online LLM baselines (ProAgent, CausalPlan). Each episode is 400 steps. — [Co-π-tree](https://arxiv.org/pdf/2606.08596)
- Queries are counted across one complete algorithm run. "Once the final policy tree is produced, additional evaluations do not require extra LLM queries." — [Co-π-tree](https://arxiv.org/pdf/2606.08596)

**MindAgent / CuisineWorld** (Gong, Huang, Ma, et al.; arXiv:2309.09971; 2023) [PDF][venue not verified in this session]
- Centralized GPT-4 dispatcher with 2-4 agents. New orders arrive every τ_int steps and expire after a lifetime τ_lft. CoS is the average completion rate across five τ_int values. Results are over 3 episodes at temperature 0.1. — [MindAgent](https://arxiv.org/pdf/2309.09971)
- Average completion as order pressure falls, from τ_int(1), the fastest arrivals, to τ_int(5). — [MindAgent](https://arxiv.org/pdf/2309.09971)
  - 2 agents: 0.318 → 0.486 → 0.709 → 0.912 → 0.937
  - 3 agents: 0.368 → 0.549 → 0.791 → 0.846 → 0.914
  - 4 agents: 0.349 → 0.590 → 0.785 → 0.875 → 0.859
- Level 3 CoS for 2 / 3 / 4 agents: GPT-4 0.686 / 0.822 / 0.848; Claude-2 0.3125 / 0.372 / 0.473; LLaMA and ChatGPT 0. — [MindAgent](https://arxiv.org/pdf/2309.09971)
- Removing environment feedback causes a large drop: on Level 3 with 2 agents, τ_int(1) goes from 10/26 to 4/25. The dispatcher "tends to repeat mistakes and gets stuck". — [MindAgent](https://arxiv.org/pdf/2309.09971)
- The paper states that centralization "significantly reduces the number of API calls" but gives no count. I found no latency figure and no classical or scripted baseline in the result tables I read. — [MindAgent](https://arxiv.org/pdf/2309.09971)

**Collab-Overcooked** (Sun, Zhang, Niu, et al.; arXiv:2502.20073; 2025) [PDF][venue not verified]
- Success Rate across Levels 1 to 6, over 30 tasks with 10 repetitions. — [Collab-Overcooked](https://arxiv.org/pdf/2502.20073)
  - Claude Sonnet 4: 100 / 100 / 96 / 92 / 74 / 58
  - o4-mini: 92 / 100 / 96 / 86 / 62 / 54
  - DeepSeek-R1: 100 / 100 / 98 / 82 / 44 / 30
  - GPT-4o: 94 / 86 / 68 / 34 / 2 / 4
  - Llama-3.1-8B: 4 / 0 / 0 / 0 / 0 / 0
- DeepSeek-R1 uses 18.6 times GPT-4o's tokens. — [Collab-Overcooked](https://arxiv.org/pdf/2502.20073)
- The authors report "consistent performance decay across sequential collaborative steps". It persists even with explicit step-to-action recipe mappings, and the authors attribute it to a strong positional dependence. — [Collab-Overcooked](https://arxiv.org/pdf/2502.20073)
- I found no latency figure and no scripted baseline in the passages I read.

**ZSC-Eval** (Wang, Zhang, et al.; NeurIPS 2024 Datasets & Benchmarks; arXiv:2310.05208) [PDF, partial][Peer]
- An evaluator for RL zero-shot coordination: FCP, MEP, TrajeDi, HSP, COLE, E3T, SP. It tests no LLM agents in what I read. — [ZSC-Eval](https://proceedings.neurips.cc/paper_files/paper/2024/hash/54a7139c548c88e288aa0fcd2bcbeceb-Abstract-Datasets_and_Benchmarks_Track.html)
- Rank correlation with human evaluation, on Coordination Ring / Counter Circuit. — [ZSC-Eval](https://arxiv.org/pdf/2310.05208)
  - ZSC-Eval: 0.90 / 1.00
  - Human Proxy: 0.90 / 0.60
  - Trained SP agents: 0.70 / 0.10
- Baseline rankings depend heavily on the evaluation partner, which is another reason cross-paper Overcooked scores are not comparable.

**Overcooked-AI origin:** Carroll, Shah, Ho, Griffiths, et al., "On the Utility of Learning about Humans for Human-AI Coordination" (arXiv:1910.05789). I confirmed the title and authors only and did not extract numbers. — [Carroll et al.](https://arxiv.org/pdf/1910.05789)

### Inferences
- **Scores across these papers cannot be directly compared.** The differences include:
  - partner: same-type pairs, cross-algorithm pairs, human proxy, or real humans;
  - whether the game waits for the model;
  - whether a BFS or script executor is supplied;
  - metric: reward, TAR, or SR.

  For example, PBT is 216.9 on Cramped Room in LLM-Coordination's same-type setting, while ProAgent's table reports cross-play averages of about 179. The tables measure different things.
- SyncPlan's hour-scale baseline runtimes probably reflect the authors' API setup and repeated invocations as well as algorithm design. Treat the ratio as direction, not as a transferable constant.
- The LLM's Overcooked wins mostly come from environments where low-level execution is delegated. So they support "LLM as a skill selector" more than "LLM makes every decision".

### Gaps
- No paper here reports a clean per-episode LLM call count for a per-step agent next to a scripted baseline in the same table. Co-π-tree shows query counts in a figure that I could not read as text.
- CausalPlan (arXiv:2508.13721) was not read; extraction failed. I do not report its numbers.
- ProAgent's model version and episode horizon were not found in the passages I read.

## Are there cooking or restaurant simulators with deadlines and shared equipment?

### Takeaway
Yes. The closest to the reader's kitchen are DuoCook (deadlines, tips, shared pots, boil-unattended), CuisineWorld (arrival interval and order lifetime), Robotouille (time delays, single-occupancy stations), ParaCook (time-efficiency against a CP-SAT optimum), and Recipe2Plan (time windows between actions). None models all of: one chef, one burner, stochastic durations, and staggered deadlines, with a classical baseline alongside. Results across the group show that asynchronous and deadline conditions sharply lower LLM performance.

### Cited Findings

**DuoCook** (Jiao, Zhang, Regmi, Ye, Qin, Chen; arXiv:2610.31511; Oct 2026) [PDF][Preprint][Recent]
- Setup: 20 maps in five categories, with one vision-language model controlling two players. Orders arrive every 1,000 steps and expire after 3,000, and an expired order resets the combo streak. Chopping and washing occupy a player, while soup boils unattended. — [DuoCook](https://arxiv.org/abs/2610.31511)
- Mean results (model names as printed in the paper). — [DuoCook](https://arxiv.org/html/2610.31511v1)

| Model | Score | Order completion | Action acceptance | USD/episode |
|---|---|---|---|---|
| gpt-6-astra | 25.6 | 26.2% | 64.6% | 5.18 |
| gemini-3.5-flash-lite | 11.9 | 11.2% | 32.1% | 0.30 |
| qwen3.8-27b | 9.1 | 8.8% | 39.5% | 0.27 |
| claude-opus-5 | 8.2 | 8.8% | 52.7% | 4.61 |

- Most episodes end with no delivery, including 15 of 20 for claude-opus-5 and 14 of 20 for qwen3.8-27b. Three of four models delivered nothing on maps combining changing terrain with shared equipment. — [DuoCook](https://arxiv.org/html/2610.31511v1)
- Caveats from the authors: **one episode per model and map**, so run-to-run variability is unquantified and rankings may be unstable. Engine-executed navigation and legal-action lists assist the controller. A ~4,000-word system prompt is re-sent at every decision. No scripted or planner baseline is reported. — [DuoCook](https://arxiv.org/html/2610.31511v1)

**Robotouille** (Gonzalez-Pumariega, Leong, Sunkara, Choudhury; ICLR 2025; arXiv:2502.05227) [PDF][Peer]
- 10 tasks × 10 instances. Success means reaching the goal within 1.5× optimal steps. — [Robotouille](https://proceedings.iclr.cc/paper_files/paper/2025/hash/d033407a1a4b7a75cd5f9e4575ad9fb5-Abstract-Conference.html)
  - gpt-4o: ReAct **47% synchronous vs 11% asynchronous**; I/O CoT 14% vs 1%; I/O 4% vs 1%.
  - gpt-4o-mini ReAct: 11% vs 0%.
  - claude-3-haiku ReAct: 2% vs 0%.
  - gemini-1.5-flash ReAct: 0% vs 0%.
- Among gpt-4o ReAct successes, 55.3% are optimal in synchronous tasks vs 9.1% in asynchronous tasks. In asynchronous tasks 63.6% are suboptimal, and the suboptimal runs were due to "inefficient actions, such as waiting while cooking". — [Robotouille](https://arxiv.org/pdf/2502.05227)
- On asynchronous Tasks 1-3, violations of the "one item at station" rule made up 38.1% of failures for ReAct. Giving more rule detail halved these transition failures, but the success change (0.30 → 0.40) was statistically insignificant because other failures rose. — [Robotouille](https://arxiv.org/pdf/2502.05227)
- Models tested are from 2024; there are no newer-model results in this paper.

**ParaCook** (Zhang, Ma, Xu, et al.; arXiv:2510.11608; 2025) [PDF][Preprint]
- Embodied success rate, Easy / Medium / Hard (average). — [ParaCook](https://arxiv.org/html/2510.11608)
  - GPT-5: 80.8 / 69.2 / 45.0 (65.0)
  - Gemini-2.5-Pro: 60.0 / 55.1 / 27.1 (47.4)
  - DeepSeek-V3.2-Exp: 66.7 / 47.5 / 21.7 (45.3)
  - Claude-Opus-4.1: 26.7 / 12.5 / 0 (13.1)
  - Qwen3-Max: 6.7 / 0 / 0 (2.2)
- Humans "maintain perfect success" on the human-evaluated subset. — [ParaCook](https://arxiv.org/html/2510.11608)
- Abstract scheduling tasks, with no embodiment, scored against a CP solver. — [ParaCook](https://arxiv.org/html/2510.11608)

| Model | SR (%) | nOCT |
|---|---|---|
| cp_sat | 100 | 1.0000 |
| Gemini-2.5-Pro | 100 | 1.0220 |
| GPT-5 | 100 | 1.0241 |
| DeepSeek-Reasoner | 94 | 1.0619 |
| Claude-Opus-4.1 | 100 | 1.0902 |
| Qwen3-Max | 78 | 1.1315 |

- **Internal inconsistency:** the prose gives nOCT 1.0174 / 1.0161 / 1.0721 for GPT-5, Gemini, and Claude, while Table 4 gives 1.0241 / 1.0220 / 1.0902. The prose implies 1-7% from optimum and the table about 2-9%.

**Recipe2Plan, "Haste Makes Waste"** (Wu, Liu, Li, Kong, Feng; arXiv:2503.02238; 2025) [PDF][Preprint]
- Success with vs without time constraints between actions. — [Recipe2Plan](https://arxiv.org/pdf/2503.02238)
  - GPT-4o ReAct: 90.8% → **21.5%**
  - Qwen2.5-32B: 80.0% → 15.4%
  - Llama-3.1-70B: 72.3% → 13.8%
  - Adding an oracle only lifts GPT-4o to 27.7%.
- Efficiency relative to the heuristic (=100): GPT-4o scores 78.2 without constraints and 109.5 with them, because it parallelizes aggressively and breaks feasibility. Combined success × efficiency is 72.2 vs 20.5. — [Recipe2Plan](https://arxiv.org/pdf/2503.02238)
- The heuristic is normalized to 100 and also helped select benchmark instances. The authors note it does not guarantee optimality, so "100" is a reference point rather than an independent contest. — [Recipe2Plan](https://arxiv.org/pdf/2503.02238)

**CuisineWorld:** see the previous section. Lifetime depends on dish complexity. Completion falls steeply as arrivals speed up. — [MindAgent](https://arxiv.org/pdf/2309.09971)

**CookBench** (Cai, Chen, An, et al.; arXiv:2508.03232; 2025) [PDF, partial][Preprint]
- Unity-based, with fine-grained actions. Intent-recognition accuracy exceeds 90% on the English set for leading models and drops sharply on multi-dish instructions. — [CookBench](https://arxiv.org/html/2508.03232v1)
- Human-in-the-loop planning scored 0.32-0.75 out of 5 by cuisine vs 5 for human experts. Full automation is left to future work. — [CookBench](https://arxiv.org/html/2508.03232v1)

**TextWorld cooking via AutoContext** (Cai, Liu, Yang, et al.; arXiv:2510.02369; 2025) [PDF][Preprint]
- ReAct success at unlimited steps: DeepSeek 37%, GPT-4.1 93%. With instance context, DeepSeek reaches 95%. There is no deadline or shared-equipment pressure, and no RL baseline in the table. — [AutoContext](https://arxiv.org/pdf/2510.02369)

**YORI, real robot kitchen:** see the OR section. — [YORI](https://arxiv.org/pdf/2405.11094)

**RoboCasa** [Snippet]
- Reports 28.8% success on human data, rising to 47.6% with the generated dataset. These are manipulation policy numbers, not LLM scheduling. — [RoboCasa via ResearchGate](https://www.researchgate.net/publication/381158423_RoboCasa_Large-Scale_Simulation_of_Everyday_Tasks_for_Generalist_Robots)

### Inferences
- **Text-only ability overstates embodied performance.** ParaCook's gap is the clearest evidence: top models are within a few percent of CP-SAT on abstract schedules, but reach only 45-81% success embodied.
- Robotouille and Recipe2Plan both show the same pattern when temporal dependencies appear. Success falls by roughly 4× for the best model tested (47 → 11, 90.8 → 21.5).
- DuoCook is the closest published analogue on deadlines and shared pots, but its visual input and two-player control make its low scores a weak predictor for a text-state, single-chef sim. A single-chef text sim should be easier. How much easier is unknown.
- Newer models help a lot in some of these settings (compare gpt-4o and Claude Sonnet 4 at Collab-Overcooked L6: 4% vs 58%). Model generation is therefore a major confound in any comparison across years.

### Gaps
- **I found no benchmark combining single-chef, single-burner, duration noise, staggered deadlines, and a planner baseline.** Duration noise specifically appears only in the ghost-kitchen OR work (next sections), not in LLM benchmarks I read.
- **ChefHearts:** one query found nothing; I cannot confirm it exists.
- **CookingWorld:** no LLM-specific result located in this session.
- **ALFRED/AI2-THOR and VirtualHome:** not read. Search results gave only garbled ALFRED table fragments (CoREN, arXiv:2411.17135), so I omit those numbers. They also lack order deadlines as far as the material I saw shows.

## Where does a per-step LLM controller lose to or beat a scripted or planner baseline? Which hybrids perform best, and how much do they cut LLM calls?

### Takeaway
Per-step LLMs lose to scripts and solvers whenever real-time latency, feasibility under time constraints, or solution quality on a formal schedule matters. They win mainly against weak greedy baselines on coordination-heavy maps, against zero-shot RL methods with unseen partners when the game waits for the model, and when simulator queries are the scarce resource. The best-supported hybrid is a sparse LLM call on top of a fast deterministic executor, re-invoked by events or replaced by distilled code. Reported reductions are about 78% in queries and 97% to over 99.9% in latency or runtime, each in the author's own setup.

### Cited Findings

**Where LLMs lose**
- **Real-time, standalone:** FSM 65.00 vs best tested LLM 46.00 (GPT-4o); slow reasoning models fall below zero. — [DPT-Agent](https://arxiv.org/pdf/2502.11882)
- **Atomic-action control:** the HLA variant where the LLM issues atomic actions misses all orders (score -20). — [HLA](https://arxiv.org/pdf/2312.15224)
- **Time-constrained feasibility:** GPT-4o 21.5% vs heuristic 100%. — [Recipe2Plan](https://arxiv.org/pdf/2503.02238)
- **Abstract schedule quality:** every LLM is at or behind cp_sat (nOCT 1.0000), and some have invalid plans. — [ParaCook](https://arxiv.org/html/2510.11608)
- **Runtime:** RL policies log 0.22-1.27 s of Real-Time (RT) in SyncPlan's protocol, vs minutes to hours for online LLM coordinators. — [SyncPlan](https://arxiv.org/pdf/2608.01652)
- **Against trained RL:** PBT beats all LLM baselines on Dynamic Coordination (88.7 vs at most 71.5) and beats even SyncPlan on Dynamic Ring (96.2 vs 88.3). — [SyncPlan](https://arxiv.org/pdf/2608.01652)
- **Against a script on easy maps:** on Dynamic symmetric, Greedy at 96.2% is above ProAgent (94.0), A-ToM (94.3), and Collab (95.9), and level with DPT-Agent (96.3). — [SyncPlan](https://arxiv.org/pdf/2608.01652)

**Where LLMs win**
- **Against Greedy on coordination-heavy maps:** every LLM baseline beats Greedy on Standard Coordination (at least 74.0 vs 40.6) and Dynamic Ring (at least 50.7 vs 22.6). — [SyncPlan](https://arxiv.org/pdf/2608.01652)
- **Against ZSC RL with unseen partners, when the game waits for the model:** ProAgent wins all Player 0 layouts, by small margins relative to standard error in some. — [ProAgent](https://arxiv.org/abs/2308.11339)
- **Against classical search when world-model queries are capped at 20:** on Blocksworld, Boomerang 78%, Classical 63%, ReAct 52%. Boomerang also beats Classical on Logistics (82 vs 5) and Grippers (89 vs 13). — [Query-Efficient Planning, Gonzalez-Pumariega, Chen, Kedia, Choudhury; arXiv:2412.06162](https://arxiv.org/pdf/2412.06162) [PDF][Preprint]
  - This metric rewards few simulator queries. It does not show better plans, and it does not apply if a simulator call is cheap.
  - Classical planners were only run on PDDL domains. Robotouille was not PDDL, so **no classical comparison exists there**. There, Boomerang scored 57% vs ToI-DFS 17%.

**Generative plan vs per-step ReAct** (Blocksworld, average per problem) — [Query-Efficient Planning](https://arxiv.org/pdf/2412.06162)

| Method | LLM calls | Tokens |
|---|---|---|
| I/O | 1.00 | 584 |
| I/O + CoT | 1.00 | 1,069 |
| Boomerang (generate whole plan, adapt) | 5.69 | 38,236 |
| ReAct (per-step) | 13.69 | 51,263 |
| ToI-DFS (LLM as heuristic) | 28.32 | 23,454 |
| ToI-BFS (LLM as heuristic) | 39.58 | 32,163 |

Generating whole plans uses about 58% fewer calls than per-step ReAct and scores higher (78% vs 52%). This is Blocksworld, not a kitchen.

**Hybrid designs, with reported effect**

| Design | Paper | Reported effect | Comparison base | Status |
|---|---|---|---|---|
| One-shot plan + wait primitives + staleness detector triggers LLM | SyncPlan | Under 0.05% runtime, +12.2 pts TAR | Strongest LLM baseline per setting | [Preprint][Recent] |
| Distill LLM reasoning into executable policy tree offline | Co-π-tree | -77.7% queries, -97.1% latency, +35.4% reward | Mean of ProAgent and CausalPlan (reward vs baseline average) | [Preprint][Recent] |
| Script executor + light LLM + slow LLM | HLA | -74.3% and -53.5% macro latency; atomic 0.08 s | Its own ablations | [Peer] |
| FSM + LLM writes code-as-policy | DPT-Agent | 44.23 vs ReAct 15.48 | ReAct, same models | [Preprint] |
| LLM generates plans, sim validates | Boomerang | 5.69 vs 13.69 calls | ReAct on Blocksworld | [Preprint] |
| Centralized dispatcher | MindAgent | "Significantly reduces" API calls; no number | Per-agent LLMs | venue not verified |

SyncPlan's variants that drop one training stage still get 76.5-100% TAR at about 5-25 s, while the full version gains most on Dynamic Ring (88.3 vs about 76.5). Every variant in Table 1 keeps at least one training stage, so this table does not show how an untrained LLM would do with the same architecture. — [SyncPlan](https://arxiv.org/pdf/2608.01652)

**Other leads, unverified**
- Plan Along the Way (arXiv:2608.28075) triggers planning on discovery events for TAMP execution, with RLBench kitchen and grill tasks. Seen through an aggregator with no percentage. [Snippet][Recent] — [Pith](https://pith.science/paper/2608.28075)
- LLM-Assisted Plan Execution for Robots reports 3.56 inference queries per achieved goal with a 5-second check, and no comparison baseline. [Snippet] — [Robotics 15(4)](https://doi.org/10.3390/robotics15040080)
- ReAd (arXiv:2405.14314; Findings of ACL 2025) is said to reduce LLM query rounds in Overcooked-AI. Percentage not seen. [Snippet] — [ReAd](https://aclanthology.org/2025.findings-acl.84.pdf)
- A search summary attributed "an order of magnitude fewer replans" to Collab-Overcooked. That claim does not match the paper I read, and the source appears misattributed. **Do not cite it.**

### Inferences
- For the reader's simulator, **the evidence argues against an LLM making every decision.** Three independent lines point the same way: FSM beating LLMs in real-time Overcooked, the heuristic's 100% vs 21.5% in Recipe2Plan, and CP-SAT setting the optimum in ParaCook.
- **Important caveat on real-time:** if the simulator pauses while the LLM thinks, the latency penalty disappears for score, as in ProAgent's and LLM-Coordination's setting. Cost and wall-clock remain. The remaining argument is then feasibility and schedule quality, not speed.
- Failures concentrate in keeping track of what is in progress and what timing rules hold. This is exactly what code can guarantee cheaply. A legal-action filter and a state tracker should come before any LLM. (DuoCook's models still have only 32-65% acceptance with a legal-operations list, which suggests how much they would struggle without enforcement.)
- A suggested experimental ladder, all in the reader's sim with identical seeds: FIFO → EDD/slack rule → CP-SAT with rolling re-solve → LLM on events only, with a validated action set → LLM every decision. This is my recommendation, not a published result. The published work has not run this exact comparison.
- LLMs may add value where rules are hard to write: unusual orders, natural-language requests, or choosing among objectives. HLA and DPT-Agent get their value from such higher-level input. Evidence for this in a single-chef kitchen is absent.

### Gaps
- **No located paper compares LLM, heuristic, RL, and CP solver in one deadline-driven kitchen.** ParaCook comes closest on LLM vs CP but with abstract tasks and no deadlines or noise.
- No reported quantity tells us how much an LLM adds over a good dispatch rule under stochastic durations.
- Reductions in the hybrid table use different baselines and cannot be ranked against each other.

## Are there studies of restaurant or kitchen scheduling via operations research?

### Takeaway
Yes, but the literature is small and usually multi-cook or delivery-focused. The most useful results are that a kitchen fits the job-shop form, that CP-SAT with event-triggered re-solve runs on real robot hardware (YORI), and that moving from FIFO to optimized scheduling cuts average delay by roughly 29-51% in a peer-reviewed ghost-kitchen study. None of these tests an LLM.

### Cited Findings

**The Restaurant Meal Delivery Problem with Ghost Kitchens** (Neria, Hildebrandt, Tzur, Ulmer; Transportation Science 59(2), 2025; arXiv:2408.07417) [PDF][Peer]
- Sequential decision process joining meal-prep scheduling and vehicle dispatch. The policy combines large neighborhood search with value function approximation ("AI" in the table). — [Transportation Science](https://pubsonline.informs.org/doi/fpi/10.1287/trsc.2024.0510)
- Average delay in minutes. — [arXiv](https://arxiv.org/pdf/2408.07417)

| Instance | FIFO | Integrated | AI |
|---|---|---|---|
| Small | 10.1 | 5.8 | 4.9 |
| Medium | 26.8 | 17.5 | 15.9 |
| Large | 15.3 | 12.8 | 10.8 |

- **Reading the percentages:** the paper reports "106.5%" improvement over FIFO. That matches dividing by the AI value. Measured from FIFO, my calculation gives 51.5% (Small), 40.7% (Medium), and 29.4% (Large).
- Late orders in Small fall from 43.4% (FIFO) to 34.3% (AI), and max delay from 52.6 to 44.0 minutes. FIFO "represents what is often done in practice". — [arXiv](https://arxiv.org/pdf/2408.07417)
- Removing cook collaboration raises average delay: 16.7 min with no collaboration, 10.8 pairwise, 10.0 full. Those labels are as I read them from Table 4, whose layout is partly ambiguous after extraction. — [arXiv](https://arxiv.org/pdf/2408.07417)
- In the independent-restaurant comparison, the authors add Gaussian noise with variance 20% of expected prep time. I did not check whether other experiments also use noise. — [arXiv](https://arxiv.org/pdf/2408.07417)
- Includes routing, which the reader's kitchen does not have, and multiple cooks.

**RL-based adaptive scheduling for commercial smart kitchens** (Kabała, Dziurzanski, Konrad; IAPGOS 3/2025, pp. 117-122) [PDF][Peer]
- Simulator built on 65,845 recorded food-prep processes from 30 Polish restaurants; DQN, SARSA, and TD-AC tested. — [IAPGOS](https://ph.pollub.pl/index.php/iapgos/article/download/6996/5173)
- **A hybrid (RL + FIFO queue) reached a mean delivery time of 30.886 ± 2.185 min vs FIFO-only 37.443 ± 6.864 min**, about 17.5% lower by my calculation. — [IAPGOS](https://ph.pollub.pl/index.php/iapgos/article/download/6996/5173)
- The abstract notes that outcomes vary "significantly depending on the choice of learning algorithm". The hybrid was tested for a small, typical restaurant scenario.

**Integrated Process Planning and Scheduling in Commercial Smart Kitchens** (Dziurzanski, Zhao, Indrusiak; arXiv:1910.03322; 2019) [PDF][venue not verified]
- MOEA/D genetic algorithm trading off makespan, energy, and food quality. One example run took 19.942 s and produced a 28:57 makespan schedule across hobs and pots. — [Dziurzanski et al.](https://arxiv.org/pdf/1910.03322)
- The authors say the method suits large restaurants or cafeterias with conflicting objectives rather than single hobs. — [Dziurzanski et al.](https://arxiv.org/pdf/1910.03322)

**YORI** (Noh, Nam, Gillespie, Liu, Hong; arXiv:2405.11094) [PDF][Preprint]
- Models robot cooking as a job shop with OR-Tools CP-SAT, adding kitchen constraints: reachability, continuous tending, and dishes not cooling after oven removal. — [YORI](https://arxiv.org/pdf/2405.11094)
- Re-solves **only on new orders or failed tasks**, keeping earlier orders first. — [YORI](https://arxiv.org/pdf/2405.11094)
- Deployment success: 30/30 lab, 10/10 sponsor HQ, 12/12 public demo. Cooking time for 1 / 2 / 3 dishes: 16.4 / 30.1 / 44.8 min. — [YORI](https://arxiv.org/pdf/2405.11094)
- Cites prior dispatching-rule and online MIP work on cooking JSSPs. I did not read those references. — [YORI](https://arxiv.org/pdf/2405.11094)

**LLM vs dispatch rules on general job shops (not kitchens)**
- Starjob (Abgaryan et al.; arXiv:2503.01877): fine-tuned Llama average gap on Taillard instances is 21.69%, vs L2D 29.54, MOPNR 42.99, FDD/WKR 46.77, MWKR 55.29, SPT 60.57. On DMU it is 22.14%. — [Starjob](https://arxiv.org/pdf/2503.01877) [PDF, partial][Preprint]
- ALAS (Chang; arXiv:2505.12501): states that LLMs "are not competitive with classical combinatorial solvers in producing globally optimal static plans", yet reports its multi-agent system beating SPT (36%), LPT (53%), and DRL-Liu (21%) on DMU. It focuses on disruption handling and local repair. — [ALAS](https://arxiv.org/pdf/2505.12501) [PDF, partial][Preprint]
- A small project found the best dispatch rule (MWKR) 8-17% above CP-SAT on instances up to 10×10, with all 45 solved to proven optimality. [Snippet; individual repository, not peer reviewed] — [GitHub](https://github.com/greggdev647/job-shop-dispatch-vs-optimal)
- A learned RL policy cut the gap to CP-SAT from 6.4% (best rule, SPT) to 3.8%, and to 2.1% with 100 rollouts, in a modular factory setting. [Snippet][Preprint][Recent] — [arXiv:2607.11725](https://arxiv.org/pdf/2607.11725)

### Inferences
- A single-chef, single-burner kitchen is likely small enough that CP-SAT can give a near-optimal or proven-optimal baseline quickly. Small job shops were solved to optimality in the unverified repository above, and YORI re-solves online. Measure this in the sim rather than assuming it.
- That gives an objective upper bound, a useful way to report any agent as "gap to solver". With duration noise, compare against rolling re-solve. A clairvoyant solver that knows realized durations could serve as a hindsight bound.
- **Rules on general job shops can be weak.** SPT's 60% gap comes from large instances without deadlines. Expect different behavior in a small deadline-driven kitchen, so test EDD and slack-based rules rather than inferring from these numbers. EDD for lateness is standard scheduling practice; I did not verify it from a kitchen-specific paper here.
- Starjob and ALAS show that LLMs can beat simple rules on job-shop gap in some setups. They do not show LLMs beating a CP solver, and neither has deadlines, kitchens, or per-call cost in the results I read.
- The published FIFO numbers give a realistic prior: optimization gains are real but moderate, and 17-51% figures come from multi-cook settings, where there is more to reorder. With one chef and one burner, the improvement may be smaller or larger depending on load; this is unknown.

### Gaps
- **I found no peer-reviewed study of a single-cook, single-burner order-sequencing problem**, and no published LLM evaluation on a restaurant OR benchmark.
- Hospitality and operations management journals may hold more studies. Searches here were web-based, and paywalled sources were not covered.
- YORI's cited prior work on cooking JSSPs (dispatching rules, online MIP) was not retrieved.
