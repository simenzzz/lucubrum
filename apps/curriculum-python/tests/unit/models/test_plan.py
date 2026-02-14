"""Tests for src/models/plan.py — Node, Plan, and utility functions."""

import pytest

from src.models.plan import Node, topological_sort


class TestTopologicalSort:
    """Tests for topological_sort function."""

    def test_simple_chain(self):
        """Simple linear chain should maintain order."""
        nodes = [
            Node(node_id="intro_a", title="Intro to A", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="concept_b", title="Concept B", objectives=["obj"], prerequisites=["intro_a"], estimated_minutes=30),
            Node(node_id="advanced_c", title="Advanced C", objectives=["obj"], prerequisites=["concept_b"], estimated_minutes=30),
        ]
        result = topological_sort(nodes)
        assert result == ["intro_a", "concept_b", "advanced_c"]

    def test_multiple_valid_orders_uses_llm_tiebreaker(self):
        """When multiple orderings are valid, original LLM order should be preserved."""
        nodes = [
            Node(node_id="first_step", title="First Step", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="second_step", title="Second Step", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="third_step", title="Third Step", objectives=["obj"], prerequisites=["first_step", "second_step"], estimated_minutes=30),
        ]
        result = topological_sort(nodes)
        # first and second have no prerequisites, so their original order should be preserved
        assert result == ["first_step", "second_step", "third_step"]

    def test_complex_dag(self):
        """Complex DAG with multiple paths."""
        nodes = [
            Node(node_id="intro_a", title="Intro to A", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="path_b", title="Path B", objectives=["obj"], prerequisites=["intro_a"], estimated_minutes=30),
            Node(node_id="path_c", title="Path C", objectives=["obj"], prerequisites=["intro_a"], estimated_minutes=30),
            Node(node_id="final_d", title="Final D", objectives=["obj"], prerequisites=["path_b", "path_c"], estimated_minutes=30),
        ]
        result = topological_sort(nodes)
        # intro_a must be before path_b and path_c; both must be before final_d
        assert result.index("intro_a") < result.index("path_b")
        assert result.index("intro_a") < result.index("path_c")
        assert result.index("path_b") < result.index("final_d")
        assert result.index("path_c") < result.index("final_d")
        # path_b and path_c order should follow original LLM order (path_b before path_c)
        assert result.index("path_b") < result.index("path_c")

    def test_independent_nodes_ordered_by_llm_preference(self):
        """Multiple independent nodes should maintain their relative order."""
        nodes = [
            Node(node_id="alpha_node", title="Alpha Concept", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="beta_node", title="Beta Concept", objectives=["obj"], prerequisites=[], estimated_minutes=30),
            Node(node_id="gamma_node", title="Gamma Concept", objectives=["obj"], prerequisites=[], estimated_minutes=30),
        ]
        result = topological_sort(nodes)
        assert result == ["alpha_node", "beta_node", "gamma_node"]

    def test_topological_sort_raises_on_cycle(self):
        """Direct call with cyclic nodes should raise AssertionError."""
        nodes = [
            Node(node_id="node_a", title="Node A", objectives=["obj"], prerequisites=["node_b"], estimated_minutes=30),
            Node(node_id="node_b", title="Node B", objectives=["obj"], prerequisites=["node_a"], estimated_minutes=30),
        ]
        with pytest.raises(AssertionError, match="topological_sort received a cyclic graph"):
            topological_sort(nodes)
