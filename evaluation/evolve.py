"""Offline dispatch-rule evolution; --live opts into LLM generation, never service."""
import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import random

from evaluation.metrics import calculate_metrics
from pasta_chef.simulation.kitchen import Kitchen
from pasta_chef.simulation.scheduler import DurationEMA, FEATURES, PriorityRule, run_priority_episode


SEEDS = (
    PriorityRule(),
    PriorityRule('least_slack', '-slack + 0.001 * background'),
    PriorityRule('shortest_task', '-pt + 0.001 * background'),
    PriorityRule('urgency_and_queue', '-due - 0.1 * slack + 0.01 * queue + background'),
)


def synthetic_case(seed):
    """Common keyed randomness: candidate scheduling order cannot change durations."""
    rng = random.Random(seed)
    arrivals = [dict(at=0, menu='lemon_pasta', time_limit=1500),
                dict(at=0, menu='lemon_pasta', time_limit=900)]
    for _ in range(2):
        arrivals.append(dict(at=rng.randint(300, 1400), menu='lemon_pasta',
                             time_limit=rng.randint(1000, 2400)))

    def sample(order, task):
        digest = hashlib.sha256(f'{seed}:{order.id}:{task["id"]}'.encode()).hexdigest()
        noise = random.Random(digest).uniform(0.8, 1.3)
        # Repeatable station/step bias creates history that the EMA can learn.
        bias = 1.2 if 'burner' in task['resources'] else 1.0
        return max(1, round(task['duration'] * noise * bias))
    return arrivals, sample


def evaluate(rule, seeds):
    episodes = []
    for seed in seeds:
        arrivals, sample = synthetic_case(seed)
        kitchen = Kitchen(duration_sampler=sample)
        result = run_priority_episode(kitchen, rule=rule, ema=DurationEMA(), arrivals=arrivals,
                                      max_actions=500, max_simulated_time=12000)
        metrics = calculate_metrics(kitchen.state, result)
        # Kitchen currently has no ticket groups or food-quality/holding model.
        fitness = (1_000_000 * metrics['unserved_orders'] + 10_000 * metrics['late_orders']
                   + metrics['total_tardiness'] + 1000 * result['rule_errors'])
        episodes.append(dict(seed=seed, fitness=fitness, metrics=metrics,
                             rule_errors=result['rule_errors'], ema=result['ema']))
    return dict(fitness=sum(e['fitness'] for e in episodes) / len(episodes), episodes=episodes)


def evolve(proposer, *, train_seeds=(11, 12, 13), test_seeds=(101, 102, 103),
           population=4, generations=2):
    """proposer(context)->JSON object; injectable so the complete loop is testable offline.

    Generate from two parents + measured scores + lessons; evaluate children;
    compare parent/child; synthesize reflection; retain the strongest population.
    Test seeds are NEVER passed to the proposer or used for selection.
    """
    train_seeds, test_seeds = tuple(train_seeds), tuple(test_seeds)
    if not train_seeds or not test_seeds or set(train_seeds) & set(test_seeds):
        raise ValueError('Nonempty disjoint train/test seeds required.')
    if type(population) is not int or not 2 <= population <= 20:
        raise ValueError('Population must be 2–20.')
    if type(generations) is not int or not 1 <= generations <= 20:
        raise ValueError('Generations must be 1–20.')
    cache = {}

    def scored(rule):
        if rule.expression not in cache:
            cache[rule.expression] = evaluate(rule, train_seeds)
        return dict(rule=asdict(rule), **cache[rule.expression])

    pool = [scored(rule) for rule in SEEDS[:population]]
    history, lessons = [], []
    for generation in range(generations):
        pool.sort(key=lambda r: r['fitness'])
        children, comparisons = [], []
        for index in range(population):
            parent = pool[index % len(pool)]
            other = pool[(index + 1) % len(pool)]
            context = dict(phase='generate', generation=generation, index=index,
                           features=FEATURES, parents=[parent, other], lessons=lessons,
                           objective='Minimize unserved*1000000 + late*10000 + tardiness + rule_errors*1000')
            proposal = proposer(context)
            try:
                child = scored(PriorityRule(proposal['name'], proposal['expression']))
            except (ValueError, SyntaxError, TypeError, KeyError) as error:
                comparisons.append(dict(parent=parent['rule'], rejected=type(error).__name__))
                continue
            children.append(child)
            comparisons.append(dict(parent=parent, child=child,
                                    fitness_delta=child['fitness'] - parent['fitness'],
                                    proposed_reason=str(proposal.get('reason', ''))[:2000]))
        reflection = proposer(dict(phase='reflect', generation=generation,
                                   comparisons=comparisons, lessons=lessons))
        # Keep LLM interpretations separate from measured deltas; neither is proof.
        note = str(reflection.get('lesson', ''))[:4000]
        lessons = (lessons + [note])[-20:]
        unique = {r['rule']['expression']: r for r in pool + children}
        pool = sorted(unique.values(), key=lambda r: r['fitness'])[:population]
        history.append(dict(generation=generation, comparisons=comparisons,
                            reflection=note, best_fitness=pool[0]['fitness']))
    best = pool[0]
    # Held-out comparison occurs only after selection has finished.
    return dict(rule=best['rule'], train_seeds=train_seeds, test_seeds=test_seeds,
                fitness_definition='unserved*1000000 + late*10000 + tardiness + rule_errors*1000',
                training=best, held_out=evaluate(PriorityRule(**best['rule']), test_seeds),
                baseline_held_out=evaluate(PriorityRule(), test_seeds),
                history=history, lessons=lessons)


class OfflineProposer:
    """Deterministic handwritten candidates for exercising the loop without API calls."""
    def __call__(self, context):
        if context['phase'] == 'reflect':
            deltas = [r['fitness_delta'] for r in context['comparisons'] if 'fitness_delta' in r]
            return dict(lesson=f'Offline fixture: child-minus-parent fitness deltas {deltas}; lower is better.')
        index = context['index'] + context['generation']
        return dict(name=f'offline_{index}', expression=(
            f'-due - {0.01 * (index + 1):.2f} * slack + 0.001 * background'),
                    reason='Handwritten urgency/slack candidate; not LLM-generated.')


class LLMProposer:
    """Optional Google GenAI author/reflector, outside the serving path."""
    def __init__(self, model):
        from pasta_chef.config import require_google_credentials
        require_google_credentials()
        from google import genai
        self.client = genai.Client(http_options={'timeout': 60000})
        self.model = model

    def __call__(self, context):
        instruction = (
            'Design arithmetic dispatch priority rules for a single-chef pasta kitchen. '
            'Higher scores run first. Features: now/due absolute seconds, pt EMA adjusted '
            'task duration, wkr sum remaining EMA work, steps remaining count, slack=due-now-wkr, '
            'queue other-order work sharing this task resources, ema_dev relative historical '
            'duration deviation, background=1 when task does not require chef. '
            'Durations are uncertain; future actual durations are hidden. '
            'Only + - * / unary signs, finite constants within +/-1e6 and these feature names '
            'are allowed; no Python statements, calls, powers or attributes. Max 100 AST nodes. '
            'Use parent scores and lessons to cross over or mutate rules. '
            'For generate return JSON {name, expression, reason}. '
            'For reflect compare measured parent/child deltas and synthesize earlier lessons '
            'into JSON {lesson}. Do not infer causality from a few synthetic cases.\n'
        )
        response = self.client.models.generate_content(
            model=self.model, contents=instruction + json.dumps(context),
            config={'response_mime_type': 'application/json', 'temperature': 0.7,
                    'max_output_tokens': 2048})
        result = json.loads(response.text)
        if not isinstance(result, dict):
            raise ValueError('LLM proposal must be a JSON object.')
        return result

    def close(self):
        self.client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Use Gemini to author rules offline (paid API calls)')
    parser.add_argument('--model', default='gemini-2.5-flash')
    parser.add_argument('--population', type=int, default=4)
    parser.add_argument('--generations', type=int, default=2)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new file.')
    proposer = OfflineProposer()
    try:
        if args.live:
            from pasta_chef.config import Settings
            Settings.from_env()
            proposer = LLMProposer(args.model)
        report = evolve(proposer, population=args.population, generations=args.generations)
        report['generation_mode'] = 'live_llm' if args.live else 'offline_fixture'
        report['model'] = args.model if args.live else None
        with args.output.open('x', encoding='utf-8') as file:
            json.dump(report, file, indent=2)
            file.write('\n')
    except Exception as error:
        # Provider exception text can contain request details. No partial rule is saved.
        print(json.dumps(dict(ok=False, error=type(error).__name__)))
        return 1
    finally:
        if isinstance(proposer, LLMProposer):
            proposer.close()
    print(json.dumps(dict(output=str(args.output), rule=report['rule'],
                          held_out_fitness=report['held_out']['fitness'],
                          baseline_fitness=report['baseline_held_out']['fitness'])))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
