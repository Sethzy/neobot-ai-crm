# Twitter Article - @ashpreetbedi: The 5 Levels of Agentic Software

**URL:** https://x.com/ashpreetbedi/status/2024885969250394191?s=46
**Author:** Ashpreet Bedi (@ashpreetbedi)
**Posted:** Feb 20, 2026, 4:36 PM UTC
**Engagement:** 9 replies, 48 reposts, 510 likes, 97.0K views

## Summary
Near-verbatim extraction of the original X/Twitter post plus embedded X Article content when available.

## Full Article

### Original Post (Near-Verbatim)

https://t.co/AqCRd8x55A

### Embedded X Article (Near-Verbatim): The 5 Levels of Agentic Software

Most teams overcomplicate agents. They start with multi-agent orchestration, autonomous reasoning loops, and over-the-top infrastructure. Then spend weeks debugging why the simplest tasks fail.

The pattern I follow is embarrassingly simple: **start simple, add capabilities progressively, verify behavior at each step.**

Today I'll show you the five architectural levels of agentic software:

1. Agent with tools

1. Agent with storage and knowledge

1. Agent with memory and learning

1. Multi-agent teams

1. Production system

We'll build a lightweight coding agent called Gcode, adding one capability at a time. Like always, I'll share code snippets for every level.

Checkout the full cookbook for code you can clone and run today.

> Disclaimer: I'm human and I make mistakes, please let me know if I got something wrong.

## Level 1: Agent with tools

An agent without tools is just an LLM. It can reason, but it can't **do** anything. Tools are what turn an LLM into an Agent. For a coding agent, the minimum viable toolset is: read files, write files, and run shell commands.

```python
from agno.agent import Agent
from agno.models.openai import OpenAIResponses
from agno.tools.coding import CodingTools

WORKSPACE = Path(__file__).parent.joinpath("workspace")
WORKSPACE.mkdir(parents=True, exist_ok=True)

agent = Agent(
    name="Gcode",
    model=OpenAIResponses(id="gpt-5.2"),
    instructions=(
        "You are a coding agent. Write clean, well-documented code. "
        "Always save your work to files and test by running them."
    ),
    tools=[CodingTools(base_dir=WORKSPACE, all=True)],
    markdown=True,
)

agent.print_response(
    "Write a Fibonacci function, save it to fib.py, and run it to verify",
    stream=True,
)
```

**What's happening:** The agent receives a task, uses CodingTools to write, edit, and run code. The `all=True` flag enables every tool in the CodingTools toolkit (read, write, edit, shell, grep, find, ls).

**What's missing:** Every run starts from zero. The agent can't recall previous sessions, can't follow project conventions unless you paste them into the prompt, and has no knowledge beyond the current context.

## Level 2: Agent with storage and knowledge

Level 1 is stateless. Everything needs to be in the context. Level 2 fixes this problem with two additions: session storage and domain knowledge.

## Storage

Storage saves every agent session, and every run in it, to a database. This gives you two things.

1. Chat history as context. Using storage, the agent can include the last N messages in its context window so it knows what's going on. For longer sessions, you can run compression algorithms to summarize earlier context and keep the window focused on what matters right now.

1. A record of what happened. Not everything needs to be sent to a third-party tracing provider. Storing sessions in your own database is the simplest way to understand what your agent did, when, and why. You own the data. You can query it, audit it, build dashboards on top of it.

## Knowledge

Today's coding agents only see the files in your codebase at and nothing else. They don't have access to your architecture specs, your team's design decisions, your internal meeting notes, or the Slack thread where someone explained why you chose Postgres over DynamoDB.

That's what knowledge fixes. It gives the agent a searchable store of everything that matters to the project but doesn't need to live in the context window at all times: specs, RFPs, runbooks, architecture decision records, meeting notes, team conversations.

The key insight is that a lot of valuable context lives outside the codebase. If your team discussed a migration strategy in a meeting last month, that context should be available to the coding agent when it's working on the migration. If someone made a decision to use library X over library Y six months ago, the agent should be able to find that reasoning before it rips out X and starts from scratch.

```python
from agno.db.sqlite import SqliteDb
from agno.knowledge import Knowledge
from agno.knowledge.embedder.openai import OpenAIEmbedder
from agno.vectordb.chroma import ChromaDb, SearchType

db = SqliteDb(db_file=str(WORKSPACE / "agents.db"))

knowledge = Knowledge(
    vector_db=ChromaDb(
        collection="coding-standards",
        path=str(WORKSPACE / "chromadb"),
        search_type=SearchType.hybrid,
        embedder=OpenAIEmbedder(id="text-embedding-3-small"),
    ),
)

agent = Agent(
    name="Gcode",
    model=OpenAIResponses(id="gpt-5.2"),
    instructions=(...),
    tools=[CodingTools(base_dir=WORKSPACE, all=True)],
    knowledge=knowledge,
    search_knowledge=True,
    db=db,
    add_history_to_context=True,
    num_history_runs=3,
    markdown=True,
)
```

**What changed:** Two additions, Knowledge backed by ChromaDb (with hybrid search for both semantic and keyword matching), and SqliteDb for session storage. The agent now:

1. **Searches knowledge** before coding. If your style guide says "use snake_case", the agent finds and follows it.

1. **Remembers conversations:** ask a follow-up question in the same session, and it has full context.

**Seeding knowledge:** You insert documents (text, PDF, URLs) into the knowledge base. At run time, the agent searches for relevant chunks and adds them to its context. This is basic Agentic RAG.

```python
# Load your coding standards
knowledge.insert(text_content="""
## Project Conventions
- Use type hints on all function signatures
- Write docstrings in Google style
- Prefer list comprehensions over map/filter
""")
```

**When to use Level 2:** When the agent needs to follow standards it wasn't trained on, or when users expect multi-turn conversations. This is the sweet spot for most internal tools.

## Level 3: Agent with memory and learning

The jump from Level 2 to Level 3 is the most important one. At Level 2, the agent follows rules you give it. At Level 3, it learns rules from experience.

> **Interaction 1000 should be better than interaction 1.**

```python
from agno.learn import LearnedKnowledgeConfig, LearningMachine, LearningMode
from agno.tools.reasoning import ReasoningTools

learned_knowledge = Knowledge(
    vector_db=ChromaDb(
        collection="coding-learnings",
        path="tmp/chromadb",
        search_type=SearchType.hybrid,
        embedder=OpenAIEmbedder(id="text-embedding-3-small"),
    ),
)

agent = Agent(
    name="Gcode",
    model=OpenAIResponses(id="gpt-5.2"),
    instructions=(...),
    tools=[
        CodingTools(base_dir=WORKSPACE, all=True),
        ReasoningTools(),
    ],
    knowledge=docs_knowledge,
    search_knowledge=True,
    learning=LearningMachine(
        knowledge=learned_knowledge,
        learned_knowledge=LearnedKnowledgeConfig(
            mode=LearningMode.AGENTIC,
        ),
    ),
    enable_agentic_memory=True,
    db=db,
    markdown=True,
)
```

**What changed:**

1. **Learning Machine**: The agent gets save_learning and search_learnings tools. It decides what's worth remembering: coding patterns that worked, mistakes to avoid, user preferences. These are stored in a separate knowledge base and surfaced in future sessions.

1. **Agentic Memory**: The agent builds a user profile over time: your preferred coding style, frameworks you use, how you like explanations.

**The two-session test:**

```
# Session 1: User teaches a preference
agent.print_response(
    "I prefer functional programming style — no classes, "
    "use pure functions and immutable data. Write a data pipeline.",
    session_id="session_1",
)

# Session 2: New task — agent should apply the preference
agent.print_response(
    "Write a log parser that extracts error counts by category.",
    session_id="session_2",
)
```

In Session 2, the agent searches its learnings, finds the functional programming preference, and writes functional code.

**When to use Level 3:** When the agent serves the same users repeatedly and should improve over time. Personal coding assistants, team tools with shared learnings, any context where "do it the way we like it" matters.

## Level 4: Multi-Agent Team

Sometimes one agent isn't enough. Level 4 splits responsibilities across specialized agents coordinated by a team leader.

```python
from agno.team.team import Team

coder = Agent(
    name="Coder",
    role="Write code based on requirements",
    tools=[CodingTools(base_dir=WORKSPACE, all=True)],
    ...
)

reviewer = Agent(
    name="Reviewer",
    role="Review code for quality, bugs, and best practices",
    tools=[CodingTools(base_dir=WORKSPACE, enable_write_file=False,
                       enable_edit_file=False, enable_run_shell=False)],
    ...
)

tester = Agent(
    name="Tester",
    role="Write and run tests for the code",
    tools=[CodingTools(base_dir=WORKSPACE, all=True)],
    ...
)

coding_team = Team(
    name="Coding Team",
    members=[coder, reviewer, tester],
    instructions=(...),
    show_members_responses=True,
    markdown=True,
)
```

Coder writes, Reviewer reads (note: write/edit/shell disabled), Tester validates. The team leader coordinates and synthesizes.

**Honest caveat:** Multi-agent teams are powerful but unpredictable. The team leader is an LLM making delegation decisions. Sometimes it delegates well, sometimes it doesn't. For production systems where reliability matters, prefer explicit workflows over dynamic teams. Teams shine in human-supervised settings where a human can review the output.

**When to use Level 4:** When you need multiple perspectives (code review is a perfect example), when tasks naturally decompose into specialist roles, or when you're building interactive tools where a human can supervise the team.

## Level 5: Agentic System (Production API)

Level 5 is the runtime that turns Levels 1-4 into a production service. You upgrade from development databases to production ones, add tracing, and expose everything as an API.

```python
from agno.db.postgres import PostgresDb
from agno.vectordb.pgvector import PgVector, SearchType
from agno.os import AgentOS

db_url = "postgresql+psycopg://ai:ai@localhost:5532/ai"
db = PostgresDb(db_url=db_url)

knowledge = Knowledge(
    vector_db=PgVector(
        db_url=db_url,
        table_name="coding_knowledge",
        search_type=SearchType.hybrid,
        embedder=OpenAIEmbedder(id="text-embedding-3-small"),
    ),
)

# ... create your Level 3 agent with production db ...

agent_os = AgentOS(
    id="Gcode OS",
    agents=[coding_agent],
    teams=[coding_team],
    config=config_path,
    tracing=True,
)
app = agent_os.get_app()

if __name__ == "__main__":
    agent_os.serve(app="run:app", reload=True)
```

**What changed:**

1. **PostgreSQL + PgVector** replaces SQLite + ChromaDb. Real connection pooling, real backups, real concurrent access.

1. **AgentOS** wraps your agents in a FastAPI application with a built-in web UI, session management, and tracing.

1. **Tracing** (tracing=True) gives you observability into every tool call, every knowledge search, every delegation decision.

**When to use Level 5:** When the agent leaves your laptop. Multiple users, uptime requirements, the need to debug production issues.

## The Most Important Advice

**Start at Level 1.** Build the simplest agent that could solve the problem. Run it. See where it fails. Then add exactly the capability it's missing.

Most teams skip to Level 4 because multi-agent architectures look impressive in demos. Then they spend months debugging coordination failures that a single agent with good instructions would have avoided.

Think of the levels as a hierarchy of capability and remember that each level adds complexity, and complexity has a cost. Pay it only when the simpler approach has clearly failed.

Here's the cookbook with runnable code for all five levels. Clone it, run it, let me know if something's not working. I'm a human and I make mistakes.

---

*Built with Agno - the programming language for agentic software.*


## Metadata
- Tweet ID: 2024885969250394191
- Canonical URL: https://twitter.com/ashpreetbedi/status/2024885969250394191
- Source tier used: tier2
- Embedded X article extracted: yes
