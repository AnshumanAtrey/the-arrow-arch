import csv
from pathlib import Path

# One source post can document multiple distinct failure modes. Each issue below
# is an atomic, source-linked problem; comment-derived records remain labeled.
sources = {
'coding_beyond': ('2024-05-29','ChatGPTCoding','The downside of coding with AI beyond your knowledge level','https://www.reddit.com/r/ChatGPTCoding/comments/1d3ole7/the_downside_of_coding_with_ai_beyond_your/','AI coding user describing personal experience','Original post; self-described developer'),
'coding_work': ('2024-11-15','ChatGPTCoding','I dont like AI tools for coding at work and its frustrating me','https://www.reddit.com/r/ChatGPTCoding/comments/1gs0lov/i_dont_like_ai_tools_for_coding_at_work_and_its/','Developer discussing workplace use of coding assistants','Original post; practitioner'),
'debug_decay': ('2025-08-01','ChatGPTCoding','Debugging Decay: The hidden reason ChatGPT can’t fix your bug','https://www.reddit.com/r/ChatGPTCoding/comments/1meyd75/debugging_decay_the_hidden_reason_chatgpt_cant/','Post author describes self as an ex-YC startup founder','Original post; self-described founder'),
'comprehension': ('2025-06-11','ExperiencedDevs','How do you guys balance productivity and knowing your codebase?','https://www.reddit.com/r/ExperiencedDevs/comments/1l8yuu8','Working Python developer with professional experience','Original post; practitioner'),
'productivity': ('2026-03-07','ExperiencedDevs','The AI coding productivity data is in and it’s not what anyone expected','https://www.reddit.com/r/ExperiencedDevs/comments/1rnkv2t/the_ai_coding_productivity_data_is_in_and_its_not/','Experienced developer discussing team and personal workflow','Original post and indexed comments; practitioner'),
'run_code': ('2025-11-06','ChatGPTCoding','Coding with AI feels fast until you actually run the damn code','https://www.reddit.com/r/ChatGPTCoding/comments/1opz2n8/coding_with_ai_feels_fast_until_you_actually_run/','Developer describing hands-on coding experience','Original post and indexed comments; practitioner'),
'cursor_end': ('2026-01-11','cursor','Cursor AI keeps breaking projects right when you’re almost done','https://www.reddit.com/r/cursor/comments/1q9r8qr/cursor_ai_keeps_breaking_projects_right_when/','Developer describing repeated Cursor project failures','Original post and indexed comments; practitioner'),
'cursor_frustrated': ('2025-03-30','cursor','Frustrating Experience with Cursor – I don’t want to use it again anymore!','https://www.reddit.com/r/cursor/comments/1jn9hkv/frustrating_experience_with_cursor_i_dont_want_to/','Poster reports personal Cursor use; new account noted in indexed discussion','Original post; unverified self-report'),
'cursor_skills': ('2025-10-20','cursor','My software engineering skills are degrading because of AI','https://www.reddit.com/r/cursor/comments/1obhyhe/my_software_engineering_skills_are_degrading/','Developer concerned about skill and codebase understanding','Original post; practitioner'),
'cursor_maintain': ('2026-06-27','cursor','Anyone else Finding It Challenging to Maintain Software Created With Coding Agents?','https://www.reddit.com/r/cursor/comments/1ugyuzg/anyone_else_finding_it_challenging_to_maintain/','Poster identifies as MLE and SWE','Original post; practitioner'),
'chatgpt_really': ('2025-05-08','ChatGPTCoding','ChatGPT REALLY sucks for coding','https://www.reddit.com/r/ChatGPTCoding/comments/1khkkp5/chatgpt_really_sucks_for_coding/','Developer describing a 12-hour coding session','Original post; practitioner'),
'frustrated_chatgpt': ('2023-12-16','ChatGPTCoding','Frustrated with ChatGPT for coding','https://www.reddit.com/r/ChatGPTCoding/comments/18k298w/frustrated_with_chatgpt_for_coding/','Developer describing coding assistant experience','Original post; practitioner'),
'agent_eval': ('2026-03-17','LLMDevs','What broke when I evaluated an AI agent in production','https://www.reddit.com/r/LLMDevs/comments/1rweggk/what_broke_when_i_evaluated_an_ai_agent_in/','Builder evaluating an AI agent with a small test suite','Original post; first-person technical report'),
'tool_use': ('2026-06-23','LLMDevs','An agent that falls back to hallucination instead of calling your knowledge base','https://www.reddit.com/r/LLMDevs/comments/1udnu6y/an_agent_that_falls_back_to_hallucination_instead/','Agent builder describing tool-use validation','Original post; technical report'),
'prod_tax': ('2026-03-02','AI_Agents','The production agent tax: context drift ≠ hallucination','https://www.reddit.com/r/AI_Agents/comments/1riibyj/the_production_agent_tax_context_drift/','Builder reports four months of production agent experience','Original post; first-person operational report'),
'prod_failures': ('2026-03-19','LangChain','After 6 months of agent failures in production, I stopped blaming the model','https://www.reddit.com/r/LangChain/comments/1rxt7c2/after_6_months_of_agent_failures_in_production_i/','Builder describing repeated production incidents','Original post; first-person operational report'),
'prod_nightmare': ('2025-11-25','AgentsOfAI','Why Most LLM Agents Fail in Production - It’s Not What You Think','https://www.reddit.com/r/AgentsOfAI/comments/1p6m36m/why_most_llm_agents_fail_in_production_its_not/','Agent builder says they have deployed agents for about two years','Original post; practitioner report'),
'function_calls': ('2025-08-24','LLMDevs','How are companies reducing LLM hallucination + mistimed function calls in AI agents?','https://www.reddit.com/r/LLMDevs/comments/1mz960w/how_are_companies_reducing_llm_hallucination/','Builder of an AI interviewer bot; post asks about production reliability','Original post and indexed comments; practitioner'),
'memory': ('2026-02-15','LocalLLaMA','How are you handling persistent memory for AI coding agents?','https://www.reddit.com/r/LocalLLaMA/comments/1r5q7xd/how_are_you_handling_persistent_memory_for_ai/','Claude Code user describing daily workflow','Original post; first-person report'),
'memory_systems': ('2026-02-11','LocalLLaMA','We’ve built memory into 4 different agent systems. Here’s what works','https://www.reddit.com/r/LocalLLaMA/comments/1r21ojm/weve_built_memory_into_4_different_agent_systems/','Builder describing memory implementations across agent systems','Original post; practitioner report'),
'small_support': ('2025-07-21','smallbusiness','Do you guys know any good AI to replace customer support?','https://www.reddit.com/r/smallbusiness/comments/1m5i5hu/do_you_guys_know_any_good_ai_to_replace_customer/','Local business owner handling support across multiple channels','Original post and indexed comments; self-described owner'),
'support_automation': ('2025-12-05','smallbusiness','How do you automate customer service?','https://www.reddit.com/r/smallbusiness/comments/1pf9acl/how_do_you_automate_customer_service/','Small team reports trying AI on support tickets','Original post; first-person business report'),
'support_trust': ('2026-02-09','smallbusiness','AI in customer service is costing businesses trust - and revenue. Are we over-automating?','https://www.reddit.com/r/smallbusiness/comments/1r0172h/ai_in_customer_service_is_costing_businesses/','Business account discusses customer-service automation and reported survey results','Original post and indexed comments; reported observation'),
'support_personal': ('2025-10-17','smallbusiness','Automation is ruining customer service in small businesses','https://www.reddit.com/r/smallbusiness/comments/1o8rdno/automation_is_ruining_customer_service_in_small/','Small-business owner describing customer interactions','Original post; first-person report'),
}
issues = {
'coding_beyond':[
('Unfamiliar generated implementation','Code comprehension','Generated code uses unfamiliar libraries or patterns, so the developer must study it before making even basic changes.','unfamiliar libraries'),
('Monolithic generated files','Code organization','The assistant puts a task into one long file that is difficult to understand and debug.','one long file'),
('Developer dependence during debugging','Debugging','Because the author does not understand generated code, failures leave them dependent on the assistant to diagnose it.','dependent on AI'),
('Failed iterative repair','Debugging workflow','When the assistant cannot fix a bug, reverting and reprompting is cumbersome and undo history may not restore a clean state.','go back to a revision'),
('Context limit reached in growing files','Context management','Large generated files consume context and prevent the assistant from working with the full task.','context window'),
('Slow edits as files grow','Generation latency','As a file grows, generation slows and the assistant may regenerate large sections for a small change.','generations get very slow'),
('Unsafe refactoring across files','Refactoring','Asking the assistant to split a large file can introduce errors or remove existing functionality.','loss in functionality'),
('Cross-file context fragmentation','Codebase context','After code is split into files, supplying the relationships and context across files becomes difficult.','pass context from different files'),
],
'coding_work':[
('Missing repository and documentation context','Codebase context','The assistant misses relevant code or documentation unless the developer manually gathers and supplies it.','find all the important context'),
('Generated code does not work on real tasks','Task reliability','On substantial programming tasks, the returned code often fails because important project details were omitted.','code that never works'),
('Prompt setup costs erase time savings','Developer productivity','Preparing context and prompts can take longer than doing the work without an assistant.','more time setting things up'),
],
'debug_decay':[
('Debugging quality declines after repeated attempts','Iterative debugging','The author reports that continued attempts to fix a bug lead to increasingly erratic outputs.','longer I go, the dumber'),
('Fix attempts increase error rate','Iterative debugging','Repeated repair prompts make the original coding problem harder instead of converging on a correct result.','more erratic results'),
('Assistant repeats a claimed fix without resolving it','Instruction following','The author describes the assistant insisting a fix is complete while the visible issue remains.','already fixed it'),
('Context drift during a long debugging exchange','Context management','As a debugging conversation grows, earlier task details stop guiding later responses.','number of attempts'),
],
'comprehension':[
('Generated coding style clashes with project conventions','Code consistency','Generated code uses different function structure, typing, naming, or documentation conventions from the existing codebase.','completely different'),
('Missing error and edge-case handling','Robustness','Generated pipeline logic omits error handling and edge cases, forcing substantial manual rewrites.','no error handling'),
('Unmaintained dependency selection','Dependency quality','The assistant selects obscure or unmaintained libraries for project tasks.','obscure non maintained libraries'),
('Rigid multi-step pipeline implementation','Pipeline correctness','For sequential transformations, the generated implementation does not preserve configurable inputs such as DPI, file paths, or image format.','does it wrong'),
('Generated code requires extensive review','Review workload','Even working output takes significant review time because the developer must understand its unfamiliar structure.','significant time reviewing'),
('Developer cannot confidently own submitted code','Code ownership','The person responsible for deployment feels they do not understand or own the assistant-generated solution.','code you feel you don’t own'),
('Large tasks reverse productivity gains','Productivity','For larger pipeline or feature tasks, review, correction, and reprompting outweigh the initial generation speed.','productivity gains start to reverse'),
('Unfamiliar libraries increase maintenance burden','Maintainability','The assistant introduces tools or patterns that are not aligned with the developer’s existing skills and stack.','weird obscure libraries'),
],
'productivity':[
('Measured completion slower than developer expectation','Productivity measurement','In the cited experienced-developer study discussion, participants expected speed gains while measured completion time increased.','actually ~20% slower'),
('Code comprehension drops after generated implementation','Learning and comprehension','The thread discusses lower follow-up understanding when developers use AI to generate code rather than reason through concepts.','lower comprehension'),
('Unnecessary abstraction and overengineering','Code complexity','Generated solutions add one-use methods, interfaces, and records for a task that could be implemented more simply.','needlessly overengineer'),
('Inconsistent naming and structure','Code consistency','Without a close reference implementation, generated code has inconsistent naming and weak architecture.','inconsistent naming'),
('Self-debugging opens more complexity','Debugging','When generated code fails, asking the same assistant to debug it can add layers that obscure the original defect.','adding layers of complexity'),
('Generated feature takes longer than manual implementation','Delivery time','A developer reports spending more time untangling generated code than writing a comparable feature manually.','wasted twice the time'),
('Novel work becomes a time sink','Task suitability','For novel tasks without a familiar reference, iterative correction makes AI assistance slower than manual work.','biggest time sink'),
('Subtle intent mismatch is hard to review','Reviewability','Reviewers can stare at plausible generated code and still miss a subtle mismatch with the original intent.','subtle way it misinterpreted'),
],
'run_code':[
('Generated code fails at runtime','Runtime correctness','A quick-looking implementation produces errors when executed, requiring extended debugging.','until you hit run'),
('Hallucinated logic in generated code','Code correctness','The author reports discovering invented or incorrect logic only after running the generated code.','hallucinated half the logic'),
('Debugging consumes hours','Time cost','The promised short task expands into hours of debugging and refactoring after execution fails.','next 3 hours debugging'),
('Developer lacks understanding of failed code','Code comprehension','The developer must debug code they did not fully understand when it was generated.','code you didn’t fully understand'),
('AI changes can damage local environment','Environment safety','The post describes generated changes breaking the developer’s environment during implementation.','broke my entire environment'),
('Tooling knowledge becomes prerequisite','Workflow overhead','Getting useful coding assistance requires learning version control, file structure, refactoring, and context management.','learn github and versioning'),
],
'cursor_end':[
('Instruction adherence degrades near completion','Instruction following','The coding assistant stops following established instructions as the project nears completion.','stops following instructions'),
('Unnecessary rewrites of working code','Change scope','The assistant rewrites functioning code without a task need, introducing avoidable risk.','rewrites working code'),
('Fix attempts introduce new bugs','Regression risk','The assistant creates new defects while claiming to repair existing ones.','bugs while claiming'),
('Correction prompts move farther from target','Iterative repair','Each correction attempt can make the result less accurate instead of converging.','goes further away'),
('Saved time is lost to repair','Net productivity','The developer spends saved time and paid usage undoing changes that were not required.','time you saved is gone'),
('Previously supplied project context disappears','Context persistence','Documentation and project constraints stop being respected or are removed across prompts.','context stops being respected'),
('Same workflow yields inconsistent results','Output consistency','Identical or similar workflows sometimes succeed and sometimes fail, making outcomes hard to rely on.','sometimes works perfectly'),
('Testing becomes regression chasing','Testing workload','With an unstable foundation, repeated test-fix cycles chase regressions without clear progress.','chasing regressions'),
('Project structure never stabilizes','Architecture','Repeated patches leave the project without a coherent overall structure.','never really solidifies'),
],
'cursor_frustrated':[
('Changes spill into unrelated projects','Change isolation','The poster says incorrect edits affected other projects beyond the one they were trying to repair.','affected my other projects'),
('Assistant invents nonexistent variables','Codebase grounding','The assistant introduces variables that are not defined in the project.','variables that don’t exist'),
('Essential dependencies are removed','Dependency safety','The assistant removes dependencies needed by existing project functionality.','removes essential dependencies'),
('Existing behavior breaks during unrelated edits','Regression risk','Unrequested changes to existing code break functionality that previously worked.','breaking functionality'),
('Rollback is hard when the assistant keeps editing','Recovery','Attempts to revert are undermined when subsequent assistant edits overwrite corrections.','overriding corrections'),
('More prompting compounds project damage','Repair loop','Repeated attempts to fix the initial mistake create additional problems.','more issues'),
('Paid tool creates a correction burden','Cost and trust','The user reports paying for a tool and then spending hours correcting damage it introduced.','waste hours undoing'),
],
'cursor_skills':[
('Reduced ability to write code independently','Skill retention','The developer worries that frequent AI reliance is weakening their ability to write code unaided.','losing my skills'),
('Codebase understanding decays over time','Code comprehension','The developer reaches a point where they no longer understand the codebase they are working in.','no longer understand the code base'),
('Ownership feels risky without understanding','Accountability','The developer finds responsibility for code frightening when they cannot explain its behavior.','taking responsibility is scary'),
('AI policy conflicts with developer preference','Workplace pressure','Management expects heavy AI use even when the developer would prefer to stop using it.','manager demands'),
('Review workload replaces coding satisfaction','Job satisfaction','The developer dislikes reviewing large volumes of generated code and misses hands-on coding.','hate reviewing code'),
('Stopping AI feels like a productivity penalty','Adoption pressure','The developer feels unable to stop using AI because doing so would reduce perceived output.','massive drop in productivity'),
],
'cursor_maintain':[
('Root-cause intuition weakens with less code exposure','Debugging and maintenance','Developers report less day-to-day contact with the code, making root causes harder to locate when defects occur.','narrow down root cause'),
('System scope grows faster than team capacity','System maintenance','AI-assisted output expands codebase size and sophistication relative to the number of developers maintaining it.','size of the code base'),
('More services increase context burden','Service ownership','Each engineer must understand a wider surface area of microservices.','greater surface area'),
('Reviewing extensions becomes cognitively harder','Code review','A growing and less familiar system makes evaluating proposed extensions more difficult.','more difficult cognitively'),
],
'chatgpt_really':[
('Syntax errors prevent generated code from compiling','Compilation','The paid coding model returns malformed syntax and indentation that prevents compilation.','syntax errors'),
('Documentation does not ensure correctness','Grounding','Even after supplying extensive documentation, the user reports continued poor code output.','pump it full of documentation'),
('Implementation is incomplete','Completeness','The assistant returns only a fraction of the requested implementation.','only 1/4'),
('TODO placeholders leave core work unfinished','Completeness','Generated code leaves placeholder comments instead of implementing required behavior.','TODOs'),
('Output limits disrupt full-file delivery','Output limits','The assistant does not reliably produce a complete implementation in one response.','limits'),
],
'frustrated_chatgpt':[
('Assistant repeats checks already answered by supplied code','Context use','After receiving relevant classes and a detailed bug report, the assistant suggests checking code that was already provided.','already in the code'),
('Explicit instructions fail to prevent repeated advice','Instruction following','The assistant repeats its unhelpful checks despite custom instructions telling it to ask for missing code instead.','still does it'),
('Code generation becomes noticeably lazy','Output completeness','The poster describes a decline in the assistant’s willingness or ability to generate requested code.','lazy about generating code'),
],
'agent_eval':[
('Tool-generated URLs are malformed','Tool integration','Broken URLs in agent tool calls reduce benchmark performance.','Broken URLs'),
('Agent targets localhost in cloud deployment','Environment configuration','The agent calls localhost from a cloud environment where the required service is unavailable.','calling localhost'),
('Valid vulnerabilities are mislabeled as hallucinations','Evaluation validity','The evaluation setup incorrectly marks real CVEs as hallucinated output.','Real CVEs flagged'),
('External platform blocks agent requests','External dependency','Reddit blocks requests made by the agent, causing a failure unrelated to model reasoning.','blocking requests'),
('Missing production credentials fail silently','Configuration visibility','A missing API key in production causes a silent failure rather than a clear error.','Missing API key'),
('Benchmark score conflates model and system defects','Evaluation attribution','The evaluation result reflects tool, environment, and data-access problems rather than model quality alone.','misattribute failures'),
],
'tool_use':[
('Agent answers without calling required knowledge tool','Tool invocation','The agent skips the knowledge-base call and invents a plausible answer instead.','didn’t call your tool'),
('Tool omission is invisible to tracing','Observability','When no API call occurs, normal tool traces do not reveal that the agent skipped retrieval.','No span shows up'),
('Latency dashboards reward the wrong behavior','Monitoring','A fabricated answer can return faster than a real lookup and appear healthy on latency dashboards.','APM marks it green'),
('Correct tool called with wrong parameters','Tool arguments','Tool use needs validation that the correct tool received the correct parameters.','right params'),
('Response fails to reflect tool result','Grounded response','A tool call can occur while the final answer still fails to use the returned information.','reflect what the tool returned'),
],
'prod_tax':[
('Agent forgets prior processing between episodes','State continuity','Across separate execution episodes, the agent forgets that it already processed an item.','forgets it already processed'),
('Repeated file reads produce conflicting decisions','Decision consistency','The same file read in different contexts leads to different decisions.','different context window'),
('Context drift is mistaken for hallucination','Failure diagnosis','Operators may classify state or context loss as model fabrication, obscuring the underlying failure.','assume it’s hallucinating'),
('Asynchronous tool completion is not awaited','Async execution','The agent proceeds as if a tool succeeded before the asynchronous call has completed.','doesn’t wait for API'),
('Async tool failures remain silent','Failure visibility','Asynchronous call failures may not surface clearly to the agent or operator.','silent failures'),
('State transitions are not validated','Workflow control','The agent can continue with invalid state because execution transitions have no hard validation.','validate state transitions'),
('Repeated actions are not detected','Idempotency','The workflow can perform work again because it lacks a reliable check for already-completed actions.','idempotency checks'),
],
'prod_failures':[
('Same production input yields different output','Output stability','The same request produces different responses after deployment without an obvious error.','same input, different output'),
('Wrong answers are delivered confidently','Answer reliability','The agent delivers an incorrect answer with confidence rather than surfacing uncertainty.','wrong answer delivered confidently'),
('Production traces do not explain failure','Observability','Available logs fail to help operators diagnose why a production answer went wrong.','No log that helps'),
('Prompt patches fix one case then regress','Prompt maintenance','Adding prompt instructions sometimes helps briefly but a different failure appears later.','broke differently'),
('LLM controls tool routing and order','Execution control','The production design leaves the model to decide which tools run and in what sequence.','which tool to call'),
('Tool arguments lack a contract','Input validation','The workflow lacks validation for parameters passed from the model to tools.','with what parameters'),
('Agent lacks a recovery path','Fault recovery','The agent has no defined way to recover when an execution step fails.','no recovery path'),
],
'prod_nightmare':[
('Tool timeouts cascade into later failures','Tool reliability','A tool timeout can confuse the agent and trigger a chain of worse decisions.','timeouts'),
('Unexpected tool output derails execution','Tool output validation','Unexpected data returned from a tool causes the agent workflow to spiral.','unexpected data'),
('Agent cannot degrade gracefully','Fault tolerance','On tool failure, the agent does not switch to a safe limited response.','doesn’t degrade gracefully'),
('Conversation and tool history fills context','Context management','Accumulated history and tool results consume the context window during agent work.','accumulate conversation history'),
('Token limits distort later decisions','Long-run reliability','After several iterations, reaching token limits is associated with nonsensical agent decisions.','hitting token limits'),
],
'function_calls':[
('Function call fires at the wrong stage','Workflow timing','The interviewer bot sometimes calls a function before or after the intended milestone.','not always make calls at the right time'),
('Agent invents unauthorized calls','Tool authorization','The model sometimes produces function calls that were never supposed to happen.','hallucinates calls'),
('Required function call is skipped','Workflow completion','The model omits a required function call and leaves the interview flow incomplete.','skips a call'),
('Reliability methods add latency','Production performance','The poster raises latency as a cost of reducing tool-call and hallucination errors.','latency expense'),
('Validation still feels short of production-ready','Production readiness','The builder reports that evaluation and retry approaches still do not provide confidence for production.','wouldn’t consider production ready'),
],
'memory':[
('Compaction removes important decisions','Agent memory','After context compaction, architectural decisions such as a database choice disappear from the agent’s working memory.','decision ... gone'),
('Previously solved fixes are forgotten','Agent memory','A long-running coding agent forgets fixes that took hours to discover.','fix for that auth bug'),
('Developer must repeatedly re-explain known context','Workflow overhead','The user has to explain information the agent knew only minutes earlier.','re-explaining things'),
('Static project notes miss session history','Memory coverage','Static instruction files do not preserve decisions, fixes, and discoveries made during an active session.','doesn’t capture what happens'),
('Manual note-taking happens too late','Memory capture','The developer cannot reliably document session decisions before compaction removes them.','by the time I think to write it down'),
('Persistent memory can retain hostile instructions','Memory security','Automatically extracted memory can preserve malicious instructions from untrusted web content.','dodgy web page'),
],
'memory_systems':[
('Semantic retrieval returns similar but wrong item','Memory retrieval','Embedding search can return semantically similar memory instead of the exact fact needed.','semantically similar'),
('Unfiltered conversation logs bury useful memory','Memory quality','Full conversation histories mix useful decisions with low-value chatter, making retrieval noisy.','noise with a few signal fragments'),
('Memory retrieval wastes tokens on irrelevant content','Inference cost','Retrieving irrelevant logged content increases token use without supplying useful context.','burning tokens'),
('Single retrieval method misses exact or relational matches','Retrieval coverage','Using only semantic or only keyword retrieval misses classes of relevant memories.','missing exact matches'),
],
'small_support':[
('Customer requests are fragmented across channels','Support operations','A small-business owner is tied to messages arriving through Instagram, WhatsApp, email, and website forms.','four channels'),
('Support notifications keep owner on phone','Operator workload','Handling inquiries across channels leaves the owner constantly checking a phone.','glued to my phone'),
('No budget for dedicated support staff','Staffing constraint','The owner says support workload is growing but a full-time support hire is not affordable.','not ready to hire'),
('Default chatbot tone sounds robotic','Customer communication','Off-the-shelf support responses do not sound like the business or its owner.','sounding like a robot'),
('Generic examples fail to capture business voice','Knowledge preparation','The business needs its own real reply examples, but preparing them is an additional setup burden.','write out 10-15 responses'),
('No clear channel consolidation','Support tooling','Advice in the discussion identifies four separate inboxes as the operational pain beneath the automation request.','4 inboxes'),
],
'support_automation':[
('Support automation has a steep learning curve','Adoption and setup','A small team says even a limited AI support-ticket trial involved a difficult learning curve.','learning curve is real'),
('AI makes mistakes on support tickets','Customer support accuracy','The team reports frustrating mistakes when AI handled customer support tickets.','mistakes were funny and frustrating'),
('Unclear process ownership undermines automation','Workflow ownership','A commenter describes poor ownership and unclear boundaries as reasons automation creates more work.','lack of clear ownership'),
('Staff cannot see why automation intervened','Decision transparency','Support staff lose confidence when they cannot understand why or when the AI took over.','without agents understanding why'),
('Messy internal documentation degrades answers','Knowledge quality','Customer-support automation struggles when business instructions and documentation are unclear.','messy internal docs'),
('Automation lacks action capability','Task completion','A support bot that only replies cannot perform the actual account or order action needed to resolve the request.','only talks'),
],
'support_trust':[
('Customers prefer human contact for service','Customer trust','The thread reports that many customers prefer a real person when contacting a business.','rather speak to a real person'),
('Callers hang up after detecting AI','Lead conversion','The post reports callers disconnecting when they realize the receptionist is automated.','hang up immediately'),
('AI-first support reduces business trust','Customer trust','The post reports customers trusting a business less when it relies heavily on AI service.','trust a business less'),
('AI blocks customers from reaching a person','Escalation','Commenters describe support automation designed to keep customers away from human help.','keep you away from a person'),
('Customers repeat their case after handoff','Escalation continuity','A handoff without prior conversation context forces customers to start the explanation again.','start from the beginning'),
('Resolution metrics miss relationship damage','Business outcomes','A commenter notes that an issue can be marked resolved without improving customer loyalty.','resolved ... more loyal'),
],
'support_personal':[
('Automation increases software overhead','Operating cost','A small-business owner says expensive automation platforms add to the cost of running the business.','expensive platforms'),
('Automation pressure conflicts with customer preference','Customer experience','The owner feels pressure to automate despite feedback that customers appreciate human contact.','pressure to automate'),
('Prospective customers value live phone answers','Lead experience','The owner hears potential customers praise the business for answering calls with a person.','first place to answer the phone'),
('Automation erodes a personal service model','Brand experience','The owner worries that replacing people with automation will undermine the small, personal business experience.','keep my business small and personal'),
],
}

# Existing X schema plus Reddit-specific traceability fields; no solution column.
headers = ['record_id','platform','post_date','author_name','author_handle','person_profile_as_stated','prominence_basis','problem_category','affected_area','problem_statement','evidence_excerpt','post_url','post_type','language','reply_count_visible','reply_review_notes','evidence_type','confidence','subreddit','source_item_type','source_item_permalink','source_score']
out=Path('data/reddit/problems.csv')
rows=[]
for source_key, entries in issues.items():
 date,sub,title,url,profile,basis=sources[source_key]
 for category,area,statement,evidence in entries:
  idx=len(rows)+1
  rows.append({
   'record_id':f'R-{idx:04d}','platform':'Reddit','post_date':date,'author_name':'Reddit poster (name not exposed in indexed result)','author_handle':'','person_profile_as_stated':profile,'prominence_basis':basis,
   'problem_category':category,'affected_area':area,'problem_statement':statement,'evidence_excerpt':evidence,'post_url':url,'post_type':title,'language':'en','reply_count_visible':'Not consistently exposed',
   'reply_review_notes':'Indexed post/comment text reviewed where returned; not a complete thread scrape. This issue is attributed only to the linked source discussion; usernames and comment permalinks were not exposed in the indexed result.' if 'comments' in basis else 'Indexed source text reviewed; Reddit JSON/API access was blocked in this environment. No claim of complete thread coverage.',
   'evidence_type':basis,'confidence':'Medium' if ('unverified' in basis or 'reported observation' in basis) else 'High','subreddit':'r/'+sub,'source_item_type':'Post-level issue extracted from thread' if 'comment' not in basis else 'Post or indexed comment; item-level attribution unavailable','source_item_permalink':url,'source_score':'Not recorded'})
with out.open('w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=headers);w.writeheader();w.writerows(rows)
print('rows',len(rows),'sources',len(set(r['post_url'] for r in rows)))
