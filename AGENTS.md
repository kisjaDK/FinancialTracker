AGENTS.md

Purpose

This repository uses Codex agents and skills to implement features consistently across a Next.js + PostgreSQL + Prisma application with optional local LLM integration via Ollama.

Agents should prioritize simple, production‑safe changes, reuse existing patterns, and avoid unnecessary abstractions.

Core Rules

1. Understand before changing

Read relevant files before modifying code.

Trace data flow before altering database, API, or UI logic.

2. Respect the stack

Primary stack:

Next.js

PostgreSQL

Prisma ORM

Local LLM via Ollama

Prefer:

TypeScript

Server-side model access

Existing repo conventions.

3. Security

Never expose database credentials.

Never call Ollama or LLM providers directly from the browser.

All model access must run server-side.

4. Commit validation

Before committing:

npm run build

Fix all build issues before committing.

Do not commit if the build fails.

Memory System

The repo includes a persistent learning layer.

Folder structure:

memory/
YYYY-MM-DD.md

Rules:

Always read relevant files in /memory before starting work.

Use prior learnings when making decisions.

Before any context compaction, summarize key learnings and append to today's file.

At the end of work, persist important learnings.

Record:

architecture decisions

debugging discoveries

repo conventions

pitfalls

useful commands

Memory should remain short, high‑signal, and practical.

Installed Skills

Agents should prefer the following installed skills when applicable:

Frontend Design

Next.js Shadcn Frontend

OpenAI Docs

Backend Data Security

llm-nextjs-prisma-ollama

Skill: llm-nextjs-prisma-ollama

Used when building AI features inside the application.

Scope:

Next.js server integration with LLMs

Ollama integration

Prompt templates

Structured outputs

AI workflows tied to Prisma models

Guidelines:

Use a provider abstraction.

Keep prompts separate from business logic.

Prefer structured JSON responses.

Validate model outputs before persistence.

Persist metadata for tasks when needed.

Recommended structure:

src/lib/ai/
providers/
prompts/
schemas/
tasks/

Development Workflow

When implementing work:

Read /memory.

Inspect relevant code.

Choose the appropriate skill.

Implement minimal safe changes.

Run npm run build.

Persist learnings to /memory.

Done Criteria

Work is complete when:

The build passes.

Code follows repo conventions.

Prisma changes are valid.

LLM integrations remain server-side.

Key learnings are persisted to /memory.
