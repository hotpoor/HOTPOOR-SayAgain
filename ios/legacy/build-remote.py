#!/usr/bin/env python3
"""Sync just the iOS target; unlock signing keychain within the same SSH session.
Password is read from an existing local Keychain item and never logged or saved.
"""
import argparse, pathlib, subprocess, shlex, tarfile, io, json, hashlib
p=argparse.ArgumentParser();p.add_argument('--ssh-helper',required=True);p.add_argument('--keychain-service',required=True);p.add_argument('--account',required=True);p.add_argument('--device');p.add_argument('--test',action='store_true');p.add_argument('--only-testing',action='append',default=[]);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
# Avoid retransmitting identical large generated models/libraries. Every skipped
# file is verified against the remote content, never just its name or mtime.
large=['SayAgain/LocalASRResources','SayAgain/NativeASR/lib','SayAgain/NativeASR/onnxruntime.framework']
remote_hashes = "import pathlib,hashlib,json; root=pathlib.Path.home()/'Developer/SayAgain-iPad'; print(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in "+repr(large)+" for p in (root/folder).rglob('*') if p.is_file()}))"
probe=subprocess.run([args.ssh_helper,'python3 -c '+shlex.quote(remote_hashes)],capture_output=True,text=True)
skip=set()
if probe.returncode == 0:
 try:
  existing=json.loads(probe.stdout)
  for folder in large:
   for file in (root/folder).rglob('*'):
    if file.is_file() and existing.get(str(file.relative_to(root))) == hashlib.sha256(file.read_bytes()).hexdigest():skip.add(str(file.relative_to(root)))
 except (ValueError,OSError):skip=set()
print('Verified unchanged native resource files:',len(skip),flush=True)
def sync_filter(info):return None if info.name in skip else info
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
 for name in ['SayAgain','SayAgainUITests','SayAgain.xcodeproj','scripts','legacy','app-store']:archive.add(root/name,arcname=name,filter=sync_filter)
subprocess.run([args.ssh_helper,'mkdir -p ~/Developer/SayAgain-iPad; tar -xzf - -C ~/Developer/SayAgain-iPad'],input=buffer.getvalue(),check=True)
password=subprocess.run(['security','find-generic-password','-s',args.keychain_service,'-a',args.account,'-w'],capture_output=True,check=True).stdout.rstrip(b'\n')
remote='''import subprocess,sys,pathlib,time
root=pathlib.Path.home()/"Developer/SayAgain-iPad"
pw=sys.stdin.buffer.read().decode()
r=subprocess.run(["security","unlock-keychain","-p",pw,str(pathlib.Path.home()/"Library/Keychains/login.keychain-db")],capture_output=True)
if r.returncode: raise SystemExit("Unable to unlock development keychain")
command=COMMAND
with (root/"latest-build.log").open("w") as log:
 r=subprocess.run(command,cwd=str(root),stdout=log,stderr=subprocess.STDOUT)
print("\\n".join((root/"latest-build.log").read_text().splitlines()[-35:]))
sys.exit(r.returncode)
'''
cmd=['xcodebuild','-project','SayAgain.xcodeproj','-scheme','SayAgain','-configuration','Debug','-xcconfig','legacy/Legacy-iOS12.xcconfig','-destination',('platform=iOS,id='+args.device) if args.device else 'generic/platform=iOS','-derivedDataPath','build']
if args.test:cmd+=['-resultBundlePath','build/test-'+__import__('time').strftime('%Y%m%d-%H%M%S')+'.xcresult','test']
else:cmd+=['build']
if args.only_testing and not args.test:p.error('--only-testing requires --test')
cmd += ['-only-testing:'+name for name in args.only_testing]
remote=remote.replace('COMMAND',repr(cmd))
result=subprocess.run([args.ssh_helper,'python3 -c '+shlex.quote(remote)],input=password)
raise SystemExit(result.returncode)
