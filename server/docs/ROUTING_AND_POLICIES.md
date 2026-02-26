# How Routing Uses Team Managers + Policies

## Team Manager Pool

Each team has a **primary manager** and an optional **manager pool** for failover:

1. **Primary manager** (`primary_manager_agent_id`): The default agent to route tasks to.
2. **Manager pool** (`registry_team_managers`): Ordered list of agents (priority 0 = primary, 1..n = failover).

**Routing logic:**

1. Resolve `team_id` for the task (e.g. from task metadata or team selector).
2. Fetch `registry_team_managers` for `team_id` ordered by `priority`.
3. Pick the first active manager. If that agent is unavailable, try the next (failover).
4. Record `manager_agent_id` and `manager_fallback_used` in `registry_team_run_logs` for observability.

**Failover triggers** (deterministic; use next manager when):
- Model/tool execution error
- Timeout
- Policy violation
- Structured output invalid

**Implementation:** Max attempts = pool size. Log which manager was tried and why it failed in `registry_team_run_logs` or existing tool-call logs. Prevent infinite retry loops.

## Policy Resolution

Policies control what tools and data an agent can use. Resolution order (most specific wins):

1. **Agent-specific** (`scope_type = 'agent'`, `scope_id = agent_id`)
2. **Team-specific** (`scope_type = 'team'`, `scope_id = team_id`)
3. **Global** (`scope_type = 'global'`, `scope_id = NULL`)

**Tool policy** (`resolveToolPolicy(agent_id, team_id, tool_name)`):

- Returns: `permission` (deny|read|draft|execute), `require_approval`, `max_cost_per_task`, `rate_limit_per_minute`, `constraints`.

**Data access policy** (`resolveDataAccessPolicy(agent_id, team_id, resource)`):

- `resource`: e.g. `gmail`, `calendar`, `drive`, `sheets`, `zendesk`, `hubspot`.
- Returns: `permission`, `constraints` (e.g. allowed_labels, allowed_calendars).

## Usage in OpenClaw

When OpenClaw assigns a task to a team:

1. **Manager selection**: Use the team’s primary manager or failover pool.
2. **Before tool call**: Call `resolveToolPolicy(agent_id, team_id, tool)` and enforce `permission` (deny → block, read → read-only, execute → allow).
3. **Before data access**: Call `resolveDataAccessPolicy(agent_id, team_id, resource)` and enforce `permission` and `constraints`.
4. **Logging**: Write `registry_team_run_logs` with `structured_output`, `raw_log`, `manager_agent_id`, `manager_fallback_used`.

## State Transitions

**Team status:** draft → active → paused ⇄ active → archived (terminal)

**Member status:** invited → active → suspended ⇄ active → removed (terminal)

Invalid transitions return `400` with a clear error message.
