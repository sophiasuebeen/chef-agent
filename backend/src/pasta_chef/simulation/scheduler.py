"""Pure dispatch rules and event-driven scheduling; no ADK/provider imports."""
import ast
from copy import deepcopy
from dataclasses import dataclass, field
import math
import operator

from .recipes import load_recipe

FEATURES = ('now', 'due', 'pt', 'wkr', 'steps', 'slack', 'queue', 'ema_dev', 'background')
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
       ast.Div: operator.truediv}


@dataclass(frozen=True)
class PriorityRule:
    """A bounded arithmetic program, deliberately not arbitrary generated Python."""
    name: str = 'earliest_due_date'
    expression: str = '-due - 0.001 * wkr + 0.00001 * background'

    def __post_init__(self):
        if not isinstance(self.name, str) or not self.name or len(self.name) > 100:
            raise ValueError('Rule name must contain 1–100 characters.')
        if not isinstance(self.expression, str) or len(self.expression) > 1000:
            raise ValueError('Rule expression must be a string of at most 1000 characters.')
        tree = ast.parse(self.expression, mode='eval')
        nodes = list(ast.walk(tree))
        allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Name, ast.Load,
                   ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub, ast.UAdd)
        if len(nodes) > 100 or any(not isinstance(n, allowed) for n in nodes):
            raise ValueError('Only bounded arithmetic expressions are supported.')
        for node in nodes:
            if isinstance(node, ast.Name) and node.id not in FEATURES:
                raise ValueError(f'Unknown feature: {node.id}')
            if isinstance(node, ast.Constant) and (
                type(node.value) not in (int, float) or not math.isfinite(node.value)
                or abs(node.value) > 1e6
            ):
                raise ValueError('Constants must be finite numbers within +/-1e6.')
        object.__setattr__(self, '_tree', tree.body)

    def score(self, features):
        def visit(node):
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.Name):
                return features[node.id]
            if isinstance(node, ast.UnaryOp):
                return -visit(node.operand) if isinstance(node.op, ast.USub) else visit(node.operand)
            return OPS[type(node.op)](visit(node.left), visit(node.right))
        value = float(visit(self._tree))
        if not math.isfinite(value):
            raise ValueError('Non-finite priority.')
        return value


@dataclass
class DurationEMA:
    """Relative duration deviation per menu/task/resource bundle, learned on completion."""
    values: dict[str, float] = field(default_factory=dict)
    alpha: float = 0.2

    def __post_init__(self):
        if not 0 < self.alpha <= 1:
            raise ValueError('EMA alpha must be in (0, 1].')
        if any(not math.isfinite(v) or v <= -1 for v in self.values.values()):
            raise ValueError('EMA deviations must be finite and greater than -1.')

    @staticmethod
    def key(menu, task):
        return '|'.join((menu, task['id'], ','.join(sorted(task['resources']))))

    def deviation(self, menu, task):
        return self.values.get(self.key(menu, task), 0.0)

    def estimate(self, menu, task):
        return task['duration'] * (1 + self.deviation(menu, task))

    def update(self, menu, task, actual):
        if not math.isfinite(actual) or actual <= 0:
            raise ValueError('Actual duration must be finite and positive.')
        key = self.key(menu, task)
        deviation = actual / task['duration'] - 1
        self.values[key] = self.alpha * deviation + (1 - self.alpha) * self.values.get(key, 0.0)


def task_features(kitchen, order, task, ema):
    """Use planned durations + completed history, never hidden sampled finish times.

    wkr is remaining work SUM (not critical-path makespan); queue is other-order
    work needing any of this task's resources. Parallel branches can overestimate slack.
    """
    state = kitchen.state
    starts = {(e['order_id'], e['task_id']): e['time'] for e in state.events
              if e['action'] == 'task_started'}

    def remaining(owner, operation):
        planned = ema.estimate(owner.menu, operation)
        start = starts.get((owner.id, operation['id']))
        return planned if start is None else max(0, planned - (state.time - start))

    work = steps = queue = 0
    for owner in state.orders.values():
        if owner.status == 'served':
            continue
        for operation in load_recipe(owner.menu)['tasks']:
            if operation['id'] in owner.completed_tasks:
                continue
            duration = remaining(owner, operation)
            if owner.id == order.id:
                work += duration
                steps += 1
            elif set(task['resources']).intersection(operation['resources']):
                queue += duration
    return dict(now=state.time, due=order.deadline, pt=ema.estimate(order.menu, task),
                wkr=work, steps=steps, slack=order.deadline - state.time - work,
                queue=queue, ema_dev=ema.deviation(order.menu, task),
                background=float('chef' not in task['resources']))


def run_priority_episode(kitchen, *, rule=None, ema=None, arrivals=(),
                         max_actions=1000, max_simulated_time=1800):
    """Dispatch all compatible ready tasks before waiting; higher score wins.

    arrivals entries: {at: absolute seconds, menu: str, time_limit: positive int}.
    All pending input is validated before any kitchen mutation.
    """
    rule = rule if rule is not None else PriorityRule()
    ema = ema if ema is not None else DurationEMA()
    if type(max_actions) is not int or max_actions <= 0:
        raise ValueError('max_actions must be positive.')
    if type(max_simulated_time) is not int or max_simulated_time < kitchen.state.time:
        raise ValueError('Invalid simulated-time cap.')
    pending = sorted(deepcopy(list(arrivals)), key=lambda a: a['at'])
    for arrival in pending:
        if type(arrival['at']) is not int or arrival['at'] < kitchen.state.time:
            raise ValueError('Arrival must be at or after current time.')
        if type(arrival['time_limit']) is not int or arrival['time_limit'] <= 0:
            raise ValueError('Arrival time_limit must be positive.')
        load_recipe(arrival['menu'])
    decisions = []
    actions = errors = 0
    # Ingest existing logs, too, so repeated calls do not double-update the EMA.
    cursor = len(kitchen.state.events)
    starts = {(e['order_id'], e['task_id']): e['time'] for e in kitchen.state.events
              if e['action'] == 'task_started'}

    def finish(reason):
        return dict(ok=reason == 'completed', status='served' if reason == 'completed' else 'stopped',
                    termination_reason=reason, model_calls=0, tool_calls=actions,
                    rule_errors=errors, decisions=decisions, ema=deepcopy(ema.values))

    while True:
        # Learn only after completion events, including simultaneous completions.
        for event in kitchen.state.events[cursor:]:
            if event['action'] == 'task_started':
                starts[(event['order_id'], event['task_id'])] = event['time']
            elif event['action'] == 'tasks_completed':
                for completed in event['completed']:
                    owner = kitchen.get_order(completed['order_id'])
                    task = next(t for t in load_recipe(owner.menu)['tasks']
                                if t['id'] == completed['task_id'])
                    ema.update(owner.menu, task, event['time'] - starts[(owner.id, task['id'])])
        cursor = len(kitchen.state.events)
        if not pending and all(o.status == 'served' for o in kitchen.state.orders.values()):
            return finish('completed')
        if actions >= max_actions:
            return finish('action_limit')
        # Boundary completions/service are permitted, but no new work past the cap.
        if pending and pending[0]['at'] == kitchen.state.time:
            arrival = pending.pop(0)
            kitchen.add_order(arrival['menu'], arrival['time_limit'])
            actions += 1
            continue
        served = False
        for order in kitchen.state.orders.values():
            if order.status != 'served' and set(load_recipe(order.menu)['completion_tasks']).issubset(order.completed_tasks):
                kitchen.serve_order(order.id)
                actions += 1
                served = True
                break
        if served:
            continue
        if kitchen.state.time >= max_simulated_time:
            return finish('simulated_time_limit')
        ranked, fallback = [], []
        for order in kitchen.state.orders.values():
            if order.status == 'served':
                continue
            for task in load_recipe(order.menu)['tasks']:
                try:
                    kitchen.validate_task(order.id, task['id'])
                except (KeyError, ValueError):
                    continue
                features = task_features(kitchen, order, task, ema)
                try:
                    score = rule.score(features)
                except (ArithmeticError, ValueError):
                    errors += 1
                    fallback.append((-order.deadline + 0.001 * features["background"],
                                     order.id, task["id"], features))
                    continue
                ranked.append((score, order.id, task['id'], features))
        # Stable insertion order breaks ties; every start revalidates all resources.
        for score, order_id, task_id, features in sorted(ranked or fallback, key=lambda r: -r[0]):
            try:
                kitchen.start_task(order_id, task_id)
            except (KeyError, ValueError):
                continue
            decisions.append(dict(time=kitchen.state.time, order_id=order_id,
                                  task_id=task_id, score=score, features=features))
            actions += 1
            break
        else:
            if not kitchen.state.running_tasks and not pending:
                return finish('no_progress')
            boundary = min(max_simulated_time, pending[0]['at']) if pending else max_simulated_time
            kitchen.advance_to_next_event(until=boundary)
            actions += 1
    # Each iteration starts, serves, accepts, or advances exactly one action.
