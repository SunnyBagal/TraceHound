# Bind a frozen worktree to the main spend state

Decision076c item9. This command set shares one physical ledger and the same environment file; it makes no provider call. Keep the spend freeze and one-paid-process rule. The final freeze tag does not exist yet: the rehearsal used main `958171b`; at F1 substitute the approved tag for `<freeze-tag>`.

Create the detached execution worktree from the main checkout (not from another lane's checkout):

```sh
git -C /Users/sunny/Projects/TraceHound worktree add --detach /private/tmp/tracehound-h1-tag <freeze-tag>
export TH_MAIN=/Users/sunny/Projects/TraceHound
export TH_TAG=/private/tmp/tracehound-h1-tag
```

Run once before T0, and repeat the verification before every paid job. Existing destinations pointing elsewhere refuse; do not replace them automatically. Dependencies reuse the main installation; this is not an install or a new dependency.

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const main=fs.realpathSync(process.env.TH_MAIN), tag=fs.realpathSync(process.env.TH_TAG);
if(main===tag) throw new Error('use a separate worktree');
for(const rel of ['.env','.tracehound/spend.jsonl']){
 const src=path.join(main,rel);
 if(!fs.statSync(src).isFile() || fs.statSync(src).size===0) throw new Error('main state file missing/empty');
 const dst=path.join(tag,rel); fs.mkdirSync(path.dirname(dst),{recursive:true});
 try{fs.lstatSync(dst); if(fs.realpathSync(dst)!==fs.realpathSync(src)) throw new Error('existing destination differs; do not overwrite');}
 catch(e){if(e.code!=='ENOENT') throw e; fs.symlinkSync(src,dst);}
}
for(const rel of ['node_modules','packages/analyzer/node_modules','packages/action/node_modules','viewer/node_modules']){
 const src=path.join(main,rel),dst=path.join(tag,rel);
 if(!fs.statSync(src).isDirectory()) throw new Error('main dependencies missing');
 try{fs.lstatSync(dst); if(fs.realpathSync(dst)!==fs.realpathSync(src)) throw new Error('existing dependency location differs');}
 catch(e){if(e.code!=='ENOENT') throw e; fs.symlinkSync(src,dst,'dir');}
}
console.log('state and dependency links ready; no provider call');
JS
```

The preflight compares effective child-process hard stops as well as the shared files. Node's environment-file loader preserves inherited values: a stale exported total cap is therefore a refusal, not an unnoticed override. Only aggregate money and the environment file's hash are printed; never print the environment file, tokens, or the entire environment.

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const main=fs.realpathSync(process.env.TH_MAIN), tag=fs.realpathSync(process.env.TH_TAG);
const cfg=parseEnv(fs.readFileSync(path.join(main,'.env'),'utf8'));
const expected=Number(cfg.TRACEHOUND_BUDGET_TOTAL_USD);
if(!Number.isFinite(expected)||expected<=0) throw new Error('main .env needs explicit valid total hard stop');
for(const rel of ['.env','.tracehound/spend.jsonl'])
 if(fs.realpathSync(path.join(tag,rel))!==fs.realpathSync(path.join(main,rel))) throw new Error('shared state binding changed');
const probe="import {SpendLedger} from './packages/analyzer/src/llm/ledger.ts'; import {capsFromEnv} from './packages/analyzer/src/llm/budget.ts'; console.log(JSON.stringify({ledgerUSD:new SpendLedger('.tracehound/spend.jsonl').totalUSD(),hardStopUSD:capsFromEnv().totalUSD}));";
const values=[main,tag].map(cwd=>{
 const r=spawnSync(process.execPath,['--env-file=.env','--input-type=module','-e',probe],{cwd,env:process.env,encoding:'utf8'});
 if(r.status!==0) throw new Error('state probe failed; no execution authorized');
 return JSON.parse(r.stdout);
});
if(values[0].ledgerUSD!==values[1].ledgerUSD || values.some(x=>x.hardStopUSD!==expected)) throw new Error('ledger/hard-stop mismatch; check inherited budget override');
const tracked=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:tag,encoding:'utf8'}).trim();
if(tracked) throw new Error('tracked worktree dirty');
const envSame=fs.readFileSync(path.join(main,'.env')).equals(fs.readFileSync(path.join(tag,'.env')));
const envSha256=createHash('sha256').update(fs.readFileSync(path.join(main,'.env'))).digest('hex');
console.log(JSON.stringify({main:values[0],worktree:values[1],samePhysicalLedger:true,envSame,envSha256,trackedClean:true}));

JS
```

Both processes must report the same ledger total and the main environment's explicit `TRACEHOUND_BUDGET_TOTAL_USD`. The symlink means future appends also reach the main ledger; no post-run copying/merging is required. Do not replace the ledger file or environment file while a job is running.

When running `pnpm spend`, load the environment explicitly: its entry point does not load it. From `$TH_TAG`, `node --env-file=.env packages/analyzer/src/spend.ts` shows the same total/cap. The runner normally loads its local environment file only if no key is inherited; invoke an authorized runner command with `node --env-file=.env scripts/run-tracehound.ts ...` after this preflight so the cap is loaded regardless of an inherited key. This document supplies no `--execute` command.

Before each paid job, record the main ledger total and UTC time in the job file. A lower per-job TOTAL/RUN envelope may then be explicitly set under076a/076b; it must stay within the global hard stop and use the same job-start value across processes. Run one paid process at a time across all jobs. Verify the global baseline again after leaving any per-job override. No copied/empty ledger, default hard stop, or independent worktree budget is allowed.

At F1 record the tag's full commit and dependency lock hash. Before T0 and after H1 verify every record's `tracehound.sha`, tracked-dirty flag, fixes/contracts/cache flags, case cap and prompt hashes against the frozen manifest. The runner's dirty flag excludes untracked files, so separately inventory the state/dependency links; a clean tracked tree alone does not certify the setup. Grok independently repeats the state/record checks before the H2 commit (076c item10). Do not commit environment files, ledgers, dependency links or private records.

This branch contains documentation only; the executed dry-run result and full commit are in the assigned testset report. No final tag, window, paid call or push is performed by this command set.

