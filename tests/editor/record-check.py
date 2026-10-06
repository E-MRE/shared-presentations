"""Record actual bounded commands without shell interpolation."""
import datetime, json, os, pathlib, subprocess, sys
name, *argv = sys.argv[1:]
root = pathlib.Path(os.environ.get('EVIDENCE_DIR', 'test-results/unit'))
root.mkdir(parents=True, exist_ok=True)
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
with (root / (name + '.stdout')).open('w') as out, (root / (name + '.stderr')).open('w') as err:
    result = subprocess.run(argv, stdout=out, stderr=err, env=os.environ.copy())
record = dict(argv=argv, cwd=os.getcwd(), started_at=start, finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), exit_code=result.returncode, environment={key: os.environ[key] for key in ['PLAYWRIGHT_BROWSERS_PATH', 'EVIDENCE_DIR'] if key in os.environ})
(root / (name + '.command.json')).write_text(json.dumps(record, indent=2))
(root / (name + '.exit')).write_text(str(result.returncode) + '\n')
print(json.dumps(record))
print((root / (name + '.stdout')).read_text())
print((root / (name + '.stderr')).read_text())
sys.exit(result.returncode)
