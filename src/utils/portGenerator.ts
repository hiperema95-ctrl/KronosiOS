import {
  generateCMakeFiles,
  generateCurlStubFiles,
  generateEntitlementsPlist,
  generateInfoPlist,
  generateIosPlatformMm,
  generateLosslessScalerHeader,
  generateLosslessScalerMm,
  generateModManagerFiles,
  generateNfdHeader,
  generateNfdIosMm,
  generateVirtualControllerHeader,
  generateVirtualControllerMm,
} from './iosTemplates';
import {
  generateApplyIosPortScript,
  generateBuildWorkflowYaml,
  generateGitignore,
  generateLegalMd,
  generateReadmeMd,
} from './workflowTemplate';

export interface PortBuildConfig {
  upstreamRepoUrl: string;
  upstreamRef: string;
  appName: string;
  bundleId: string;
  appVersion: string;
  deploymentTarget: '17.0' | '17.4' | '18.0';
  rendererBackend: 'metal3-native' | 'moltenvk-metal3';
  secretMode: 'single-archive' | 'individual-secrets';
  buildConfiguration: 'Release' | 'RelWithDebInfo';
  targetInstaller: 'both' | 'feather' | 'livecontainer';
  enable120HzProMotion: boolean;
  enableIncreasedMemoryLimit: boolean;
  enableVirtualGamepad: boolean;
  enableDirectXisoImport: boolean;
  enableFileSharingApp: boolean;
}

export type FileCategory = 'ci' | 'script' | 'ios-native' | 'cmake' | 'docs';

export interface GeneratedRepositoryFile {
  path: string;
  title: string;
  category: FileCategory;
  language: 'yaml' | 'objc' | 'cpp' | 'xml' | 'cmake' | 'bash' | 'markdown' | 'text';
  description: string;
  content: string;
  executable?: boolean;
}

export interface ConfigValidationIssue {
  field: keyof PortBuildConfig;
  message: string;
}

export interface DlcPackDefinition {
  id: string;
  enumName: string;
  title: string;
  subtitle: string;
  targetSubDir: string;
  validationFile: string;
  sizeLabel: string;
}

export interface ModProfileEntry {
  folderName: string;
  name: string;
  author: string;
  version: string;
  enabled: boolean;
}

export interface XisoInspectionResult {
  valid: boolean;
  fileName: string;
  sizeBytes: number;
  detectedOffsetHex: string;
  formatLabel: string;
  magicMatched: boolean;
  estimatedRamFootprintMb: number;
  requiresPcExtraction: boolean;
  error?: string;
}

export const DEFAULT_BUILD_CONFIG: PortBuildConfig = {
  upstreamRepoUrl: 'https://github.com/sonicnext-dev/MarathonRecomp.git',
  upstreamRef: 'main',
  appName: 'Marathon06iOS',
  bundleId: 'com.hiperema.kronos06.ios',
  appVersion: '1.0.0',
  deploymentTarget: '17.0',
  rendererBackend: 'metal3-native',
  secretMode: 'single-archive',
  buildConfiguration: 'Release',
  targetInstaller: 'both',
  enable120HzProMotion: true,
  enableIncreasedMemoryLimit: true,
  enableVirtualGamepad: true,
  enableDirectXisoImport: true,
  enableFileSharingApp: true,
};

/**
 * Matches MarathonRecomp/install/installer.h DLC enum exactly (7 official Xbox 360 DLC packs).
 */
export const MARATHON_DLC_CATALOG: DlcPackDefinition[] = [
  {
    id: 'episode_sonic',
    enumName: 'DLC::EpisodeSonic',
    title: 'Very Hard — Sonic',
    subtitle: 'Pacchetto difficoltà Very Hard per gli stage di Sonic',
    targetSubDir: 'Documents/MarathonRecomp/dlc/episode_sonic',
    validationFile: 'download.arc',
    sizeLabel: '18.4 MB',
  },
  {
    id: 'episode_shadow',
    enumName: 'DLC::EpisodeShadow',
    title: 'Very Hard — Shadow',
    subtitle: 'Pacchetto difficoltà Very Hard per gli stage di Shadow',
    targetSubDir: 'Documents/MarathonRecomp/dlc/episode_shadow',
    validationFile: 'download.arc',
    sizeLabel: '16.9 MB',
  },
  {
    id: 'episode_silver',
    enumName: 'DLC::EpisodeSilver',
    title: 'Very Hard — Silver',
    subtitle: 'Pacchetto difficoltà Very Hard per gli stage di Silver',
    targetSubDir: 'Documents/MarathonRecomp/dlc/episode_silver',
    validationFile: 'download.arc',
    sizeLabel: '15.2 MB',
  },
  {
    id: 'episode_amigo',
    enumName: 'DLC::EpisodeAmigo',
    title: 'Team Attack Amigo',
    subtitle: 'Modalità speciale con tutti gli Amigo giocabili in sequenza',
    targetSubDir: 'Documents/MarathonRecomp/dlc/episode_amigo',
    validationFile: 'download.arc',
    sizeLabel: '22.1 MB',
  },
  {
    id: 'mission_sonic',
    enumName: 'DLC::MissionSonic',
    title: 'Boss Attack — Sonic',
    subtitle: 'Sfida Boss Attack dedicata alla campagna di Sonic',
    targetSubDir: 'Documents/MarathonRecomp/dlc/mission_sonic',
    validationFile: 'download.arc',
    sizeLabel: '9.6 MB',
  },
  {
    id: 'mission_shadow',
    enumName: 'DLC::MissionShadow',
    title: 'Boss Attack — Shadow',
    subtitle: 'Sfida Boss Attack dedicata alla campagna di Shadow',
    targetSubDir: 'Documents/MarathonRecomp/dlc/mission_shadow',
    validationFile: 'download.arc',
    sizeLabel: '9.4 MB',
  },
  {
    id: 'mission_silver',
    enumName: 'DLC::MissionSilver',
    title: 'Boss Attack — Silver',
    subtitle: 'Sfida Boss Attack dedicata alla campagna di Silver',
    targetSubDir: 'Documents/MarathonRecomp/dlc/mission_silver',
    validationFile: 'download.arc',
    sizeLabel: '8.9 MB',
  },
];

export const DEFAULT_MOD_PROFILES: ModProfileEntry[] = [
  {
    folderName: 'LegacyOfSolaris_HD_UI',
    name: 'HD HUD & Prompts (Xbox 360)',
    author: 'Community',
    version: '1.2.0',
    enabled: true,
  },
  {
    folderName: 'RestoreOriginalLighting',
    name: 'Soleanna Lighting Tweaks',
    author: 'Community',
    version: '1.0.4',
    enabled: false,
  },
  {
    folderName: 'SkipIntroLogos',
    name: 'Fast Boot & Skip Intro',
    author: 'Community',
    version: '1.0.0',
    enabled: true,
  },
];

export const XBOX360_XISO_OFFSETS = [
  { offset: 0x00000000, hex: '0x00000000', label: 'XISO Compatto / Redump Stripped' },
  { offset: 0x0000fb20, hex: '0x0000FB20', label: 'Xbox 360 XGD3 (Offset FB20)' },
  { offset: 0x00020600, hex: '0x00020600', label: 'Xbox 360 XGD2/XGD3 Variant' },
  { offset: 0x02080000, hex: '0x02080000', label: 'Xbox 360 XGD3 Full Dump' },
  { offset: 0x0fd90000, hex: '0x0FD90000', label: 'Xbox 360 XGD2 Full Redump ISO' },
] as const;

export const XISO_MAGIC = 'MICROSOFT*XBOX*MEDIA';

/**
 * Validates PortBuildConfig fields before export or CI generation.
 */
export function validateBuildConfig(config: PortBuildConfig): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];

  if (!config.appName.trim() || !/^[A-Za-z0-9][A-Za-z0-9 _-]{1,30}$/.test(config.appName.trim())) {
    issues.push({
      field: 'appName',
      message: 'Il nome app deve contenere 2-31 caratteri alfanumerici (senza simboli speciali).',
    });
  }

  if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+){2,}$/.test(config.bundleId.trim())) {
    issues.push({
      field: 'bundleId',
      message: 'Bundle ID non valido (esempio corretto: com.hiperema.kronos06.ios).',
    });
  }

  if (!/^\d+\.\d+\.\d+$/.test(config.appVersion.trim())) {
    issues.push({
      field: 'appVersion',
      message: 'Usa una versione semantica X.Y.Z (es. 1.0.0).',
    });
  }

  if (!config.upstreamRepoUrl.startsWith('https://github.com/')) {
    issues.push({
      field: 'upstreamRepoUrl',
      message: 'Inserisci un URL GitHub HTTPS valido (es. https://github.com/sonicnext-dev/MarathonRecomp.git).',
    });
  }

  if (!config.upstreamRef.trim()) {
    issues.push({
      field: 'upstreamRef',
      message: 'Specifica un branch o tag upstream (es. main o v1.0.0).',
    });
  }

  return issues;
}

/**
 * Inspects an Xbox 360 .xiso / .iso candidate (either real header bytes or simulated preset)
 * matching our streaming pread() ISOFileSystem logic.
 */
export function inspectXisoCandidate(input: {
  fileName: string;
  sizeBytes: number;
  headerSample?: Uint8Array;
  presetOffsetIndex?: number;
}): XisoInspectionResult {
  const lower = input.fileName.toLowerCase();
  const hasValidExt = lower.endsWith('.xiso') || lower.endsWith('.iso');

  if (!hasValidExt) {
    return {
      valid: false,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      detectedOffsetHex: 'N/A',
      formatLabel: 'Formato non supportato',
      magicMatched: false,
      estimatedRamFootprintMb: 0,
      requiresPcExtraction: false,
      error: 'Seleziona un file .xiso o .iso Xbox 360 (i DLC vanno inseriti nello step separato).',
    };
  }

  // Real byte inspection if caller passed a header buffer (>= 32*2048 + 20 bytes)
  if (input.headerSample && input.headerSample.length >= 65556) {
    const decoder = new TextDecoder('ascii');
    const sector32 = decoder.decode(input.headerSample.subarray(32 * 2048, 32 * 2048 + 20));
    const matched = sector32 === XISO_MAGIC;
    return {
      valid: matched,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      detectedOffsetHex: matched ? '0x00000000' : 'Non trovato nei primi 128 KB',
      formatLabel: matched ? 'XISO Compatto (Magic Verificato)' : 'Offset XGD2/XGD3 o immagine non valida',
      magicMatched: matched,
      estimatedRamFootprintMb: 3.4,
      requiresPcExtraction: false,
      error: matched
        ? undefined
        : 'Firma MICROSOFT*XBOX*MEDIA non trovata a 0x10000 (su iOS il lettore pread scansiona tutti e 5 gli offset).',
    };
  }

  const idx = input.presetOffsetIndex ?? 0;
  const preset = XBOX360_XISO_OFFSETS[idx] ?? XBOX360_XISO_OFFSETS[0];

  return {
    valid: true,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    detectedOffsetHex: preset.hex,
    formatLabel: preset.label,
    magicMatched: true,
    estimatedRamFootprintMb: 3.4,
    requiresPcExtraction: false,
  };
}

export interface GoogleDriveConversionResult {
  valid: boolean;
  fileId: string | null;
  directUrl: string | null;
  error?: string;
}

/**
 * Converts a Google Drive share/view/uc URL into a direct download URL suitable for
 * curl inside GitHub Actions Secrets (bypasses the Drive HTML preview & scan interstitial).
 */
export function convertGoogleDriveUrl(rawUrl: string): GoogleDriveConversionResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      fileId: null,
      directUrl: null,
      error: 'Incolla un link di condivisione Google Drive (es. https://drive.google.com/file/d/FILE_ID/view?usp=sharing).',
    };
  }

  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
    /drive\.usercontent\.google\.com\/download\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match?.[1]) {
      const fileId = match[1];
      return {
        valid: true,
        fileId,
        directUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
      };
    }
  }

  return {
    valid: false,
    fileId: null,
    directUrl: null,
    error: 'ID file Google Drive non trovato. Usa un link del tipo https://drive.google.com/file/d/ID_FILE/view?usp=sharing.',
  };
}

/**
 * Generates MarathonRecomp compatible profiles.json & Default.json for iOS Mod Manager.
 */
export function generateModProfileJson(mods: ModProfileEntry[]): {
  profilesJson: string;
  defaultProfileJson: string;
} {
  const profilesObj = {
    ProfileIndex: 0,
    ProfilesList: [
      {
        Name: 'Default',
        Filename: 'Default.json',
      },
    ],
  };

  const defaultObj = {
    EnabledMods: mods.filter((m) => m.enabled).map((m) => m.folderName),
  };

  return {
    profilesJson: JSON.stringify(profilesObj, null, 2),
    defaultProfileJson: JSON.stringify(defaultObj, null, 2),
  };
}

/**
 * Generates the entire clean-room iOS Port overlay repository for sonicnext-dev/MarathonRecomp v1.0.0.
 */
export function generatePortRepository(config: PortBuildConfig): GeneratedRepositoryFile[] {
  const { marathonIosCmake, iosPortTargetCmake } = generateCMakeFiles(config);
  const { header: modMgrH, mm: modMgrMm } = generateModManagerFiles();
  const { header: curlH, mm: curlMm } = generateCurlStubFiles();

  return [
    {
      path: '.github/workflows/build-ios-ipa.yml',
      title: 'GitHub Actions Cloud Builder (.ipa)',
      category: 'ci',
      language: 'yaml',
      description:
        'Compila MarathonRecomp v1.0.0 per iOS arm64 su runner macOS-15 senza Mac, con audit copyright e download effimero via Secrets.',
      content: generateBuildWorkflowYaml(config),
    },
    {
      path: 'scripts/apply_ios_port.sh',
      title: 'Patcher Clean-Room v1.0.0',
      category: 'script',
      language: 'bash',
      executable: true,
      description:
        'Applica le patch iOS su MarathonRecomp v1.0.0: FreeType/FFmpeg/NFD/CURL, XISO streaming pread(), launcher XISO diretto + DLC separati, Metal iOS SDK e SDL_main.',
      content: generateApplyIosPortScript(config),
    },
    {
      path: 'ios/nfd_ios.mm',
      title: 'iOS Files Picker (XISO Diretto + DLC)',
      category: 'ios-native',
      language: 'objc',
      description:
        'Bridge UIDocumentPickerViewController stile edgyios: selezione diretta .xiso/.iso senza scompattazione + multi-selezione separata per i 7 DLC.',
      content: generateNfdIosMm(config),
    },
    {
      path: 'ios/include/nfd.h',
      title: 'Header NFD-Extended iOS',
      category: 'ios-native',
      language: 'cpp',
      description:
        'API C compatibili con MarathonRecomp/ui/installer_wizard.cpp (inclusi NFD_OpenDialogMultipleN e PathSet per DLC).',
      content: generateNfdHeader(),
    },
    {
      path: 'ios/curl_ios_stub.mm',
      title: 'Layer libcurl -> NSURLSession iOS',
      category: 'ios-native',
      language: 'objc',
      description:
        'Sostituisce libcurl desktop con NSURLSession nativo iOS per UpdateChecker e sostituisce std::system() con UIApplication openURL.',
      content: curlMm,
    },
    {
      path: 'ios/include/curl/curl.h',
      title: 'Header libcurl Compat iOS',
      category: 'ios-native',
      language: 'cpp',
      description:
        'Header compatibile curl/curl.h richiesto da MarathonRecomp/install/update_checker.cpp su iOS.',
      content: curlH,
    },
    {
      path: 'ios/os/ios_platform.mm',
      title: 'Layer OS Nativo iOS',
      category: 'ios-native',
      language: 'objc',
      description:
        'Implementa locale ShiftJIS (CoreFoundation), logger os_log, AVAudioSession, Documents/MarathonRecomp e UIUserInterfaceStyle.',
      content: generateIosPlatformMm(),
    },
    {
      path: 'ios/ios_virtual_controller.mm',
      title: 'Virtual Controller Soleanna + CoreHaptics',
      category: 'ios-native',
      language: 'objc',
      description:
        'Controller touch vettoriale Xbox 360 (CoreGraphics) con CoreHaptics rumble, Quick-HUD e auto-hide su controller fisici MFi/DualSense/Xbox.',
      content: generateVirtualControllerMm(config),
    },
    {
      path: 'ios/include/ios_virtual_controller.h',
      title: 'Header Virtual Controller',
      category: 'ios-native',
      language: 'cpp',
      description: 'Interfaccia C/C++ atomica per stato gamepad touch e forwarding rumble XInput.',
      content: generateVirtualControllerHeader(),
    },
    {
      path: 'ios/ios_mod_manager.mm',
      title: 'Mod Manager Nativo UIKit',
      category: 'ios-native',
      language: 'objc',
      description: 'Foglio nativo UIKit per attivare/disattivare mod in Documents/MarathonRecomp/mods.',
      content: modMgrMm,
    },
    {
      path: 'ios/include/ios_mod_manager.h',
      title: 'Header Mod Manager',
      category: 'ios-native',
      language: 'cpp',
      description: 'Entry point C per aprire il Mod Manager iOS dal Quick-HUD.',
      content: modMgrH,
    },
    {
      path: 'ios/ios_lossless_scaler.mm',
      title: 'Motore Lossless Scaling Metal (RCAS + Optical-Flow FG)',
      category: 'ios-native',
      language: 'objc',
      description:
        'Shader Metal 3 nativi: upscaling spaziale + RCAS anti-ringing e Frame Generation optical-flow 2x (60->120) / 3x (40->120) / 2x Eco (30->60) su CADisplayLink ProMotion.',
      content: generateLosslessScalerMm(),
    },
    {
      path: 'ios/include/ios_lossless_scaler.h',
      title: 'Header Lossless Scaling Metal',
      category: 'ios-native',
      language: 'cpp',
      description:
        'API C per Lossless Upscaling (Quality/Balanced/Performance), Optical-Flow Frame Generation (2x/3x/2x Eco) e telemetria FPS effettivi.',
      content: generateLosslessScalerHeader(),
    },
    {
      path: 'ios/Info.plist',
      title: 'iOS Bundle Info.plist',
      category: 'ios-native',
      language: 'xml',
      description:
        'Metadata app universale iPhone+iPad, 120Hz ProMotion, App File sharing e dichiarazione UTType per file .xiso/.iso.',
      content: generateInfoPlist(config),
    },
    {
      path: 'ios/Entitlements.plist',
      title: 'iOS Memory Entitlements',
      category: 'ios-native',
      language: 'xml',
      description:
        'Entitlements increased-memory-limit ed extended-virtual-addressing per spazio indirizzi Xbox 360.',
      content: generateEntitlementsPlist(config),
    },
    {
      path: 'cmake/MarathonRecompIOS.cmake',
      title: 'Toolchain CMake iOS arm64',
      category: 'cmake',
      language: 'cmake',
      description:
        'Configura flag -fPIC -Wl,-pie (Feather + LiveContainer), framework Apple, FFmpeg XMA statico e FreeType.',
      content: marathonIosCmake,
    },
    {
      path: 'cmake/iOSPortTarget.cmake',
      title: 'Target Helper CMake',
      category: 'cmake',
      language: 'cmake',
      description: 'Collega il target MarathonRecomp al bundle .app, Info.plist, Entitlements e librerie iOS.',
      content: iosPortTargetCmake,
    },
    {
      path: '.gitignore',
      title: 'Protezione Copyright .gitignore',
      category: 'docs',
      language: 'text',
      description:
        'Blocca esplicitamente *.xex, *.xbe, *.iso, *.xiso, shader.arc, shader_lt.arc e cartelle private/ su repo pubblico.',
      content: generateGitignore(),
    },
    {
      path: 'README.md',
      title: 'Documentazione Porting (README)',
      category: 'docs',
      language: 'markdown',
      description: 'Guida completa a Cloud Build GitHub Actions, Secrets, XISO diretto, DLC separati e sideload.',
      content: generateReadmeMd(config),
    },
    {
      path: 'LEGAL.md',
      title: 'Conformità Legale (LEGAL)',
      category: 'docs',
      language: 'markdown',
      description: 'Policy Zero Copyrighted Assets e licenze upstream per repository pubblico GitHub.',
      content: generateLegalMd(config),
    },
  ];
}
