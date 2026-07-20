"""The room aggregate: the in-memory model, its store, and HTTP routes.

This package is the seam the rest of the backlog builds on — participants (S2),
the voting round (S3), reveal/results (S4), and lifecycle (S5) all extend the
``Room`` model and its store rather than introducing parallel state.
"""
