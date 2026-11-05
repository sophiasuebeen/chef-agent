"""Credential-free deadline metrics from authoritative simulator state."""


def calculate_metrics(state, result: dict) -> dict:
    """Counts are integers; per-order details identify unserved and late orders.

    finished_at is the last observed simulated timestamp, including stopped runs.
    Tardiness counts only served orders. Missing service timestamps fail closed.
    """
    event_times = {
        event["order_id"]: event["time"]
        for event in state.events if event["action"] == "order_served"
    }
    details = []
    for order in state.orders.values():
        served = order.status == "served"
        served_at = getattr(order, "served_at", None) if served else None
        if served and served_at is None:
            served_at = event_times.get(order.id)
        if served and served_at is None:
            raise ValueError(f"Missing service timestamp for served order: {order.id}")
        tardiness = max(0, served_at - order.deadline) if served else None
        details.append({
            "order_id": order.id, "deadline": order.deadline,
            "served": served, "served_at": served_at, "tardiness": tardiness,
            "on_time": served and tardiness == 0,
        })
    unserved = sum(not order["served"] for order in details)
    late = sum(order["served"] and order["tardiness"] > 0 for order in details)
    all_served = bool(details) and unserved == 0
    all_on_time = all_served and late == 0
    reason = result["termination_reason"]
    return {
        "all_served": all_served,
        "all_on_time": all_on_time,
        "unserved_orders": unserved,
        "late_orders": late,
        "total_tardiness": sum(order["tardiness"] for order in details if order["served"]),
        "finished_at": state.time,
        "model_calls": result["model_calls"],
        "tool_calls": result["tool_calls"],
        "termination_reason": reason,
        "run_success": result["ok"] and reason == "completed" and all_on_time,
        "orders": details,
    }
