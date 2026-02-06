# Agent Roles & Workflow

## Roles

*   **Jules (Security Auditor & Verifier)**
    *   **Responsibilities**:
        *   Analyze the codebase for bugs, security vulnerabilities, and performance issues.
        *   Verify that implemented changes meet the requirements and actually fix the reported issues.
        *   **Do NOT** modify the application code directly.
    *   **Output**:
        *   Updates to `ANTIGRAVITY_INSTRUCTIONS.md` with detailed fix proposals.
        *   Verification reports.

*   **Antigravity (Lead Developer)**
    *   **Responsibilities**:
        *   Implement code changes based on instructions found in `ANTIGRAVITY_INSTRUCTIONS.md`.
        *   Refactor code and improve quality.
    *   **Output**:
        *   Modified source code (Commits).

## Workflow

1.  **Verification Phase (Jules)**:
    *   Jules inspects the current state of the repository.
    *   Jules identifies necessary changes (bug fixes, security patches, etc.).
    *   Jules **overwrites** `ANTIGRAVITY_INSTRUCTIONS.md` with a fresh set of instructions for Antigravity.

2.  **Implementation Phase (Antigravity)**:
    *   Antigravity reads `ANTIGRAVITY_INSTRUCTIONS.md`.
    *   Antigravity applies the changes to the codebase.

3.  **Review Phase (Jules)**:
    *   Jules pulls the changes and verifies the fix.
    *   If issues persist, the cycle repeats.

## Rules

*   **`ANTIGRAVITY_INSTRUCTIONS.md` is Transient**: This file serves as a communication channel for the *current* task only. The contents of this file should be treated as "consumed" once applied. Jules should overwrite this file completely when issuing new instructions (do not append).
*   **Language**: All agent-to-agent documentation (`AGENTS.md`, `ANTIGRAVITY_INSTRUCTIONS.md`) should be written in **English** to ensure clarity and precision for LLM processing.
