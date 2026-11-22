import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUILD_CONFIG,
  DEFAULT_MOD_PROFILES,
  MARATHON_DLC_CATALOG,
  XISO_MAGIC,
  generateModProfileJson,
  generatePortRepository,
  inspectXisoCandidate,
  validateBuildConfig,
} from './portGenerator';
import { buildZipBytes, computeCrc32 } from './zipBuilder';

test('DEFAULT_BUILD_CONFIG passes validation with zero issues', () => {
  const issues = validateBuildConfig(DEFAULT_BUILD_CONFIG);
  assert.equal(issues.length, 0);
});

test('validateBuildConfig flags invalid bundle ID, app version, and non-GitHub URL', () => {
  const issues = validateBuildConfig({
    ...DEFAULT_BUILD_CONFIG,
    appName: '!',
    bundleId: 'invalid_bundle',
    appVersion: 'v1',
    upstreamRepoUrl: 'http://example.com/repo',
    upstreamRef: '',
  });
  assert.equal(issues.length, 5);
  assert.ok(issues.some((i) => i.field === 'bundleId'));
  assert.ok(issues.some((i) => i.field === 'appVersion'));
});

test('generatePortRepository creates all required clean-room overlay files for MarathonRecomp v1.0.0', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const paths = new Set(files.map((f) => f.path));

  const expected = [
    '.github/workflows/build-ios-ipa.yml',
    'scripts/apply_ios_port.sh',
    'ios/nfd_ios.mm',
    'ios/include/nfd.h',
    'ios/os/ios_platform.mm',
    'ios/ios_virtual_controller.mm',
    'ios/include/ios_virtual_controller.h',
    'ios/ios_mod_manager.mm',
    'ios/include/ios_mod_manager.h',
    'ios/Info.plist',
    'ios/Entitlements.plist',
    'cmake/MarathonRecompIOS.cmake',
    'cmake/iOSPortTarget.cmake',
    '.gitignore',
    'README.md',
    'LEGAL.md',
  ];

  for (const exp of expected) {
    assert.ok(paths.has(exp), `Missing expected generated file: ${exp}`);
  }
});

test('config updates propagate dynamically into Info.plist, workflow YAML, and CMake', () => {
  const custom = {
    ...DEFAULT_BUILD_CONFIG,
    appName: 'Sonic06Mobile',
    bundleId: 'com.hiperema.sonic06mobile.app',
    deploymentTarget: '18.0' as const,
    secretMode: 'individual-secrets' as const,
    rendererBackend: 'moltenvk-metal3' as const,
  };
  const files = generatePortRepository(custom);
  const plist = files.find((f) => f.path === 'ios/Info.plist')!.content;
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;
  const cmake = files.find((f) => f.path === 'cmake/MarathonRecompIOS.cmake')!.content;

  assert.match(plist, /com\.hiperema\.sonic06mobile\.app/);
  assert.match(plist, /<string>18\.0<\/string>/);
  assert.match(workflow, /DEFAULT_XEX_URL/);
  assert.match(workflow, /SHADER_ARC_URL/);
  assert.match(workflow, /SHADER_LT_ARC_URL/);
  assert.match(workflow, /MoltenVK-ios\.tar/);
  assert.match(cmake, /MARATHON_IOS_MOLTENVK=1/);
});

test('generated .gitignore and workflow strictly block copyrighted binaries on public repo', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const gitignore = files.find((f) => f.path === '.gitignore')!.content;
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;

  for (const token of ['*.xex', '*.xbe', '*.iso', '*.xiso', 'shader.arc', 'shader_lt.arc']) {
    assert.ok(gitignore.includes(token), `.gitignore missing copyright guard for ${token}`);
  }
  assert.match(workflow, /Audit Sicurezza Repo Pubblico/);
  assert.match(workflow, /rm -rf "\$\{GITHUB_WORKSPACE\}\/MarathonRecomp-Upstream\/MarathonRecompLib\/private"/);
});

test('generated apply_ios_port.sh and nfd_ios.mm implement direct XISO streaming and separate DLC mode', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const nfd = files.find((f) => f.path === 'ios/nfd_ios.mm')!.content;

  assert.match(patcher, /MARATHON_IOS_STREAMING_XISO/);
  assert.match(patcher, /MICROSOFT\*XBOX\*MEDIA/);
  assert.match(patcher, /MARATHON_IOS_PICKER_MODE_GAME_XISO/);
  assert.match(patcher, /MARATHON_IOS_PICKER_MODE_DLC_SEPARATE/);
  assert.match(nfd, /ScanLocalXisoCandidates/);
  assert.match(nfd, /NFD_OpenDialogMultipleN/);
});

test('inspectXisoCandidate validates extensions and detects real MICROSOFT*XBOX*MEDIA magic', () => {
  const invalid = inspectXisoCandidate({ fileName: 'game.zip', sizeBytes: 1024 });
  assert.equal(invalid.valid, false);

  const buf = new Uint8Array(32 * 2048 + 64);
  const magicBytes = new TextEncoder().encode(XISO_MAGIC);
  buf.set(magicBytes, 32 * 2048);

  const validReal = inspectXisoCandidate({
    fileName: 'Sonic06_USA.xiso',
    sizeBytes: 6_800_000_000,
    headerSample: buf,
  });
  assert.equal(validReal.valid, true);
  assert.equal(validReal.magicMatched, true);
  assert.equal(validReal.requiresPcExtraction, false);
  assert.equal(validReal.detectedOffsetHex, '0x00000000');
});

test('MARATHON_DLC_CATALOG covers all 7 official Xbox 360 DLC packs and generateModProfileJson filters enabled mods', () => {
  assert.equal(MARATHON_DLC_CATALOG.length, 7);
  const { profilesJson, defaultProfileJson } = generateModProfileJson(DEFAULT_MOD_PROFILES);
  const parsedProfiles = JSON.parse(profilesJson);
  const parsedDefault = JSON.parse(defaultProfileJson);

  assert.equal(parsedProfiles.ProfileIndex, 0);
  assert.deepEqual(parsedDefault.EnabledMods, ['LegacyOfSolaris_HD_UI', 'SkipIntroLogos']);
});

test('buildZipBytes produces valid PKZIP archive with expected CRC32 and signatures', () => {
  assert.equal(computeCrc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const zipBytes = buildZipBytes(
    files.map((f) => ({ path: f.path, content: f.content, executable: f.executable }))
  );

  // Local file header signature PK\x03\x04
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);

  // EOCD signature PK\x05\x06 at end - 22
  const eocdOffset = zipBytes.length - 22;
  assert.equal(zipBytes[eocdOffset], 0x50);
  assert.equal(zipBytes[eocdOffset + 1], 0x4b);
  assert.equal(zipBytes[eocdOffset + 2], 0x05);
  assert.equal(zipBytes[eocdOffset + 3], 0x06);

  // Entry count matches generated files
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(view.getUint16(eocdOffset + 10, true), files.length);
});
