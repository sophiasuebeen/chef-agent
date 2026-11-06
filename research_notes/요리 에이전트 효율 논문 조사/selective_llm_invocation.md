# Selective / Event-Triggered LLM Invocation Above a Deterministic Controller

Context: an optimizer runs a simulated pasta kitchen; an LLM is called only when a customer creates a disruption (cancel, rush, change order) and translates natural language into structured changes. Search date 2026-11-06.

Evidence tags used on every finding:
- **[M]** measured by the authors, almost always on their own benchmark. No result here is an independent replication unless stated. **[C]** claim or qualitative statement with no number behind it.
- **[V]** I read the passage in the arXiv PDF text. I read targeted passages, not whole papers. Table values come from PDF text extraction, so re-check them before quoting. **[A]** abstract or landing page only. **[S]** search-result snippet or a fetch-tool summary only, treat as unverified.
- **Preprint** = no peer-reviewed venue confirmed. **†** = venue recalled from memory and not checked in this session. Percent reductions marked "my calc" are my arithmetic on the paper's table.

## What do papers report on event-triggered / when-to-ask LLM control?

### Takeaway
Selective invocation has measured savings: 82-95% fewer calls in a small learned-gating study, about 50% cost or tokens with plan caches, about 40% inference time at a 3-frame interval, and usually little task loss when the lower layer can keep acting on its own. The most useful pattern is a slow LLM that never blocks a fast controller. The main caveat is that crude triggers lose performance: a hand-coded trigger made the fewest calls but succeeded far less often.

### Cited Findings

**Closest architectural analogues: event gating plus plan repair**
- Robust-TAMP (Vijayakumar, Ojha, Singhal, Varma, Thomas; 2026; preprint, arXiv 2608.28075) asks IF a discovery needs a replan, WHEN to act while planning, and WHERE to insert the fix. [M][V] Removing the IF gate (replan on every newly visible object) raised kitchen planner calls from 4.2 to 5.5 per trial, added 64 s mean planning time and gave no success gain. — [Robust-TAMP](https://arxiv.org/abs/2608.28075)
- [M][V] Same paper, on keeping the plan and inserting a correction: always appending corrections cut kitchen success to 52.5%; fixed front or end insertion gave 30.0% in the grill domain; replacing insertion with a full replan was worse in both domains. Continuing independent actions during planning only modestly reduced waiting per corrective episode (127 to 118 s kitchen, 147 to 135 s grill). — [Robust-TAMP](https://arxiv.org/abs/2608.28075)
- [M][V] Same paper, baseline table over 14 MuJoCo variants: Robust-TAMP with in-context examples 92.1% success, 3.8 calls, 355 s planning. Inner Monologue 45.0%, 15.0 calls, 1047 s. VLM-TAMP 18.6%, 2.1 calls, 85 s. Fewest calls did not mean best outcome. Per-call latency is about 92 s with a local Qwen3-VL-8B model. First-proposal urgency accuracy was only 58.8%. — [Robust-TAMP](https://arxiv.org/abs/2608.28075)
- Stability-aware rescheduling gate (Shiau, Chen, Fan; 2026; preprint, not peer reviewed). For each event it compares ignore, right-shift repair and full reschedule under a frozen horizon, scoring performance cost and a five-part stability score. A deterministic rule with an anti-thrashing interval recommends the action. A local LLM may only exercise bounded judgement, cannot generate schedules, is schema-checked and yields to the rule on failure; a human decides. [M][A] White-box validation only: 312-operation industrial instance, 27 event scenarios, 108 candidate schedules, 9 LLM protocol scenarios; no invariant broken; under 1 s per assessment; "LLM layer failed safe". No comparison of production outcomes. — [Shiau et al.](https://www.researchsquare.com/article/rs-11277628/v1)
- CoMuRoS (Borate et al.; preprint, arXiv 2511.22354): onboard perception classifies events as relevant or irrelevant, and only relevant events, failures or user intent changes trigger the Task Manager LLM. [M][V] Hardware: object recovery 9/10, coordinated transport 8/8, human-assisted recovery 5/5; replanning text set of only 5 scenarios scored 1.0 correctness. Call or cost savings not reported in the passages I read. — [CoMuRoS](https://arxiv.org/abs/2511.22354)

**Learned "when to ask"**
- When2Ask (Hu et al.; RLC 2024; arXiv 2306.03604). [M][V] LLM calls, Always-ask vs learned, with success rates:

| MiniGrid task | Calls: Always | Calls: When2Ask | Reduction (my calc) | Success: Always to When2Ask | Hard-coded trigger (calls / success) |
|---|---|---|---|---|---|
| SimpleDoorKey | 25.78 | 4.24 | 84% | 100% to 100% | 1.58 / 59% |
| KeyInBox | 26.78 | 4.33 | 84% | 100% to 100% | 1.58 / 59% |
| RandomBoxKey | 30.26 | 3.61 | 88% | 94% to 95% | 1.93 / 56% |
| ColoredDoorKey | 61.96 | 3.29 | 95% | 49% to 83% | 2.01 / 43% |
| MovingObstacle | 39.49 | 6.94 | 82% | 94% to 92% | 2.29 / 43% |

  Source: [When2Ask](https://arxiv.org/abs/2306.03604). The cost shows up as extra steps: 8-23% more timesteps than Always on four of five tasks (my calc). These are small toy grid worlds, and the gate needs RL training.
- KnowNo (Ren et al.; CoRL 2023†; arXiv 2307.01928) gates asking a human, not calling the LLM, using conformal prediction to give a statistical success guarantee. [M][V] Human help reduced 10-24% vs baselines. In the hardware multi-step setting, task success was 0.74 vs 0.38 with no help, but help was still needed on 58% of steps. Stated limitation: the guarantee assumes the environment is fully grounded. — [KnowNo](https://arxiv.org/abs/2307.01928)
- Introspective Planning (Liang, Zhang, Fisac; NeurIPS 2024†; arXiv 2402.06529). [C][V] Adds retrieved reasoning before conformal prediction, and argues success rate plus help rate are not sufficient metrics because over-asking and over-stepping both occur. — [IntroPlan](https://arxiv.org/abs/2402.06529)
- I found no paper titled "Agents that know when to call". When2Ask is the closest match found.

**Caching and reuse**
- AgenticCache (Kim, Wu, Tambe; MLSys 2026; arXiv 2604.24039). [M][V] Across 4 multi-agent embodied benchmarks and 3 models: task success +22% on average, simulation latency -65%, tokens -50%. Peak: 86% latency reduction and 79% cost savings with GPT-5 on TDW-COOK (cooking), with 97% average success. Motivating measurement: over 70% of runtime goes to LLM planning queries. — [AgenticCache](https://arxiv.org/abs/2604.24039)
- Caveats on AgenticCache, [V]: main results use a warm-start cache pre-filled from successful GPT-5 trajectories on separate tasks; TDW-COOK evaluates only 18 episodes; the updater queries **periodically** with suppression, so it is not purely event-triggered. Cold misses pause high-level planning until the LLM replies. — [AgenticCache](https://arxiv.org/abs/2604.24039)
- Agentic Plan Caching (Zhang, Wornow, Wan, Olukotun; NeurIPS 2025; arXiv 2506.14852). [M][V] Over 5 workloads: cost -50.31%, latency -27.28%, 96.61% of optimal performance. Worst-case overhead at zero hit rate is 1.31%. It caches plan templates rather than responses, because outputs depend on external data. — [APC](https://arxiv.org/abs/2506.14852)
- Voyager (Wang et al.; 2023; TMLR†; arXiv 2305.16291). [M][V] Reusable skill library in Minecraft: 3.3x more unique items, 2.3x longer distances, tech-tree milestones up to 15.3x faster. These are capability metrics. I found no call or cost savings in the passages I read, so it is not evidence for efficiency. — [Voyager](https://arxiv.org/abs/2305.16291)

**Fast and slow dual systems**
- SwiftSage (Lin et al.; NeurIPS 2023†; arXiv 2305.17390). [M][V] ScienceWorld score 84.7 vs SayCan 33.8, ReAct 36.4, Reflexion 45.3. Tokens per action 757 vs 1,856 / 1,971 / 2,983, about 62% below ReAct (my calc). Authors attribute this to invoking the LLM only when needed plus an action buffer. The fast-only agent scored 49.22, so the LLM adds real value. — [SwiftSage](https://arxiv.org/abs/2305.17390)
- HLA (Liu et al.; AAMAS 2024; arXiv 2312.15224) is **the closest domain match**: Overcooked with natural-language human commands at about 3 Hz. Slow LLM for intent, light LLM for macro actions, script executor for atomic actions. [M][V] Macro-action latency 1.07 s vs 4.16 s (slow-only) and 2.30 s (fast-only). Atomic latency 0.08 s vs 0.28 s best competitor and 0.71 s with no executor. — [HLA](https://arxiv.org/abs/2312.15224)
- AgileThinker (Wen, Ye, Zhang, Yang, Zhu; ICLR 2026; arXiv 2511.04898) runs reactive and planning threads in parallel, with the reactive thread reading partial reasoning. [M][V] Wall-clock scores, reactive / planning / AgileThinker: Freeway 0.24 / 0.12 / 0.88; Snake 0.37 / 0.04 / 0.45; **Overcooked 0.57 / 0.00 / 0.89**. Measured decoding about 0.047 s per token on the DeepSeek API. — [AgileThinker](https://arxiv.org/abs/2511.04898)
- RACE-Sched (Cao, Yuan, Liu; 2026; arXiv 2605.29262; IJCAI 2026 template, and a search result lists it under [IJCAI 2026](https://www.ijcai.org/proceedings/2026/0684.pdf), which I did not open). The dispatcher never waits for the LLM, which writes heuristics in the background; candidates pass a sandbox replay and go live by atomic pointer swap. [M][V] Average RPD 5.33% (Qwen3-8b) vs 9.82% for the best DRL baseline; input tokens about 60% below direct LLM control. Note this is a rule-improvement loop, not a reaction to natural-language requests. — [RACE-Sched](https://arxiv.org/abs/2605.29262)
- ReflecSched (Cao, Yuan; 2025; preprint, arXiv 2508.01724). LLM reflection runs "only at critical, event-driven moments". [M][V] 71.35% win rate over direct LLM baselines and 15.1% more token-efficient on normal-scale problems; RPD 6.09% on GEN-Bench. — [ReflecSched](https://arxiv.org/abs/2508.01724)

**LLM as supervisor over MPC or fast planners**
- AESOP (Sinha et al.; RSS 2024†; arXiv 2407.08735). A fast embedding-based anomaly classifier triggers a slow generative reasoner, while MPC keeps multiple fallback plans jointly feasible during the LLM's latency. [M][V] Slow-reasoner assessment in the VTOL domain: GPT-4 with chain of thought TPR 0.89, FPR 0.10, accuracy 0.90; GPT-4 without it 0.65 / 0.06 / 0.79; Llama 2 7B 0.52 / 0.46 / 0.52. — [AESOP](https://arxiv.org/abs/2407.08735)
- AsyncDriver (Chen et al.; ECCV 2024†; arXiv 2406.14556). [M][V] Running the LLM every 3 frames cut inference time by nearly 40% with about 1% accuracy loss on nuPlan. The cached guidance features keep driving the real-time planner between LLM updates. — [AsyncDriver](https://arxiv.org/abs/2406.14556)
- LanguageMPC (Sha et al.; 2023; arXiv 2310.03026, venue unverified). The LLM outputs an action bias and selects MPC weights, updating "every few seconds", while MPC runs at high frequency. [M][V] Overall cost down 18.1% vs a learning-based method and 16.4% vs an optimization-based method (GPT-3.5). No figure on call savings. — [LanguageMPC](https://arxiv.org/abs/2310.03026)
- DriveVLM / DriveVLM-Dual (Tian et al.; CoRL 2024†; arXiv 2402.12289). The VLM trajectory seeds a classical planner, which runs asynchronously at high frequency and "can selectively receive" it. [C][V] Deployed on a production vehicle (Li Auto is an author affiliation). I could not extract a latency figure or field-outcome metrics. — [DriveVLM](https://arxiv.org/abs/2402.12289)
- LLM-Assist (Sharan et al.; 2023; arXiv 2401.00125, venue unverified). Hybrid with the PDM-Closed rule planner; the LLM proposes planner parameters. [M][V] 11% fewer dangerous driving scenarios on nuPlan; performance rises with allowed queries per step. This is direct evidence that throttling queries costs quality. — [LLM-Assist](https://arxiv.org/abs/2401.00125)
- DiLu (Wen et al.; ICLR 2024; arXiv 2309.16292). [M][V] 70% success with 40 memory items vs 69% for GRAD RL after 600,000 episodes. The LLM decides at 1 Hz, yet authors report 5-10 s decision latency and state that hallucinations are not eliminated. — [DiLu](https://arxiv.org/abs/2309.16292)

**Grounding, and cost routing as an adjacent lever**
- SayCan (Ahn et al.; CoRL 2022†; arXiv 2204.01691). LLM skill scores are multiplied by learned affordance values. [M][V] 84% planning and 74% execution in a mock kitchen; 81% and 60% in a real kitchen; 67% planning without affordances. 65% of errors were LLM failures and 35% affordance failures. It queries at each step, so it is a grounding precedent, not a savings one. — [SayCan](https://arxiv.org/abs/2204.01691)
- Model routing, once the decision to call is made. FrugalGPT (Chen, Zaharia, Zou; 2023): [M][V] up to 98% cost reduction matching the best LLM on one news dataset. RouteLLM (Ong et al.; ICLR 2025): [M][V] over 2x cost reduction without quality loss. — [FrugalGPT](https://arxiv.org/abs/2305.05176); [RouteLLM](https://arxiv.org/abs/2406.18665)

### Inferences
- The reader's design is closest to Robust-TAMP, Shiau et al. and HLA, not to SayCan or DiLu, which call the LLM at every decision. Customer messages are an unusually clean trigger because they are explicit and exogenous, so most of the detection problem these papers solve does not apply. The hard part moves to interpretation and plan repair.
- Savings are heavily dependent on the baseline. "Calls vs an LLM on every tick" will look enormous for any event-triggered system. The informative comparators for this project are the optimizer plus a rule or form parser with no LLM (does the LLM add anything?) and the same stack with an LLM-per-step supervisor.
- Reported savings cluster by mechanism and should not be pooled: domains, baselines and metrics all differ.
- The mid-execution insertion evidence in Robust-TAMP suggests a cancel, rush or change should be a local repair to the current plan rather than a full replan, but it comes from manipulation, not scheduling.

### Gaps
- I found no paper on event-triggered LLM calls for a kitchen or restaurant scheduler. TDW-COOK, Overcooked and Robotouille are the nearest domains, and none is optimizer-controlled.
- I found no head-to-head of periodic vs event-triggered vs learned gating on the same scheduling benchmark.
- The HLA human-study sample size and the DriveVLM on-vehicle latency were not extracted.
- AESOP closed-loop outcome numbers and detector latency were not extracted.

## How well do LLMs translate natural language into validated structured actions or constraints, how do they fail, and what guardrails work?

### Takeaway
Translating into constraints or code that a solver then checks works far better than asking the LLM to produce a schedule: roughly 90-95% against 15-73% feasibility, though across very different tasks. The failures that remain are mostly semantic rather than syntactic: ambiguity, unsupported requests, wrong classification and logic errors. Schema validity does not catch those, so guardrails need solver checks, an explicit "can't do this" path and clarification.

### Cited Findings

**Direct generation, the weak baseline**
- SCHEDBench (Sharma, Sharma; 2026; preprint, arXiv 2608.00991; 1,132 instances; models generate full schedules). [M][V] Feasibility under full surface-form variation: GPT-5.5 55.9%, Gemini 3 Flash Preview 29.5%, all others below 26%, cross-model average 15.2%. On a matched subset, variation dropped GPT-5.5 from 84.0% to 61.5%. Reordering constraints alone shifted violations above noise for five models. — [SCHEDBench](https://arxiv.org/abs/2608.00991)
- DScheLLM (Zhang et al.; 2026; preprint, arXiv 2601.09100; fine-tuned 7B model; job shop with five event types including insertion and cancellation). [M][V] Fast mode: 73.33% feasible, 46.67% optimal. The model's own fast/slow selection was 100% right on fast tasks but only 33.33% on slow tasks. — [DScheLLM](https://arxiv.org/abs/2601.09100)
- TravelPlanner line. [M][V] GPT-4 0.6% and o1-preview 10% direct; LLM-Modulo 20% (GPT-4-Turbo) and 65% (o1-preview); LLM-to-SMT solver 93.9% on the test set, and 81.6% / 91.7% of unsatisfiable queries repaired on two datasets. These numbers are reported by Hao et al., whose own method is the 93.9%. — [Hao et al.](https://arxiv.org/abs/2404.11891) (Hao, Chen, Zhang, Fan; 2024; NAACL 2025†)
- LLM-Modulo position paper. [C][V] LLMs cannot plan or self-verify alone and should be paired with external sound verifiers; cites about 12% of GPT-4 plans being executable and goal-reaching in autonomous mode. — [Kambhampati et al.](https://arxiv.org/abs/2402.01817) (ICML 2024†)

**NL to constraints or code with a solver behind it**
- MeetMate (Lawless et al.; ACM TiiS 14(3), 2024; arXiv 2312.06908) is the **closest fit for "user sentence to constraint"**. Diary study: 64 participants, 114 meetings, 211 preference expressions. [M][V] GPT-4 with rephraser: compilation 97.2%, precision 95.8%, recall 94.0% against expert implementations. Without the rephraser: 93.4 / 95.2 / 89.6. **The safeguard that judges whether a request is expressible reached only 79.8% (GPT-4) and 81.8% (GPT-3) accuracy.** — [MeetMate](https://arxiv.org/abs/2312.06908)
- OptiChat (Chen, Li et al.; INFORMS IJDS DOI seen in search; arXiv 2501.08406). 172 expert-drafted Q&A pairs, 24 Pyomo models. [M][S, read through a fetch summary of the HTML] Overall accuracy 62.8% (GPT-4o-mini), 83.1% (GPT-4o), 84.3% (GPT-4.1), 88.9% (o3). Why-not queries are weakest at 54.1-78.4%. Average response 0.2-0.5 min. — [OptiChat](https://arxiv.org/abs/2501.08406)
- OptiChat failure mix and ablation, same tag. GPT-4.1 errors: syntax 46.8%, classification 31.3%, logic 21.9%. o3: syntax 10.0%, classification 25.0%, logic 65.0%. Removing predefined functions dropped diagnosing to 0.0% / 33.3% and sensitivity to 0.0% / 0.0% (GPT-4.1 / o3). This supports a narrow tool API over free code generation, and shows stronger models shift errors from syntax to logic. — [OptiChat](https://arxiv.org/abs/2501.08406)
- Ye, Luebbers, Gombolay (ICRA 2026, venue inferred from file name; GPT-4 + AutoGen code-writer with retry on Python errors + MILP + A*). [M][V] Within-subjects n=30, simulated maritime domain: lower workload (p<.0001), better usability (p<.0001), lower planning time vs templates (p=.0027), with similar path optimality. A summarizer explains the generated code back to the user. — [Ye et al.](https://m-luebbers.github.io/pdfs/icra26.pdf)
- Human-Centered Planning (arXiv 2311.04403). [S, unverified] 47% of user-specified constraints were vague and open-ended; a study with 12 participants is mentioned in the same search result, though I could not confirm it belongs to the same paper. — [Human-Centered Planning](https://ar5iv.labs.arxiv.org/html/2311.04403)

**Tool and function calling**
- ToolSandbox (Lu et al., Apple; 2024; NAACL Findings 2025†; arXiv 2408.04682). [M][V] GPT-4o: average 73.0, single-tool 87.8, state dependency 84.0, canonicalization 76.6, **insufficient information 42.0**. Same category: GPT-3.5 22.3, Claude 3 Opus 57.3. Models given a task they cannot do often call tools anyway. Models are 2024 vintage, so treat the level as dated. — [ToolSandbox](https://arxiv.org/abs/2408.04682)
- τ-bench (Yao, Shinn, Razavi, Narasimhan; 2024; ICLR 2025†; arXiv 2406.12045; retail includes order cancel and modify policies). [M][V] GPT-4o with function calling about 61% retail and 35% airline; pass^8 about 25% in retail. Failures: reasoning over databases, ad hoc policies, compound requests. — [τ-bench](https://arxiv.org/abs/2406.12045)
- BFCL (Patil et al.; ICML 2025). [C][S] Top models do well on single-turn calls; memory, dynamic decision-making and long-horizon reasoning stay open. Scores not extracted. — [BFCL](https://proceedings.mlr.press/v267/patil25a.html)
- PIZZA (Arkoudas et al., Amazon Alexa AI; 2022; preprint, arXiv 2212.00265). Food-order parsing to executable form, **pre-LLM**. [M][V] Exact match on 1,357 human test utterances: BART to executable form 78.56%, BART TOP 62.17%, PCFG grammar 68.02%. Direct executable targets beat a pipeline with separate entity resolution. — [PIZZA](https://arxiv.org/abs/2212.00265)

**Structured output and guardrails**
- Format-restriction effect, conflicting evidence. Let Me Speak Freely (Tam et al.; 2024; EMNLP Industry†): [M][V] reasoning degrades under format restrictions, and on Last Letter 100% of GPT-3.5 JSON-mode responses placed the answer key before the reasoning key; NL-to-Format nearly matches free text. — [Tam et al.](https://arxiv.org/abs/2408.02442). JSONSchemaBench (Geng et al.; 2025; preprint, Microsoft/EPFL): [M][V] constrained decoding improves downstream tasks by up to 4% and speeds generation 50%; the best framework supports twice as many real-world schemas as the worst. — [JSONSchemaBench](https://arxiv.org/abs/2501.10868)
- AgentSpec (Wang, Poskitt, Sun; 2025; arXiv 2503.18666, venue unverified), a runtime rule DSL. [M][V] Prevents unsafe execution in over 90% of code-agent cases, eliminates hazardous actions in embodied tasks, 100% AV compliance, millisecond overhead. Rules generated by o1 reach 95.56% precision and only 70.96% recall on embodied agents. — [AgentSpec](https://arxiv.org/abs/2503.18666)
- Safety Chip (Yang, Raman, Shah, Tellex; 2023; arXiv 2309.09919). [C][V] NL to LTL, with experts verifying the formula; the automaton validates actions and the LLM only explains violations and replans, because LLM classification is treated as unreliable. Numbers not extracted. — [Safety Chip](https://arxiv.org/abs/2309.09919)
- OptiGuide limitation. [C][V] "Can we dock demand xc132 fifteen days earlier?" is ambiguous among three reference dates, and the LLM may write wrong code. A safeguard agent is part of the design. — [OptiGuide](https://arxiv.org/abs/2307.03875)

### Inferences
- A workable stack from this evidence: closed action schema with a few verbs, LLM fills arguments only, an explicit `unsupported` / `needs_clarification` result, deterministic validation against order state, solver feasibility check, and confirmation back to the customer when a change is costly.
- The likely weak point is not JSON validity but the request the system cannot honor: a rush that is infeasible, or a cancel on a dish already plated. MeetMate's about 80% safeguard and ToolSandbox's 42.0 both point there. **I would test this category first.**
- Compound requests ("cancel the carbonara and make the other one a rush") are a named τ-bench failure and should be in the test set.
- Reporting pass^k over repeated runs is likely more honest than single-run accuracy.
- Whether format restriction hurts a pasta-order translator is open, but the Tam et al. harm was on reasoning tasks. Slot-filling extraction carries less reasoning, so I expect a small effect. That is an inference, not a measurement.

### Gaps
- I found no credible evaluation of LLMs on restaurant cancel, rush and change intents specifically. A [2025 CSIT paper](https://aircconline.com/csit/papers/vol15/csit151804.pdf) on RAG-grounded menu-to-JSON turned up in search [S, unverified, low-tier venue] and reports fewer JSON errors.
- I did not locate LLM results on the PIZZA dataset, or any study with frontier 2026 models on stateful order edits.
- No per-call latency distribution for translation-only calls was found. OptiChat's 0.2-0.5 min covers a heavier workflow and likely overstates it.

## What real-world or industrial LLM-for-scheduling/operations systems exist with reported outcomes?

### Takeaway
Reported deployments are rare and their outcomes are thin. OptiGuide in Azure is the strongest primary source, but it is an explainability and what-if tool with preliminary accuracy and qualitative feedback, not a disruption-handling system with business outcomes. I found no peer-reviewed study showing an LLM improving live shop-floor KPIs.

### Cited Findings
- OptiGuide (Li, Mellou, Zhang, Pathuri, Menache; Microsoft; 2023; arXiv 2307.03875). Planners ask in plain text; generated code runs against a Gurobi MIP solved hourly with about 500 MB of input. [M][V] Benchmark accuracy with GPT-4: 93% in-distribution with examples, 59% with none, 80-84% out-of-distribution with 10 examples. — [OptiGuide](https://arxiv.org/abs/2307.03875)
- OptiGuide deployment. [M/C][V] Deployed for Azure server deployment planning, with over 90% in-distribution accuracy in a "preliminary evaluation" and "positive" user feedback. Before it, one what-if question took more than three operators plus one on-call engineer. No measured time or cost saving is reported. Interactive re-optimization ("use at most two suppliers") is listed as **future work**, so this is not the reader's write-path design. — [OptiGuide](https://arxiv.org/abs/2307.03875)
- Literature census (Shiau et al.; 2026; preprint). [M][A] A structured review of 43 studies from 2024-2026: 44% use LLMs to produce rules, heuristics or code offline; only 16% close the event-decision-execution loop with measured results; none of the disruption-injection studies measures schedule stability. A single unreviewed review, but the only census of this kind I found. — [Shiau et al.](https://www.researchsquare.com/article/rs-11277628/v1)
- LSCM / PolyU / HKU MiC factory platform. [C][fetch summary] LLM multi-agent rescheduling with a TextSchedule function converting natural language into scheduling constraints. "Undergoing pilot deployment" at a named factory, claims closed-loop rescheduling within 1 minute, no baseline or metric. Organization article, not evidence of outcomes. — [LSCM](https://www.lscm.hk/en/blog/detail/38/)
- Amarasinghe et al. (2023; arXiv 2309.13218, venue unverified). Fine-tuned code LLM for production-scheduling formulation, with a real-world case study and open datasets. [C][V] An offline modeling aid; no live operating outcome in the passages I read. — [Amarasinghe et al.](https://arxiv.org/abs/2309.13218)
- Agentic LLMs in the Supply Chain (Jannelli et al.; 2024; preprint under review, arXiv 2411.10184). Consensus-seeking agents in a simulated chain, with a tool-only agent as the strong baseline. Simulation, not deployment; numbers not extracted. — [Jannelli et al.](https://arxiv.org/abs/2411.10184)
- DriveVLM-Dual on a production vehicle is the clearest deployed slow/fast hybrid, but in a different domain and without quantified field results in the passages I read. — [DriveVLM](https://arxiv.org/abs/2402.12289)

### Inferences
- Claims like "LLM improves real-world rescheduling" should be treated as unproven at present. A simulation with a clean, repeatable evaluation would be in line with, not behind, most of this literature.
- Published deployments keep a human or planner as final authority (OptiGuide planners confirm or override; Shiau et al. human decides). The reader's fully automated write path has less deployment precedent, though a simulated kitchen also carries lower stakes.

### Gaps
- No deployed restaurant or kitchen system with published measured results was found. I did not search trade press systematically, and the suggested source policy excludes unmeasured blogs.
- No published throughput, tardiness or revenue effect from a live LLM rescheduling deployment was found. This may be publication lag or commercial secrecy, so absence here is weak evidence.
- Follow-up reporting from the LSCM pilot was not found.

## Which designs gave the best tradeoff, and what is the published evidence against this kind of hybrid?

### Takeaway
The best-supported design has a deterministic layer that always keeps executing, an LLM limited to bounded outputs, a validator or solver before anything takes effect, and repair rather than wholesale replanning. The evidence against is mostly about a poor trigger, latency during time-critical windows, stale cached plans, plan churn and weak measurement. None of it refutes the hybrid, and few papers test the failure modes directly.

### Cited Findings

**Designs compared (each row uses its own benchmark; not directly comparable)**

| Design pattern | Example | Savings [M] | Performance effect [M] | Fit to the pasta kitchen (my judgement) |
|---|---|---|---|---|
| Explicit event gate + local repair | [Robust-TAMP](https://arxiv.org/abs/2608.28075) | 5.5 to 4.2 calls, 64 s less planning | No success change from gate; 92.1% overall | High |
| Rule decides, LLM bounded and fail-safe | [Shiau et al.](https://www.researchsquare.com/article/rs-11277628/v1) | Under 1 s per assessment | Invariants held; no outcome study | High, but thin evidence |
| NL to solver constraints | [MeetMate](https://arxiv.org/abs/2312.06908), [Hao et al.](https://arxiv.org/abs/2404.11891) | Not reported | 94-96% P/R; 93.9% vs 10% direct | High for translation |
| Slow LLM + fast mind + executor | [HLA](https://arxiv.org/abs/2312.15224) | 1.07 s vs 4.16 s macro latency | Human study favorable | High, same game family |
| Parallel threads, never block | [AgileThinker](https://arxiv.org/abs/2511.04898), [RACE-Sched](https://arxiv.org/abs/2605.29262) | About 60% fewer input tokens (RACE) | Overcooked 0.89 vs 0.57; RPD 5.33 vs 9.82 | Medium to high |
| Plan cache + async updater | [AgenticCache](https://arxiv.org/abs/2604.24039), [APC](https://arxiv.org/abs/2506.14852) | About 50% tokens or cost | 96.61% of optimal (APC) | Medium; the optimizer already holds the plan |
| Learned asking policy | [When2Ask](https://arxiv.org/abs/2306.03604) | 82-95% fewer calls | Roughly equal success, more steps | Low; customer events are already explicit |
| Fixed low-frequency interval | [AsyncDriver](https://arxiv.org/abs/2406.14556) | About 40% inference time | About 1% loss | Low to medium |

**Evidence against, or limits**
- **Trigger misses.** A hard-coded trigger made the fewest calls but cut success to 43-59% vs up to 100%. Toy domains, but a clear warning about hand-defined events. — [When2Ask](https://arxiv.org/abs/2306.03604)
- **Throttling cost.** LLM-Assist's performance rises with allowed queries, and When2Ask takes more steps than Always on most tasks. — [LLM-Assist](https://arxiv.org/abs/2401.00125); [When2Ask](https://arxiv.org/abs/2306.03604)
- **Latency while the world moves.** A pure planning agent scored 0.00 in Overcooked under wall-clock time, and 0.04-0.12 in the other two games. — [AgileThinker](https://arxiv.org/abs/2511.04898). DiLu reports 5-10 s per decision. — [DiLu](https://arxiv.org/abs/2309.16292). Robust-TAMP sees about 92 s per local call and only small waiting gains from concurrency, "workload-dependent". — [Robust-TAMP](https://arxiv.org/abs/2608.28075)
- **Scheduling time-scale mismatch (claim).** RACE-Sched authors argue multi-second LLM calls are incompatible with millisecond control loops in high-speed lines. [C][V] A pasta kitchen does not run on that time scale, so this applies less. — [RACE-Sched](https://arxiv.org/abs/2605.29262)
- **Stale plans.** AgenticCache's pattern-only reuse falls sharply below dynamic GPT-5 (81.2-100%, against a lower series of 10-27.5% and a mid series of 57.2-80%; the extracted legend names only two series, so I cannot assign the last two reliably). Authors state pure reuse risks acting on stale information, for example when another agent has already taken the target object. — [AgenticCache](https://arxiv.org/abs/2604.24039)
- **Timer-driven planning is hard for LLMs.** Robotouille cooking benchmark (Gonzalez-Pumariega et al.; 2025; ICLR 2025†): [M][V] GPT-4o ReAct 47% synchronous vs **11% asynchronous**, with failures dominated by rule violations and goal misinterpretation, and poor failure recovery. This counts against the LLM owning timing and supports leaving it to the optimizer. — [Robotouille](https://arxiv.org/abs/2502.05227)
- **Scheduling failure modes.** ReflecSched names the long-context paradox, heuristic underutilization (LLM priors override expert rules) and myopic greed. — [ReflecSched](https://arxiv.org/abs/2508.01724)
- **Self-routing is unreliable.** DScheLLM picked slow reasoning correctly on only 33.33% of slow tasks. — [DScheLLM](https://arxiv.org/abs/2601.09100). AESOP's slow reasoner FPR ranges from 0.06 to 0.54 by model and prompt. — [AESOP](https://arxiv.org/abs/2407.08735)
- **Consistency.** Same-task reliability collapses over repeated runs (pass^8 about 25%). — [τ-bench](https://arxiv.org/abs/2406.12045)
- **Plan churn is largely unmeasured.** No disruption-injection study in one review measured stability; a longer frozen horizon improves stability but reduces reaction freedom. — [Shiau et al.](https://www.researchsquare.com/article/rs-11277628/v1)
- **Evaluation asymmetry.** Authors note most agent work assumes environments halt during reasoning. — [AgileThinker](https://arxiv.org/abs/2511.04898). Benchmarks of this kind can overstate real-time viability.

### Inferences
- **Recommended configuration for the reader's proposal:** optimizer keeps cooking during the LLM call, using the pre-disruption plan. The LLM outputs a validated change request only. The optimizer decides among no-op, local repair and re-solve, under a frozen horizon for dishes in progress.
- **The state-race problem is the concrete version of "stale plan" here.** The dish may advance while the LLM is translating, so a cancel may arrive after plating. Validate against state at commit time, not at call time. I found no paper evaluating this exact race.
- **Customer-only triggers leave a hole.** A burnt batch, a stockout or a slow station produces no customer message. These should go through deterministic detectors to the optimizer without any LLM. The reader's trigger scope is defensible only if these are handled separately.
- **Possible objection worth stating to a mentor:** if the disruption vocabulary is small (cancel, rush, change), a form or a grammar parser may match the LLM at zero latency and zero token cost. PIZZA's 68% PCFG on human utterances suggests free text is harder than it looks, but that data predates LLMs. The project should measure this rather than assume it.
- **Metrics to report for credibility:** calls per service, end-to-end decision latency, events arriving during an in-flight call, late-dish rate or tardiness vs an oracle with instant correct translation, schedule changes per event (nervousness), translation exact-match, correct-refusal rate on infeasible requests, and pass^k.
- **Do not expect "cost savings" alone to carry the argument.** With few calls per service the token cost is probably tiny either way. The stronger case is latency isolation and safety of the control loop. This is my reasoning, not a published result.

### Gaps
- I found no benchmark that scores events arriving **during** an in-flight LLM call in a scheduling setting. AgileThinker comes closest, in games.
- No controlled study compares a validated-translation LLM against a grammar or form parser on a disruption-driven optimizer.
- No direct published comparison of local repair vs full re-solve under LLM-translated requests in scheduling was found. Robust-TAMP is the nearest, in manipulation.
- Nearly all numbers are self-reported on authors' own setups, and several 2026 items are preprints without replication.
- I did not read every paper end to end, and I capped the search effort, so omissions are likely, particularly in operations-research journals outside arXiv.
