#!/usr/bin/env python3
"""Build the pinned, device-only iOS 12 ASR library and stage existing desktop weights.
Inputs are an extracted sherpa-onnx v1.10.30 source and the official Microsoft
onnxruntime-c 1.17.1 pod archive (iOS 12; not the iOS 13 sherpa prebuilt archive).
"""
import argparse,pathlib,subprocess,os,shutil,hashlib,json,plistlib
p=argparse.ArgumentParser();p.add_argument('--sherpa-source',required=True,type=pathlib.Path);p.add_argument('--ort-package',required=True,type=pathlib.Path);p.add_argument('--model-dir',required=True,type=pathlib.Path);p.add_argument('--build-dir',required=True,type=pathlib.Path);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
source=args.sherpa_source.resolve();ort=args.ort_package.resolve();build=args.build_dir.resolve();build.mkdir(parents=True,exist_ok=True)
if '1.10.30' not in (source/'CMakeLists.txt').read_text():raise SystemExit('Expected sherpa-onnx 1.10.30')
if 'session.disable_prepacking' not in (source/'sherpa-onnx/csrc/session.cc').read_text():
 subprocess.run(['patch','-p1','-i',str(root/'native/sherpa-ios12-memory.patch')],cwd=source,check=True)
runtime=ort/'onnxruntime.xcframework/ios-arm64/onnxruntime.framework/onnxruntime'
link=build/'ort-link';link.mkdir(exist_ok=True);target=link/'libonnxruntime.a'
if not target.exists():target.symlink_to(runtime)
env=dict(os.environ,SHERPA_ONNXRUNTIME_LIB_DIR=str(link),SHERPA_ONNXRUNTIME_INCLUDE_DIR=str(ort/'Headers'))
flags=['-DPLATFORM=OS64','-DDEPLOYMENT_TARGET=12.0','-DENABLE_BITCODE=OFF','-DENABLE_ARC=ON','-DCMAKE_BUILD_TYPE=Release','-DSHERPA_ONNX_ENABLE_PYTHON=OFF','-DSHERPA_ONNX_ENABLE_BINARY=OFF','-DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF','-DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF','-DSHERPA_ONNX_ENABLE_TTS=OFF','-DSHERPA_ONNX_ENABLE_SPEAKER_DIARIZATION=OFF','-DSHERPA_ONNX_BUILD_C_API_EXAMPLES=OFF']
subprocess.run(['cmake','-S',str(source),'-B',str(build),'-DCMAKE_TOOLCHAIN_FILE='+str(source/'toolchains/ios.toolchain.cmake')]+flags,env=env,check=True)
subprocess.run(['cmake','--build',str(build),'--target','sherpa-onnx-c-api','-j','6'],check=True)
native=root/'SayAgain/NativeASR';lib=native/'lib';lib.mkdir(parents=True,exist_ok=True)
archives=[str(f) for f in (build/'lib').glob('*.a') if 'onnxruntime' not in f.name]
if not archives:raise SystemExit('No native archives produced')
subprocess.run(['xcrun','libtool','-static','-o',str(lib/'libSayAgainASR.a')]+archives,check=True)
# Finalize modern ObjC selector stubs with the current linker. Xcode 13 can then
# link and sign this iOS 12 framework without interpreting newer static objects.
framework=native/'onnxruntime.framework';framework.mkdir(exist_ok=True)
sdk=subprocess.check_output(['xcrun','--sdk','iphoneos','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','--sdk','iphoneos','clang++','-target','arm64-apple-ios12.0','-isysroot',sdk,'-dynamiclib','-Wl,-all_load','-Wl,-no_fixup_chains','-Wl,-install_name,@rpath/onnxruntime.framework/onnxruntime',str(runtime),'-framework','Foundation','-weak_framework','CoreML','-framework','Accelerate','-o',str(framework/'onnxruntime')],check=True)
(framework/'Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable':'onnxruntime','CFBundleIdentifier':'com.hotpoor.sayagain.onnxruntime','CFBundleName':'onnxruntime','CFBundlePackageType':'FMWK','CFBundleShortVersionString':'1.17.1','CFBundleVersion':'1','MinimumOSVersion':'12.0','CFBundleSupportedPlatforms':['iPhoneOS']}))
include=native/'include/sherpa-onnx/c-api';include.mkdir(parents=True,exist_ok=True);shutil.copy2(source/'sherpa-onnx/c-api/c-api.h',include/'c-api.h')
resources=root/'SayAgain/LocalASRResources';resources.mkdir(exist_ok=True)
manifest={}
for name in ['model.int8.onnx','tokens.txt']:
 shutil.copy2(args.model_dir/name,resources/name);data=(resources/name).read_bytes();manifest[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
print(json.dumps(manifest,indent=2))
shutil.copy2(source/'LICENSE',resources/'sherpa-onnx-LICENSE.txt');shutil.copy2(ort/'LICENSE',resources/'onnxruntime-LICENSE.txt')
subprocess.run(['python3',str(root/'scripts/make-project.py')],check=True)
