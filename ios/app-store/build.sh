#!/bin/sh
# Compile-check the modern App Store track. Does not sign, upload or publish.
set -eu
route_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ios_dir=$(CDPATH= cd -- "$route_dir/.." && pwd)
exec xcodebuild -project "$ios_dir/SayAgain.xcodeproj" -scheme SayAgain \
  -configuration Release -xcconfig "$route_dir/AppStore.xcconfig" \
  -destination 'generic/platform=iOS' -derivedDataPath "$ios_dir/build/app-store" \
  CODE_SIGNING_ALLOWED=NO "$@" build
