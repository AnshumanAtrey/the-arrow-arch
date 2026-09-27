#!/usr/bin/env python3
"""Build a source-linked, semantically deduplicated keyword index from platform CSVs."""
import csv
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
INPUTS = [ROOT/'data/x/problems.csv', ROOT/'data/reddit/problems.csv', ROOT/'data/stackoverflow/problems.csv']

# Merge only clear same-meaning reports; source_map.csv preserves every input record.
DUPLICATE_GROUPS = {
    'KW-REVIEW-BOTTLENECK': ['X-0003', 'R-0020', 'R-0058'],
    'KW-COMPACTION-MEMORY-LOSS': ['X-0009', 'R-0107'],
    'KW-CODE-HALLUCINATION': ['X-0011', 'R-0033'],
    'KW-CONTEXT-WINDOW-LIMIT': ['R-0005', 'SO-75396481'],
    'KW-CONTEXT-NOT-RETAINED': ['R-0015', 'R-0043', 'R-0109'],
    'KW-REPAIR-LOOP-REGRESSION': ['R-0012', 'R-0013', 'R-0041', 'R-0052', 'R-0093'],
    'KW-REPEATED-DEBUGGING-ADVICE': ['R-0069', 'R-0070'],
}

CUSTOM_THEMES = {
    'KW-REVIEW-BOTTLENECK': ('AI-generated code review burden', ['AI code review','PR review backlog','review workload','generated code']),
    'KW-COMPACTION-MEMORY-LOSS': ('Agent loses decisions after context compaction', ['context compaction','lost project decisions','agent memory loss','long-running coding tasks']),
    'KW-CODE-HALLUCINATION': ('AI coding assistant invents or hallucinates code logic', ['AI code hallucination','invented logic','incorrect generated code','codebase context']),
    'KW-CONTEXT-WINDOW-LIMIT': ('Large prompts or files exceed the model context window', ['context window limit','large code files','prompt length','token limit']),
    'KW-CONTEXT-NOT-RETAINED': ('Agent fails to retain earlier instructions and project context', ['context retention','lost instructions','conversation drift','repeated explanations']),
    'KW-REPAIR-LOOP-REGRESSION': ('Repeated AI repair attempts fail to converge or introduce regressions', ['debugging loop','failed code repair','regression','correction prompts']),
    'KW-REPEATED-DEBUGGING-ADVICE': ('Assistant repeats checks or advice already supplied by the developer', ['repeated advice','ignored instructions','debugging context','duplicate checks']),
}

# X-source records with no SO tags: supply focused search keywords grounded in their evidence.
# Keys are source_record_ids; values are lists of keyword phrases.
X_CUSTOM_KEYWORDS = {
    'X-0001': ['AI billing logic error','billing charge mismatch','SaaS subscription overcharge','design doc ignored'],
    'X-0004': ['plausible wrong fix','silent incorrect agent output','agent change looks correct until reviewed'],
    'X-0005': ['tests pass but test nothing','meaningless generated tests','false test coverage'],
    'X-0006': ['prototype ready before stakeholder buy-in','stakeholder approval bottleneck','delivery coordination gap'],
    'X-0007': ['context switching across repositories','multi-project depth loss','breadth vs depth tradeoff'],
    'X-0008': ['agent invented fake businesses','fabricated email addresses','bounced outreach leads'],
    'X-0010': ['agent ignores style corrections','repeated style instruction failure','voice correction not retained'],
    'X-0012': ['single-threaded AI IDE','no built-in task coordination','manual context switching between tasks'],
    'X-0013': ['high token cost parallel agents','token burn from parallel use','parallel agent overhead'],
    'X-0014': ['Claude ignores repo structure instructions','repeated instruction loop','local repository structure not followed'],
    'X-0015': ['coding tool does not sync across devices','split research threads','device-dependent conversation state'],
    'X-0018': ['agent access to private keys','agent codebase trust','supply chain risk in agent dependencies'],
    'X-0019': ['agents faster than surrounding infrastructure','index and sandbox latency','tool throughput bottleneck'],
    'X-0020': ['AI misses high-severity security vulnerabilities','smart contract audit gap','automated audit coverage'],
    'X-0021': ['AI audit false positive rate','security report noise','false positive vulnerability findings'],
    'X-0023': ['AI inflates vulnerability severity','incorrect severity label','critical label on low-severity finding'],
    'X-0024': ['runnable proof-of-concept for invalid bug','AI-generated PoC does not validate finding'],
    'X-0025': ['agent setup and debugging cost','API token burn during setup','MLX server debugging time'],
    'X-0026': ['agent activity without business results','automation produces no sales','zero actual outcomes'],
    'X-0027': ['automated posting rate limit','account banned for rapid posting','publish rate exceeded'],
    'X-0028': ['agent repeats same content','duplicate post loop','no topic rotation in agent'],
    'X-0029': ['find-and-replace corrupts documentation','bulk doc corruption in PR','documentation PR damage'],
    'X-0030': ['Codex incorrect image token injection','multimodal implementation error','wrong model implementation'],
    'X-0031': ['Claude chose wrong model generation','wrong image encoder selected','Gemma 3 vs Gemma 4 mistake'],
    'X-0032': ['agent deleted database during freeze','destructive action despite freeze instruction','data loss from agent'],
    'X-0033': ['agent falsely reports tests passed','unit test result lie','agent claims success when tests fail'],
    'X-0034': ['agent reports success with zero output','HTTP 429 reported as success','silent API quota failure'],
    'X-0035': ['full context payload on every message','32 million tokens in 48 hours','missing memory index causes token burn'],
    'X-0036': ['more time debugging prompts than doing work','prompt and context overhead','productivity assistant setup tax'],
    'X-0037': ['shared AI skill quality unknown','AI-generated skill reliability','skill author expertise unverifiable'],
    'X-0038': ['untrusted skill instructions in project','malicious prompt injection via skill','skill supply chain risk'],
    'X-0039': ['shared skill becomes obsolete','stale AI skill','skill not updated as models evolve'],
}

STOP = set('''a an and are as at be been being by can could did do does doing done for from had has have he her here hers him his how i if in into is it its may me might more most my of on or our ours she should so than that the their theirs them then there these they this those to too under up us was we were what when where which who why will with would you your yours already instead every'''.split())
GENERIC = set('''ai llm model assistant agent tool code coding developer problem issue error errors question questions system app application software using use used make made get getting work works working fix fixing solve solution help want need try tried data platform'''.split())

# Multi-word problem_category values that contain commas and must not be split.
# Mapped to clean keyword phrases for use in the index.
CATEGORY_PHRASE_MAP = {
    'build, runtime, and environment failures': 'build runtime environment failure',
    'build runtime and environment failures': 'build runtime environment failure',
}


def read_sources():
    records=[]
    for path in INPUTS:
        with path.open(newline='',encoding='utf-8') as f:
            for row in csv.DictReader(f):
                platform=(row.get('platform') or path.parent.name).strip()
                rid=(row.get('record_id') or '').strip()
                if platform.lower()=='stackoverflow' and not rid:
                    rid='SO-'+(row.get('question_id') or '')
                if not rid:
                    continue
                source_url=(row.get('post_url') or '').strip()
                if platform.lower()=='reddit' and row.get('source_item_permalink'):
                    source_item_url=row['source_item_permalink'].strip()
                else:
                    source_item_url=source_url
                record={
                    'source_record_id':rid,
                    'platform':platform,
                    'source_date':(row.get('post_date') or '').strip(),
                    'author_name':(row.get('author_name') or 'not exposed').strip(),
                    'author_handle':(row.get('author_handle') or '').strip(),
                    'problem_category':(row.get('problem_category') or '').strip(),
                    'affected_area':(row.get('affected_area') or '').strip(),
                    'problem_statement':(row.get('problem_statement') or '').strip(),
                    'evidence_excerpt':(row.get('evidence_excerpt') or '').strip(),
                    'source_url':source_url,
                    'source_item_url':source_item_url,
                    'tags':(row.get('tags') or '').strip(),
                    'evidence_type':(row.get('evidence_type') or '').strip(),
                    'confidence':(row.get('confidence') or '').strip(),
                    'content_license':(row.get('content_license') or '').strip(),
                }
                records.append(record)
    return records


def dedupe(records):
    by_id={r['source_record_id']:r for r in records}
    assigned={}
    reason={}
    for canonical, ids in DUPLICATE_GROUPS.items():
        present=[i for i in ids if i in by_id]
        if len(present)<2:
            continue
        # Lists preserve the chosen representative deterministically across rebuilds.
        rep=next((i for i in ids if i in present),present[0])
        for sid in present:
            assigned[sid]=canonical
            if sid!=rep:
                reason[sid]='Merged with the same underlying complaint; original source retained in source_map.csv.'
        reason[rep]='Canonical record for a meaning-based duplicate group; all matching sources are retained.'
    groups=defaultdict(list)
    for r in records:
        groups[assigned.get(r['source_record_id'],r['source_record_id'])].append(r)
    return groups,reason


def _clean_phrase(phrase):
    """Normalize whitespace and lowercase a phrase."""
    return re.sub(r'\s+',' ',phrase.strip().lower())


def _split_category_field(raw):
    """Split a problem_category or affected_area field into usable phrases.

    Handles:
    - Known multi-word categories with internal commas (mapped to clean equivalents).
    - Slash-separated alternatives (e.g. 'SaaS billing / subscriptions').
    - Normal semicolon/comma/pipe delimiters.
    """
    normalized=raw.lower().strip()
    # Replace known comma-containing phrases before splitting on commas
    for cat_phrase, replacement in CATEGORY_PHRASE_MAP.items():
        if cat_phrase in normalized:
            normalized=normalized.replace(cat_phrase,replacement)
    phrases=[]
    for part in re.split(r'[;,|]', normalized):
        # Further split on slash separators within a field
        for subpart in re.split(r'\s*/\s*', part):
            # Normalize hyphens to spaces so 'openai-api' and tag 'openai api' do not both appear
            p=_clean_phrase(subpart.replace('-', ' '))
            if p:
                phrases.append(p)
    return phrases


def keyword_list(recs, canonical):
    """Produce compact, source-grounded search terms without noisy token frequency."""
    words=[]
    if canonical in CUSTOM_THEMES:
        words.extend(CUSTOM_THEMES[canonical][1])

    # Apply X-specific custom keywords for single-source X records
    for r in recs:
        sid=r['source_record_id']
        if sid in X_CUSTOM_KEYWORDS:
            words.extend(X_CUSTOM_KEYWORDS[sid])

    content_text=' '.join(' '.join([r['problem_statement'],r['evidence_excerpt']]) for r in recs).lower()

    # Add symptom phrases grounded in the report itself.
    # The hallucination pattern requires the fabrication/hallucination to be the core complaint,
    # not merely mentioned as context (e.g. "cost of reducing hallucination errors").
    patterns=[
        # Hallucination: match when the report describes a fabrication/hallucination failure.
        # Exclude 'hallucination errors' (where it names what a mitigation tries to prevent)
        # by using a negative lookahead on 'errors'.
        (r'\bhallucinated\b|\bhallucinat(?:es|ing)\b|\bhallucinat(?:ion)s?\b(?!\s+errors\b)|\bfabricat(?:ed|es|ing)\b|\binvented\b|\bmade[- ]up\b', 'AI hallucination'),
        (r'context window|context limit|token limit|maximum context|context length', 'context window limit'),
        (r'compaction|checkpoint.*stale|session.*forget', 'context compaction'),
        (r'forget|lost instructions|re[- ]explain|conversation drift', 'context retention failure'),
        (r'pull request|\bpr review\b|review backlog', 'code review workload'),
        (r'false positive|invalid finding', 'false positive findings'),
        (r'repeated.*(attempt|repair|fix)|repair.*loop|regression', 'iterative repair failure'),
        (r'repeat.*advice|already provided|ignored instructions', 'repeated debugging advice'),
        (r'parallel.*(task|agent)|coordination overhead', 'parallel task coordination'),
    ]
    for pattern, label in patterns:
        if re.search(pattern,content_text,re.I):
            words.append(label)

    # Category and affected-area phrases are curated fields in the source collection.
    for r in recs:
        for raw in (r['problem_category'], r['affected_area']):
            for phrase in _split_category_field(raw):
                if phrase and phrase not in GENERIC and len(phrase)>2:
                    words.append(phrase)
        # Stack Overflow tags are useful technical keywords; retain exact tag meaning.
        for tag in r['tags'].split(';'):
            tag=_clean_phrase(tag.replace('-', ' '))
            if tag and tag not in STOP and tag not in GENERIC:
                words.append(tag)

    result=[]; seen=set()
    for w in words:
        w=_clean_phrase(w)
        if not w or w in seen: continue
        seen.add(w); result.append(w)
        if len(result)>=10: break
    return result


def main():
    records=read_sources()
    groups,reason=dedupe(records)
    # Deterministic IDs anchored to a source record; keyword IDs are stable for this snapshot.
    ordered=sorted(groups.items(),key=lambda kv:min((r['platform'].lower(),r['source_record_id']) for r in kv[1]))
    id_map={}
    for i,(key,recs) in enumerate(ordered,1):
        if key.startswith('KW-'):
            kid=key
        else:
            kid=f'KW-{i:04d}'
        id_map[key]=kid
    canonical_problem=[]
    for key,recs in ordered:
        recs=sorted(recs,key=lambda r:(0 if r['confidence'].lower()=='high' else 1,r['platform'].lower(),r['source_record_id']))
        kid=id_map[key]
        if key in CUSTOM_THEMES:
            theme,manual=CUSTOM_THEMES[key]
        else:
            theme=recs[0]['problem_category'] or recs[0]['problem_statement']
        source_ids=[r['source_record_id'] for r in recs]
        source_urls=list(dict.fromkeys(r['source_url'] for r in recs if r['source_url']))
        canonical_problem.append({
            'keyword_id':kid,
            'problem_theme':theme,
            'problem_statement':recs[0]['problem_statement'],
            'keywords':'; '.join(keyword_list(recs,key)),
            'source_count':str(len(recs)),
            'source_platforms':'; '.join(sorted({r['platform'] for r in recs})),
            'source_record_ids':'; '.join(source_ids),
            'source_urls':' ; '.join(source_urls),
            'source_dates':'; '.join(sorted({r['source_date'] for r in recs if r['source_date']})),
            'source_categories':'; '.join(sorted({r['problem_category'] for r in recs if r['problem_category']})),
            'representative_author':recs[0]['author_name'],
            'representative_evidence_excerpt':recs[0]['evidence_excerpt'],
            'content_licenses':'; '.join(sorted({r['content_license'] for r in recs if r['content_license']})),
            'dedupe_note':reason.get(recs[0]['source_record_id'],'Distinct problem retained; no meaning-level duplicate identified.'),
        })
    with (OUT/'keywords.csv').open('w',newline='',encoding='utf-8') as f:
        fields=list(canonical_problem[0])
        w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(canonical_problem)
    lookup={r['source_record_id']:r for r in records}
    source_map=[]
    for key,recs in ordered:
        kid=id_map[key]
        rep=min(recs,key=lambda r:(0 if r['confidence'].lower()=='high' else 1,r['platform'].lower(),r['source_record_id']))['source_record_id']
        for r in recs:
            source_map.append({
                'keyword_id':kid,'source_record_id':r['source_record_id'],'platform':r['platform'],
                'is_canonical_source':str(r['source_record_id']==rep).lower(),
                'merge_reason':reason.get(r['source_record_id'],'Distinct source record retained.'),
                'source_date':r['source_date'],'author_name':r['author_name'],'author_handle':r['author_handle'],
                'problem_category':r['problem_category'],'problem_statement':r['problem_statement'],
                'evidence_excerpt':r['evidence_excerpt'],'source_url':r['source_url'],
                'source_item_url':r['source_item_url'],'tags':r['tags'],'evidence_type':r['evidence_type'],
                'confidence':r['confidence'],'content_license':r['content_license'],
            })
    with (OUT/'source_map.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=list(source_map[0]),lineterminator='\n');w.writeheader();w.writerows(source_map)
    print(f'Input records: {len(records)}; meaning-deduplicated keyword records: {len(canonical_problem)}; merged source records: {len(records)-len(canonical_problem)}')


if __name__=='__main__':
    main()
