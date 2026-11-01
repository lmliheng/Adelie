# Custom NSIS hooks for Adelie's Windows installer. electron-builder.yml's `nsis.include` pulls
# this file in; electron-builder prepends what it was given to the generated script, so the macros
# below are defined before its own templates test for them (`!ifmacrodef customUnInstall` in
# templates/nsis/uninstaller.nsh).
#
# Why this exists: Settings › Appearance can register the app to start when the user signs in — a
# value under HKCU's Run key, written by Electron's app.setLoginItemSettings (see
# packages/desktop/src/login-item.ts). Left behind by an uninstall it points at an executable that
# is gone, so Task Manager › Startup apps keeps listing a dead entry that nothing in the product
# can remove any more. The uninstaller therefore deletes both halves of it.
#
# The value name is the app's own name as the shell sets it (app.name → "Adelie" for the release
# profile; see appIdentity in packages/desktop/src/app-identity.ts), because that literal is what
# the shell registers the entry under — the two have to stay equal. A per-machine install that
# another administrator uninstalls clears THAT account's HKCU entry rather than the one that turned
# the switch on; the entry lives in HKCU, so this is the most an uninstaller can honestly do.

!macro customUnInstall
  # The startup entry itself. Deleting a value that is not there is not an error in NSIS, which is
  # what makes this safe for the many installs that never turned the switch on.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Adelie"
  # The record Windows keeps of whether that entry is enabled or disabled (Task Manager › Startup
  # apps). Left behind, it would apply to whatever a later install registers under the same name —
  # an app that arrives already switched off in Task Manager.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Adelie"
!macroend
