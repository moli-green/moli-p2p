# Agent Roles & Workflow

## Overview
This repository utilizes an AI-assisted development workflow. The roles have evolved from a strict Auditor/Developer split to a more collaborative and active development model.

## Roles

*   **Jules (Lead Architect & Full-Stack Engineer)**
    *   **Responsibilities**:
        *   Lead architectural design, feature planning, and deep code analysis.
        *   Implement major features, complex refactoring, and critical bug fixes directly.
        *   Ensure code quality, security, and adherence to the "Sovereign" philosophy (e.g., Sakoku policy, local-first logic).
        *   **Documentation Rule**: Whenever a significant feature or architectural change is implemented, Jules **MUST** append the specification and rationale to the end of `spec.md`. Do not modify or delete historical entries in `spec.md`.
    *   **Output**:
        *   Direct code commits for features and fixes.
        *   Updates to `spec.md` for major changes.
        *   Updates to `ANTIGRAVITY_INSTRUCTIONS.md` when delegating specific, isolated tasks to Antigravity.

*   **Antigravity (Developer / Assistant)**
    *   **Responsibilities**:
        *   Execute specific implementation tasks, refactoring, or boilerplate generation as instructed by Jules.
        *   Follow instructions provided in `ANTIGRAVITY_INSTRUCTIONS.md`.
    *   **Output**:
        *   Modified source code (Commits) based on delegated tasks.

## Workflow

1.  **Planning & Implementation (Jules)**:
    *   Jules analyzes the user request and the codebase.
    *   Jules directly implements the solution, tests it locally, and verifies the frontend if applicable.
    *   Jules updates `spec.md` with the new feature details.

2.  **Delegation (When Necessary)**:
    *   If a task is better suited for asynchronous or parallel execution, Jules **overwrites** `ANTIGRAVITY_INSTRUCTIONS.md` with detailed instructions for Antigravity.
    *   Antigravity implements the delegated changes.

## Core Rules

*   **`spec.md` is the Historical Source of Truth**: This file contains the chronological evolution of the architecture. **Never** delete or significantly alter past entries. Always **append** new major features or architectural shifts to the bottom with a new version/section number.
*   **`ANTIGRAVITY_INSTRUCTIONS.md` is Transient**: This file serves as a communication channel for the *current* delegated task only. Jules should overwrite this file completely when issuing new instructions (do not append).
*   **Language**: All agent-to-agent documentation (`AGENTS.md`, `ANTIGRAVITY_INSTRUCTIONS.md`, `spec.md`) should be written in **English** to ensure clarity and precision for LLM processing.
*   **Testing Image Uploads (Browser Subagents)**: When using browser subagents to test upload functionality, use realistic payload sizes. If using generated canvas images, ensure they are large enough to test WebRTC DataChannel chunking and backpressure logic, or use real test images provided in the repository.
