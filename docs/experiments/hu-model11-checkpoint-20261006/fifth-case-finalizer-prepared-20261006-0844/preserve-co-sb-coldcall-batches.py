"""Copy immutable successful batches into an archive; no numerical work or acceptance."""
from pathlib import Path
import datetime,hashlib,io,json,re,sys,tarfile
ROOT=Path('/workspace/scratch/08c72b2d7549')
BASE=ROOT/'hu-final-recovery'
RUN=BASE/'co-sb-coldcall-optimized-five-workers/run'
ATTEMPT=RUN/'attempts/attempt-c9075316-cf53-45dc-811a-ef6287230a77'
tag=sys.argv[1]
assert re.fullmatch(r'\d{8}-\d{4}',tag)
records={};boards=set();batches=[]
def capture(path,pin=None):
    path=Path(path)
    assert path.is_relative_to(RUN) and path.is_file()
    assert not any(p.is_symlink() for p in [path,*path.parents])
    raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
    if pin:assert len(raw)==pin['bytes'] and digest==pin['sha256'],str(path)
    key=str(path.relative_to(ROOT));prior=records.get(key)
    assert prior is None or prior['sha256']==digest
    records[key]={'path':str(path),'archivePath':key,'bytes':len(raw),'sha256':digest}
    return raw
for terminal in sorted(ATTEMPT.glob('*.terminal.json')):
    try:item=json.loads(terminal.read_text())
    except json.JSONDecodeError:continue
    if item['exitCode']!=0:continue
    job=item['job'];jid=job['id']
    assert re.fullmatch(r'boards-lane[0-4]-\d{4}',jid)
    assert terminal.name==jid+'.terminal.json'
    expected=ATTEMPT/'jobs'/(jid+'.completed.json')
    assert item['completion']['path']==str(expected)
    complete=json.loads(capture(expected,item['completion']))
    assert complete['generatedBoards']==len(job['indices'])
    assert [row['index'] for row in complete['completed']]==job['indices']
    capture(terminal);capture(ATTEMPT/(jid+'.launch.json'))
    for name in [jid+'.json',jid+'.started.json']:capture(ATTEMPT/'jobs'/name)
    identity=complete['started']['checkpointIdentityHash']
    assert re.fullmatch(r'[a-f0-9]{64}',identity) and job['lane'] in range(5)
    directory=RUN/('lane-'+str(job['lane']))/'checkpoints'/identity
    capture(directory/'identity.json')
    for row in complete['completed']:
        assert re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3}',row['board'])
        assert row['board'] not in boards and row['checkpoint']['path']==row['board']+'.json'
        boards.add(row['board']);capture(directory/row['checkpoint']['path'],row['checkpoint'])
        for pin in row['proofs']:
            assert re.fullmatch(r'[a-f0-9]{64}\.proof\.json',pin['path'])
            capture(directory/pin['path'],pin)
    batches.append({'job':jid,'boards':len(complete['completed']),'terminalSha256':records[str(terminal.relative_to(ROOT))]['sha256']})
assert boards and len(boards)==sum(row['boards'] for row in batches)
capture(RUN/'prepared.json')
if (RUN/'owner.lock').exists():capture(RUN/'owner.lock')
if (ATTEMPT/'receipt.json').exists():capture(ATTEMPT/'receipt.json')
manifest={'kind':'active-run-successful-batch-byte-preservation','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'case':'CO_open_SB_3bet_BB_call_CO_fold','attempt':str(ATTEMPT),'mainOwnerSession':29433,'wholeRunTerminalAvailable':(ATTEMPT/'receipt.json').exists(),'acceptance':False,'successfulBatches':len(batches),'completeBoards':len(boards),'boardIds':sorted(boards),'batches':batches,'records':list(records.values()),'scope':'Only actual successful immutable batch completions and exact referenced bytes. Active partial batches excluded. No numerical revalidation/generation or whole-run acceptance.'}
mp=BASE/('co-sb-coldcall-successful-batches-snapshot-'+tag+'.json')
out=BASE/('hu-model11-co-sb-coldcall-progress-'+tag+'.tar.gz')
assert not mp.exists() and not out.exists()
mp.write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out,'w:gz',compresslevel=3) as tar:
    for path in [BASE/'hu-model11-co-sb-coldcall-progress-base-v1.tar.gz',mp,Path(__file__)]:tar.add(path,arcname=path.name)
    for pin in records.values():
        raw=Path(pin['path']).read_bytes()
        assert len(raw)==pin['bytes'] and hashlib.sha256(raw).hexdigest()==pin['sha256']
        info=tarfile.TarInfo(pin['archivePath']);info.size=len(raw);tar.addfile(info,io.BytesIO(raw))
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'successfulBatches':len(batches),'completeBoards':len(boards),'capturedFiles':len(records)}))
