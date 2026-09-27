# The Inventory

**Your AI keeps rebuilding things you already own.**

Your project has a function that formats dates. It's called `fmtDt`, it's buried three folders deep, and nobody has looked at it in a year.

You ask your AI assistant to show a date on the invoice page. It searches the project for "date formatter". It finds nothing, because the thing is called `fmtDt`. So it writes a new one.

The new one is fine. Correct, tested, passes review. You now own two.

Next month someone fixes a bug in one of them. The other one still has the bug. Nobody knows there are two.

## Why this is a new problem

A developer who'd been on the team a while carried a rough memory of what the project already contained. *"I think we've got something for that."* Nobody wrote that memory down. It built up over months of reading and reviewing code.

An AI starts every session with no memory at all. It can only search by name. If the name is unhelpful, the thing is invisible, so it builds a new one.

Then it happens again. And again. Every session, for every developer. Each copy makes the project noisier, which makes the next search worse, which makes the next copy more likely.

## What we're building

A plain-language inventory of everything the project can already do. Not a list of names — a list of *descriptions*. "Turns a date into DD/MM/YYYY" points at `fmtDt`.

Before the AI starts work, we hand it that inventory. It no longer has to guess whether something exists.

And we don't take its word for it. If two functions give the same answers across hundreds of test inputs, they genuinely do the same thing.

**The AI reuses instead of rebuilds. The project stops growing sideways.**
