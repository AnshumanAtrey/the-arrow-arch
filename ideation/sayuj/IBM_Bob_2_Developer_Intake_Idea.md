# Developer Intake → Clarification → Execution

## IBM Bob 2.0 Hackathon Idea

> **One-line idea:** Turn work arriving through email and team chat into
> a clear, confirmed developer task, then use IBM Bob 2.0 to take that
> task through the actual development workflow.

------------------------------------------------------------------------

## 1. The idea in simple words

A developer often does not receive work as a clean engineering ticket.

The request may arrive as:

-   a Gmail message
-   a Slack message
-   a forwarded customer complaint
-   a message from a manager
-   a short sentence such as "the checkout is broken"
-   a conversation containing the real requirement across several
    messages

Today, the developer has to manually:

1.  find the request
2.  understand what the person actually wants
3.  find missing information
4.  decide whether the request is clear enough
5.  turn it into a development task
6.  estimate what kind of work it is
7.  start working

Our idea puts an **AI intake layer before development**.

It collects incoming work, understands the conversation, identifies what
is known and unknown, asks only the important clarification questions,
gets human confirmation, and then hands a clean task to IBM Bob 2.0.

The goal is **not to replace the developer**.

The goal is to make sure that when the developer starts working, the
task is already clear.

------------------------------------------------------------------------

# 2. The problem

The problem is not simply "developers receive too many messages."

The deeper problem is:

> **Important development work often starts with an unclear human
> request.**

Example:

### Incoming Slack message

> "Hey, checkout is not working for some customers. Can you fix it
> ASAP?"

A developer still has to figure out:

-   Which store?
-   Which customers?
-   What does "not working" mean?
-   Is payment failing?
-   Is the cart failing?
-   Is this on mobile?
-   When did it start?
-   Is there an error message?
-   Is this a bug or an intended behavior?
-   How urgent is it?
-   What should the final behavior be?

The developer is doing requirement clarification before they can even
begin engineering.

That creates wasted time and, more importantly, creates a risk of
building the wrong thing.

------------------------------------------------------------------------

# 3. What our system does

The system has five simple stages:

``` text
MESSAGE
   ↓
UNDERSTAND
   ↓
CHECK WHAT IS MISSING
   ↓
ASK HUMAN
   ↓
CONFIRM TASK
   ↓
IBM BOB 2.0
   ↓
DEVELOPMENT WORKFLOW
```

### Stage 1 --- Collect

The system watches selected work channels such as:

-   Gmail
-   Slack

For the hackathon prototype, we should start with **one or two
sources**, not everything.

WhatsApp can be shown as a future integration rather than becoming a
major engineering dependency.

------------------------------------------------------------------------

## Stage 2 --- Understand

The system reads the conversation and creates a simple task summary.

Example:

**Original message**

> "The checkout is broken for some users. Please fix it."

**AI interpretation**

**Possible task:** Investigate checkout failures.

**Known:** - Checkout is failing - Some users are affected - A fix is
requested

**Unknown:** - Which users? - Which checkout step? - What error
occurs? - Which environment? - Expected behavior?

------------------------------------------------------------------------

# 4. The important feature: ambiguity detection

The system should not pretend that every request is clear.

It checks how much important information is missing.

Instead of showing a complicated technical score, the developer sees:

### CLEAR

> "Add a discount code field to checkout and validate codes against the
> existing discount API."

**Action:** Ready to send to Bob.

### NEEDS CLARIFICATION

> "Checkout is broken."

**Action:** Ask the requester a question.

### HIGHLY UNCLEAR

> "Make the checkout better."

**Action:** Do not start development.

The system should explain **why** it needs clarification.

------------------------------------------------------------------------

# 5. Human confirmation

This is one of the most important parts of the product.

The AI should not silently decide what the requester meant.

Instead it asks a normal-language question.

Example:

> "I understood the request as:
>
> 'Fix checkout failures affecting mobile users during payment.'
>
> Is that what you want me to work on?
>
> **Yes, that's correct** **No, change it**"

If something is missing:

> "I can investigate the checkout problem, but I need one detail:
>
> **Does the problem happen before payment, during payment, or after
> payment?**"

The requester answers.

The task becomes clearer.

Only then can the development workflow begin.

------------------------------------------------------------------------

# 6. Where IBM Bob 2.0 fits

This is where the idea must be very deliberate.

**Bob should not be the chatbot that asks the clarification questions.**

The intake layer prepares the work.

**IBM Bob 2.0 becomes the engineering system that receives the confirmed
task.**

For example:

``` text
Slack / Gmail
      ↓
Task Intake
      ↓
Understand request
      ↓
Find missing information
      ↓
Human confirmation
      ↓
Clean engineering task
      ↓
IBM Bob 2.0
      ↓
Plan
      ↓
Parallel investigation
      ↓
Implementation
      ↓
Verification
      ↓
Developer receives result
```

Bob's Agent mode, subagents, parallel work, document understanding and
execution capabilities can then be used for the actual engineering work.

The important point is:

> **We are improving the workflow before and around development, rather
> than building another tool that only writes or reviews code.**

------------------------------------------------------------------------

# 7. Why this is different from a normal AI coding assistant

A normal coding assistant starts here:

> "Here is a coding task. Write code."

Our system starts much earlier:

> "Someone sent a messy human request. What are they actually asking the
> developer to do?"

That is the gap we want to solve.

------------------------------------------------------------------------

# 8. What we should NOT build

This is critical.

The hackathon already explicitly asks teams to improve developer
workflows such as onboarding, debugging, code review, testing,
maintenance, and release/deployment.

We should **not try to build another generic version of those tools**.

Do not make the core product:

-   another code reviewer
-   another testing assistant
-   another debugging assistant
-   another GitHub repository chatbot
-   another CI/CD dashboard
-   another generic coding agent
-   another project-management replacement

Those areas are crowded.

Our product should own this narrower problem:

> **Turning messy incoming developer requests into confirmed, executable
> engineering work.**

Then Bob handles the downstream engineering workflow.

------------------------------------------------------------------------

# 9. Critical comparison with our existing team ideas

## Friend Idea 1 --- The Workshop

The Workshop focuses on:

-   breaking a large development task into smaller tasks
-   multiple AI helpers
-   parallel work
-   planning
-   verification
-   persistent project information
-   proving that work is actually finished

Its central problem is:

> **How can AI execute a development task safely without losing context
> or pretending it is finished?**

That is a strong downstream execution idea.

Our idea should **not copy this**.

Our system should feed the Workshop/Bob a better-defined task.

``` text
MESSY REQUEST
     ↓
OUR SYSTEM
     ↓
CONFIRMED TASK
     ↓
WORKSHOP / BOB
     ↓
IMPLEMENTATION
```

The two ideas can therefore fit together rather than compete.

------------------------------------------------------------------------

## Friend Idea 2 --- TraceGuard

TraceGuard focuses on the gap between:

> what was requested

and

> what was actually implemented.

It creates a chain from the requirement through code, APIs, database,
tests and documentation, then detects mismatches and verifies the
result.

That is a post-implementation / continuous verification problem.

Our system should not become another TraceGuard.

Instead:

``` text
INCOMING REQUEST
       ↓
OUR SYSTEM
       ↓
CONFIRMED REQUIREMENT
       ↓
TRACEGUARD / BOB
       ↓
IMPLEMENTATION
       ↓
VERIFICATION
```

TraceGuard is concerned with whether the implementation matches the
requirement.

Our idea is concerned with whether the **original message has been
understood correctly before implementation starts**.

------------------------------------------------------------------------

# 10. The biggest criticism of our idea

There is a serious problem we must acknowledge:

**"AI reads Slack and turns it into a task" is not unique enough by
itself.**

The previous IBM Bob Hackathon already had projects around
conversational-to-code workflows and scope clarification.

For example, the previous competition included **ScopeShield**, which
focused on turning vague requests into clear technical scope before
development. It identified hidden scope, risks, affected areas and
clarification questions.

There was also **EchoSync**, positioned around moving from conversation
to code autonomously.

Therefore:

> **If our demo is only "paste Slack message → AI creates task," it will
> look like a weaker copy of existing ideas.**

We need a sharper distinction.

------------------------------------------------------------------------

# 11. The stronger version of our idea

The real product should be:

## "Developer Work Intake Gateway"

Not simply:

> AI task generator

But:

> **A system that turns unstructured work communication into a
> human-confirmed development task and then hands it directly to an
> agentic development workflow.**

The important difference is the complete flow:

``` text
REAL MESSAGE
     ↓
SOURCE + CONVERSATION CONTEXT
     ↓
TASK EXTRACTION
     ↓
AMBIGUITY CHECK
     ↓
MISSING INFORMATION
     ↓
ONE OR MORE HUMAN QUESTIONS
     ↓
CONFIRMED INTENT
     ↓
ENGINEERING TASK
     ↓
BOB EXECUTION
     ↓
RESULT BACK TO DEVELOPER
```

The system is therefore not only analyzing text.

It is managing the **handoff between humans and engineering work**.

------------------------------------------------------------------------

# 12. The killer demo

The demo should feel like a real developer's morning.

### Step 1 --- A message arrives

Slack:

> "Hey, the subscription customers are still seeing the old price on
> checkout. Can someone fix this?"

### Step 2 --- System extracts the request

It shows:

**Detected task**

> Investigate and fix checkout pricing for subscription customers.

**Possible affected area**

> Checkout / subscription pricing

**Missing information**

> Which subscription plans are affected?

### Step 3 --- AI asks the requester

> "Do you mean all subscription plans, or only the annual plan?"

Requester:

> "Only annual."

### Step 4 --- System updates the task

> Fix checkout pricing for annual subscription customers.

### Step 5 --- Human confirms

> "This is what I will send to the developer workflow. Correct?"

**Confirm**

### Step 6 --- Bob starts

Bob receives:

``` text
Goal:
Fix checkout pricing for annual subscription customers.

Source:
Slack conversation

Confirmed requirement:
Annual subscription customers must see the current subscription
price during checkout.

Important clarification:
Monthly subscriptions are not part of this task.

Source evidence:
<conversation>

User confirmation:
<timestamp>
```

Now Bob can investigate the repository and execute the development
workflow.

### Step 7 --- Result

The developer gets:

> Task completed.
>
> Files changed: 4 Tests: 12 passed Human decisions required: 0
> Remaining issue: none

The exact downstream workflow can use the capabilities of Bob that the
hackathon asks teams to demonstrate.

------------------------------------------------------------------------

# 13. Why the human confirmation matters

This is not just a safety button.

It solves a fundamental problem:

**AI can understand language, but understanding language does not mean
knowing the person's intention with certainty.**

For example:

> "Make the product page faster."

Could mean:

-   reduce JavaScript
-   optimize images
-   improve server response time
-   improve mobile performance
-   improve page-load metrics
-   simply make the page feel faster

The system should not guess.

It should ask.

------------------------------------------------------------------------

# 14. What should be measured

The hackathon explicitly asks teams to demonstrate impact.

So we need measurable before/after numbers.

### Without our system

Measure:

-   time from receiving message → understanding task
-   number of clarification messages
-   time spent creating the engineering task
-   number of tasks that require re-clarification
-   number of tasks started with missing information

### With our system

Measure:

-   time to create a confirmed task
-   number of clarification messages
-   number of missing requirements detected before development
-   number of tasks sent to Bob without manual rewriting
-   developer time saved

Example demo benchmark:

``` text
WITHOUT SYSTEM
Slack message
     ↓
Developer reads conversation
     ↓
Asks questions
     ↓
Creates task
     ↓
Explains task to engineering agent

Time: 12 minutes

WITH SYSTEM
Slack message
     ↓
AI extracts task
     ↓
AI asks one clarification
     ↓
Human confirms
     ↓
Bob receives structured task

Time: 2 minutes
```

The exact numbers should be measured during the prototype rather than
invented for the final presentation.

------------------------------------------------------------------------

# 15. What the judges are likely to care about

The current IBM Bob 2.0 challenge explicitly asks for a solution that
improves a specific developer workflow, starts from a real problem, uses
Bob for a working prototype, and demonstrates measurable productivity,
effort, error, rework or time improvements.

The published judging criteria for a related IBM Bob build emphasize
**depth of IBM Bob usage, relevance of the use case, technical
execution, and presentation clarity**.

So our project should prove four things:

### 1. Real problem

Show an actual messy developer request.

### 2. Bob is essential

Bob must perform meaningful engineering work after the request is
clarified.

### 3. Full workflow

Show:

``` text
MESSAGE → CLARIFY → CONFIRM → BOB → WORK → RESULT
```

### 4. Measurable improvement

Show before/after time and manual steps.

------------------------------------------------------------------------

# 16. What previous winners tell us

The previous IBM Bob Hackathon had **5,628 participants, 503 final
submissions**, and the official winners included Pedigree, Atlas and
Sandbox.

Pedigree focused on a very specific problem: proving the origin and
approval history of AI-generated code.

Atlas focused on a simple, visual onboarding problem: understanding a
large repository quickly.

Sandbox focused on showing how a system could fail under simulated
production load.

The common lesson is not that one particular technology won.

The stronger pattern is:

> **A narrow problem + a clear visual demonstration + a working
> product + a reason Bob matters.**

Atlas is particularly useful as a lesson: its hackathon version had a
very simple promise --- turn a repository into something a developer
could understand quickly --- and it was built as a focused 48-hour
prototype.

------------------------------------------------------------------------

# 17. Why our idea can still work

Our idea has one potentially strong advantage:

**It sits before the coding process.**

Most developer AI tools assume that a clean task already exists.

Real work does not always start that way.

The actual chain is often:

``` text
Customer
   ↓
Manager
   ↓
Slack / Email
   ↓
Developer
   ↓
Task interpretation
   ↓
Engineering
```

We want to automate the messy middle.

That gives us a simple story:

> **Before Bob can build the right thing, someone needs to know what
> "the right thing" actually is.**

------------------------------------------------------------------------

# 18. What I would build for the hackathon

Do NOT attempt all integrations.

### MVP

Support:

-   Gmail
-   Slack
-   one sample project/repository
-   one Bob-powered development workflow

### Core features

1.  **Incoming request inbox**
2.  **Conversation understanding**
3.  **Task extraction**
4.  **Missing-information detection**
5.  **Plain-language clarification**
6.  **Human confirmation**
7.  **Confirmed task package**
8.  **Bob execution**
9.  **Result returned to the developer**
10. **Before/after metrics**

### Optional

-   WhatsApp
-   Jira
-   Linear
-   GitHub Issues

These should be shown as future integrations unless the team has enough
time.

------------------------------------------------------------------------

# 19. The product boundary

This boundary should be extremely clear.

### We own:

**"What exactly is the developer being asked to do?"**

### Bob owns:

**"How should the development work be planned and executed?"**

### The developer owns:

**"Is this actually what I want?"**

That separation makes the product easier to understand.

------------------------------------------------------------------------

# 20. Final definition

## Developer Work Intake Gateway

**A human-confirmed AI layer that converts messy developer requests from
communication channels into clear engineering tasks, identifies missing
information before development begins, and passes the confirmed task
directly to IBM Bob 2.0 for execution.**

### The core promise

> **No more starting development from "Hey, can you fix this?"**

Instead:

> **Message → Understand → Clarify → Confirm → Build**

------------------------------------------------------------------------

# 21. Final warning

The idea is **not automatically a winner**.

The basic concept is too close to existing "conversation → task" and
"vague request → technical scope" tools.

The project becomes interesting only if we make the **entire handoff
measurable and executable**:

``` text
REAL COMMUNICATION
        ↓
UNDERSTAND
        ↓
DETECT AMBIGUITY
        ↓
ASK THE MINIMUM QUESTION
        ↓
HUMAN CONFIRMS
        ↓
CREATE EXECUTABLE TASK
        ↓
IBM BOB 2.0
        ↓
ACTUAL ENGINEERING WORK
        ↓
RESULT BACK TO THE PERSON
```

If the team cannot demonstrate the final **Bob execution step**, then
this risks becoming a generic productivity/requirements tool rather than
a strong IBM Bob 2.0 project.

The strongest version is therefore **not an AI inbox**.

It is a **verified bridge from human communication to autonomous
software development**.
