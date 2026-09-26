#!/usr/bin/env python3
import pathlib, plistlib, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
def uid(s):return hashlib.sha1(s.encode()).hexdigest()[:24].upper()
objects=[]
def obj(name,body):objects.append(f'{uid(name)} = {{ {body} }};');return uid(name)
files=[]; builds=[]
for file in ['App.swift','Model.swift','API.swift','VoiceRecorder.swift','TextModelAPI.swift','InferenceKeys.swift','QwenAccounts.swift','QwenAccountSettings.swift','QwenTTS.swift','Preferences.swift','Appearance.swift','SpeechPanel.swift','Waveform.swift','LocalASR.swift','NativeASR/LocalASRBridge.mm']:
 filetype='sourcecode.cpp.objcpp' if file.endswith('.mm') else 'sourcecode.swift'
 f=obj(file,f'isa = PBXFileReference; lastKnownFileType = {filetype}; path = SayAgain/{file}; sourceTree = "<group>";')
 files.append(f);builds.append(obj(file+'build',f'isa = PBXBuildFile; fileRef = {f};'))
assets=obj('assets','isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = SayAgain/Assets.xcassets; sourceTree = "<group>";')
assetbuild=obj('assetbuild',f'isa = PBXBuildFile; fileRef = {assets};')
launch=obj('launch','isa = PBXFileReference; lastKnownFileType = file.storyboard; path = SayAgain/LaunchScreen.storyboard; sourceTree = "<group>";')
launchbuild=obj('launchbuild',f'isa = PBXBuildFile; fileRef = {launch};')
asr=obj('asr-model','isa = PBXFileReference; lastKnownFileType = folder; path = SayAgain/LocalASRResources; sourceTree = "<group>";')
asrbuild=obj('asr-model-build',f'isa = PBXBuildFile; fileRef = {asr};')
resources=obj('resources',f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({assetbuild},{launchbuild},{asrbuild}); runOnlyForDeploymentPostprocessing = 0;')
ort=obj('ort-framework','isa = PBXFileReference; lastKnownFileType = wrapper.framework; path = SayAgain/NativeASR/onnxruntime.framework; sourceTree = "<group>";')
ortlink=obj('ort-link',f'isa = PBXBuildFile; fileRef = {ort};')
ortembed=obj('ort-embed',f'isa = PBXBuildFile; fileRef = {ort}; settings = {{ATTRIBUTES = (CodeSignOnCopy, RemoveHeadersOnCopy);}};')
embed=obj('embed-frameworks',f'isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 10; files = ({ortembed}); name = "Embed Frameworks"; runOnlyForDeploymentPostprocessing = 0;')
files.extend([assets,launch,asr,ort])
product=obj('product','isa = PBXFileReference; explicitFileType = wrapper.application; path = SayAgain.app; sourceTree = BUILT_PRODUCTS_DIR;')
group=obj('group',f'isa = PBXGroup; children = ({",".join(files+[product])}); sourceTree = "<group>";')
source=obj('sources',f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(builds)}); runOnlyForDeploymentPostprocessing = 0;')
frameworks=obj('frameworks',f'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ({ortlink}); runOnlyForDeploymentPostprocessing = 0;')
native_settings='CLANG_ENABLE_OBJC_ARC = YES; CLANG_CXX_LANGUAGE_STANDARD = "c++17"; SWIFT_OBJC_BRIDGING_HEADER = "SayAgain/NativeASR/LocalASRBridge.h"; HEADER_SEARCH_PATHS = "$(SRCROOT)/SayAgain/NativeASR/include"; LIBRARY_SEARCH_PATHS = "$(SRCROOT)/SayAgain/NativeASR/lib"; FRAMEWORK_SEARCH_PATHS = "$(SRCROOT)/SayAgain/NativeASR"; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks"; OTHER_LDFLAGS = ("-lc++", "-lSayAgainASR", "-framework", "Accelerate", "-weak_framework", "CoreML");'
settings=native_settings+'ALWAYS_SEARCH_USER_PATHS = NO; SWIFT_VERSION = 5.0; IPHONEOS_DEPLOYMENT_TARGET = 12.0; SDKROOT = iphoneos; TARGETED_DEVICE_FAMILY = "1,2"; SAYAGAIN_BUNDLE_IDENTIFIER = com.hotpoor.sayagain.ipad; PRODUCT_BUNDLE_IDENTIFIER = "$(SAYAGAIN_BUNDLE_IDENTIFIER)"; ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; PRODUCT_NAME = SayAgain; INFOPLIST_FILE = SayAgain/Info.plist; CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = K9XXFUT37X; ENABLE_BITCODE = NO; SWIFT_OPTIMIZATION_LEVEL = "-Onone";'
configs=[obj(c,f'isa = XCBuildConfiguration; name = {c}; buildSettings = {{{settings}}};') for c in ['Debug','Release']]
configlist=obj('configs',f'isa = XCConfigurationList; buildConfigurations = ({",".join(configs)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
target=obj('target',f'isa = PBXNativeTarget; buildConfigurationList = {configlist}; buildPhases = ({source},{frameworks},{resources},{embed}); buildRules = (); dependencies = (); name = SayAgain; productName = SayAgain; productReference = {product}; productType = "com.apple.product-type.application";')
testfile=obj('testfile','isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SayAgainUITests/SmokeTests.swift; sourceTree = "<group>";')
testbuild=obj('testbuild',f'isa = PBXBuildFile; fileRef = {testfile};')
testproduct=obj('testproduct','isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = SayAgainUITests.xctest; sourceTree = BUILT_PRODUCTS_DIR;')
testsources=obj('testsources',f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({testbuild}); runOnlyForDeploymentPostprocessing = 0;')
testsettings='ALWAYS_SEARCH_USER_PATHS = NO; SWIFT_VERSION = 5.0; IPHONEOS_DEPLOYMENT_TARGET = 12.0; SDKROOT = iphoneos; TARGETED_DEVICE_FAMILY = "1,2"; PRODUCT_BUNDLE_IDENTIFIER = com.hotpoor.sayagain.ipad.uitests; PRODUCT_NAME = SayAgainUITests; GENERATE_INFOPLIST_FILE = YES; CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = K9XXFUT37X; TEST_TARGET_NAME = SayAgain;'
testconfigs=[obj('test'+c,f'isa = XCBuildConfiguration; name = {c}; buildSettings = {{{testsettings}}};') for c in ['Debug','Release']]
testconfiglist=obj('testconfigs',f'isa = XCConfigurationList; buildConfigurations = ({",".join(testconfigs)}); defaultConfigurationName = Debug; defaultConfigurationIsVisible = 0;')
proxy=obj('proxy',f'isa = PBXContainerItemProxy; containerPortal = {uid("project")}; proxyType = 1; remoteGlobalIDString = {target}; remoteInfo = SayAgain;')
dep=obj('dependency',f'isa = PBXTargetDependency; target = {target}; targetProxy = {proxy};')
testtarget=obj('testtarget',f'isa = PBXNativeTarget; buildConfigurationList = {testconfiglist}; buildPhases = ({testsources}); buildRules = (); dependencies = ({dep}); name = SayAgainUITests; productName = SayAgainUITests; productReference = {testproduct}; productType = "com.apple.product-type.bundle.ui-testing";')
proj=obj('project',f'isa = PBXProject; attributes = {{LastUpgradeCheck = 1320;}}; buildConfigurationList = {configlist}; compatibilityVersion = "Xcode 12.0"; developmentRegion = en; knownRegions = (en,Base); mainGroup = {group}; projectDirPath = ""; projectRoot = ""; targets = ({target},{testtarget});')
p=root/'SayAgain.xcodeproj';p.mkdir(exist_ok=True)
(p/'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 54; objects = {'+'\n'.join(objects)+'}; rootObject = '+proj+';}\n')
info={'CFBundleDisplayName':'SayAgain','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleName':'SayAgain','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.1.0','CFBundleVersion':'1','LSRequiresIPhoneOS':True,'UILaunchStoryboardName':'LaunchScreen','UIRequiresFullScreen':True,'UIUserInterfaceStyle':'Light','UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'NSMicrophoneUsageDescription':'录制练习与音色参考，录音默认只保存到这台 iPad。','UIFileSharingEnabled':True,'LSSupportsOpeningDocumentsInPlace':True,'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True},'UIRequiredDeviceCapabilities':['arm64']}
(root/'SayAgain/Info.plist').write_bytes(plistlib.dumps(info))
schemes=p/'xcshareddata/xcschemes'; schemes.mkdir(parents=True,exist_ok=True)
ref=f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="SayAgain.app" BlueprintName="SayAgain" ReferencedContainer="container:SayAgain.xcodeproj"/>'
tref=f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{testtarget}" BuildableName="SayAgainUITests.xctest" BlueprintName="SayAgainUITests" ReferencedContainer="container:SayAgain.xcodeproj"/>'
(schemes/'SayAgain.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="1320" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{ref}</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{tref}</TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref}</BuildableProductRunnable></LaunchAction></Scheme>''')
print(p)
