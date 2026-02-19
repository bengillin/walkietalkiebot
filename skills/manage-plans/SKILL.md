---
name: manage-plans
description: Create, update, and track implementation plans in Walkie Talkie Bot. Use when the user wants to manage structured plans.
allowed-tools: list_plans, get_plan, create_plan, update_plan, delete_plan
---

# Manage Plans

Create and manage implementation plans in Walkie Talkie Bot's database.

## Status Workflow

Plans follow this lifecycle:
1. **draft** — newly created, not yet reviewed
2. **approved** — reviewed and accepted
3. **in_progress** — actively being worked on
4. **completed** — all steps finished
5. **archived** — stored for reference

## Steps

- **Create**: Use `create_plan` with a title and markdown content. Default status is "draft".
- **List**: Use `list_plans` to see all plans with their current status.
- **View**: Use `get_plan` to read the full content of a specific plan.
- **Update**: Use `update_plan` to change title, content, or advance the status.
- **Delete**: Use `delete_plan` to permanently remove a plan.

## Notes

- Plans can be linked to conversations via `conversationId`
- Use markdown formatting in plan content
- Works offline (no WTB server needed)
