# Triage Board

The Triage Board is a Kanban-style issue triage canvas with a top-3 **Needs attention now** lane that shows a summary and justification for each card, a backlog lane, and an **Add to context** button on every card. The button pushes that issue into the current Copilot session as a GitHub reference attachment.

## How to use

Ask Copilot to triage the repository's open issues and open the `triage-board` canvas. The agent can use the `set_board` action to populate or replace the board, and `add_to_context` to attach an issue from the board to the current session.

The canvas accepts this input shape when opened:

```js
{
  repo,
  title?,
  top: [{ number, title, url, state?, labels?, summary, justification }],
  rest: [...]
}
```

`repo` is the `owner/repo` identifier. Each issue requires `number`, `title`, and `url`; `state` and `labels` are optional. Include a `summary` and `justification` for each top-lane issue. `top` contains at most three prioritized issues, and `rest` contains backlog issues in the same shape.

Board data is stored per user under `$COPILOT_HOME/extensions/triage-board/artifacts/boards/` (by default, `~/.copilot/extensions/triage-board/artifacts/boards/`), not in the repository.
