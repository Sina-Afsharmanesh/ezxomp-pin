#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import agentExperienceExtension from '../extensions/agent-experience/index.ts';
import { formatAgentExperienceConfig, DEFAULT_AGENT_EXPERIENCE_CONFIG } from '../extensions/agent-experience/src/config.ts';
import { resolveLocalEmbeddingWorkerUrl } from '../extensions/agent-experience/src/semantic/local-adapter.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(typeof agentExperienceExtension,'function');
assert.match(fileURLToPath(resolveLocalEmbeddingWorkerUrl()),/runtime\/agent-experience\/local-embedding-worker\.mjs$/);
const packageJson=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
assert.equal(packageJson.engines.bun,'>=1.3.14','package Bun floor must match the runtime');
assert.ok(packageJson.files.includes('runtime/'),'packed package must include local worker/vendor runtime');
assert.ok(packageJson.files.includes('docs/'),'packed package must include README/gallery artwork');
assert.ok(packageJson.files.includes('CHANGELOG.md'),'packed package must include user-facing release history');
const changelog=await readFile(join(root,'CHANGELOG.md'),'utf8');
assert.match(changelog,/^# Changelog$/m,'changelog heading missing');
assert.match(changelog,/^## \[Unreleased\]$/m,'changelog must preserve an Unreleased section');
assert.match(changelog,new RegExp('^## \\[' + packageJson.version.replace(/-ezxomp\.\d+$/, '').replaceAll('.', '\\.') + '\\]', 'm'),'changelog must contain the current published package version');
assert.equal(packageJson.description,'Human-reviewed habits for OMP coding agents—a local-first behavioral learning layer alongside skills and memory.','package description must preserve the discoverable habits category');
assert.deepEqual(packageJson.dependencies ?? {}, {}, 'runtime dependencies must stay empty; local embedding assets are shipped in runtime/ and JS glue is vendored');
assert.match(packageJson.scripts?.['check:agent-experience']||'',/test-agent-experience-phase16-conversation\.mjs/,'complete checks must include conversational habit validation');
assert.match(packageJson.scripts?.['check:agent-experience']||'',/test-agent-experience-phase22-provider-guidance\.mjs/,'complete checks must include system-level provider guidance validation');
for(const keyword of ['omp-package','omp-coding-agent','coding-agent','agent-habits','agent-memory','agent-profile','agent-skills','behavioral-learning','context-management','human-in-the-loop','local-first','token-efficiency']){
  assert.ok(packageJson.keywords.includes(keyword),`package discovery keyword missing: ${keyword}`);
}
assert.equal(packageJson.scripts?.install,undefined);
assert.equal(packageJson.scripts?.postinstall,undefined);
assert.equal(packageJson.scripts?.prepare,undefined,'package installation must never download or generate local model assets');
const configText=formatAgentExperienceConfig(DEFAULT_AGENT_EXPERIENCE_CONFIG);
assert.doesNotMatch(configText,/embedding_(provider|model|dimensions|review_threshold|strong_threshold|timeout|openai)/i);
assert.doesNotMatch(configText,/selector_daily_budget|daily_budget/i,'formatted config must not emit a selector quota');

const readme=await readFile(join(root,'README.md'),'utf8');
const technicalSummary='<summary><strong>For agents and maintainers: technical contract, caveats, and release discipline</strong></summary>';
const technicalSummaryIndex=readme.indexOf(technicalSummary);
assert.notEqual(technicalSummaryIndex,-1,'README must preserve the collapsed agent/maintainer technical contract');
const technicalOpenIndex=readme.lastIndexOf('<details>',technicalSummaryIndex);
const technicalCloseIndex=readme.indexOf('</details>',technicalSummaryIndex);
assert.notEqual(technicalOpenIndex,-1,'agent/maintainer technical contract must be inside <details>');
assert.notEqual(technicalCloseIndex,-1,'agent/maintainer technical contract must close its <details> block');
assert.equal(readme.slice(technicalOpenIndex,technicalSummaryIndex).trim(),'<details>','agent/maintainer technical contract must be collapsed by default');
for(const marker of ['# OMP Experiences — habits for a coding agent that learns how you work','## The missing layer in AI agent improvement','## Why not put every preference in `profile.md`?','## Real-life habits OMP can learn','## How the review-first learning loop works','## Safety model','## Normal workflow','## See when a habit steers an answer','## Local duplicate prevention','## Privacy in plain language','## Frequently asked questions']){
  const index=readme.indexOf(marker);
  assert.ok(index>=0&&index<technicalOpenIndex,`README human-first product section missing before technical contract: ${marker}`);
}
assert.match(readme.slice(0,technicalOpenIndex),/\[CHANGELOG\.md\]\(\.\/CHANGELOG\.md\)/,'README must link the user-facing changelog');
for(const phrase of ['OMP coding agent','Agent skill','Agent memory','Experience habit','human-in-the-loop behavioral learning','Profiles describe the person; experience manages reviewed habits','selected OMP model/provider']){
  assert.match(readme.slice(0,technicalOpenIndex),new RegExp(phrase,'i'),`README discovery/product story missing: ${phrase}`);
}
assert.match(readme.slice(0,technicalOpenIndex),/!\[Infographic: skills give an OMP coding agent procedures, memory preserves facts, and human-reviewed habits improve how it works with you\]\(\.\/docs\/images\/pi-experiences-habits\.svg\)/,'README must show the local habits/skills/memory infographic');
for(const marker of ['### Package contract','### Hard invariants','### Why `profile.md` is not the habit store','### Local embedding contract','### Duplicate-resolution contract','### Bounded observations and privacy retention','### Law-check caveat','### Development and validation','### Release discipline']){
  const index=readme.indexOf(marker,technicalSummaryIndex);
  assert.ok(index>technicalSummaryIndex&&index<technicalCloseIndex,`README technical contract missing: ${marker}`);
}
const humanReadme=readme.slice(0,technicalOpenIndex);
const technicalReadme=readme.slice(technicalSummaryIndex,technicalCloseIndex);
assert.match(humanReadme,/situation and action separately/i,'normal-user duplicate explanation must preserve separate-field behavior');
assert.match(humanReadme,/shipped, SHA-256-verified local assets/i,'normal-user duplicate explanation must describe shipped verified local assets');
for(const phrase of ['exact `When:` \/ `Do:` wording','later, explicit confirmation','bypasses only that repetition threshold','numbered plain-language items','◇ Steered by habit','No marker means that response received no habit guidance','not an LLM message','There is no daily quota']) assert.match(humanReadme,new RegExp(phrase,'i'),`README conversational/transparency contract missing: ${phrase}`);
for(const phrase of ['one short-lived draft and one numbered review snapshot','no raw conversation or confirmation utterance','If it is unavailable, no candidate','expire after 15 minutes','agent_experience.habit_steering','durable marker does not participate in LLM context','system-instruction field','non-TUI modes']) assert.match(technicalReadme,new RegExp(phrase,'i'),`README technical conversational/transparency contract missing: ${phrase}`);
assert.match(technicalReadme,/non-TUI modes[^.]*suppress/is,'README technical contract must fail closed outside the visible TUI');
for(const phrase of ['lower of separate condition and behavior cosine scores','Review threshold: 5,500 basis points','candidate-to-candidate semantic routing is excluded','obsolete pending scoring-method relations','every pending relation involving it','keep-separate decisions survive scoring/cache method upgrades'])assert.match(technicalReadme,new RegExp(phrase,'i'),`README dedupe correction contract missing: ${phrase}`);
const extensionReadme=await readFile(join(root,'extensions/agent-experience/README.md'),'utf8');
const experienceSkill=await readFile(join(root,'skills/agent-experience/SKILL.md'),'utf8');
for(const [name,text] of [['extension README',extensionReadme],['public skill',experienceSkill]]){
  assert.match(text,/condition and behavior.*two independent inputs/is,`${name} must preserve separate-field privacy contract`);
  assert.match(text,/candidate-to-candidate/is,`${name} must preserve candidate-pair exclusion`);
  assert.match(text,/obsolete pending scoring-method/is,`${name} must preserve reconciliation contract`);
  assert.match(text,/exact `When:` \/ `Do:`/is,`${name} must document exact conversational habit drafting`);
  assert.match(text,/later user (?:input )?turn|later user message/is,`${name} must preserve two-turn confirmation`);
  assert.match(text,/bypasses only (?:the )?repe(?:at|tit)/is,`${name} must preserve direct-declaration evidence boundary`);
  assert.match(text,/◇ Steered by habit/is,`${name} must document exact response-specific habit steering`);
  assert.match(text,/No marker means that response received no habit guidance/is,`${name} must define marker absence semantics`);
  assert.match(text,/never enters? LLM context|does not participate in LLM context/is,`${name} must keep steering provenance out of model context`);
  assert.match(text,/system-level (?:provider )?instruction|system-instruction field/is,`${name} must keep habit guidance at system authority`);
  assert.match(text,/never (?:as|inject).*user|never user content|never inject.*user/is,`${name} must reject user-role habit guidance`);
  assert.match(text,/non-TUI|interface is not the OMP TUI/is,`${name} must preserve fail-closed interface visibility`);
  assert.match(text,/no daily quota/is,`${name} must preserve unlimited eligible guidance`);
}

const selectorSource=await readFile(join(root,'extensions/agent-experience/src/selector.ts'),'utf8');
const configSource=await readFile(join(root,'extensions/agent-experience/src/config.ts'),'utf8');
assert.doesNotMatch(selectorSource,/daily_budget|dailyBudget|countDailySelectorInjections/,'selector runtime must never enforce a daily guidance quota');
assert.doesNotMatch(configSource,/selector_daily_budget|selector\.daily_budget/,'active config schema must not expose a daily guidance quota');
const steeringSource=await readFile(join(root,'extensions/agent-experience/src/steering-note.ts'),'utf8');
assert.match(steeringSource,/agent_experience\.habit_steering/,'steering custom-entry type must remain stable');
assert.doesNotMatch(steeringSource,/sendMessage|prompt_hash|confidence_bp|checksum|source_refs?|provider|model/,'steering entry module must not persist context-bearing or internal fields');
const extensionSource=await readFile(join(root,'extensions/agent-experience/index.ts'),'utf8');
const providerGuidanceSource=await readFile(join(root,'extensions/agent-experience/src/provider-guidance.ts'),'utf8');
assert.doesNotMatch(extensionSource,/agent_experience\.habit_guidance/,'habit guidance must never be emitted as a custom/user conversation message');
assert.match(extensionSource,/pi\.on\("before_provider_request"/,'habit guidance must use the pre-provider payload boundary');
assert.match(extensionSource,/appendHabitGuidanceToProviderPayload\(ctx\.model\?\.api, event\.payload, state\.guidance\)/,'provider guidance must dispatch by the exact current model API');
assert.match(providerGuidanceSource,/KNOWN_GUIDANCE_APIS/,'provider guidance must use a closed known-API allowlist');
assert.match(providerGuidanceSource,/agent_experience_response_guidance/,'provider guidance must be retry-idempotent');
assert.doesNotMatch(providerGuidanceSource,/console\.|writeFile|appendFile|sendMessage|sendUserMessage/,'transient provider guidance must not log, persist, or create conversation messages');
const forbidden=/OPENAI_API_KEY|AX_OPENAI_EMBEDDING|openai-compatible embedding|api\.openai\.com/i;
async function sourceFiles(directory){
  const out=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())out.push(...await sourceFiles(path));
    else if(/\.(?:ts|mjs|md|json)$/.test(entry.name))out.push(path);
  }
  return out;
}
for(const path of await sourceFiles(join(root,'extensions')))assert.doesNotMatch(await readFile(path,'utf8'),forbidden,`hosted embedding behavior must be absent: ${path}`);
const heroSvg=await readFile(join(root,'docs/images/pi-experiences-habits.svg'),'utf8');
assert.match(heroSvg,/<title[^>]*>OMP Experiences: skills, memory, and habits<\/title>/,'README SVG needs an accessible title');
assert.match(heroSvg,/<desc[^>]*>[^<]*human-reviewed habits[^<]*<\/desc>/i,'README SVG needs an accessible description of habits');
assert.doesNotMatch(heroSvg,/<script\b|(?:href|src)=["']https?:/i,'README SVG must remain inert and self-contained');
const galleryPng=await readFile(join(root,'docs/images/pi-experiences-habits.png'));
assert.deepEqual([...galleryPng.subarray(0,8)],[137,80,78,71,13,10,26,10],'OMP gallery preview must be a valid PNG');
assert.equal(galleryPng.readUInt32BE(16),1400,'OMP gallery preview width drifted');
assert.equal(galleryPng.readUInt32BE(20),800,'OMP gallery preview height drifted');
assert.ok(galleryPng.byteLength<=500_000,'OMP gallery preview should remain lightweight');
const expectedGlue={
  'ort.node.min.mjs':'8f2fdcb6a9257450f3c8768d9a5c46d55f74b9c49c74d45405df781058910c6d',
  'ort-wasm-simd-threaded.mjs':'0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3',
};
for(const [name,expected] of Object.entries(expectedGlue)){
  const bytes=await readFile(join(root,'runtime/vendor/onnxruntime-web',name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`vendored runtime hash mismatch: ${name}`);
}
const localAdapterSource=await readFile(join(root,'extensions/agent-experience/src/semantic/local-adapter.ts'),'utf8');
assert.doesNotMatch(localAdapterSource,/denyFetch/,'local embedding worker fetch denial must be default-on, not caller opt-in');
const workerSource=await readFile(join(root,'runtime/agent-experience/local-embedding-worker.mjs'),'utf8');
assert.match(workerSource,/globalThis\.fetch = \(\) => \{ throw new Error\('local_embedding_worker_fetch_denied'\); \};[\s\S]*import\('\.\.\/vendor\/onnxruntime-web\/ort\.node\.min\.mjs'\)/,'worker must deny fetch before loading vendored runtime modules');
assert.doesNotMatch(workerSource,/workerData\?\.denyFetch|workerData && workerData\.denyFetch/,'worker must not retain opt-in fetch-denial mode');
const thirdPartyNotices=await readFile(join(root,'THIRD_PARTY_NOTICES.md'),'utf8');
for(const relative of ['runtime/vendor/onnxruntime-web/LICENSE','runtime/vendor/onnxruntime-common/LICENSE','runtime/assets/local-embedding/multilingual-minilm-l12-int8-v1/LICENSE.Apache-2.0']){
  const text=await readFile(join(root,relative),'utf8');
  assert.match(thirdPartyNotices,new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`third-party notices must name packed license path: ${relative}`);
  assert.ok(text.length>500,`packed license text too small: ${relative}`);
  if(relative.endsWith('LICENSE.Apache-2.0')) assert.match(text,/Base model metadata declares license: apache-2\.0[\s\S]*Apache License[\s\S]*Version 2\.0[\s\S]*END OF TERMS AND CONDITIONS/,`packed model license must include Apache-2.0 text and provenance: ${relative}`);
}
await esbuild.build({entryPoints:[join(root,'extensions/agent-experience/index.ts')],bundle:true,platform:'node',format:'esm',target:['node22'],write:false,logLevel:'silent',external:['@oh-my-pi/pi-ai','@oh-my-pi/pi-ai/*','@oh-my-pi/pi-coding-agent','@oh-my-pi/pi-coding-agent/*','@oh-my-pi/pi-tui','@oh-my-pi/pi-tui/*','bun']});
await esbuild.build({entryPoints:[join(root,'runtime/agent-experience/local-embedding-worker.mjs')],bundle:false,platform:'node',format:'esm',target:['node22'],write:false,logLevel:'silent'});
console.log('agent-experience source/import/package checks passed');
