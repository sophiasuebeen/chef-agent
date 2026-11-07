# Optimization and dispatching methods for dynamic job shop scheduling and rescheduling, including LLM-evolved rules

Target setting: 2 to 20 orders of about 9 tasks each (18 to 180 operations), 4 resources, about 1 s per decision, with tardiness, arrivals and noisy durations.

Evidence tags: **[FT]** I read the full text or its tables. **[AB]** abstract or metadata only. **[SN]** search-result snippet only, so verify before quoting. **[PRE]** preprint with no peer-reviewed venue located. "My calc" means arithmetic I did on the paper's published numbers.

Read this first: no source I located tests this exact setting. Most gap numbers are for makespan, not tardiness, on square instances (jobs roughly equal to machines). The kitchen is job-heavy, at up to 5 jobs per resource, and has no published 1 s benchmark.

## Q1. CP-SAT and CP vs MIP vs dispatching rules: optimality gaps and solve times at small sizes

### Takeaway
With minutes of compute, CP-SAT proves optimality on makespan job shops up to about 15x15 and rules sit 12 to 42% above optimal at 6x6, while CP beats MIP on shop problems generally. I found no published sub-second solve times, and CP is much weaker on tardiness objectives than on makespan, so the "1 s is enough" assumption is untested.

### Cited Findings

**Exact vs rules, small sizes (makespan)**

Zhang et al., "Learning to Dispatch for Job Shop Scheduling via Deep Reinforcement Learning", 2020, arXiv:2010.12367 (NeurIPS 2020 per the citation in Huang et al. ref [39]) [FT]. Random Taillard-style instances, 100 per size. OR-Tools had a 3600 s limit. Gap is relative to the OR-Tools result. — [L2D full text](https://ar5iv.labs.arxiv.org/html/2010.12367)

| Size | OR-Tools optimal at 3600 s | SPT gap / time | MWKR gap | FDD/MWKR gap | MOPNR gap / time | L2D gap / time |
|---|---|---|---|---|---|---|
| 6x6 | 100% | 42.0% / 0.012 s | 34.6% | 24.0% | 29.2% / 0.012 s | 17.7% / 0.061 s |
| 10x10 | 100% | 50.0% / 0.037 s | 42.6% | 36.6% | 36.5% / 0.037 s | 22.3% / 0.176 s |
| 15x15 | 99% | 59.2% / 0.113 s | 52.6% | 45.1% | 42.6% / 0.112 s | 26.7% / 0.435 s |
| 20x20 | 4% | 62.0% / 0.306 s | 58.6% | 49.6% | 45.5% / 0.305 s | 29.0% / 0.932 s |

- These times are for a whole-instance rollout, not one decision. The optimal-rate column says nothing about how fast optimality was reached. — [L2D](https://ar5iv.labs.arxiv.org/html/2010.12367)
- Infantes et al. reproduce the setup with a 3-minute limit, 100 instances per size, and OR-Tools defining the 0 gap. At 6x6: OR-Tools 485, Wheatley 521 (7.4%), best PDR 545 (12.4%), L2D 571 (17.7%). At 10x10: OR-Tools 812, Wheatley 890 (9.6%), best PDR 948 (16.8%), L2D 993 (22.3%). — "Learning to Solve Job Shop Scheduling under Uncertainty", Infantes, Roussel, Pereira, Jacquet, Benazera, 2024, arXiv:2404.01308 [FT tables; author list beyond Infantes/Pereira from memory, verify] — [Wheatley](https://arxiv.org/html/2404.01308v1)
- **Conflict:** best-PDR gaps at 6x6 are 24.0% in L2D and 12.4% in Infantes et al. The instance sets differ, and Infantes et al. retrieve each machine's order from the PDR and rebuild with a schedule generation scheme (SGS). That may explain part of the difference, but neither paper tests this. — [L2D](https://ar5iv.labs.arxiv.org/html/2010.12367); [Wheatley](https://arxiv.org/html/2404.01308v1)

**CP-SAT vs CP Optimizer**

- Da Col & Teppan, "Google vs IBM: A Constraint Solving Challenge on the Job-Shop Scheduling Problem", 2019, arXiv:1909.08247, EPTCS, Sep 2019 per DOAJ [FT via ar5iv]. OR-Tools 6.10 vs CP Optimizer 12.8, 74 classic instances, 1200 s limit, 1 and 4 cores. Single core: CPO reached the optimum on 59 of 74 (79.7%), ORT on 58 of 74 (78.3%). CPO was better on 13 instances, ORT on 6. CPO was faster on 63.5%, ORT on 18.9%. At 10,000 to 100,000 operations with 6 h: CPO optimal on 16 of 24 on one core; ORT on 0 of 24 on one core and 7 of 24 on four cores. — [Google vs IBM](https://ar5iv.labs.arxiv.org/html/1909.08247)
- Da Col & Teppan, "Industrial-size job shop scheduling with constraint programming", *Operations Research Perspectives* 9, 2022, DOI 10.1016/j.orp.2022.100249 [AB; full text returned 403]. Up to 1 million operations on 1000 machines, makespan and time-to-solve, 1 and 4 cores. Its numbers are not useful at kitchen scale. — [EconPapers](https://econpapers.repec.org/RePEc:eee:oprepe:v:9:y:2022:i:c:s2214716022000215)
- Lan & Berkhout, "PyJobShop: Solving scheduling problems with constraint programming in Python", 2025, arXiv:2502.13483 [FT, PRE]. OR-Tools 9.11 vs CP Optimizer 22.1, 8 cores, 900 s, instances mostly from Naderi et al. Average RPD / optimality gap: — [PyJobShop](https://arxiv.org/html/2502.13483v1)
  - JSP (242 instances): OR-Tools 1.98 / 3.40, CPO 1.80 / 4.09.
  - FJSP (289): OR-Tools 0.68 / 1.04, CPO 0.99 / 27.67.
  - **Total-tardiness permutation flow shop, TT-PFSP (135): OR-Tools 53.14 / 66.86, CPO 20.79 / 72.43.** Instance sizes for this row were not captured, and RPD is set to 100 when the best-known value is 0 and the numerator is nonzero, which inflates tardiness RPD.

**CP vs MIP**

- Naderi, Ruiz & Roshanaei, "Mixed-Integer Programming vs. Constraint Programming for Shop Scheduling Problems: New Results and Outlook", *INFORMS JoC* 35(4):817-843, 2023 [AB only: the author PDF connection was refused and the INFORMS page was not readable]. CP Optimizer 20.1 vs CPLEX 20.1 and Gurobi 9.1.2, 12 shop problems, more than 6,600 instances. CPO generally wins on feasibility, gap and quality, except on pure assignment problems, where MIP wins. Default solver settings. I could not retrieve per-problem gaps or the time limit. — [EBSCO listing](https://www.ebsco.com/articles/computer-science/5450d6f5-182f-5897-8a73-fcd6221fc76b/mixed-integer-programming-vs-constraint-programming-for-shop-scheduling-problems-new-results-and-outlook); [INFORMS](https://pubsonline.informs.org/doi/fpi/10.1287/ijoc.2023.1287)
- Sahraeian (attribution from an index record), "On the optimal modeling and evaluation of job shops with a total weighted tardiness objective: CP vs MIP", *Applied Mathematical Modelling* 39(2), 2015 [SN]. CP outperformed MIP at finding optima up to 450 jobs, in what the snippet describes as a special two-stage configuration. — [record](https://next.sciencegate.app/document/10.1016/j.apm.2014.07.032)

**Modeling and tooling**

- CP-SAT models each operation as an interval variable with no-overlap per machine and linear precedence constraints; optional intervals handle alternative resources. This is a community mirror of the OR-Tools doc, not the canonical URL. — [scheduling.md mirror](https://github.com/farao-community/or-tools/blob/stable/ortools/sat/doc/scheduling.md)
- CP-SAT returning FEASIBLE under a time limit is not a proof of optimality, which matters when reading "RL vs CP-SAT" comparisons. — [jorsacademy repo, SN](https://github.com/jorsacademy/cp-sat-job-shop-scheduling)
- A third-party Rust wrapper claims optimality proofs on 15x10 in under 5 s on 10 cores. This is an unverified code comment, not a benchmark. — [converge-ferrox-solver](https://docs.rs/crate/converge-ferrox-solver/latest/source/src/jobshop/cpsat.rs)

### Inferences
- Static CP-SAT is probably comfortable at the small end of the range (18 to about 90 operations), since 6x6 (36 ops) and 10x10 (100 ops) were always solved within the limits above. "Within the limit" is not "within 1 s", however.
- 20 orders x 9 tasks on 4 resources is 180 operations, about 45 per resource. That is larger than 10x10 and shaped differently from any square benchmark, so the 100% optimal rate should not be carried over.
- Tardiness is the bigger risk than size. PyJobShop's TT-PFSP row shows gaps above 60% for both solvers at 900 s, against 3 to 4% for JSP. Expect a good incumbent at 1 s without a proof, and treat the solver as an anytime heuristic.
- MIP has no clear role here. Assignment-heavy problems are its one winning class, and a 4-resource kitchen is sequencing-dominated.

### Gaps
- **No source reports CP-SAT solution quality at a 1 s limit on instances near 180 operations with a tardiness objective.** This is the most decision-relevant unknown, and a short benchmark on the actual kitchen instances would settle it.
- Naderi et al.'s per-problem tables were not retrieved. The Da Col & Teppan 2022 full text was not retrieved.
- The canonical OR-Tools documentation page was not fetched. Warm-starting CP-SAT from the previous plan through solution hints is from my memory, not a verified source.

## Q2. Rolling-horizon, event-driven or periodic rescheduling: benefit under arrivals and noise, and stability tradeoffs

### Takeaway
Re-solving at each arrival can beat the best rule by about 10 to 19% at sizes near the kitchen's when given 60 s, but it lost to rules by about a factor of two in another study on larger instances with a budget of seconds. Whether re-solve wins therefore depends on the ratio of compute to problem size. Stability follows a clear ordering: full regeneration is most nervous, then partial repair, then right-shift. I found no controlled study of tardiness and nervousness together in a dynamic job shop.

### Cited Findings

**Does re-solving help?**

- Tang, Zakwan, Balta, Lygeros & Rupenyan, "Deep Reinforcement Learning for Flexible Job Shop Scheduling with Random Job Arrivals", 2026, arXiv:2605.22773 [FT via HTML summary, PRE]. 6 machines, 20 or 40 jobs, Poisson arrivals, Gurobi MILP re-solved at each arrival with a **60 s limit**. "Best HH" is the best of 10 rule combinations chosen per instance in hindsight, so it is optimistic for rules. The objective is makespan in the body and total completion time in the abstract, an inconsistency in the paper. — [Tang et al.](https://arxiv.org/html/2605.22773v1)

| Setting | MILP re-solve | DRL rule selector | Best rule (hindsight) |
|---|---|---|---|
| Homogeneous, 20 jobs, λ=0.2 | **307** | 338 | 378 |
| Homogeneous, 40 jobs, λ=0.2 | **560** | 595 | 619 |
| Heterogeneous, λ=0.2 | 1642 | **1478** | 1499 |
| Heterogeneous, λ=0.05 | 1660 | **1550** | 1564 |
| Heterogeneous, λ=0.02 | 1757 | **1753** | 1797 |

- From that table, MILP re-solve beats the hindsight-best rule by about 19% at 20 jobs (378 vs 307) and about 10% at 40 jobs (619 vs 560) in the homogeneous case (my calc). It loses by about 10% in the heterogeneous λ=0.2 case. — [Tang et al.](https://arxiv.org/html/2605.22773v1)
- The same authors state that when arrivals are infrequent relative to job duration, simple dispatching rules are already competitive; all methods were close at λ=0.02. — [Tang et al.](https://arxiv.org/html/2605.22773v1)
- Zhang, Yuan, Zhou, Song & Cao, "LLM-Based Exogenous World Modeling for Dynamic Scheduling", 2026, arXiv:2610.29308 [FT tables, PRE, submitted 21 Oct 2026]. Total weighted tardiness on 80 dynamic Taillard instances, horizon scaled 5x. OR-Tools baselines got budgets "at least as large as" a method that runs "in seconds"; no explicit limit is stated. — [AWMP](https://arxiv.org/html/2610.29308)

| Dynamic JSSP arrivals | Myopic | Rolling | Best of 8 PDRs | AWMP |
|---|---|---|---|---|
| Pulse train | 79931 | 67930 | 32923 | 29238 |
| Late-ramp | 70584 | 59654 | 34841 | 27619 |
| Cyclic | 82708 | 70243 | 34486 | 32483 |
| Step-up | 78631 | 66590 | 32686 | 29630 |

- In that table the best rule beats OR-Tools rolling-horizon by 1.7x to 2.1x on JSSP, and by 1.2x to 1.7x on the FJSP set (my calc). Rolling beats myopic by about 15% on JSSP and 56 to 67% on FJSP (my calc). "Best PDR" is the best of WSPT, ATC, SPT, EDD, MWKR, FIFO, MS and COVERT; the winner is not broken out. — [AWMP](https://arxiv.org/html/2610.29308)
- **Conflict:** Tang et al. (about 20 to 40 jobs, 60 s) favor re-solve on homogeneous data. AWMP (Taillard TA sizes, 15x15 to 100x20 per the L2D table, budget of seconds, TWT) strongly favors rules. Objective, size and compute all differ, and AWMP's authors are presenting a competitor to those baselines. — [Tang et al.](https://arxiv.org/html/2605.22773v1); [AWMP](https://arxiv.org/html/2610.29308)
- A deterministic plan executed open-loop under noise can do worse than a rule. In Infantes et al.'s stochastic test, a CP-SAT plan on mode durations scored 728 at 6x6 and 1262 at 10x10, against MOPNR 699 and 1252, and a 50-scenario CP Optimizer plan 669 and 1177. The oracle with true durations scored 614 and 1002. No method re-solved during execution. — [Wheatley](https://arxiv.org/html/2404.01308v1)
- **Anomaly in that source:** stated noise is at most -5% / +10% around the mode, yet the oracle's stochastic makespan (614) is 27% above the deterministic optimum (485) at 6x6 (my calc). The stated noise alone cannot explain that, so use the relative ordering and not the magnitudes. — [Wheatley](https://arxiv.org/html/2404.01308v1)

**Policies and stability**

- Vieira, Herrmann & Lin, "Rescheduling Manufacturing Systems: A Framework of Strategies, Policies, and Methods", *Journal of Scheduling* 6(1):39-62, 2003 [FT, author-hosted manuscript]. Findings as stated in the review: — [Vieira et al.](https://isr.umd.edu/Labs/CIM/projects/jos-rescheduling.pdf)
  - Policies are periodic, event-driven and hybrid. Periodic and hybrid are what the literature calls rolling time horizon.
  - Periodic gives more stability and less nervousness than constant rescheduling, but following a stale schedule through significant changes can hurt performance, and choosing the period is hard.
  - Rescheduling on every event risks a "permanent state of rescheduling", with high nervousness and excessive computation, in large facilities with rapid events.
  - Repair methods: regeneration gives better schedules with the most nervousness and most compute. Partial rescheduling is in between. Right-shift gives the least nervousness.
  - Nervousness is defined as the opposite of stability, and it "presents little predictability".
  - It cites Shafaei & Brunn: as uncertainty rises, frequent rescheduling becomes more effective for robustness.
- Church & Uzsoy (1992), as summarized secondhand: event-driven can achieve high quality with less rescheduling than continuous policies, in simple single and parallel machine analysis. — [secondary summary, SN; exact record not confirmed](https://www.sciencedirect.com/science/article/abs/pii/S0360835203000950)
- A search snippet states that periodic rescheduling improves classical efficiency measures but compromises stability. It surfaced among "Dynamic rescheduling that simultaneously considers efficiency and stability" and related records, and I did not confirm which one it came from [SN]. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0360835203000950)
- *Applied Sciences* 15(5):2483, 2025 [SN; page returned 403, title and authors not retrieved]: on parallel machines, not a job shop, periodic complete rescheduling cut TWT by 50% and tardy jobs by 27% against conventional methods, with its own nervousness metrics. — [MDPI](https://www.mdpi.com/2076-3417/15/5/2483)
- Ouelhadj & Petrovic, "A Survey of Dynamic Scheduling in Manufacturing Systems", *Journal of Scheduling* 12(4):417-431, 2009 [AB]: near-optimal static schedules can go obsolete once released to the floor. — [Springer](https://link.springer.com/doi/10.1007/s10951-008-0090-8)

### Inferences
- A kitchen has few events (at most about 180 task completions plus up to 20 arrivals) and a simulator with perfect state visibility. That removes the data-collection reason for periodic policies, and the "permanent rescheduling" failure mode is mostly a large-facility concern. Event-driven re-solve looks viable if each solve is capped.
- Nervousness may cost little in the kitchen if a task that has started is frozen and only unstarted tasks are re-sequenced. In a simulated kitchen it matters only if the agent is penalized for plan churn or has to communicate a plan. This reasoning is mine, not from a source.
- A hybrid is a sensible default to test: re-solve on order arrival and when a task overruns beyond a threshold, otherwise follow the plan or a rule. Vieira's hybrid category and Shafaei & Brunn's result support it directionally, but no cited study tests it at this scale.
- A rule should be kept as the fallback for any solve that times out, given the AWMP result that under-budgeted solvers can lose badly.

### Gaps
- I found no controlled study measuring both tardiness and nervousness across rolling-horizon and event-driven policies in the same dynamic job shop.
- I found no study of re-solve with a limit of about 1 s at 20 to 180 operations.
- Church & Uzsoy and Sabuncuoglu & Bayiz were seen only secondhand.
- Author names for the C&IE "efficiency and stability" paper were not shown in the retrieved record.

## Q3. Huang et al. arXiv:2410.22657, GP hyper-heuristics, LLM heuristic design and deep RL vs exact methods and rules

### Takeaway
Huang et al. show an LLM-evolved rule beating GP, GEP, rules and DRL on static makespan, and beating rules and GP/GEP in simulated dynamic cases, but it was never compared to an exact solver or to ATC or minimum slack, and it remains about 10 to 36% above best-known on static makespan across the size groups in Tables III and V (my calc). Learned and evolved rules are best seen as better rules, roughly 10 to 20% better than hand-written ones on tardiness, and on makespan CP remains ahead of them when it has time to finish.

### Cited Findings

**Huang et al., read directly** [FT, full 13-page accepted manuscript; figures were not viewable, tables and text were]

Citation: Huang, Liu, Li, Gao & Teng, "Automatic programming via large language models with population self-evolution for dynamic fuzzy job shop scheduling problem", arXiv:2410.22657v2 (29 Jul 2026), accepted in *IEEE Transactions on Fuzzy Systems*, DOI 10.1109/TFUZZ.2025.3650586. All items below are from this source — [arXiv](https://arxiv.org/abs/2410.22657).

- **Method (SeEvo):** the LLM writes a priority function as code over the inputs pt, wkr, rm, so, twk, ema, dd and et. Evolution uses three LLM reflections: co-evolution (compare two parents), self-evolution (compare child with parent, the claimed novelty) and collective (long-term memory). These guide LLM crossover and mutation.
- **Duration uncertainty:** in simulation the environment knows actual time p′ and the rule sees only planned time p. The relative deviation p′/p − 1 is tracked with exponential smoothing (κ = 0.2) and mapped onto time features as `ema`. An ablation on 100 dynamic instances reports a lower median gap and narrower spread with `ema`, for makespan, shown in figures only.
- **Configuration:** chosen by Taguchi design: population 20, 20 iterations, mutation 0.9, temperature 1.0. Trained on 20 cases. Models: gpt-4.1-mini (best), DeepSeek-V3, Qwen-Turbo. GP and GEP received 80 training cases, 20 generations, population 20. The parameter tuning used average makespan.
- **Static benchmarks:** 160 Taillard and DMU cases, sizes 15x15 to 100x20. Beat other methods in 14 of 16 selected DMU cases and 13 of 16 selected TA cases. Baselines include SPT, MWKR, FDD/WKR, MOPNR, GP, GEP and DRL (L2D, Chen, Liu).

| Mean makespan (Tables III, V) | MOPNR | L2D | GP | GEP | SeEvo best | Best known | SeEvo gap (my calc) | L2D gap (my calc) |
|---|---|---|---|---|---|---|---|---|
| TA 15x15 | 1782.3 | 1547.4 | 1543.2 | 1528.7 | 1440.8 | 1228.9 | 17.2% | 25.9% |
| TA 20x20 | 2309.9 | 2128.1 | 2075.2 | 2083.5 | 1943.3 | 1617.5 | 20.1% | 31.6% |
| TA 100x20 | 6452.3 | 6097.6 | 6024.3 | 6037.8 | 5881.3 | 5365.7 | 9.6% | 13.6% |
| DMU 20x15 | 4513.2 | 4215.3 | 4171.6 | 4064.9 | 3868.6 | 3023.8 | 27.9% | 39.4% |

- These rows are a sample. The largest SeEvo gap in the two tables is DMU 50x20, at 8463.4 vs 6227.3, or 35.9% (my calc).

- **Dynamic benchmark:** simulated with random arrivals, fuzzy durations and machine breakdowns, 100 test cases. Stated training generator: 20 to 50 jobs, 5 to 20 machines, processing times 50 to 100, gamma noise (shape 1.0, scale 0.10), 1 to 2 breakdowns. Test sizes are not stated separately.
- **Dynamic tardiness result:** SeEvo's maximum gap ratio is at most 6% and below 1% in most cases. Baselines: EDD, EMT, SPT, TWKR, SRM, SSO, LPT/TWK, SPT×TWK, SPT+SSO, GP, GEP. The makespan variant reports at most 5%.
- **Runtime:** at test time generations are reduced to one, and solutions take 40 s (Qwen-Turbo), 42 s (gpt-4.1-mini) or 122 s (DeepSeek-V3) on 100x20. Generated rules are mostly O(n), with some O(n²).
- **Stated limitations:** a gap to optimal remains on static cases. External API cost. A single rule per dynamic case limits performance and prevents the superiority seen in static cases. The authors also say no single dynamic method is superior across all scenarios.

Critical points from my reading of the same text:

- **The "gap" is not to optimal.** The authors state that it is relative to the best of the 14 compared methods per case. A small gap means "near the best in this pool".
- **No exact solver was run in any comparison.** "UB" columns are literature best-known values for static instances only.
- **DRL appears only in the static comparisons.** The dynamic sections list rules plus GP and GEP. The abstract's claim of beating DRL, "particularly in previously unseen and dynamic scenarios", is not supported by a dynamic DRL comparison in the text.
- **ATC, COVERT and minimum slack are not baselines.** For tardiness, EDD and EMT are the only due-date rules.
- **Due dates are release time plus total work, an allowance factor of 1.0.** The authors acknowledge these are deliberately tight. That is below the 1.3 minimum in Ferreira et al., and such tight dates reward processing-time logic and may make tardiness behave like flow time.
- **Tardiness numbers exist only in a figure.** The text gives no baseline values, and I saw no significance tests in the text.
- **The 40 s runtime is an LLM iteration.** A frozen rule would run in milliseconds, but the paper does not separately evaluate a rule frozen after training.

**LLM-based heuristic design, other work**

- Liu et al., "Evolution of Heuristics: Towards Efficient Automatic Algorithm Design Using Large Language Model" (EoH), arXiv:2401.02051, 2024 [AB; arXiv page lists no venue]. Evolves natural-language ideas and code together. Reports beating handcrafted heuristics and FunSearch on three combinatorial benchmarks. Not a scheduling-specific result. — [arXiv](https://arxiv.org/abs/2401.02051)
- Qiu, Zhuang, Liu, Liu & Zhang, "EvoDR: Evolving Dispatching Rules via Large Language Model for Dynamic Flexible Assembly Flow Shop Scheduling", arXiv:2601.15738v3 [FT tables, PRE]. Assembly flow shop, not job shop. Decision time at millisecond level for all rules. 480 instances over 24 scenarios. Test-set average tardiness (Table V, 10 held-out instances, 5 design runs), with column labels inferred from the accompanying text: — [EvoDR](https://arxiv.org/pdf/2601.15738)

| EDD | GEP | GP | ReEvo | MCTS-AHD | RandSample | EoH | FunSearch | EvoDR |
|---|---|---|---|---|---|---|---|---|
| 5005.47 | 4980.56 | 4521.10 | 4327.27 | 4284.26 | 4151.41 | 4141.59 | 4078.61 | 4073.03 |

- Three things stand out in that table. Every LLM method beats EDD by 13.6 to 18.6% on test. EvoDR's edge over FunSearch is 0.14% (my calc). **RandSample, which by its name appears to be plain LLM sampling with no evolutionary strategy, is only 1.9% behind EvoDR** (my calc), though EvoDR's lead over it is statistically significant (Wilcoxon p = 1.37e-3, baseline wins 38 of 100 comparisons). In the first three listed robustness scenarios EDD was the best hand-written baseline, and EvoDR beat it by 10 to 35% (1710 vs 1118; 6957 vs 6265; 13473 vs 11079). — [EvoDR](https://arxiv.org/pdf/2601.15738)
- AWMP (above) uses a different pattern: an LLM forecasts arrivals online (Claude Haiku 4, about 0.84 s per call, 18 calls per episode with reuse vs 7191 naive) and an evolved strategy plans with short rollouts. It reduced TWT by 5.8 to 20.7% vs the best of 8 PDRs on JSSP and 21.9 to 46.3% on FJSP. Stated limitations: coarse arrival belief, synthetic arrival patterns. — [AWMP](https://arxiv.org/html/2610.29308)
- Novikov et al., "AlphaEvolve: A coding agent for scientific and algorithmic discovery", arXiv:2506.13131, 2025 [FT for the scheduling section, PRE/white paper]. No job shop result. A heuristic for Borg job placement, framed as vector bin packing, recovers on average 0.7% of Google's fleet-wide compute that was otherwise stranded, confirmed post-deployment. It was chosen over a DRL approach for better performance plus interpretability, debuggability, predictability and ease of deployment. — [arXiv](https://arxiv.org/abs/2506.13131)
- Chen et al., "Teacher-Aware Evolution of Heuristic Programs from Learned Optimization Policies", arXiv:2605.10634 [AB, PRE]. Located and includes job shop experiments per a search snippet; I could not verify its numbers. — [arXiv](https://arxiv.org/pdf/2605.10634)

**Genetic programming hyper-heuristics**

- Ferreira, Figueira & Amorim, "Effective and interpretable dispatching rules for dynamic job shops via guided empirical learning", arXiv:2109.03323 and published 2022 (ScienceDirect PII S0305048322000512, which is the *Omega* ISSN; one search summary said JORS, so verify) [FT]. Dynamic job shop, Poisson arrivals, 2000 measured jobs, mean tardiness. Tested on 10 to 100 machines, allowance factor 1.3 to 10, utilization 0.70 to 0.99. **19% average improvement over the best combination of existing rules.** Evolved rules beat the benchmark in 33 and 38 of 49 settings and are small and readable, for example: — [Ferreira et al.](https://arxiv.org/pdf/2109.03323)
  - R1: `2PT + PT·S⁺/RPT + WINQ`
  - R2: `if Slack > 0: PT + PT·CR⁺ + WINQ; else 3PT + WINQ − WINQ/PT`
  - The rules deteriorate at utilization of about 0.97 and above. The authors conclude specific rules should be trained for those tight settings.
- Zhou & Yang, Procedia CIRP 2019 [SN]: multi-objective GP on dynamic flexible job shop, including mean weighted and maximum tardiness. Evolved policies beat 320 human-made policies on training and won 58 of 64 test scenarios. — [GP bibliography](https://gpbib.cs.ucl.ac.uk/gp-html/ZHOU_2019_procir.html)
- Park, Mei, Nguyen, Chen & Zhang, EuroGP 2016 [SN]: for TWT in dynamic job shops, evolved ensembles beat single rules. — [GP bibliography](https://gpbib.cs.ucl.ac.uk/gp-html/Park_2016_EuroGP.html)
- Zeiträg, Figueira, Horta & Neves, *Expert Systems with Applications*, 2022 [SN]: surrogate-assisted GP for multi-objective dynamic job shop, with reductions of 90.8%, 40.3% and 44.6% in total tardiness vs known rules across sizes. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0957417422013550)

**Deep RL and critiques**

- L2D beats PDRs but stays 17.7 to 29.0% from OR-Tools on 6x6 to 20x20 and on Taillard 15x15 to 30x20 sits at 26.0 to 33.6%. — [L2D](https://ar5iv.labs.arxiv.org/html/2010.12367)
- **Against L2D at small sizes:** in Infantes et al., L2D is worse than the best PDR at 6x6 (17.7% vs 12.4%) and at 10x10 (22.3% vs 16.8%). W-10x10 is worse than MOPNR on stochastic 6x6 (714 vs 699). The same paper notes L2D's specificity complicates adaptation to uncertainty. — [Wheatley](https://arxiv.org/html/2404.01308v1)
- Tassel et al. (authors from memory), "A Reinforcement Learning Environment For Job-Shop Scheduling", arXiv:2104.03760 [SN]: OR-Tools found solutions about 7% better on Taillard and 6% better on DMU than its RL method, which beat rules. — [arXiv](https://arxiv.org/pdf/2104.03760)
- Zhang et al. (authors from memory), "Deep Reinforcement Learning Guided Improvement Heuristic for Job Shop Scheduling", arXiv:2211.10936 [SN]: a DRL improvement heuristic claims to beat CP-SAT on large instances. This does not transfer to small kitchen instances. — [arXiv](https://arxiv.org/pdf/2211.10936)
- Tang et al.: a rule-selecting DRL policy matched or beat the hindsight-best fixed rule throughout, and beat MILP on heterogeneous data (table in Q2). — [Tang et al.](https://arxiv.org/html/2605.22773v1)

### Inferences
- For this project, the relevant value of LLM evolution is offline authoring of a small, readable priority function. It should run frozen at decision time, because any per-decision LLM call would need to fit in 1 s, and Huang's one-iteration online stage takes tens of seconds on a large instance.
- The EvoDR RandSample result suggests a cheap experiment first: sample many LLM-written rules, score them in the simulator and keep the best. An elaborate reflection loop may add little at this scale, although this is one study in a different shop type.
- Evolved rules overfit the training distribution (GP's train-test gap in EvoDR; Ferreira's degradation at extreme load). The simulator's order mix and due-date tightness therefore need to match the kitchen, and Huang's zero-slack due dates should not be copied.
- At kitchen scale, deep RL looks least attractive of the three: training cost, weaker interpretability, and small-instance results that do not clearly beat good rules. This is an inference from makespan results, and no study tests DRL on this exact problem.
- The tiny-instance end (2 to 5 orders) is where an exact solver's advantage should be largest and where evolved rules have least evidence.

### Gaps
- I found **no head-to-head of LLM-evolved rules vs CP-SAT on the same dynamic instances under the same time budget.** AWMP compares a planner to OR-Tools, but its evolved component is a planning strategy and not a pure rule.
- Huang's Figure 5 per-baseline tardiness values could not be read from extracted text.
- I found no independent reproduction of SeEvo, and no systematic independent DRL vs rule vs CP benchmark under identical conditions. Most numbers come from papers presenting their own method.
- The Nguyen, Mei and Zhang GP survey was not located in a verifiable form.

## Q4. Best dispatch rules for total tardiness or number of tardy jobs, distance from optimal, and duration uncertainty

### Takeaway
No single hand-written rule wins across load conditions: due-date logic helps when load is light, processing-time logic when load is heavy, and composite rules (RR, the ATC and COVERT family) and evolved slack-switching rules lead in their respective studies, with no single study I read ranking all of them. I found no measured gap between ATC, EDD or minimum slack and the optimum on small job shops for tardiness, so that figure is unknown. Under duration noise, evolved rules kept their advantage, and feeding in an estimated deviation helped in one study.

### Cited Findings

**Which rules**

- Ferreira et al. summarize the literature: when due dates are loose or utilization is low, rules should use due-date information; in highly loaded shops, processing-time-based rules work better. Operation-level due dates beat job-level due dates in simulation. No simple rule works for all load conditions. — [Ferreira et al.](https://arxiv.org/pdf/2109.03323)
- Its named state-of-the-art tardiness benchmarks are RR (Raghu & Rajendran 1993: `PT·exp(u) + PT·S/RPT·exp(−u) + WINQ`), good in light load, and 2PT+WINQ+NPT (Rajendran & Holthaus 1999), good in tight load, "none of them works well in both cases". — [Ferreira et al.](https://arxiv.org/pdf/2109.03323)
- Performance ratio τ of evolved rule to best benchmark (lower is better), Table 7, 10 machines, tardiness: at u = 0.85, a = 8, τ is 0.26 to 0.30; at a = 1.3 it is 0.98 to 0.99 across most utilizations; at u = 0.99 it is 0.98 to 1.23. Tight due dates compress the differences between rules. Light-load settings can produce no tardiness at all and tie. — [Ferreira et al.](https://arxiv.org/pdf/2109.03323)
- Vepsalainen & Morton, "Priority Rules for Job Shops with Weighted Tardiness Costs", *Management Science* 33(8):1035, 1987 (one search summary gives 1988) [AB]: look-ahead rules (the ATC family) beat competitors on weighted tardiness and are robust on number of tardy jobs. — [INFORMS](https://pubsonline.informs.org/doi/fpi/10.1287/mnsc.33.8.1035)
- Sels, Gheysen & Vanhoucke, "A comparison of priority rules for the job shop scheduling problem under different flow time- and tardiness-related objective functions", *IJPR*, 2012, DOI 10.1080/00207543.2011.611539, working paper 2010 [AB; the downloaded PDF held only the cover page]. 30 literature rules on 2 flow-time and 3 tardiness objectives, 13 combined rules, then checks on larger instances, flexibility, setups and dynamic arrivals. **Per-objective rankings were not retrieved.** This is the most directly relevant comparison to read in full. — [RePEc](https://ideas.repec.org/p/rug/rugwps/10-680.html)
- 1987 IJPR study [SN]: COVERT was superior in most instances among tested sequencing rules across tardiness measures and due-date tightness. — [IJPR record](https://informahealthcare.com/doi/abs/10.1080/00207548708919930)
- Kanet & Baker 1990 as summarized [SN]: a modified-due-date rule was more robust to due-date tightness than S/OPN, critical ratio and COVERT, except when due dates were quite loose. — [IAOR](https://iaorifors.com/paper/3024); note that this record's mapping to the paper was not independently confirmed.
- EvoDR scenario data: EDD was the best listed hand-written baseline in three tardiness scenarios of an assembly flow shop, though composite evolved rules beat it. — [EvoDR](https://arxiv.org/pdf/2601.15738)

**Distance from optimal**

- Singer & Pinedo, "A computational study of branch and bound techniques for minimizing the total weighted tardiness in job shops", *IIE Transactions*, 1998 [SN; Springer redirected to login]: optimal solutions for all the 10x10 instances considered. Solve times not retrieved. — [Springer](https://link.springer.com/article/10.1023/A:1007405915227)
- A later paper describes a 63-instance TWT test set from Singer & Pinedo: abz, la, mt and orb, 10 jobs on 10 machines, 100 operations each [SN]. This is the natural small tardiness benchmark. — [ScienceDirect record of related work](https://www.sciencedirect.com/science/article/abs/pii/S0305054810002108); attribution of the quote to this exact record was not confirmed.
- Closest available proxy, for makespan only: rules are 12.4 to 42% from optimal at 6x6 and 16.8 to 50% at 10x10 (Q1 table). — [L2D](https://ar5iv.labs.arxiv.org/html/2010.12367); [Wheatley](https://arxiv.org/html/2404.01308v1)

**Uncertainty and estimated or learned durations**

- Ferreira et al., Table 9, τ vs coefficient of variation on stochastic processing times, with rules trained only on deterministic data. R2: 0.81 (cv 0), 0.85 (0.2), 0.86 (0.4), 0.87 (0.6), 0.88 (0.8), 0.89 (1.0). R1: 0.83, 0.91, 0.92, 0.90, 0.92, 0.91. Absolute tardiness rises with cv for all rules. RR degrades fast at medium load as cv rises. — [Ferreira et al.](https://arxiv.org/pdf/2109.03323)
- Huang et al.: an EMA of the planned-to-actual deviation (κ = 0.2) improved median gap and spread under noise, on makespan in dynamic instances. — [Huang et al.](https://arxiv.org/abs/2410.22657)
- Infantes et al.: planning with scenarios beats planning on the mode (669 vs 728 at 6x6; 1177 vs 1262 at 10x10), with a 3-minute budget, open-loop. — [Wheatley](https://arxiv.org/html/2404.01308v1)
- Ikonen & Harjunkoski, IFAC 2019 [SN]: predict processing times and their uncertainty with probabilistic ML and feed them into scheduling. Inaccuracy in estimated parameters can significantly affect optimality or even feasibility. — [Aalto PDF](https://acris.aalto.fi/ws/portalfiles/portal/38756720/CHEM_Ikonen_Harjunkoski_Incorporation_of_parameter_2019_Ifac.pdf)
- Karunakaran, Mei, Chen & Zhang, "Evolving dispatching rules for dynamic job shop scheduling with uncertain processing times", IEEE CEC 2017 [SN; results not retrieved]. — [GP bibliography](https://gpbib.cs.ucl.ac.uk/gp-html/karunakaran_2017_CEC.html)

### Inferences
- A sensible baseline set for the kitchen is EDD, minimum slack, ATC, a slack-switching rule shaped like Ferreira's R2, and a critical-ratio or operation-due-date variant. Test against CP-SAT, since the literature cannot say which leads at this scale.
- Kitchen load matters as much as the rule. With 2 orders there may be little to optimize and rules may tie at zero tardiness; with 20 orders on tight deadlines all rules may compress together, as at Ferreira's a = 1.3. Differences may show up mostly in the middle range.
- Number of tardy jobs is a harder, threshold-style objective with thin evidence here. Optimizing mean tardiness may not optimize it, so both should be reported.
- Corrected duration estimates look like cheap, portable value for any of the three approaches: an EMA multiplier per task type can feed a rule's PT or a solver's durations. Evidence for it comes from one rule-based ablation, so its use with a solver is an extrapolation.
- The Ferreira rules assume long-run steady state with Poisson arrivals over thousands of jobs. A kitchen run of 2 to 20 orders is a short transient, so their ranking may not carry over.

### Gaps
- **I found no source measuring EDD, ATC or minimum slack against optimal for total tardiness or number of tardy jobs on small job shops.** Computing this on the kitchen instances, or on the 63 Singer-Pinedo instances, is feasible.
- The per-objective rankings in Sels et al. were not retrieved.
- Number of tardy jobs has little direct evidence in the sources I read; it appears mainly as a secondary robustness note.
- I found no study comparing a learned duration predictor vs true durations in a tardiness job shop at this scale.
