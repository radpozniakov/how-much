# 00 — Context

## What this is

**how-much** is a Planning-Poker-style estimation tool. A team gathers in a room,
each member privately picks an estimate for the current item, and the votes are
revealed together on the host's command. It removes anchoring bias — nobody sees
another person's number until everyone has committed.

This is an **MVP**. The goal is a working, self-hostable tool with the smallest
feature set that makes a real estimation session usable. There are many similar
tools; we are not trying to differentiate on features, only to have a clean,
dependency-light implementation we control.

## Problem

Distributed teams need a fast, frictionless way to run estimation rounds without
accounts, setup, or a database. Existing tools are either heavy, paid, or require
sign-up.

## Goals

- Create a room and share it in seconds — no login, no account.
- Run private voting rounds and reveal them on the host's command.
- Show clear results (each vote + basic stats) after reveal.
- Stay lightweight: no database, no persistence beyond process memory.

## Non-goals (MVP)

- User accounts, authentication, or authorization.
- Persistent history, analytics, or exporting results.
- Backlog / ticket management or integrations (Jira, etc.).
- Multiple estimation decks or custom cards.
- Mobile-native apps.

## High-level architecture

- **Backend** — Python service. Holds all room state in memory. Speaks WebSocket
  as the primary transport for real-time events; minimal HTTP for room creation
  and static concerns.
- **Frontend** — Vite + React single-page app. Connects to the backend over
  WebSocket and renders room state.
- **Deployment** — Each service runs in its own Docker container.

## Constraints

- No database. All room state lives in the backend process memory and is lost on
  restart.
- Maximum **30 participants** per room.
- Primary event transport is **WebSocket**.

See [03-decisions.md](03-decisions.md) for the specific choices behind these, and
[01-requirements.md](01-requirements.md) for detailed requirements.
