"""The coach agent's steps as a LangGraph state machine: ask Claude, run the tools it asked for, repeat, stop.

Same contract as assistant._loop, which takes over when langgraph isn't installed or COACH_GRAPH=off: returns Claude's
final response, or None when it was still calling tools after max_rounds.
"""
import os
from collections.abc import Callable
from importlib.util import find_spec
from typing import Any, TypedDict


class State(TypedDict):
    response: Any
    rounds: int


def enabled() -> bool:
    return os.getenv("COACH_GRAPH", "on") != "off" and find_spec("langgraph") is not None


def run(ask: Callable[[], Any], act: Callable[[Any], None], max_rounds: int) -> Any:
    from langgraph.graph import END, START, StateGraph

    def model(state: State) -> dict:
        return {"response": ask(), "rounds": state["rounds"] + 1}

    def tools(state: State) -> dict:
        act(state["response"])
        return {"rounds": state["rounds"]}

    def give_up(_: State) -> dict:
        return {"response": None}

    def after_model(state: State) -> str:
        if state["response"].stop_reason != "tool_use":
            return END
        return "tools" if state["rounds"] < max_rounds else "give_up"

    graph = StateGraph(State)
    graph.add_node("model", model)
    graph.add_node("tools", tools)
    graph.add_node("give_up", give_up)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", after_model, ["tools", "give_up", END])
    graph.add_edge("tools", "model")
    graph.add_edge("give_up", END)
    result = graph.compile().invoke({"response": None, "rounds": 0}, {"recursion_limit": max_rounds * 2 + 2})
    return result["response"]
