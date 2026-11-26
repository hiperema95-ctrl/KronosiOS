/**
 * Generates the No-Mac GitHub Actions workflow (.github/workflows/build-ios-ipa.yml),
 * the clean-room patcher (scripts/apply_ios_port.sh), .gitignore copyright guard,
 * README.md, and LEGAL.md for sonicnext-dev/MarathonRecomp v1.0.0 on iOS.
 */

export interface WorkflowTemplateParams {
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
}

export function generateGitignore(): string {
  return `# Node / Web Studio
node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*
!.env.example

# Copyright & Binary Protection (Public Repo Safety Guard)
# NEVER commit copyrighted Xbox 360 / SEGA / Sonic Team files!
*.xex
*.xbe
*.iso
*.xiso
*.arc
*.xcp
*.stfs
*.ipa
*.app/
*.dSYM/
default.xex
default.xbe
shader.arc
shader_lt.arc
private/
**/private/*
!**/private/.gitkeep

# Local build & upstream working directories
MarathonRecomp-Upstream/
build-host/
build-ios/
ios-deps/
out/
`;
}

export function generateBuildWorkflowYaml(p: WorkflowTemplateParams): string {
  const driveHelper = `          download_ephemeral() {
            local RAW_URL="$1"
            local OUT_FILE="$2"
            local DL_URL="\${RAW_URL}"
            # Converte automaticamente link Google Drive (/file/d/ID/view o uc?id=ID) in link diretto con confirm=t
            if echo "\${RAW_URL}" | grep -qE "drive\\.google\\.com|drive\\.usercontent\\.google\\.com"; then
              local GID=""
              GID="\$(echo "\${RAW_URL}" | sed -nE 's#.*drive\\.google\\.com/file/d/([a-zA-Z0-9_-]+).*#\\1#p')"
              if [ -z "\${GID}" ]; then
                GID="\$(echo "\${RAW_URL}" | sed -nE 's#.*[?&]id=([a-zA-Z0-9_-]+).*#\\1#p')"
              fi
              if [ -n "\${GID}" ]; then
                DL_URL="https://drive.usercontent.google.com/download?id=\${GID}&export=download&confirm=t"
                echo "==> Rilevato link Google Drive: normalizzato a download diretto (confirm=t)."
              fi
            fi
            curl -fSL -A "Mozilla/5.0" "\${DL_URL}" -o "\${OUT_FILE}"
            if file "\${OUT_FILE}" | grep -qi "HTML"; then
              echo "::error::Il link ha restituito una pagina HTML invece del file! Su Google Drive imposta Condividi -> 'Chiunque abbia il link' (Visualizzatore)."
              exit 1
            fi
          }`;

  const secretSection =
    p.secretMode === 'single-archive'
      ? `        env:
          SECRET_ARCHIVE_URL: \${{ secrets.GAME_FILES_ARCHIVE_URL }}
          SECRET_XEX_URL: \${{ secrets.DEFAULT_XEX_URL }}
          SECRET_SHADER_URL: \${{ secrets.SHADER_ARC_URL }}
          SECRET_SHADER_LT_URL: \${{ secrets.SHADER_LT_ARC_URL }}
          SECRET_LEGACY_XBE_URL: \${{ secrets.DEFAULT_XBE_URL }}
        run: |
${driveHelper}
          PRIVATE_DIR="\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream/MarathonRecompLib/private"
          mkdir -p "\${PRIVATE_DIR}"
          TMP_DL="\${RUNNER_TEMP}/ephemeral-game-inputs"
          mkdir -p "\${TMP_DL}"

          if [ -n "\${SECRET_ARCHIVE_URL}" ]; then
            echo "==> Download effimero archivio privato da GitHub Secret GAME_FILES_ARCHIVE_URL..."
            download_ephemeral "\${SECRET_ARCHIVE_URL}" "\${TMP_DL}/inputs.archive"
            if file "\${TMP_DL}/inputs.archive" | grep -qi "zip"; then
              unzip -o "\${TMP_DL}/inputs.archive" -d "\${TMP_DL}/extracted"
            elif file "\${TMP_DL}/inputs.archive" | grep -qiE "tar|gzip|xz|bzip2"; then
              mkdir -p "\${TMP_DL}/extracted"
              tar -xf "\${TMP_DL}/inputs.archive" -C "\${TMP_DL}/extracted"
            else
              echo "::error::Archivio non riconosciuto. Carica un .zip o .tar.gz contenente default.xex, shader.arc e shader_lt.arc."
              exit 1
            fi
            for REQ in default.xex shader.arc shader_lt.arc; do
              FOUND="\$(find "\${TMP_DL}/extracted" -iname "\${REQ}" -type f | head -n 1)"
              if [ -z "\${FOUND}" ]; then
                echo "::error::File richiesto \${REQ} mancante nell'archivio privato!"
                exit 1
              fi
              cp "\${FOUND}" "\${PRIVATE_DIR}/\${REQ}"
            done
            rm -rf "\${TMP_DL}"
          elif [ -n "\${SECRET_XEX_URL}" ] && [ -n "\${SECRET_SHADER_URL}" ] && [ -n "\${SECRET_SHADER_LT_URL}" ]; then
            echo "==> Download effimero da singoli GitHub Secrets (DEFAULT_XEX_URL, SHADER_ARC_URL, SHADER_LT_ARC_URL)..."
            download_ephemeral "\${SECRET_XEX_URL}" "\${PRIVATE_DIR}/default.xex"
            download_ephemeral "\${SECRET_SHADER_URL}" "\${PRIVATE_DIR}/shader.arc"
            download_ephemeral "\${SECRET_SHADER_LT_URL}" "\${PRIVATE_DIR}/shader_lt.arc"
          else
            if [ -n "\${SECRET_LEGACY_XBE_URL}" ]; then
              echo "::warning::Rilevato DEFAULT_XBE_URL (formato OG Xbox usato in edgyios). MarathonRecomp (Xbox 360) richiede default.xex + shader.arc + shader_lt.arc!"
            fi
            echo "::error::Configura il GitHub Secret GAME_FILES_ARCHIVE_URL (zip con default.xex, shader.arc, shader_lt.arc) oppure i 3 secret individuali!"
            exit 1
          fi
          ls -lh "\${PRIVATE_DIR}/default.xex" "\${PRIVATE_DIR}/shader.arc" "\${PRIVATE_DIR}/shader_lt.arc"`
      : `        env:
          SECRET_XEX_URL: \${{ secrets.DEFAULT_XEX_URL }}
          SECRET_SHADER_URL: \${{ secrets.SHADER_ARC_URL }}
          SECRET_SHADER_LT_URL: \${{ secrets.SHADER_LT_ARC_URL }}
          SECRET_ARCHIVE_URL: \${{ secrets.GAME_FILES_ARCHIVE_URL }}
          SECRET_LEGACY_XBE_URL: \${{ secrets.DEFAULT_XBE_URL }}
        run: |
${driveHelper}
          PRIVATE_DIR="\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream/MarathonRecompLib/private"
          mkdir -p "\${PRIVATE_DIR}"

          if [ -n "\${SECRET_XEX_URL}" ] && [ -n "\${SECRET_SHADER_URL}" ] && [ -n "\${SECRET_SHADER_LT_URL}" ]; then
            echo "==> Download effimero da GitHub Secrets (DEFAULT_XEX_URL, SHADER_ARC_URL, SHADER_LT_ARC_URL)..."
            download_ephemeral "\${SECRET_XEX_URL}" "\${PRIVATE_DIR}/default.xex"
            download_ephemeral "\${SECRET_SHADER_URL}" "\${PRIVATE_DIR}/shader.arc"
            download_ephemeral "\${SECRET_SHADER_LT_URL}" "\${PRIVATE_DIR}/shader_lt.arc"
          elif [ -n "\${SECRET_ARCHIVE_URL}" ]; then
            echo "==> Fallback su GAME_FILES_ARCHIVE_URL..."
            TMP_DL="\${RUNNER_TEMP}/ephemeral-game-inputs"
            mkdir -p "\${TMP_DL}/extracted"
            download_ephemeral "\${SECRET_ARCHIVE_URL}" "\${TMP_DL}/inputs.zip"
            unzip -o "\${TMP_DL}/inputs.zip" -d "\${TMP_DL}/extracted"
            for REQ in default.xex shader.arc shader_lt.arc; do
              FOUND="\$(find "\${TMP_DL}/extracted" -iname "\${REQ}" -type f | head -n 1)"
              cp "\${FOUND}" "\${PRIVATE_DIR}/\${REQ}"
            done
            rm -rf "\${TMP_DL}"
          else
            if [ -n "\${SECRET_LEGACY_XBE_URL}" ]; then
              echo "::warning::DEFAULT_XBE_URL è per Xbox Originale (edgyios). MarathonRecomp (Xbox 360) richiede DEFAULT_XEX_URL + SHADER_ARC_URL + SHADER_LT_ARC_URL."
            fi
            echo "::error::Imposta i GitHub Secrets DEFAULT_XEX_URL, SHADER_ARC_URL e SHADER_LT_ARC_URL (nessun file binario viene salvato nel repo pubblico)."
            exit 1
          fi
          ls -lh "\${PRIVATE_DIR}/default.xex" "\${PRIVATE_DIR}/shader.arc" "\${PRIVATE_DIR}/shader_lt.arc"`;

  const moltenVkStep =
    p.rendererBackend === 'moltenvk-metal3'
      ? `
          # Scarica MoltenVK statico iOS arm64 (modalità MoltenVK)
          mkdir -p "\${GITHUB_WORKSPACE}/ios-deps/moltenvk"
          curl -fSL "https://github.com/KhronosGroup/MoltenVK/releases/download/v1.2.11/MoltenVK-ios.tar" -o /tmp/MoltenVK-ios.tar
          tar -xf /tmp/MoltenVK-ios.tar -C "\${GITHUB_WORKSPACE}/ios-deps/moltenvk"`
      : `
          # Native Metal 3 backend tramite Plume (nessun layer MoltenVK necessario)`;

  return `name: Build ${p.appName} iOS IPA (MarathonRecomp v1.0.0)

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:
    inputs:
      build_configuration:
        description: "CMake build configuration"
        required: false
        default: "${p.buildConfiguration}"
        type: choice
        options:
          - Release
          - RelWithDebInfo
      upstream_ref:
        description: "Branch o tag di sonicnext-dev/MarathonRecomp"
        required: false
        default: "${p.upstreamRef}"
        type: string

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

env:
  IOS_DEPLOYMENT_TARGET: "${p.deploymentTarget}"
  FREETYPE_VERSION: "2.13.3"
  FFMPEG_VERSION: "7.1"
  APP_DISPLAY_NAME: "${p.appName}"
  APP_BUNDLE_ID: "${p.bundleId}"
  APP_VERSION: "${p.appVersion}"

jobs:
  build-ios-ipa:
    name: Cross-Compile iOS arm64 (.ipa)
    runs-on: macos-15
    timeout-minutes: 90

    steps:
      - name: 1. Checkout Clean-Room iOS Port Overlay
        uses: actions/checkout@v4
        with:
          path: ios-port

      - name: 2. Audit Sicurezza Repo Pubblico (Zero Copyrighted Binaries)
        run: |
          echo "==> Verifica assenza di binari Xbox 360 / SEGA nel repository pubblico..."
          FORBIDDEN="\$(find ios-port -maxdepth 5 \\( -iname '*.xex' -o -iname '*.xbe' -o -iname '*.iso' -o -iname '*.xiso' -o -iname 'shader.arc' -o -iname 'shader_lt.arc' \\) -not -path '*/.git/*')"
          if [ -n "\${FORBIDDEN}" ]; then
            echo "::error::Trovati file binari protetti da copyright nel repository pubblico:"
            echo "\${FORBIDDEN}"
            exit 1
          fi
          echo "OK: Repository 100% pulito (zero file binari protetti)."

      - name: 3. Clone Upstream sonicnext-dev/MarathonRecomp (v1.0.0 + Submodules)
        run: |
          REF="\${{ inputs.upstream_ref || '${p.upstreamRef}' }}"
          git clone --depth 1 --branch "\${REF}" --recurse-submodules --shallow-submodules \\
            "${p.upstreamRepoUrl}" MarathonRecomp-Upstream
          cd MarathonRecomp-Upstream
          git log -1 --oneline

      - name: 4. Fetch Effimero Private Build Inputs (da GitHub Secrets, mai committati)
${secretSection}

      - name: 5. Configura Xcode 16.2, Dipendenze macOS & Toolchain iOS
        run: |
          if [ -d "/Applications/Xcode_16.2.app/Contents/Developer" ]; then
            sudo xcode-select -s /Applications/Xcode_16.2.app/Contents/Developer
          fi
          xcodebuild -version
          brew install cmake ninja ldid pkg-config zstd nasm${moltenVkStep}

      - name: 6. Applica Patch Clean-Room iOS su MarathonRecomp v1.0.0
        run: |
          chmod +x ios-port/scripts/apply_ios_port.sh
          ./ios-port/scripts/apply_ios_port.sh \\
            "\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream" \\
            "\${GITHUB_WORKSPACE}/ios-port" \\
            "\${GITHUB_WORKSPACE}/ios-deps"

      - name: 7. Compila Host Tools nativi macOS arm64 (XenonRecomp, XenosRecomp iOS Metal, u8extract, file_to_c)
        working-directory: MarathonRecomp-Upstream
        env:
          VCPKG_ROOT: \${{ github.workspace }}/ios-deps/vcpkg-ios-stub
        run: |
          cmake -S . -B "\${GITHUB_WORKSPACE}/build-host" -G Ninja \\
            -DCMAKE_BUILD_TYPE=Release \\
            -DMARATHON_IOS_HOST_TOOLS_ONLY=ON \\
            -DXENOS_RECOMP_METAL_IOS=ON
          cmake --build "\${GITHUB_WORKSPACE}/build-host" \\
            --target XenonRecomp XenosRecomp u8extract file_to_c --parallel
          ls -lh "\${GITHUB_WORKSPACE}/build-host/tools/"*/* || true

      - name: 8. Cross-Compila FreeType e FFmpeg (XMA Decoder) statici per iOS arm64
        run: |
          IOS_SDK="\$(xcrun --sdk iphoneos --show-sdk-path)"
          mkdir -p "\${GITHUB_WORKSPACE}/ios-deps/freetype-src" "\${GITHUB_WORKSPACE}/ios-deps/freetype-install"
          curl -fSL "https://download.savannah.gnu.org/releases/freetype/freetype-\${FREETYPE_VERSION}.tar.gz" -o /tmp/freetype.tar.gz
          tar -xzf /tmp/freetype.tar.gz -C "\${GITHUB_WORKSPACE}/ios-deps/freetype-src" --strip-components=1

          cmake -S "\${GITHUB_WORKSPACE}/ios-deps/freetype-src" -B "\${GITHUB_WORKSPACE}/ios-deps/freetype-build" -G Ninja \\
            -DCMAKE_SYSTEM_NAME=iOS \\
            -DCMAKE_OSX_SYSROOT="\${IOS_SDK}" \\
            -DCMAKE_OSX_ARCHITECTURES=arm64 \\
            -DCMAKE_OSX_DEPLOYMENT_TARGET="\${IOS_DEPLOYMENT_TARGET}" \\
            -DCMAKE_BUILD_TYPE=Release \\
            -DBUILD_SHARED_LIBS=OFF \\
            -DFT_DISABLE_HARFBUZZ=ON -DFT_DISABLE_PNG=ON -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_BROTLI=ON \\
            -DCMAKE_INSTALL_PREFIX="\${GITHUB_WORKSPACE}/ios-deps/freetype-install"
          cmake --build "\${GITHUB_WORKSPACE}/ios-deps/freetype-build" --parallel
          cmake --install "\${GITHUB_WORKSPACE}/ios-deps/freetype-build"

          # Compila FFmpeg statico iOS arm64 (avformat, avcodec, swscale, avutil, swresample + patch XMAFRAMES di sonicnext-dev/ffmpeg-core)
          mkdir -p "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-src" "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install"
          curl -fSL "https://ffmpeg.org/releases/ffmpeg-\${FFMPEG_VERSION}.tar.xz" -o /tmp/ffmpeg.tar.xz
          tar -xf /tmp/ffmpeg.tar.xz -C "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-src" --strip-components=1
          cd "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-src"

          # Applica la patch 0008-xmaframes (AV_CODEC_ID_XMAFRAMES / ff_xmaframes_decoder) usata da MarathonRecomp/apu/xma_decoder.cpp
          python3 - << 'PY_XMAFRAMES'
          import pathlib

          def patch_once(rel_path, anchor, replacement):
              p = pathlib.Path(rel_path)
              src = p.read_text(encoding="utf-8")
              if "xmaframes" in src or "AV_CODEC_ID_XMAFRAMES" in src:
                  return
              assert anchor in src, f"Anchor not found in {rel_path}: {anchor!r}"
              p.write_text(src.replace(anchor, replacement, 1), encoding="utf-8")
              print(f"Patched {rel_path} for xmaframes decoder.")

          patch_once(
              "configure",
              'xma2_decoder_select="wmapro_decoder"',
              'xma2_decoder_select="wmapro_decoder"\\nxmaframes_decoder_select="wmapro_decoder"'
          )
          patch_once(
              "libavcodec/Makefile",
              "OBJS-\$(CONFIG_XMA2_DECODER)            += wmaprodec.o wma.o wma_common.o",
              "OBJS-\$(CONFIG_XMA2_DECODER)            += wmaprodec.o wma.o wma_common.o\\nOBJS-\$(CONFIG_XMAFRAMES_DECODER)       += wmaprodec.o wma.o wma_common.o"
          )
          patch_once(
              "libavcodec/allcodecs.c",
              "extern const FFCodec ff_xma2_decoder;",
              "extern const FFCodec ff_xma2_decoder;\\nextern const FFCodec ff_xmaframes_decoder;"
          )
          patch_once(
              "libavcodec/codec_desc.c",
              "    /* subtitle codecs */",
              """    {
                  .id        = AV_CODEC_ID_XMAFRAMES,
                  .type      = AVMEDIA_TYPE_AUDIO,
                  .name      = "xmaframes",
                  .long_name = NULL_IF_CONFIG_SMALL("Xbox Media Audio raw frames"),
                  .props     = AV_CODEC_PROP_INTRA_ONLY | AV_CODEC_PROP_LOSSY,
              },

              /* subtitle codecs */"""
          )
          patch_once(
              "libavcodec/codec_id.h",
              "    /* subtitle codecs */",
              "    AV_CODEC_ID_XMAFRAMES,\\n\\n    /* subtitle codecs */"
          )

          wma_path = pathlib.Path("libavcodec/wmaprodec.c")
          wma_src = wma_path.read_text(encoding="utf-8")
          if "AV_CODEC_ID_XMAFRAMES" not in wma_src:
              init_anchor = "    } else if (avctx->codec_id == AV_CODEC_ID_WMAPRO && avctx->extradata_size >= 18) {"
              assert init_anchor in wma_src, "decode_init anchor not found in wmaprodec.c"
              wma_src = wma_src.replace(
                  init_anchor,
                  """    } else if (avctx->codec_id == AV_CODEC_ID_XMAFRAMES) {
                  s->decode_flags    = 0x10d6;
                  s->bits_per_sample = 16;
                  channel_mask       = 0;
                  s->nb_channels     = avctx->ch_layout.nb_channels;
          """ + init_anchor,
                  1
              )
              xmaframes_impl = r"""

          static av_cold int xmaframes_decode_init(AVCodecContext* avctx)
          {
              WMAProDecodeCtx *s = avctx->priv_data;
              avctx->block_align = 2048;
              return decode_init(s, avctx, 0);
          }

          static av_cold int xmaframes_decode_end(AVCodecContext* avctx)
          {
              WMAProDecodeCtx *s = avctx->priv_data;
              decode_end(s);
              return 0;
          }

          static int xmaframes_decode_packet(AVCodecContext *avctx, AVFrame *frame,
                                             int *got_frame_ptr, AVPacket *avpkt)
          {
              WMAProDecodeCtx *s = avctx->priv_data;
              GetBitContext* gb = &s->gb;
              int ret, xma_frame_len = 0;
              uint8_t padding_start, padding_end = 0;

              if (avpkt->size < 3) {
                  av_log(avctx, AV_LOG_ERROR, "XMA Frame is too small, %d bytes\\n", avpkt->size);
                  return AVERROR_INVALIDDATA;
              }

              s->buf_bit_size = avpkt->size << 3;
              init_get_bits(gb, avpkt->data, s->buf_bit_size);

              padding_start = get_bits(gb, 3);
              padding_end = get_bits(gb, 3);
              skip_bits(gb, 2);

              skip_bits(gb, padding_start);

              xma_frame_len = show_bits(gb, s->log2_frame_size);
              if (s->buf_bit_size != 8 + padding_start + xma_frame_len + padding_end) {
                  av_log(avctx, AV_LOG_ERROR,
                         "XMA Frame sizing incorrect: %d != 8 + (%d + %d + %d)\\n",
                         s->buf_bit_size, padding_start, xma_frame_len, padding_end);
                  return AVERROR_INVALIDDATA;
              }

              save_bits(s, gb, xma_frame_len, 0);

              frame->nb_samples = s->samples_per_frame;
              if ((ret = ff_get_buffer(avctx, frame, 0)) < 0) {
                  s->packet_loss = 1;
                  return 0;
              }

              decode_frame(s, frame, got_frame_ptr);

              return avpkt->size;
          }

          const FFCodec ff_xmaframes_decoder = {
              .p.name         = "xmaframes",
              CODEC_LONG_NAME("Xbox Media Audio raw frames"),
              .p.type         = AVMEDIA_TYPE_AUDIO,
              .p.id           = AV_CODEC_ID_XMAFRAMES,
              .priv_data_size = sizeof(WMAProDecodeCtx),
              .init           = xmaframes_decode_init,
              .close          = xmaframes_decode_end,
              FF_CODEC_DECODE_CB(xmaframes_decode_packet),
              .flush          = wmapro_flush,
              .p.capabilities = AV_CODEC_CAP_DR1,
              .p.sample_fmts  = (const enum AVSampleFormat[]) { AV_SAMPLE_FMT_FLTP,
                                                                AV_SAMPLE_FMT_NONE },
              .caps_internal  = FF_CODEC_CAP_INIT_CLEANUP,
          };
          """
              wma_path.write_text(wma_src + xmaframes_impl, encoding="utf-8")
              print("Patched libavcodec/wmaprodec.c with ff_xmaframes_decoder.")
          PY_XMAFRAMES

          ./configure \\
            --prefix="\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install" \\
            --enable-cross-compile --target-os=darwin --arch=arm64 \\
            --cc="xcrun -sdk iphoneos clang" \\
            --extra-cflags="-arch arm64 -miphoneos-version-min=\${IOS_DEPLOYMENT_TARGET} -fPIC" \\
            --extra-ldflags="-arch arm64 -miphoneos-version-min=\${IOS_DEPLOYMENT_TARGET}" \\
            --disable-programs --disable-doc --disable-network --disable-everything \\
            --disable-avdevice --disable-avfilter \\
            --enable-avformat --enable-avcodec --enable-swscale --enable-avutil --enable-swresample \\
            --enable-decoder=xmaframes,xma1,xma2,wmv3,wmav2,wmapro,theora,vorbis,h264,aac,flac,opus,mp3float,pcm_s16le,pcm_s24le,pcm_f32le,pcm_s16be,adpcm_ms,mpeg4,vc1 \\
            --enable-demuxer=asf,ogg,mov,wav,flac,mp3,xmv,mpegps \\
            --enable-parser=vorbis,h264,aac,flac,opus,mpegaudio \\
            --enable-protocol=file \\
            --enable-static --disable-shared
          make -j"\$(sysctl -n hw.ncpu)"
          make install

          # Verifica archivi statici FreeType, FFmpeg e decoder XMAFRAMES pronti per Step 9
          ls -lh "\${GITHUB_WORKSPACE}/ios-deps/freetype-install/lib/libfreetype.a"
          ls -lh "\${GITHUB_WORKSPACE}/ios-deps/freetype-install/include/freetype2/ft2build.h"
          ls -lh "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install/lib/"lib*.a
          grep -q "AV_CODEC_ID_XMAFRAMES" "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install/include/libavcodec/codec_id.h"
          nm "\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install/lib/libavcodec.a" | grep -q "ff_xmaframes_decoder"
          echo "OK: AV_CODEC_ID_XMAFRAMES e ff_xmaframes_decoder verificati in libavcodec.a!"

      - name: 9. Cross-Compila MarathonRecomp v1.0.0 per iOS arm64 (${p.rendererBackend === 'metal3-native' ? 'Metal 3 Nativo' : 'MoltenVK Metal 3'})
        working-directory: MarathonRecomp-Upstream
        env:
          VCPKG_ROOT: \${{ github.workspace }}/ios-deps/vcpkg-ios-stub
        run: |
          CONFIG="\${{ inputs.build_configuration || '${p.buildConfiguration}' }}"
          IOS_SDK="\$(xcrun --sdk iphoneos --show-sdk-path)"
          FREETYPE_ROOT="\${GITHUB_WORKSPACE}/ios-deps/freetype-install"
          FFMPEG_ROOT="\${GITHUB_WORKSPACE}/ios-deps/ffmpeg-install"

          # Localizza dinamicamente i 4 host tool nativi macOS compilati allo Step 7
          HOST_XENON="\$(find "\${GITHUB_WORKSPACE}/build-host" -type f -name "XenonRecomp" -perm +111 | head -n 1)"
          HOST_XENOS="\$(find "\${GITHUB_WORKSPACE}/build-host" -type f -name "XenosRecomp" -perm +111 | head -n 1)"
          HOST_U8="\$(find "\${GITHUB_WORKSPACE}/build-host" -type f -name "u8extract" -perm +111 | head -n 1)"
          HOST_F2C="\$(find "\${GITHUB_WORKSPACE}/build-host" -type f -name "file_to_c" -perm +111 | head -n 1)"
          for BIN in "\${HOST_XENON}" "\${HOST_XENOS}" "\${HOST_U8}" "\${HOST_F2C}"; do
            if [ -z "\${BIN}" ] || [ ! -x "\${BIN}" ]; then
              echo "::error::Host tool macOS mancante in build-host! Verifica lo Step 7."
              exit 1
            fi
          done
          echo "==> Host tools rilevati:"
          echo "    XenonRecomp: \${HOST_XENON}"
          echo "    XenosRecomp: \${HOST_XENOS}"
          echo "    u8extract:   \${HOST_U8}"
          echo "    file_to_c:   \${HOST_F2C}"

          cmake -S . -B "\${GITHUB_WORKSPACE}/build-ios" -G Ninja \\
            -DCMAKE_SYSTEM_NAME=iOS \\
            -DCMAKE_OSX_SYSROOT="\${IOS_SDK}" \\
            -DCMAKE_OSX_ARCHITECTURES=arm64 \\
            -DCMAKE_OSX_DEPLOYMENT_TARGET="\${IOS_DEPLOYMENT_TARGET}" \\
            -DCMAKE_BUILD_TYPE="\${CONFIG}" \\
            -DCMAKE_FIND_ROOT_PATH="\${IOS_SDK};\${FREETYPE_ROOT};\${FFMPEG_ROOT}" \\
            -DCMAKE_FIND_ROOT_PATH_MODE_PACKAGE=BOTH \\
            -DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=BOTH \\
            -DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=BOTH \\
            -DCMAKE_FIND_ROOT_PATH_MODE_PROGRAM=NEVER \\
            -DFREETYPE_LIBRARY="\${FREETYPE_ROOT}/lib/libfreetype.a" \\
            -DFREETYPE_INCLUDE_DIRS="\${FREETYPE_ROOT}/include/freetype2" \\
            -DFREETYPE_INCLUDE_DIR_ft2build="\${FREETYPE_ROOT}/include/freetype2" \\
            -DFREETYPE_INCLUDE_DIR_freetype2="\${FREETYPE_ROOT}/include/freetype2" \\
            -DMARATHON_IOS_PORT=ON \\
            -DMARATHON_RECOMP_METAL=ON \\
            -DSDL_HIDAPI_LIBUSB=OFF \\
            -DSDL_HIDAPI_LIBUSB_SHARED=OFF \\${p.rendererBackend === 'metal3-native' ? `
            -DSDL_VULKAN=OFF \\
            -DSDL_RENDER_VULKAN=OFF \\` : ''}
            -DMARATHON_HOST_XENON_RECOMP="\${HOST_XENON}" \\
            -DMARATHON_HOST_XENOS_RECOMP="\${HOST_XENOS}" \\
            -DMARATHON_HOST_U8EXTRACT="\${HOST_U8}" \\
            -DMARATHON_HOST_FILE_TO_C="\${HOST_F2C}" \\
            -DMARATHON_IOS_FFMPEG_ROOT="\${FFMPEG_ROOT}" \\
            -DMARATHON_IOS_FREETYPE_ROOT="\${FREETYPE_ROOT}" \\
            -DCMAKE_PREFIX_PATH="\${FREETYPE_ROOT};\${FFMPEG_ROOT}"

          cmake --build "\${GITHUB_WORKSPACE}/build-ios" --target MarathonRecomp --parallel

      - name: 10. Impacchetta .ipa (${p.targetInstaller === 'both' ? 'Feather + LiveContainer' : p.targetInstaller}) & Firma Ad-Hoc (ldid)
        run: |
          OUT_DIR="\${GITHUB_WORKSPACE}/dist-ipa"
          APP_DIR="\${OUT_DIR}/Payload/MarathonRecomp.app"
          mkdir -p "\${APP_DIR}"

          BIN_PATH="\$(find "\${GITHUB_WORKSPACE}/build-ios" -type f -name "MarathonRecomp" -perm +111 | head -n 1)"
          if [ -z "\${BIN_PATH}" ]; then
            echo "::error::Binario arm64 MarathonRecomp non trovato!"
            exit 1
          fi

          cp "\${BIN_PATH}" "\${APP_DIR}/MarathonRecomp"
          chmod +x "\${APP_DIR}/MarathonRecomp"
          cp "\${GITHUB_WORKSPACE}/ios-port/ios/Info.plist" "\${APP_DIR}/Info.plist"
          plutil -replace CFBundleShortVersionString -string "\${APP_VERSION}" "\${APP_DIR}/Info.plist"
          plutil -replace CFBundleVersion -string "\${GITHUB_RUN_NUMBER:-1}" "\${APP_DIR}/Info.plist"

          # Genera icone iOS PNG + Assets.car (richiesto da Feather / SpringBoard per risoluzione nativa)
          ICON_SRC=""
          if [ -f "\${GITHUB_WORKSPACE}/ios-port/ios/AppIcon.jpg" ]; then
            ICON_SRC="\${GITHUB_WORKSPACE}/ios-port/ios/AppIcon.jpg"
          elif [ -f "\${GITHUB_WORKSPACE}/ios-port/ios/AppIcon.png" ]; then
            ICON_SRC="\${GITHUB_WORKSPACE}/ios-port/ios/AppIcon.png"
          elif [ -f "\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream/MarathonRecompResources/images/game_icon_mac.png" ]; then
            ICON_SRC="\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream/MarathonRecompResources/images/game_icon_mac.png"
          fi
          if [ -n "\${ICON_SRC}" ]; then
            ICON_TMP="/tmp/MarathonAppIconAssets/Assets.xcassets/AppIcon.appiconset"
            rm -rf /tmp/MarathonAppIconAssets
            mkdir -p "\${ICON_TMP}"
            sips -s format png -z 120 120 "\${ICON_SRC}" --out "\${APP_DIR}/AppIcon60x60@2x.png" >/dev/null
            sips -s format png -z 180 180 "\${ICON_SRC}" --out "\${APP_DIR}/AppIcon60x60@3x.png" >/dev/null
            sips -s format png -z 152 152 "\${ICON_SRC}" --out "\${APP_DIR}/AppIcon76x76@2x~ipad.png" >/dev/null
            sips -s format png -z 167 167 "\${ICON_SRC}" --out "\${APP_DIR}/AppIcon83.5x83.5@2x~ipad.png" >/dev/null
            sips -s format png -z 1024 1024 "\${ICON_SRC}" --out "\${APP_DIR}/AppIcon1024x1024.png" >/dev/null
            cp "\${APP_DIR}/AppIcon60x60@2x.png" "\${ICON_TMP}/AppIcon60x60@2x.png"
            cp "\${APP_DIR}/AppIcon60x60@3x.png" "\${ICON_TMP}/AppIcon60x60@3x.png"
            cp "\${APP_DIR}/AppIcon76x76@2x~ipad.png" "\${ICON_TMP}/AppIcon76x76@2x~ipad.png"
            cp "\${APP_DIR}/AppIcon83.5x83.5@2x~ipad.png" "\${ICON_TMP}/AppIcon83.5x83.5@2x~ipad.png"
            cp "\${APP_DIR}/AppIcon1024x1024.png" "\${ICON_TMP}/AppIcon1024x1024.png"
            cat << 'EOF_ICON_JSON' > "\${ICON_TMP}/Contents.json"
          {
            "images": [
              { "filename": "AppIcon60x60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
              { "filename": "AppIcon60x60@3x.png", "idiom": "iphone", "scale": "3x", "size": "60x60" },
              { "filename": "AppIcon76x76@2x~ipad.png", "idiom": "ipad", "scale": "2x", "size": "76x76" },
              { "filename": "AppIcon83.5x83.5@2x~ipad.png", "idiom": "ipad", "scale": "2x", "size": "83.5x83.5" },
              { "filename": "AppIcon1024x1024.png", "idiom": "ios-marketing", "scale": "1x", "size": "1024x1024" }
            ],
            "info": { "author": "xcode", "version": 1 }
          }
          EOF_ICON_JSON
            xcrun actool --compile "\${APP_DIR}" \\
              --platform iphoneos \\
              --minimum-deployment-target "\${IOS_DEPLOYMENT_TARGET}" \\
              --app-icon AppIcon \\
              --output-partial-info-plist /tmp/icon-info.plist \\
              /tmp/MarathonAppIconAssets/Assets.xcassets || true
          fi

          # Rimuovi eventuali file privati dalla VM e firme residue prima del packaging
          rm -rf "\${GITHUB_WORKSPACE}/MarathonRecomp-Upstream/MarathonRecompLib/private"
          rm -rf "\${APP_DIR}/_CodeSignature"

          # Firma ad-hoc con entitlements (Feather + LiveContainer)
          ldid -S"\${GITHUB_WORKSPACE}/ios-port/ios/Entitlements.plist" "\${APP_DIR}/MarathonRecomp"

          cd "\${OUT_DIR}"
          IPA_NAME="${p.appName}-v${p.appVersion}-iOS-arm64.ipa"
          zip -qry "\${IPA_NAME}" Payload
          ls -lh "\${IPA_NAME}"

      - name: 11. Carica Artefatto .ipa
        uses: actions/upload-artifact@v4
        with:
          name: ${p.appName}-v${p.appVersion}-iOS-arm64
          path: dist-ipa/*.ipa
          retention-days: 30
`;
}

export function generateApplyIosPortScript(p: WorkflowTemplateParams): string {
  return `#!/usr/bin/env bash
# Clean-Room iOS Port Patcher for sonicnext-dev/MarathonRecomp v1.0.0
# Architecture inspired by hiperema95-ctrl/edgyios (zero-fork overlay)
# - Direct .xiso / .iso import in SelectGame (streaming pread ISOFileSystem, no PC unpacking!)
# - Separate DLC import preserved in SelectDLC (7 official Xbox 360 DLC packs)
# - Native iOS 17+ Metal 3 AIR shader target + Plume UIWindow/CAMetalLayer bridge
# - Writable Documents/MarathonRecomp sandbox + Apple libc++ std::atomic_ref polyfill

set -euo pipefail

UPSTREAM_DIR="$1"
PORT_DIR="$2"
DEPS_DIR="$3"

echo "==> [1/8] Creazione stub VCPKG_ROOT per cross-compilazione iOS..."
mkdir -p "\${DEPS_DIR}/vcpkg-ios-stub/scripts/buildsystems"
cat << 'EOF_VCPKG' > "\${DEPS_DIR}/vcpkg-ios-stub/scripts/buildsystems/vcpkg.cmake"
# Stub vcpkg.cmake per cross-compilazione iOS arm64 su GitHub Actions
message(STATUS "MarathonRecomp iOS: utilizzo librerie statiche iOS arm64 native al posto di vcpkg desktop.")
EOF_VCPKG

echo "==> [2/8] Copia layer nativo iOS (OS, NFD Files Picker XISO/DLC, CURL NSURLSession, Controller, Mod Manager, CMake)..."
mkdir -p "\${UPSTREAM_DIR}/MarathonRecomp/os/ios"
mkdir -p "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/curl"
mkdir -p "\${UPSTREAM_DIR}/ios" "\${UPSTREAM_DIR}/cmake"

cp "\${PORT_DIR}/ios/os/ios_platform.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_platform.mm"
cp "\${PORT_DIR}/ios/nfd_ios.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/nfd_ios.mm"
cp "\${PORT_DIR}/ios/curl_ios_stub.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/curl_ios_stub.mm"
cp "\${PORT_DIR}/ios/ios_virtual_controller.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_virtual_controller.mm"
cp "\${PORT_DIR}/ios/ios_mod_manager.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_mod_manager.mm"
cp "\${PORT_DIR}/ios/ios_lossless_scaler.mm" "\${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_lossless_scaler.mm"

cp "\${PORT_DIR}/ios/include/nfd.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/nfd.h"
cp "\${PORT_DIR}/ios/include/curl/curl.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/curl/curl.h"
cp "\${PORT_DIR}/ios/include/ios_virtual_controller.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_virtual_controller.h"
cp "\${PORT_DIR}/ios/include/ios_mod_manager.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_mod_manager.h"
cp "\${PORT_DIR}/ios/include/ios_lossless_scaler.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_lossless_scaler.h"

cp "\${PORT_DIR}/ios/Info.plist" "\${UPSTREAM_DIR}/ios/Info.plist"
cp "\${PORT_DIR}/ios/Entitlements.plist" "\${UPSTREAM_DIR}/ios/Entitlements.plist"
cp "\${PORT_DIR}/cmake/MarathonRecompIOS.cmake" "\${UPSTREAM_DIR}/cmake/MarathonRecompIOS.cmake"
cp "\${PORT_DIR}/cmake/iOSPortTarget.cmake" "\${UPSTREAM_DIR}/cmake/iOSPortTarget.cmake"

echo "==> [3/8] Patch XenosRecomp AIR Compiler per target iOS Metal SDK (-sdk iphoneos -mios-version-min=${p.deploymentTarget})..."
python3 - "\${UPSTREAM_DIR}/tools/XenosRecomp/XenosRecomp/air_compiler.cpp" << 'PY_XENOS'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
if p.exists():
    src = p.read_text(encoding="utf-8")
    if "XENOS_RECOMP_METAL_IOS" not in src:
        src = src.replace(
            '"-sdk", "macosx", "metal",',
            '"-sdk", "iphoneos", "metal", "-mios-version-min=${p.deploymentTarget}",'
        )
        src = src.replace(
            '"-sdk", "macosx", "metallib",',
            '"-sdk", "iphoneos", "metallib",'
        )
        src = src.replace(
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), nullptr)',
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), environ)'
        )
        header = "// XENOS_RECOMP_METAL_IOS\\n"
        if "extern char** environ;" not in src:
            header += "#include <unistd.h>\\nextern char** environ;\\n"
        src = header + src
        p.write_text(src, encoding="utf-8")
        print("Patched XenosRecomp/air_compiler.cpp for iPhoneOS Metal SDK (metal + metallib).")
PY_XENOS

echo "==> [4/8] Patch ISOFileSystem: Streaming pread() su iOS per immagini .xiso/.iso da 6+ GB senza limiti mmap..."
python3 - "\${UPSTREAM_DIR}/MarathonRecomp/install/iso_file_system.h" "\${UPSTREAM_DIR}/MarathonRecomp/install/iso_file_system.cpp" << 'PY_ISO'
import sys, pathlib

h_path = pathlib.Path(sys.argv[1])
cpp_path = pathlib.Path(sys.argv[2])

if h_path.exists() and cpp_path.exists():
    h_src = h_path.read_text(encoding="utf-8")
    if "MARATHON_IOS_STREAMING_XISO" not in h_src:
        h_src = h_src.replace(
            "MemoryMappedFile mappedFile;",
            "#if defined(MARATHON_IOS_STREAMING_XISO) && MARATHON_IOS_STREAMING_XISO\\n"
            "    int isoFd = -1;\\n"
            "    size_t isoFileSize = 0;\\n"
            "    ~ISOFileSystem() override;\\n"
            "#else\\n"
            "    MemoryMappedFile mappedFile;\\n"
            "#endif"
        )
        h_path.write_text(h_src, encoding="utf-8")
        print("Patched iso_file_system.h for streaming pread() on iOS.")

    cpp_src = cpp_path.read_text(encoding="utf-8")
    if "MARATHON_IOS_STREAMING_XISO" not in cpp_src:
        streaming_impl = r'''
#if defined(MARATHON_IOS_STREAMING_XISO) && MARATHON_IOS_STREAMING_XISO
#include "iso_file_system.h"
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <stack>
#include <sys/stat.h>
#include <unistd.h>

static bool ReadExactAt(int fd, size_t offset, void* outBuf, size_t len) {
    uint8_t* dst = static_cast<uint8_t*>(outBuf);
    size_t done = 0;
    while (done < len) {
        ssize_t n = pread(fd, dst + done, len - done, static_cast<off_t>(offset + done));
        if (n < 0) {
            if (errno == EINTR) continue;
            return false;
        }
        if (n == 0) return false;
        done += static_cast<size_t>(n);
    }
    return true;
}

ISOFileSystem::~ISOFileSystem() {
    if (isoFd >= 0) {
        close(isoFd);
        isoFd = -1;
    }
}

ISOFileSystem::ISOFileSystem(const std::filesystem::path &isoPath) {
    isoFd = open(isoPath.c_str(), O_RDONLY);
    if (isoFd < 0) return;

    struct stat st{};
    if (fstat(isoFd, &st) != 0 || st.st_size <= 0) {
        close(isoFd);
        isoFd = -1;
        return;
    }
    isoFileSize = static_cast<size_t>(st.st_size);

    constexpr size_t XeSectorSize = 2048;
    static const size_t PossibleOffsets[] = {
        0x00000000, // Standard XISO / Redump stripped
        0x0000FB20, // XGD3 offset
        0x00020600, // XGD2 / XGD3 variant
        0x02080000, // XGD3 full dump
        0x0FD90000  // XGD2 full Redump ISO
    };
    const char RefMagic[] = "MICROSOFT*XBOX*MEDIA";
    char magicBuf[20]{};
    size_t gameOffset = 0;
    bool magicFound = false;

    for (size_t cand : PossibleOffsets) {
        size_t magicOff = cand + (32 * XeSectorSize);
        if (magicOff + 28 > isoFileSize) continue;
        if (ReadExactAt(isoFd, magicOff, magicBuf, 20) && std::memcmp(magicBuf, RefMagic, 20) == 0) {
            gameOffset = cand;
            magicFound = true;
            break;
        }
    }

    if (!magicFound) {
        close(isoFd);
        isoFd = -1;
        return;
    }

    uint32_t rootInfo[2]{};
    if (!ReadExactAt(isoFd, gameOffset + (32 * XeSectorSize) + 20, rootInfo, sizeof(rootInfo))) {
        close(isoFd);
        isoFd = -1;
        return;
    }
    uint32_t rootSector = rootInfo[0];
    uint32_t rootSize = rootInfo[1];
    if (rootSize < 13 || rootSize > 32 * 1024 * 1024) {
        close(isoFd);
        isoFd = -1;
        return;
    }

    struct Step { std::string base; size_t dirOff; size_t entryOff; };
    std::stack<Step> stack;
    stack.push({ "", gameOffset + static_cast<size_t>(rootSector) * XeSectorSize, 0 });

    while (!stack.empty()) {
        Step step = stack.top();
        stack.pop();

        uint8_t hdr[14]{};
        if (!ReadExactAt(isoFd, step.dirOff + step.entryOff, hdr, sizeof(hdr))) continue;

        uint16_t nodeL = 0, nodeR = 0;
        uint32_t sector = 0, length = 0;
        std::memcpy(&nodeL, &hdr[0], sizeof(nodeL));
        std::memcpy(&nodeR, &hdr[2], sizeof(nodeR));
        std::memcpy(&sector, &hdr[4], sizeof(sector));
        std::memcpy(&length, &hdr[8], sizeof(length));
        uint8_t attrs = hdr[12];
        uint8_t nameLen = hdr[13];

        char nameBuf[256]{};
        if (nameLen > 0 && !ReadExactAt(isoFd, step.dirOff + step.entryOff + 14, nameBuf, nameLen)) continue;
        std::string fullName = step.base + std::string(nameBuf, nameLen);

        if (nodeR != 0 && nodeR != 0xFFFF) stack.push({ step.base, step.dirOff, static_cast<size_t>(nodeR) * 4 });
        if (nodeL != 0 && nodeL != 0xFFFF) stack.push({ step.base, step.dirOff, static_cast<size_t>(nodeL) * 4 });

        if (attrs & 0x10) {
            if (length > 0) stack.push({ fullName + "/", gameOffset + static_cast<size_t>(sector) * XeSectorSize, 0 });
        } else {
            fileMap[fullName] = { gameOffset + static_cast<size_t>(sector) * XeSectorSize, static_cast<size_t>(length) };
        }
    }
    name = isoPath.filename().string();
}

bool ISOFileSystem::load(const std::string &path, uint8_t *fileData, size_t fileDataMaxByteCount) const {
    if (isoFd < 0) return false;
    auto it = fileMap.find(path);
    if (it == fileMap.end()) return false;
    size_t off = std::get<0>(it->second);
    size_t sz  = std::get<1>(it->second);
    if (sz > fileDataMaxByteCount) return false;
    return ReadExactAt(isoFd, off, fileData, sz);
}

size_t ISOFileSystem::getSize(const std::string &path) const {
    auto it = fileMap.find(path);
    return it == fileMap.end() ? 0 : std::get<1>(it->second);
}

bool ISOFileSystem::exists(const std::string &path) const {
    return fileMap.find(path) != fileMap.end();
}

const std::string &ISOFileSystem::getName() const { return name; }
bool ISOFileSystem::empty() const { return fileMap.empty(); }
std::unique_ptr<ISOFileSystem> ISOFileSystem::create(const std::filesystem::path &isoPath) {
    auto fs = std::make_unique<ISOFileSystem>(isoPath);
    if (fs->empty()) return nullptr;
    return fs;
}
#else
'''
        cpp_path.write_text(streaming_impl + cpp_src + "\\n#endif\\n", encoding="utf-8")
        print("Patched iso_file_system.cpp with streaming pread() XISO reader for iOS.")
PY_ISO

echo "==> [5/8] Patch UI Touch Smartphone (InstallerWizard tap diretto + ButtonWindow touch senza simboli mouse/tastiera + MessageWindow + HID + Crediti iOS multilingua)..."
python3 - \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/installer_wizard.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.h" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/message_window.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/hid/hid.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/kernel/memory.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/locale/locale.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/imgui_utils.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/options_menu.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/user/config_def.h" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/locale/config_locale.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/user/config.h" << 'PY_WIZ'
import sys, pathlib

wiz_p = pathlib.Path(sys.argv[1])
bw_h  = pathlib.Path(sys.argv[2])
bw_c  = pathlib.Path(sys.argv[3])
mw_c  = pathlib.Path(sys.argv[4])
hid_c = pathlib.Path(sys.argv[5])
mem_c = pathlib.Path(sys.argv[6])
loc_c = pathlib.Path(sys.argv[7])
imu_c = pathlib.Path(sys.argv[8])
opt_c = pathlib.Path(sys.argv[9])
cfg_def_h = pathlib.Path(sys.argv[10])
cfg_loc_c = pathlib.Path(sys.argv[11])
cfg_h = pathlib.Path(sys.argv[12])

# 5a. ui/button_window.h & .cpp: hit-test touch + modalità input iOS (Touch senza simboli mouse/tastiera, Keyboard solo su tasto reale, Gamepad su controller)
if bw_h.exists() and bw_c.exists():
    bwh = bw_h.read_text(encoding="utf-8")
    if "HitTest(" not in bwh:
        bwh = bwh.replace(
            "static void Close();",
            "static void Close();\\n"
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    enum class EIOSInputMode : int\\n"
            "    {\\n"
            "        Touch = 0,\\n"
            "        Keyboard = 1,\\n"
            "        Gamepad = 2\\n"
            "    };\\n"
            "    static inline EIOSInputMode s_iosInputMode = EIOSInputMode::Touch;\\n"
            "#endif\\n"
            "    static inline float s_hitMinX = 0.0f;\\n"
            "    static inline float s_hitMinY = 0.0f;\\n"
            "    static inline float s_hitMaxX = 0.0f;\\n"
            "    static inline float s_hitMaxY = 0.0f;\\n"
            "    static bool HitTest(float x, float y);"
        )
        bw_h.write_text(bwh, encoding="utf-8")
    bwc = bw_c.read_text(encoding="utf-8")
    if "ButtonWindow::HitTest" not in bwc:
        old_bw_inc = "#include <app.h>"
        new_bw_inc = (
            "#include <app.h>\\n"
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#include <sdl_listener.h>\\n\\n"
            "class SDLEventListenerForIOSButtonMode : public SDLEventListener\\n"
            "{\\n"
            "public:\\n"
            "    bool OnSDLEvent(SDL_Event* event) override\\n"
            "    {\\n"
            "        if (!event || App::s_isInit)\\n"
            "            return false;\\n\\n"
            "        switch (event->type)\\n"
            "        {\\n"
            "            case SDL_EVENT_KEY_DOWN:\\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Keyboard;\\n"
            "                break;\\n\\n"
            "            case SDL_EVENT_GAMEPAD_BUTTON_DOWN:\\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Gamepad;\\n"
            "                break;\\n\\n"
            "            case SDL_EVENT_GAMEPAD_AXIS_MOTION:\\n"
            "                if (event->gaxis.value > 16384 || event->gaxis.value < -16384)\\n"
            "                    ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Gamepad;\\n"
            "                break;\\n\\n"
            "            case SDL_EVENT_FINGER_DOWN:\\n"
            "            case SDL_EVENT_FINGER_MOTION:\\n"
            "            case SDL_EVENT_MOUSE_BUTTON_DOWN:\\n"
            "            case SDL_EVENT_MOUSE_MOTION:\\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Touch;\\n"
            "                break;\\n\\n"
            "            default:\\n"
            "                break;\\n"
            "        }\\n\\n"
            "        return false;\\n"
            "    }\\n"
            "}\\n"
            "g_sdlEventListenerForIOSButtonMode;\\n"
            "#endif"
        )
        assert old_bw_inc in bwc, "Failed to locate #include <app.h> in button_window.cpp"
        bwc = bwc.replace(old_bw_inc, new_bw_inc, 1)

        old_bw_locale = "    auto buttonLocale = &Localise(g_buttonKey);"
        new_bw_locale = (
            "    auto buttonLocale = &Localise(g_buttonKey);\\n"
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    if (!App::s_isInit && s_iosInputMode == EIOSInputMode::Touch)\\n"
            "    {\\n"
            "        if (g_buttonKey == \\"Button_SelectBack\\" || g_buttonKey == \\"Button_Back\\")\\n"
            "        {\\n"
            "            buttonLocale = &Localise(\\"Common_Back\\");\\n"
            "        }\\n"
            "        else if (g_buttonKey == \\"Button_Cancel\\")\\n"
            "        {\\n"
            "            buttonLocale = &Localise(\\"Common_Cancel\\");\\n"
            "        }\\n"
            "        else if (g_buttonKey == \\"Button_SelectQuit\\")\\n"
            "        {\\n"
            "            buttonLocale = &Localise(\\"Common_Quit\\");\\n"
            "        }\\n"
            "        else\\n"
            "        {\\n"
            "            s_hitMinX = s_hitMinY = s_hitMaxX = s_hitMaxY = 0.0f;\\n"
            "            return;\\n"
            "        }\\n"
            "    }\\n"
            "#endif"
        )
        assert old_bw_locale in bwc, "Failed to locate buttonLocale in button_window.cpp"
        bwc = bwc.replace(old_bw_locale, new_bw_locale, 1)

        bwc = bwc.replace(
            "drawList->AddImage(g_upTexButtonWindow.get(), windowEdgeMin, windowEdgeMax, GET_UV_COORDS(windowEdgeUVs), windowColour);",
            "drawList->AddImage(g_upTexButtonWindow.get(), windowEdgeMin, windowEdgeMax, GET_UV_COORDS(windowEdgeUVs), windowColour);\\n"
            "    s_hitMinX = windowEdgeMin.x;\\n"
            "    s_hitMinY = windowEdgeMin.y;\\n"
            "    s_hitMaxX = windowStretchMax.x;\\n"
            "    s_hitMaxY = windowStretchMax.y;"
        )
        bwc = bwc.replace(
            "void ButtonWindow::Close()\\n{\\n    s_isVisible = false;\\n    g_buttonKey.clear();\\n}",
            "void ButtonWindow::Close()\\n{\\n    s_isVisible = false;\\n    s_hitMinX = s_hitMinY = s_hitMaxX = s_hitMaxY = 0.0f;\\n    g_buttonKey.clear();\\n}\\n\\n"
            "bool ButtonWindow::HitTest(float x, float y)\\n{\\n"
            "    if (!s_isVisible || s_hitMaxX <= s_hitMinX || s_hitMaxY <= s_hitMinY)\\n"
            "        return false;\\n"
            "    const float pad = 20.0f;\\n"
            "    return x >= (s_hitMinX - pad) && x <= (s_hitMaxX + pad) &&\\n"
            "           y >= (s_hitMinY - pad) && y <= (s_hitMaxY + pad);\\n"
            "}"
        )
        bw_c.write_text(bwc, encoding="utf-8")
        print("Patched button_window.{h,cpp} for touch-first iOS installer (no mouse/keyboard icons unless keyboard/controller is used).")

# 5b. ui/installer_wizard.cpp: tap diretto sulle scritte delle opzioni + tap su ButtonWindow Indietro + skip tutorial desktop + XISO/DLC picker mode
if wiz_p.exists():
    src = wiz_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_DIRECT_TOUCH_UI" not in src:
        src = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#define MARATHON_IOS_DIRECT_TOUCH_UI 1\\n"
            'extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY);\\n'
            "#endif\\n" + src
        )
        old_mouse = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            case SDL_EVENT_MOUSE_MOTION:
            {
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];

                    if (ImGui::IsMouseHoveringRect(currentRect.first, currentRect.second, false))
                    {
                        newCursorIndex = int(i);

                        if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                            g_currentCursorAccepted = true;

                        break;
                    }
                }

                if (newCursorIndex < 0)
                    g_currentCursorIndex = -1;

                break;
            }'''
        new_mouse = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            case SDL_EVENT_MOUSE_MOTION:
            {
#if defined(MARATHON_IOS_PORT)
                float rawX = (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN) ? event->button.x : event->motion.x;
                float rawY = (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN) ? event->button.y : event->motion.y;
                float tapX = 0.0f, tapY = 0.0f;
                MarathonIOS_MapWindowPointToImGui(rawX, rawY, &tapX, &tapY);

                // Tap sul bottone "Indietro / Back / Cancel / Quit" in basso a destra
                if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN &&
                    event->button.button == SDL_BUTTON_LEFT &&
                    g_currentPage != WizardPage::InstallSucceeded &&
                    ButtonWindow::HitTest(tapX, tapY))
                {
                    g_currentCursorBack = true;
                    break;
                }

                // Hit-test a 2 passaggi: prima tap esatto sulla scritta/pill dell'opzione, poi margine touch verticale sul più vicino
                int exactIdx = -1;
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];
                    if (tapX >= currentRect.first.x && tapX <= currentRect.second.x &&
                        tapY >= currentRect.first.y && tapY <= currentRect.second.y)
                    {
                        exactIdx = int(i);
                        break;
                    }
                }
                if (exactIdx < 0)
                {
                    const float touchPadY = 10.0f;
                    float bestDist = FLT_MAX;
                    for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                    {
                        auto &currentRect = g_currentCursorRects[i];
                        if (tapX >= currentRect.first.x && tapX <= currentRect.second.x &&
                            tapY >= (currentRect.first.y - touchPadY) && tapY <= (currentRect.second.y + touchPadY))
                        {
                            float centerY = (currentRect.first.y + currentRect.second.y) * 0.5f;
                            float dist = std::abs(tapY - centerY);
                            if (dist < bestDist)
                            {
                                bestDist = dist;
                                exactIdx = int(i);
                            }
                        }
                    }
                }
                if (exactIdx >= 0)
                {
                    newCursorIndex = exactIdx;
                    if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                        g_currentCursorAccepted = true;
                }
                if (newCursorIndex < 0 && event->type == SDL_EVENT_MOUSE_BUTTON_DOWN)
                    g_currentCursorIndex = -1;
#else
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];
                    if (ImGui::IsMouseHoveringRect(currentRect.first, currentRect.second, false))
                    {
                        newCursorIndex = int(i);
                        if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                            g_currentCursorAccepted = true;
                        break;
                    }
                }
                if (newCursorIndex < 0)
                    g_currentCursorIndex = -1;
#endif
                break;
            }'''
        assert old_mouse in src, "Failed to locate SDL_EVENT_MOUSE_BUTTON_DOWN in installer_wizard.cpp"
        src = src.replace(old_mouse, new_mouse, 1)

        # Reset cursore quando si cambia pagina su iOS (nessuna evidenziazione fantasma)
        src = src.replace(
            "static void SetCurrentPage(WizardPage page)\\n{\\n    g_currentPage = page;",
            "static void SetCurrentPage(WizardPage page)\\n{\\n    g_currentPage = page;\\n#if defined(MARATHON_IOS_PORT)\\n    g_currentCursorIndex = -1;\\n    g_currentCursorAccepted = false;\\n#endif",
            1
        )
        # Salta i popup tutorial mouse desktop su iOS così "Aggiungi file" apre subito il selettore XISO/File iOS
        src = src.replace(
            "    NFD_Init();",
            "    NFD_Init();\\n#if defined(MARATHON_IOS_PORT)\\n    g_pickerTutorialCleared[0] = true;\\n    g_pickerTutorialCleared[1] = true;\\n#endif",
            1
        )
        # Imposta modalità picker iOS (XISO diretto in SelectGame vs DLC separati in SelectDLC)
        old_open = "result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);"
        new_open = '''#if defined(MARATHON_IOS_PORT)
        MarathonIOS_SetPickerMode(
            g_currentPage == WizardPage::SelectDLC
                ? MARATHON_IOS_PICKER_MODE_DLC_SEPARATE
                : MARATHON_IOS_PICKER_MODE_GAME_XISO
        );
#endif
        result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);'''
        assert old_open in src, "Failed to locate NFD_OpenDialogMultipleN in installer_wizard.cpp"
        src = src.replace(old_open, new_open, 1)

        wiz_p.write_text(src, encoding="utf-8")
        print("Patched installer_wizard.cpp: direct 1-tap touch options, tappable Back button, instant iOS XISO picker.")

# 5c. ui/message_window.cpp: tap diretto 1-touch sui pulsanti OK / Sì / No dei dialoghi
if mw_c.exists():
    msrc = mw_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_MSG_TOUCH" not in msrc:
        msrc = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#define MARATHON_IOS_MSG_TOUCH 1\\n"
            "#include <ui/button_window.h>\\n"
            'extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY);\\n'
            "static std::vector<std::pair<ImVec2, ImVec2>> g_iosMsgButtonRects{};\\n"
            "#endif\\n" + msrc
        )
        old_mw_click = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            {
                // Only accept left mouse button.
                if (event->button.button != SDL_BUTTON_LEFT)
                    break;

                // Only accept mouse buttons when an item is selected.
                if (g_selectedRowIndex == -1)
                    break;

                g_isAccepted = true;

                break;
            }'''
        new_mw_click = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            {
                if (event->button.button != SDL_BUTTON_LEFT)
                    break;
#if defined(MARATHON_IOS_PORT)
                float tapX = 0.0f, tapY = 0.0f;
                MarathonIOS_MapWindowPointToImGui(event->button.x, event->button.y, &tapX, &tapY);
                const float padY = 12.0f;
                bool hit = false;
                for (size_t i = 0; i < g_iosMsgButtonRects.size(); i++)
                {
                    auto& r = g_iosMsgButtonRects[i];
                    if (tapX >= r.first.x && tapX <= r.second.x &&
                        tapY >= (r.first.y - padY) && tapY <= (r.second.y + padY))
                    {
                        g_selectedRowIndex = int(i);
                        g_isAccepted = true;
                        hit = true;
                        break;
                    }
                }
                if (!hit && ButtonWindow::HitTest(tapX, tapY))
                {
                    g_isDeclined = true;
                }
#else
                if (g_selectedRowIndex == -1)
                    break;

                g_isAccepted = true;
#endif
                break;
            }'''
        assert old_mw_click in msrc, "Failed to locate SDL_EVENT_MOUSE_BUTTON_DOWN in message_window.cpp"
        msrc = msrc.replace(old_mw_click, new_mw_click, 1)

        old_mw_loop = '''    for (auto& button : g_buttons)
        DrawButton(rowCount++, windowMarginY, itemPadding, itemWidth, itemHeight, button);'''
        new_mw_loop = '''#if defined(MARATHON_IOS_PORT)
    g_iosMsgButtonRects.clear();
    {
        auto clipMin = drawList->GetClipRectMin();
        auto clipMax = drawList->GetClipRectMax();
        for (int i = 0; i < static_cast<int>(g_buttons.size()); i++)
        {
            float y0 = clipMin.y + windowMarginY + (itemHeight + itemPadding) * i;
            g_iosMsgButtonRects.emplace_back(ImVec2(clipMin.x, y0), ImVec2(clipMax.x, y0 + itemHeight));
        }
    }
#endif
    for (auto& button : g_buttons)
        DrawButton(rowCount++, windowMarginY, itemPadding, itemWidth, itemHeight, button);'''
        assert old_mw_loop in msrc, "Failed to locate DrawButton loop in message_window.cpp"
        msrc = msrc.replace(old_mw_loop, new_mw_loop, 1)

        # Non resettare g_selectedRowIndex su iOS se g_isAccepted è già stato confermato dal tap diretto!
        msrc = msrc.replace(
            "        // Invalidate index if the mouse cursor is outside of the list box.\\n        if (!ImGui::IsMouseHoveringRect(listMin, listMax, false))\\n            g_selectedRowIndex = -1;",
            "        // Invalidate index if the mouse cursor is outside of the list box.\\n        if (!g_isAccepted && !ImGui::IsMouseHoveringRect(listMin, listMax, false))\\n            g_selectedRowIndex = -1;",
            1
        )
        mw_c.write_text(msrc, encoding="utf-8")
        print("Patched message_window.cpp for direct 1-tap smartphone dialog confirmation.")

# 5d. hid/hid.cpp: cabla il virtual controller Sonic '06 + rumble CoreHaptics e non blocca mai l'input su iOS
if hid_c.exists():
    hsrc = hid_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_VIRTUAL_GAMEPAD" not in hsrc:
        assert '#include "hid.h"' in hsrc, "Failed to locate #include \\"hid.h\\" in hid/hid.cpp"
        hsrc = hsrc.replace(
            '#include "hid.h"',
            '#include "hid.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#define MARATHON_IOS_VIRTUAL_GAMEPAD 1\\n'
            '#include <algorithm>\\n'
            '#include <cstdlib>\\n'
            '#include <ios_virtual_controller.h>\\n'
            'static inline int16_t MergeTouchAxis(int16_t phys, int16_t virt)\\n'
            '{\\n'
            '    return (std::abs(static_cast<int>(virt)) > std::abs(static_cast<int>(phys))) ? virt : phys;\\n'
            '}\\n'
            '#endif',
            1
        )
        old_get_state = '''        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            XAMINPUT_STATE state
            {
                .dwPacketNumber = packetNumber++,
                .Gamepad = pUser->GetState()
            };

            *out_pState = state;

            return true;
        }

        return false;'''
        new_get_state = '''        XAMINPUT_GAMEPAD gamepad{};
        bool hasUser = false;
        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            gamepad = pUser->GetState();
            hasUser = true;
        }
#if defined(MARATHON_IOS_PORT)
        if (in_userIndex == 0)
        {
            MarathonTouchGamepadState vpad{};
            MarathonIOS_GetVirtualControllerState(&vpad);
            gamepad.wButtons |= static_cast<uint16_t>(vpad.buttons & 0xFFFFu);
            gamepad.bLeftTrigger = std::max(gamepad.bLeftTrigger, vpad.leftTrigger);
            gamepad.bRightTrigger = std::max(gamepad.bRightTrigger, vpad.rightTrigger);
            gamepad.sThumbLX = MergeTouchAxis(gamepad.sThumbLX, vpad.thumbLX);
            gamepad.sThumbLY = MergeTouchAxis(gamepad.sThumbLY, vpad.thumbLY);
            gamepad.sThumbRX = MergeTouchAxis(gamepad.sThumbRX, vpad.thumbRX);
            gamepad.sThumbRY = MergeTouchAxis(gamepad.sThumbRY, vpad.thumbRY);
            hasUser = true;
        }
#endif
        if (hasUser)
        {
            XAMINPUT_STATE state
            {
                .dwPacketNumber = packetNumber++,
                .Gamepad = gamepad
            };

            *out_pState = state;

            return true;
        }

        return false;'''
        assert old_get_state in hsrc, "Failed to locate HID::GetState body in hid/hid.cpp"
        hsrc = hsrc.replace(old_get_state, new_get_state, 1)

        old_set_state = '''        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            pUser->SetVibration(*in_pVibration);
            return true;
        }

        return false;'''
        new_set_state = '''#if defined(MARATHON_IOS_PORT)
        if (in_userIndex == 0)
        {
            MarathonIOS_TriggerHapticRumble(in_pVibration->wLeftMotorSpeed, in_pVibration->wRightMotorSpeed);
        }
#endif
        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            pUser->SetVibration(*in_pVibration);
            return true;
        }

#if defined(MARATHON_IOS_PORT)
        return (in_userIndex == 0);
#else
        return false;
#endif'''
        assert old_set_state in hsrc, "Failed to locate HID::SetState body in hid/hid.cpp"
        hsrc = hsrc.replace(old_set_state, new_set_state, 1)

        hsrc = hsrc.replace(
            "return GameWindow::s_isFocused || Config::AllowBackgroundInput;",
            "#if defined(MARATHON_IOS_PORT)\\n        return true;\\n#else\\n        return GameWindow::s_isFocused || Config::AllowBackgroundInput;\\n#endif",
            1
        )
        hid_c.write_text(hsrc, encoding="utf-8")
        print("Patched hid/hid.cpp: wired Sonic '06 virtual gamepad + CoreHaptics rumble + always-active iOS input.")

# 5e. kernel/memory.cpp: FIX CRASH IMMEDIATO SU FEATHER (mmap restituisce MAP_FAILED = (void*)-1, NON nullptr!)
if mem_c.exists():
    ksrc = mem_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_MMAP_GUARD" not in ksrc:
        old_mmap = '''    base = (uint8_t*)mmap((void*)0x100000000ull, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == (uint8_t*)MAP_FAILED)
        base = (uint8_t*)mmap(NULL, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == nullptr)
        return;'''
        new_mmap = '''    // MARATHON_IOS_MMAP_GUARD: mmap() restituisce MAP_FAILED ((void*)-1), non nullptr!
    // Senza questo controllo, su Feather senza EVA entitlement il costruttore statico scriveva a (void*)-1 crashando prima di main().
    base = (uint8_t*)mmap((void*)0x100000000ull, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);
    if (base == (uint8_t*)MAP_FAILED)
        base = (uint8_t*)mmap(NULL, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == (uint8_t*)MAP_FAILED || base == nullptr)
    {
        base = nullptr;
        return;
    }'''
        assert old_mmap in ksrc, "Failed to locate mmap guard in kernel/memory.cpp"
        ksrc = ksrc.replace(old_mmap, new_mmap, 1)
        mem_c.write_text(ksrc, encoding="utf-8")
        print("Patched kernel/memory.cpp: fixed MAP_FAILED pre-main crash on Feather.")

# 5f. locale/locale.cpp: crediti multilingua del porting iOS ("Porting iOS creato da hiperema") nella schermata InstallSucceeded
if loc_c.exists():
    lsrc = loc_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_PORT_CREDITS" not in lsrc:
        old_credits_locale = r'''    {
        "Installer_Page_InstallSucceeded",
        {
            { ELanguage::English,  "Installation complete!\\n\\nThis project is brought to you by:" },
            { ELanguage::Japanese, "インストール完了！\\n\\nプロジェクト制作：" },
            { ELanguage::German,   "Installation abgeschlossen!\\n\\nDieses Projekt wird präsentiert von:" },
            { ELanguage::French,   "Installation terminée !\\n\\nCe projet vous est présenté par :" },
            { ELanguage::Spanish,  "¡Instalación completada!\\n\\nEste proyecto ha sido posible gracias a:" },
            { ELanguage::Italian,  "Installazione completata!\\n\\nQuesto progetto è stato creato da:" }
        }
    },'''
        new_credits_locale = r'''    // MARATHON_IOS_PORT_CREDITS
    {
        "Installer_Page_InstallSucceeded",
        {
            { ELanguage::English,  "Installation complete!\\niOS port created by hiperema\\n\\nThis project is brought to you by:" },
            { ELanguage::Japanese, "インストール完了！\\niOS版制作：hiperema\\n\\nプロジェクト制作：" },
            { ELanguage::German,   "Installation abgeschlossen!\\niOS-Port erstellt von hiperema\\n\\nDieses Projekt wird präsentiert von:" },
            { ELanguage::French,   "Installation terminée !\\nPortage iOS créé par hiperema\\n\\nCe projet vous est présenté par :" },
            { ELanguage::Spanish,  "¡Instalación completada!\\nPort para iOS creado por hiperema\\n\\nEste proyecto ha sido posible gracias a:" },
            { ELanguage::Italian,  "Installazione completata!\\nPorting iOS creato da hiperema\\n\\nQuesto progetto è stato creato da:" }
        }
    },'''
        assert old_credits_locale in lsrc, "Failed to locate Installer_Page_InstallSucceeded in locale/locale.cpp"
        lsrc = lsrc.replace(old_credits_locale, new_credits_locale, 1)
        loc_c.write_text(lsrc, encoding="utf-8")
        print("Patched locale/locale.cpp with multilingual iOS port credits (hiperema).")

# 5g. ui/imgui_utils.cpp: su iOS nell'installatore non mostrare mai simboli mouse; simboli tastiera SOLO in modalità Keyboard, controller in modalità Gamepad
if imu_c.exists():
    isrc = imu_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_INSTALLER_HID_ICONS" not in isrc:
        assert "#include <ui/black_bar.h>" in isrc, "Failed to locate #include <ui/black_bar.h> in ui/imgui_utils.cpp"
        isrc = isrc.replace(
            "#include <ui/black_bar.h>",
            "#include <ui/black_bar.h>\\n#if defined(MARATHON_IOS_PORT)\\n#include <ui/button_window.h>\\n#endif",
            1
        )
        old_hid_icons = '''    if (!App::s_isInit)
    {
        if (const auto pMutator = HID::GetManager()->GetUser(0)->GetMutator())
        {
            const auto type = pMutator->GetType();
            const auto isKeyboard = type == HID::PeripheralType::Keyboard;
            const auto isMouse = type == HID::PeripheralType::Mouse;

            if (isKeyboard || isMouse)
            {
                buttonTexture = &g_upTexKbm;
                buttonTextureWidth = uint16_t(84);
                buttonTextureHeight = uint16_t(28);
            }

            if (isKeyboard)
            {
                buttonCrops = &g_buttonCropsKeyboard;
            }
            else if (isMouse)
            {
                buttonCrops = &g_buttonCropsMouse;
            }
        }
    }'''
        new_hid_icons = '''    // MARATHON_IOS_INSTALLER_HID_ICONS
#if defined(MARATHON_IOS_PORT)
    if (!App::s_isInit)
    {
        if (ButtonWindow::s_iosInputMode == ButtonWindow::EIOSInputMode::Keyboard)
        {
            buttonTexture = &g_upTexKbm;
            buttonTextureWidth = uint16_t(84);
            buttonTextureHeight = uint16_t(28);
            buttonCrops = &g_buttonCropsKeyboard;
        }
    }
#else
    if (!App::s_isInit)
    {
        if (const auto pMutator = HID::GetManager()->GetUser(0)->GetMutator())
        {
            const auto type = pMutator->GetType();
            const auto isKeyboard = type == HID::PeripheralType::Keyboard;
            const auto isMouse = type == HID::PeripheralType::Mouse;

            if (isKeyboard || isMouse)
            {
                buttonTexture = &g_upTexKbm;
                buttonTextureWidth = uint16_t(84);
                buttonTextureHeight = uint16_t(28);
            }

            if (isKeyboard)
            {
                buttonCrops = &g_buttonCropsKeyboard;
            }
            else if (isMouse)
            {
                buttonCrops = &g_buttonCropsMouse;
            }
        }
    }
#endif'''
        assert old_hid_icons in isrc, "Failed to locate GetHidInterpTextData block in ui/imgui_utils.cpp"
        isrc = isrc.replace(old_hid_icons, new_hid_icons, 1)
        imu_c.write_text(isrc, encoding="utf-8")
        print("Patched ui/imgui_utils.cpp: disabled mouse icons in iOS installer, keyboard icons only on real keyboard input.")

# 5h. ui/options_menu.cpp: abilita selettore framerate 30 / 40 / 60 / 120 FPS + MetalFX Upscaling + Frame Generation + Output Scale nella scheda Video su iOS
if opt_c.exists():
    osrc = opt_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_FPS_SELECTOR" not in osrc:
        assert '#include "options_menu.h"' in osrc, "Failed to locate #include \\"options_menu.h\\" in ui/options_menu.cpp"
        osrc = osrc.replace(
            '#include "options_menu.h"',
            '#include "options_menu.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#define MARATHON_IOS_FPS_SELECTOR 1\\n'
            '#include <ios_virtual_controller.h>\\n'
            '#include <ios_lossless_scaler.h>\\n'
            '#endif',
            1
        )
        old_res_row = "            DrawOption(rowCount++, &Config::ResolutionScale, true, nullptr, 0.25f, 1.0f, 2.0f);"
        new_res_row = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "            DrawOption(rowCount++, &Config::ResolutionScale, true, nullptr, 0.50f, 0.75f, 1.00f);\\n"
            "#else\\n"
            "            DrawOption(rowCount++, &Config::ResolutionScale, true, nullptr, 0.25f, 1.0f, 2.0f);\\n"
            "#endif"
        )
        assert old_res_row in osrc, "Failed to locate ResolutionScale DrawOption in ui/options_menu.cpp"
        osrc = osrc.replace(old_res_row, new_res_row, 1)

        old_fps_row = "            // TODO DrawOption(rowCount++, &Config::FPS, true, nullptr, FPS_MIN, 120, FPS_MAX);"
        new_fps_row = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "            DrawOption(rowCount++, &Config::FPS, true, nullptr, 30, 60, 120, false);\\n"
            "            DrawOption(rowCount++, &Config::ShowFPS, true);\\n"
            "            DrawOption(rowCount++, &Config::MetalFXUpscaling, true);\\n"
            "            DrawOption(rowCount++, &Config::FrameGeneration, true);\\n"
            "            DrawOption(rowCount++, &Config::OutputResolutionScale, true);\\n"
            "#else\\n"
            "            // TODO DrawOption(rowCount++, &Config::FPS, true, nullptr, FPS_MIN, 120, FPS_MAX);\\n"
            "#endif"
        )
        assert old_fps_row in osrc, "Failed to locate commented FPS DrawOption in ui/options_menu.cpp"
        osrc = osrc.replace(old_fps_row, new_fps_row, 1)

        old_int_step = '''                        if constexpr (std::is_integral_v<T>)
                        {
                            if (decrement)
                                config->Value -= 1;
                            else if (increment)
                                config->Value += 1;
                        }'''
        new_int_step = '''                        if constexpr (std::is_integral_v<T>)
                        {
#if defined(MARATHON_IOS_PORT)
                            if (static_cast<const void*>(config) == static_cast<const void*>(&Config::FPS))
                            {
                                static constexpr int32_t kIOSFpsPresets[4] = { 30, 40, 60, 120 };
                                const int presetCount = (Config::FrameGeneration.Value == EFrameGeneration::On) ? 3 : 4;
                                int idx = 2;
                                if (config->Value <= 35) idx = 0;
                                else if (config->Value <= 48) idx = 1;
                                else if (config->Value <= 90) idx = 2;
                                else idx = (presetCount > 3) ? 3 : 2;
                                if (decrement) idx = (idx + presetCount - 1) % presetCount;
                                else if (increment) idx = (idx + 1) % presetCount;
                                config->Value = kIOSFpsPresets[idx];
                                MarathonIOS_SetBaseFpsLimit(config->Value);
                                MarathonIOS_SetTargetFPS(config->Value);
                                MarathonIOS_NotifyFrameGenChanged();
                            }
                            else
#endif
                            if (decrement)
                                config->Value -= 1;
                            else if (increment)
                                config->Value += 1;
                        }'''
        assert old_int_step in osrc, "Failed to locate integral step block in ui/options_menu.cpp"
        osrc = osrc.replace(old_int_step, new_int_step, 1)

        old_int_text = '''        else if (config == &Config::Monitor)
        {
            valueText = fmt::format("{}", config->Value + 1);
            isValueCentred = true;
        }
        else'''
        new_int_text = '''        else if (config == &Config::Monitor)
        {
            valueText = fmt::format("{}", config->Value + 1);
            isValueCentred = true;
        }
#if defined(MARATHON_IOS_PORT)
        else if (config == &Config::FPS)
        {
            const int fgBase = MarathonIOS_GetFrameGenBaseFPS();
            const int fgOut = MarathonIOS_GetFrameGenOutputFPS();
            if (fgBase > 0 && fgOut > 0)
                valueText = fmt::format("{} -> {} FPS", fgBase, fgOut);
            else
                valueText = fmt::format("{} FPS", config->Value);
            isValueCentred = true;
        }
#endif
        else'''
        assert old_int_text in osrc, "Failed to locate Monitor/int32 valueText block in ui/options_menu.cpp"
        osrc = osrc.replace(old_int_text, new_int_text, 1)
        opt_c.write_text(osrc, encoding="utf-8")
        print("Patched ui/options_menu.cpp: enabled 30/40/60/120 FPS + ShowFPS + MetalFX Upscaling + Frame Generation + Output Scale in Video Options.")

# 5i. user/config.h: aggiungi enum EMetalFXUpscaling, EFrameGeneration ed EOutputResolutionScale
if cfg_h.exists():
    chsrc = cfg_h.read_text(encoding="utf-8")
    if "enum class EMetalFXUpscaling" not in chsrc:
        old_ui_enum = '''enum class EUIAlignmentMode : uint32_t
{
    Edge,
    Centre
};'''
        new_ui_enum = '''enum class EUIAlignmentMode : uint32_t
{
    Edge,
    Centre
};

enum class EMetalFXUpscaling : uint32_t
{
    Off,
    Temporal,
    Spatial
};

enum class EFrameGeneration : uint32_t
{
    Off,
    On
};

enum class EOutputResolutionScale : uint32_t
{
    Scale75,
    Scale85,
    Scale100
};'''
        assert old_ui_enum in chsrc, "Failed to locate EUIAlignmentMode in user/config.h"
        chsrc = chsrc.replace(old_ui_enum, new_ui_enum, 1)
        cfg_h.write_text(chsrc, encoding="utf-8")
        print("Patched user/config.h: added EMetalFXUpscaling, EFrameGeneration and EOutputResolutionScale enums.")

# 5j. user/config_def.h: promuovi Config::ShowFPS a CONFIG_DEFINE_LOCALISED + aggiungi MetalFXUpscaling, FrameGeneration & OutputResolutionScale
if cfg_def_h.exists():
    dsrc = cfg_def_h.read_text(encoding="utf-8")
    old_showfps_def = 'CONFIG_DEFINE("Video", bool, ShowFPS, false, false);'
    new_showfps_def = (
        'CONFIG_DEFINE_LOCALISED("Video", bool, ShowFPS, false, false);\\n'
        'CONFIG_DEFINE_ENUM_LOCALISED("Video", EMetalFXUpscaling, MetalFXUpscaling, EMetalFXUpscaling::Off, false);\\n'
        'CONFIG_DEFINE_ENUM_LOCALISED("Video", EFrameGeneration, FrameGeneration, EFrameGeneration::Off, false);\\n'
        'CONFIG_DEFINE_ENUM_LOCALISED("Video", EOutputResolutionScale, OutputResolutionScale, EOutputResolutionScale::Scale100, false);'
    )
    if "MetalFXUpscaling" not in dsrc:
        assert old_showfps_def in dsrc, "Failed to locate ShowFPS definition in user/config_def.h"
        dsrc = dsrc.replace(old_showfps_def, new_showfps_def, 1)
        cfg_def_h.write_text(dsrc, encoding="utf-8")
        print("Patched user/config_def.h: promoted ShowFPS + added MetalFXUpscaling, FrameGeneration & OutputResolutionScale.")

# 5k. locale/config_locale.cpp: aggiungi localizzazione 6 lingue di ShowFPS, MetalFXUpscaling, FrameGeneration e OutputResolutionScale
if cfg_loc_c.exists():
    clsrc = cfg_loc_c.read_text(encoding="utf-8")
    if "CONFIG_DEFINE_LOCALE(MetalFXUpscaling)" not in clsrc:
        anchor_brightness = "CONFIG_DEFINE_LOCALE(Brightness)"
        showfps_locale = '''CONFIG_DEFINE_LOCALE(ShowFPS)
{
    { ELanguage::English,  { "Show FPS", "Display a real-time frame rate counter in the top-left corner of the screen." } },
    { ELanguage::Japanese, { "FPS表示", "画面の左上に現在のフレームレートを表示します" } },
    { ELanguage::German,   { "FPS anzeigen", "Zeige eine Echtzeit-Bildwiederholrate oben links auf dem Bildschirm an." } },
    { ELanguage::French,   { "Afficher les IPS", "Affiche le compteur d'images par seconde en temps réel en haut à gauche de l'écran." } },
    { ELanguage::Spanish,  { "Mostrar FPS", "Muestra un contador de fotogramas por segundo en la esquina superior izquierda." } },
    { ELanguage::Italian,  { "Mostra FPS", "Mostra il contatore degli FPS in tempo reale nell'angolo in alto a sinistra dello schermo." } }
};

CONFIG_DEFINE_LOCALE(MetalFXUpscaling)
{
    { ELanguage::English,  { "MetalFX Upscaling", "Hardware-accelerated Apple MetalFX temporal or spatial upscaling from internal render scale to crisp display output." } },
    { ELanguage::Japanese, { "MetalFXアップスケーリング", "Apple MetalFXのテンポラルまたは空間スケーリングで低負荷かつ高精細に描画します" } },
    { ELanguage::German,   { "MetalFX-Upscaling", "Hardwarebeschleunigtes Apple MetalFX Temporal- oder Spatial-Upscaling für scharfe Grafik bei geringer GPU-Last." } },
    { ELanguage::French,   { "Mise à l'échelle MetalFX", "Upscaling matériel Apple MetalFX temporel ou spatial pour une image nette et un GPU plus frais." } },
    { ELanguage::Spanish,  { "Escalado MetalFX", "Escalado por hardware Apple MetalFX temporal o espacial para imagen nítida y menor temperatura." } },
    { ELanguage::Italian,  { "MetalFX Upscaling", "Upscaling hardware nativo Apple MetalFX temporale o spaziale per immagine nitida e GPU fresca." } }
};

CONFIG_DEFINE_ENUM_LOCALE(EMetalFXUpscaling)
{
    {
        ELanguage::English,
        {
            { EMetalFXUpscaling::Off,      { "Off", "" } },
            { EMetalFXUpscaling::Temporal, { "Temporal", "" } },
            { EMetalFXUpscaling::Spatial,  { "Spatial", "" } }
        }
    },
    {
        ELanguage::Japanese,
        {
            { EMetalFXUpscaling::Off,      { "オフ", "" } },
            { EMetalFXUpscaling::Temporal, { "テンポラル", "" } },
            { EMetalFXUpscaling::Spatial,  { "空間", "" } }
        }
    },
    {
        ELanguage::German,
        {
            { EMetalFXUpscaling::Off,      { "Aus", "" } },
            { EMetalFXUpscaling::Temporal, { "Temporal", "" } },
            { EMetalFXUpscaling::Spatial,  { "Spatial", "" } }
        }
    },
    {
        ELanguage::French,
        {
            { EMetalFXUpscaling::Off,      { "Désactivé", "" } },
            { EMetalFXUpscaling::Temporal, { "Temporel", "" } },
            { EMetalFXUpscaling::Spatial,  { "Spatial", "" } }
        }
    },
    {
        ELanguage::Spanish,
        {
            { EMetalFXUpscaling::Off,      { "Desactivado", "" } },
            { EMetalFXUpscaling::Temporal, { "Temporal", "" } },
            { EMetalFXUpscaling::Spatial,  { "Espacial", "" } }
        }
    },
    {
        ELanguage::Italian,
        {
            { EMetalFXUpscaling::Off,      { "Disattivato", "" } },
            { EMetalFXUpscaling::Temporal, { "Temporale", "" } },
            { EMetalFXUpscaling::Spatial,  { "Spaziale", "" } }
        }
    }
};

CONFIG_DEFINE_LOCALE(FrameGeneration)
{
    { ELanguage::English,  { "MetalFX Frame Gen", "Native Apple MetalFX Frame Interpolation (2x). Doubles base FPS (e.g. 60->120) with clean HUD compositing; auto-disables if unsupported." } },
    { ELanguage::Japanese, { "MetalFXフレーム生成", "Apple MetalFXフレーム補間 (2x) で60->120 FPSを実現します。非対応環境では自動で無効になります" } },
    { ELanguage::German,   { "MetalFX Frame Gen", "Native Apple MetalFX Frame Interpolation (2x) für 60->120 FPS mit sauberem HUD; bei fehlender Unterstützung automatisch aus." } },
    { ELanguage::French,   { "MetalFX Frame Gen", "Interpolation native Apple MetalFX (2x) doublant les IPS (60->120) avec HUD propre; désactivation auto si non supporté." } },
    { ELanguage::Spanish,  { "MetalFX Frame Gen", "Interpolación nativa Apple MetalFX (2x) que duplica FPS (60->120) con HUD limpio; se desactiva si no es compatible." } },
    { ELanguage::Italian,  { "MetalFX Frame Gen", "Interpolazione nativa Apple MetalFX (2x): raddoppia gli FPS base (60->120) con HUD pulito; fallback automatico se non supportata." } }
};

CONFIG_DEFINE_ENUM_LOCALE(EFrameGeneration)
{
    {
        ELanguage::English,
        {
            { EFrameGeneration::Off, { "Off", "" } },
            { EFrameGeneration::On,  { "On (2x)", "" } }
        }
    },
    {
        ELanguage::Japanese,
        {
            { EFrameGeneration::Off, { "オフ", "" } },
            { EFrameGeneration::On,  { "オン (2x)", "" } }
        }
    },
    {
        ELanguage::German,
        {
            { EFrameGeneration::Off, { "Aus", "" } },
            { EFrameGeneration::On,  { "Ein (2x)", "" } }
        }
    },
    {
        ELanguage::French,
        {
            { EFrameGeneration::Off, { "Désactivé", "" } },
            { EFrameGeneration::On,  { "Activé (2x)", "" } }
        }
    },
    {
        ELanguage::Spanish,
        {
            { EFrameGeneration::Off, { "Desactivado", "" } },
            { EFrameGeneration::On,  { "Activado (2x)", "" } }
        }
    },
    {
        ELanguage::Italian,
        {
            { EFrameGeneration::Off, { "Disattivato", "" } },
            { EFrameGeneration::On,  { "Attivo (2x)", "" } }
        }
    }
};

CONFIG_DEFINE_LOCALE(OutputResolutionScale)
{
    { ELanguage::English,  { "Output Scale", "Adjusts display output resolution (75%-100% of native Retina) to give the GPU extra thermal headroom at 120Hz." } },
    { ELanguage::Japanese, { "出力解像度スケール", "ディスプレイ出力解像度をネイティブの75%〜100%で調整し、120Hz時の発熱を抑えます" } },
    { ELanguage::German,   { "Ausgabe-Skalierung", "Passt die Ausgabeauflösung (75%-100% nativ) für mehr thermische Reserve bei 120Hz an." } },
    { ELanguage::French,   { "Échelle de sortie", "Ajuste la résolution de sortie (75%-100% native) pour garder une marge thermique à 120Hz." } },
    { ELanguage::Spanish,  { "Escala de salida", "Ajusta la resolución de salida (75%-100% nativa) para mantener margen térmico a 120Hz." } },
    { ELanguage::Italian,  { "Scala Output", "Regola la risoluzione di output (75%-100% della nativa Retina) per avere più margine termico a 120Hz." } }
};

CONFIG_DEFINE_ENUM_LOCALE(EOutputResolutionScale)
{
    {
        ELanguage::English,
        {
            { EOutputResolutionScale::Scale75,  { "75% (Cool)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (Balanced)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (Native)", "" } }
        }
    },
    {
        ELanguage::Japanese,
        {
            { EOutputResolutionScale::Scale75,  { "75% (省発熱)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (バランス)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (ネイティブ)", "" } }
        }
    },
    {
        ELanguage::German,
        {
            { EOutputResolutionScale::Scale75,  { "75% (Kühl)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (Ausgewogen)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (Nativ)", "" } }
        }
    },
    {
        ELanguage::French,
        {
            { EOutputResolutionScale::Scale75,  { "75% (Frais)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (Équilibré)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (Natif)", "" } }
        }
    },
    {
        ELanguage::Spanish,
        {
            { EOutputResolutionScale::Scale75,  { "75% (Frío)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (Equilibrado)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (Nativo)", "" } }
        }
    },
    {
        ELanguage::Italian,
        {
            { EOutputResolutionScale::Scale75,  { "75% (Fresco)", "" } },
            { EOutputResolutionScale::Scale85,  { "85% (Bilanciato)", "" } },
            { EOutputResolutionScale::Scale100, { "100% (Nativa)", "" } }
        }
    }
};

CONFIG_DEFINE_LOCALE(Brightness)'''
        assert anchor_brightness in clsrc, "Failed to locate CONFIG_DEFINE_LOCALE(Brightness) in locale/config_locale.cpp"
        clsrc = clsrc.replace(anchor_brightness, showfps_locale, 1)
        cfg_loc_c.write_text(clsrc, encoding="utf-8")
        print("Patched locale/config_locale.cpp: added 6-language ShowFPS, MetalFXUpscaling, FrameGeneration & OutputResolutionScale localization.")
PY_WIZ

echo "==> [6/8] Patch paths.cpp, paths.h, config.cpp, file_system.cpp, imports.cpp (FIX FREEZE ARM64!), app.cpp, sdl3_driver.cpp, heap.cpp, guest_thread.cpp e stdafx.h..."
python3 - \\
  "\${UPSTREAM_DIR}/MarathonRecomp/user/paths.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/stdafx.h" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/user/config.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/user/paths.h" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/kernel/io/file_system.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/kernel/imports.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/app.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/apu/driver/sdl3_driver.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/kernel/heap.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/cpu/guest_thread.cpp" << 'PY_PATHS'
import sys, pathlib

p = pathlib.Path(sys.argv[1])
if p.exists():
    src = p.read_text(encoding="utf-8")
    if "MARATHON_IOS_PORT" not in src:
        src = src.replace(
            'std::filesystem::path configPath = homePath / "Library" / "Application Support";',
            '#if defined(MARATHON_IOS_PORT)\\n'
            '        std::filesystem::path configPath = homePath / "Documents";\\n'
            '        std::error_code iosEc;\\n'
            '        std::filesystem::create_directories(configPath / USER_DIRECTORY, iosEc);\\n'
            '#else\\n'
            '        std::filesystem::path configPath = homePath / "Library" / "Application Support";\\n'
            '#endif'
        )
        src = src.replace(
            "return g_userPath;",
            "static std::filesystem::path s_userPath = BuildUserPath();\\n    return s_userPath;"
        )
        p.write_text(src, encoding="utf-8")
        print("Patched user/paths.cpp for writable iOS Documents/MarathonRecomp + SIOF safety.")

cfg_p = pathlib.Path(sys.argv[3])
if cfg_p.exists():
    csrc = cfg_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_SAFE_CONFIG_DIR" not in csrc:
        assert '#include "config.h"' in csrc, "Failed to locate #include \\"config.h\\" in user/config.cpp"
        csrc = csrc.replace(
            '#include "config.h"',
            '#include "config.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#include <cmath>\\n'
            '#include <ios_virtual_controller.h>\\n'
            '#include <ios_lossless_scaler.h>\\n'
            'static float OutputScaleEnumToFloat(EOutputResolutionScale s)\\n'
            '{\\n'
            '    switch (s)\\n'
            '    {\\n'
            '        case EOutputResolutionScale::Scale75: return 0.75f;\\n'
            '        case EOutputResolutionScale::Scale85: return 0.85f;\\n'
            '        case EOutputResolutionScale::Scale100: default: return 1.00f;\\n'
            '    }\\n'
            '}\\n'
            'static void SyncIOSMetalFXFromConfig()\\n'
            '{\\n'
            '    MarathonIOS_SetUpscaleMode(static_cast<int>(Config::MetalFXUpscaling.Value));\\n'
            '    MarathonIOS_SetRenderScale(Config::ResolutionScale.Value);\\n'
            '    MarathonIOS_SetFrameGenMode(static_cast<int>(Config::FrameGeneration.Value));\\n'
            '    MarathonIOS_SetBaseFpsLimit(Config::FPS.Value);\\n'
            '    MarathonIOS_SetOutputResolutionScale(OutputScaleEnumToFloat(Config::OutputResolutionScale.Value));\\n'
            '    MarathonIOS_SetTargetFPS(Config::FPS.Value);\\n'
            '    MarathonIOS_NotifyFrameGenChanged();\\n'
            '}\\n'
            'static void ApplyIOSHardwareDefaults(bool applyValues)\\n'
            '{\\n'
            '    MarathonIOSHardwareProfile prof{};\\n'
            '    MarathonIOS_GetHardwareProfile(&prof);\\n'
            '    auto setDef = [applyValues](auto& def, auto val) {\\n'
            '        def.DefaultValue = val;\\n'
            '        if (applyValues) def.Value = val;\\n'
            '    };\\n'
            '    setDef(Config::FPS, static_cast<int32_t>(prof.recommendedFps));\\n'
            '    setDef(Config::VSync, true);\\n'
            '    setDef(Config::TripleBuffering, ETripleBuffering::On);\\n'
            '    setDef(Config::ResolutionScale, prof.recommendedResScale);\\n'
            '    setDef(Config::AntiAliasing, prof.recommendedAA == 1 ? EAntiAliasing::MSAA2x : EAntiAliasing::Off);\\n'
            '    setDef(Config::TransparencyAntiAliasing, false);\\n'
            '    setDef(Config::ShadowResolution, prof.recommendedShadowRes == 0 ? EShadowResolution::x512 : EShadowResolution::x1024);\\n'
            '    setDef(Config::ReflectionResolution, prof.recommendedReflection == 0 ? EReflectionResolution::Eighth : EReflectionResolution::Quarter);\\n'
            '    setDef(Config::RadialBlur, prof.recommendedRadialBlur == 0 ? ERadialBlur::Off : ERadialBlur::Original);\\n'
            '    setDef(Config::AnisotropicFiltering, static_cast<uint32_t>(prof.recommendedAF));\\n'
            '    if (prof.tier >= 3) {\\n'
            '        // iPhone 15 Pro / 16 Pro (A18 Pro, 120Hz ProMotion): crisp Spatial+CAS (zero HUD downscale, 0.85x 3D) + 2x FrameGen (60 -> 120 FPS) + 85% output scale (2229x1025)!\\n'
            '        setDef(Config::MetalFXUpscaling, EMetalFXUpscaling::Spatial);\\n'
            '        setDef(Config::FrameGeneration, EFrameGeneration::On);\\n'
            '        setDef(Config::OutputResolutionScale, EOutputResolutionScale::Scale85);\\n'
            '    } else if (prof.tier == 2) {\\n'
            '        setDef(Config::MetalFXUpscaling, EMetalFXUpscaling::Spatial);\\n'
            '        setDef(Config::FrameGeneration, EFrameGeneration::Off);\\n'
            '        setDef(Config::OutputResolutionScale, EOutputResolutionScale::Scale85);\\n'
            '    } else if (prof.tier == 1) {\\n'
            '        setDef(Config::MetalFXUpscaling, EMetalFXUpscaling::Spatial);\\n'
            '        setDef(Config::FrameGeneration, EFrameGeneration::Off);\\n'
            '        setDef(Config::OutputResolutionScale, EOutputResolutionScale::Scale75);\\n'
            '    } else {\\n'
            '        setDef(Config::MetalFXUpscaling, EMetalFXUpscaling::Spatial);\\n'
            '        setDef(Config::FrameGeneration, EFrameGeneration::Off);\\n'
            '        setDef(Config::OutputResolutionScale, EOutputResolutionScale::Scale75);\\n'
            '    }\\n'
            '}\\n'
            '#endif',
            1
        )
        old_enum_tpl = '''CONFIG_DEFINE_ENUM_TEMPLATE(EUIAlignmentMode)
{
    { "Edge",    EUIAlignmentMode::Edge },
    { "Centre",  EUIAlignmentMode::Centre },
    { "Center",  EUIAlignmentMode::Centre }
};'''
        new_enum_tpl = '''CONFIG_DEFINE_ENUM_TEMPLATE(EUIAlignmentMode)
{
    { "Edge",    EUIAlignmentMode::Edge },
    { "Centre",  EUIAlignmentMode::Centre },
    { "Center",  EUIAlignmentMode::Centre }
};

CONFIG_DEFINE_ENUM_TEMPLATE(EMetalFXUpscaling)
{
    { "Off",      EMetalFXUpscaling::Off },
    { "Temporal", EMetalFXUpscaling::Temporal },
    { "Spatial",  EMetalFXUpscaling::Spatial }
};

CONFIG_DEFINE_ENUM_TEMPLATE(EFrameGeneration)
{
    { "Off", EFrameGeneration::Off },
    { "On",  EFrameGeneration::On }
};

CONFIG_DEFINE_ENUM_TEMPLATE(EOutputResolutionScale)
{
    { "75%",  EOutputResolutionScale::Scale75 },
    { "85%",  EOutputResolutionScale::Scale85 },
    { "100%", EOutputResolutionScale::Scale100 }
};'''
        assert old_enum_tpl in csrc, "Failed to locate EUIAlignmentMode enum template in user/config.cpp"
        csrc = csrc.replace(old_enum_tpl, new_enum_tpl, 1)

        old_res_cb = '''    Config::ResolutionScale.Callback = [](ConfigDef<float>* def)
    {
        def->Value = std::clamp(def->Value, 0.25f, 2.0f);
    };'''
        new_res_cb = '''    Config::ResolutionScale.Callback = [](ConfigDef<float>* def)
    {
#if defined(MARATHON_IOS_PORT)
        def->Value = std::clamp(def->Value, 0.50f, 1.00f);
        MarathonIOS_SetRenderScale(def->Value);
#else
        def->Value = std::clamp(def->Value, 0.25f, 2.0f);
#endif
    };'''
        assert old_res_cb in csrc, "Failed to locate Config::ResolutionScale.Callback in user/config.cpp"
        csrc = csrc.replace(old_res_cb, new_res_cb, 1)

        old_cb_end = '''    Config::AlwaysUnlockedDebugSettings.Callback = [](ConfigDef<bool>* def)
    {
        if (def->Value)
            OptionsMenu::s_isDebugUnlocked = true;
    };'''
        new_cb_end = '''    Config::AlwaysUnlockedDebugSettings.Callback = [](ConfigDef<bool>* def)
    {
        if (def->Value)
            OptionsMenu::s_isDebugUnlocked = true;
    };
#if defined(MARATHON_IOS_PORT)
    Config::FPS.Callback = [](ConfigDef<int32_t>* def)
    {
        if (!def) return;
        MarathonIOS_SetBaseFpsLimit(def->Value);
        MarathonIOS_SetTargetFPS(def->Value);
        MarathonIOS_NotifyFrameGenChanged();
    };
    Config::MetalFXUpscaling.Callback = [](ConfigDef<EMetalFXUpscaling>* def)
    {
        if (!def) return;
        MarathonIOS_SetUpscaleMode(static_cast<int>(def->Value));
    };
    Config::FrameGeneration.Callback = [](ConfigDef<EFrameGeneration>* def)
    {
        if (!def) return;
        MarathonIOS_SetFrameGenMode(static_cast<int>(def->Value));
        if (def->Value == EFrameGeneration::On && Config::FPS.Value > 60)
        {
            Config::FPS.Value = 60;
            MarathonIOS_SetBaseFpsLimit(60);
            MarathonIOS_SetTargetFPS(60);
        }
        MarathonIOS_NotifyFrameGenChanged();
    };
    Config::OutputResolutionScale.Callback = [](ConfigDef<EOutputResolutionScale>* def)
    {
        if (!def) return;
        MarathonIOS_SetOutputResolutionScale(OutputScaleEnumToFloat(def->Value));
    };
#endif'''
        assert old_cb_end in csrc, "Failed to locate AlwaysUnlockedDebugSettings.Callback in user/config.cpp"
        csrc = csrc.replace(old_cb_end, new_cb_end, 1)

        old_cfg_first = '''    if (!std::filesystem::exists(configPath))
    {
        Config::Save();
        return;
    }'''
        new_cfg_first = '''    if (!std::filesystem::exists(configPath))
    {
#if defined(MARATHON_IOS_PORT)
        ApplyIOSHardwareDefaults(true);
        SyncIOSMetalFXFromConfig();
        Config::Save();
        std::error_code tuneEc;
        std::ofstream(GetUserPath() / "ios_hw_tuned_v5") << "5";
#else
        Config::Save();
#endif
        return;
    }'''
        assert old_cfg_first in csrc, "Failed to locate first-launch check in user/config.cpp"
        csrc = csrc.replace(old_cfg_first, new_cfg_first, 1)

        old_cfg_catch = '''    catch (toml::parse_error& err)
    {
        LOGFN_ERROR("Failed to parse configuration: {}", err.what());
    }
}'''
        new_cfg_catch = '''    catch (toml::parse_error& err)
    {
        LOGFN_ERROR("Failed to parse configuration: {}", err.what());
    }
#if defined(MARATHON_IOS_PORT)
    {
        std::error_code tuneEc;
        auto markerPath = GetUserPath() / "ios_hw_tuned_v5";
        if (!std::filesystem::exists(markerPath, tuneEc))
        {
            MarathonIOSHardwareProfile prof{};
            MarathonIOS_GetHardwareProfile(&prof);
            // One-time migration to crisp v5 Spatial+CAS + Two-Tier 2x FG + fixed 120Hz pacer
            const bool isOldHeavyDefault =
                std::fabs(Config::ResolutionScale.Value - 1.0f) < 0.01f &&
                Config::AntiAliasing.Value != EAntiAliasing::Off;
            const bool isTier3Upgrade = (prof.tier >= 3);
            ApplyIOSHardwareDefaults(isOldHeavyDefault || isTier3Upgrade);
            if (isOldHeavyDefault || isTier3Upgrade)
            {
                Config::Save();
            }
            std::ofstream(markerPath) << "5";
        }
        else
        {
            ApplyIOSHardwareDefaults(false);
        }
        SyncIOSMetalFXFromConfig();
    }
#endif
}'''
        assert old_cfg_catch in csrc, "Failed to locate Config::Load end in user/config.cpp"
        csrc = csrc.replace(old_cfg_catch, new_cfg_catch, 1)

        old_cfg_dir = '''    if (!std::filesystem::exists(userPath))
        std::filesystem::create_directory(userPath);'''
        new_cfg_dir = '''    // MARATHON_IOS_SAFE_CONFIG_DIR: usa create_directories con error_code per evitare eccezioni al primo avvio su LiveContainer
    std::error_code cfgDirEc;
    if (!userPath.empty() && !std::filesystem::exists(userPath, cfgDirEc))
        std::filesystem::create_directories(userPath, cfgDirEc);'''
        assert old_cfg_dir in csrc, "Failed to locate create_directory in user/config.cpp"
        csrc = csrc.replace(old_cfg_dir, new_cfg_dir, 1)
        cfg_p.write_text(csrc, encoding="utf-8")
        print("Patched user/config.cpp: non-throwing create_directories + MetalFX templates/callbacks + v5 smart auto-config.")

ph_p = pathlib.Path(sys.argv[4])
if ph_p.exists():
    ph_src = ph_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_PATH_CACHE_FIX" not in ph_src:
        old_bpc = '''inline void BuildPathCache(const std::string& gamePath) {
    for (const auto& entry : std::filesystem::recursive_directory_iterator(gamePath)) {
        std::string fullPath = entry.path().string();
        std::string key = toLower(fullPath);
        g_pathCache[key] = entry.path();
    }
}'''
        new_bpc = '''// MARATHON_IOS_PATH_CACHE_FIX: non-throwing iterator + lexically_normal() per APFS case-sensitive su iOS
inline void BuildPathCache(const std::string& gamePath) {
    std::error_code ec;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(gamePath, ec)) {
        std::string fullPath = entry.path().lexically_normal().string();
        std::string key = toLower(fullPath);
        g_pathCache[key] = entry.path();
    }
}'''
        assert old_bpc in ph_src, "Failed to locate BuildPathCache in user/paths.h"
        ph_src = ph_src.replace(old_bpc, new_bpc, 1)
        ph_p.write_text(ph_src, encoding="utf-8")
        print("Patched user/paths.h: non-throwing BuildPathCache with lexically_normal().")

fs_p = pathlib.Path(sys.argv[5])
if fs_p.exists():
    fsrc = fs_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_CASE_INSENSITIVE_FS" not in fsrc:
        old_open_fallback = '''    if (!fileStream.is_open()) {
        std::filesystem::path cachedPath = FindInPathCache(filePath.string());
        if (!cachedPath.empty()) {
            fileStream.open(cachedPath, fileOpenMode);
        }
    }'''
        new_open_fallback = '''    // MARATHON_IOS_CASE_INSENSITIVE_FS: aggiorna filePath con cachedPath su APFS case-sensitive (altrimenti XGetFileSizeA fallisce!)
    if (!fileStream.is_open()) {
        std::filesystem::path cachedPath = FindInPathCache(filePath.lexically_normal().string());
        if (!cachedPath.empty()) {
            fileStream.open(cachedPath, fileOpenMode);
            if (fileStream.is_open()) {
                filePath = std::move(cachedPath);
            }
        }
    }'''
        assert old_open_fallback in fsrc, "Failed to locate FindInPathCache fallback in kernel/io/file_system.cpp"
        fsrc = fsrc.replace(old_open_fallback, new_open_fallback, 1)

        old_attrs = '''uint32_t XGetFileAttributesA(const char* lpFileName)
{
    std::filesystem::path filePath = FileSystem::ResolvePath(lpFileName, true);
    if (std::filesystem::is_directory(filePath))
        return FILE_ATTRIBUTE_DIRECTORY;
    else if (std::filesystem::is_regular_file(filePath))
        return FILE_ATTRIBUTE_NORMAL;
    else
        return INVALID_FILE_ATTRIBUTES;
}'''
        new_attrs = '''uint32_t XGetFileAttributesA(const char* lpFileName)
{
    std::filesystem::path filePath = FileSystem::ResolvePath(lpFileName, true);
    std::error_code ec;
    if (!std::filesystem::exists(filePath, ec))
    {
        std::filesystem::path cachedPath = FindInPathCache(filePath.lexically_normal().string());
        if (!cachedPath.empty())
            filePath = std::move(cachedPath);
    }
    if (std::filesystem::is_directory(filePath, ec))
        return FILE_ATTRIBUTE_DIRECTORY;
    else if (std::filesystem::is_regular_file(filePath, ec))
        return FILE_ATTRIBUTE_NORMAL;
    else
        return INVALID_FILE_ATTRIBUTES;
}'''
        assert old_attrs in fsrc, "Failed to locate XGetFileAttributesA in kernel/io/file_system.cpp"
        fsrc = fsrc.replace(old_attrs, new_attrs, 1)
        fs_p.write_text(fsrc, encoding="utf-8")
        print("Patched kernel/io/file_system.cpp: case-insensitive APFS filePath update + non-throwing XGetFileAttributesA.")

# 6b. kernel/imports.cpp: FIX CRITICO DEADLOCK CASUALE SU ARM64 (compare_exchange_weak spurious failure -> wait(true) / wait(0) infinito!)
imp_p = pathlib.Path(sys.argv[6])
if imp_p.exists():
    isrc = imp_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_ARM64_CAS_FIX" not in isrc:
        old_ev_wait = '''        else if (timeout == INFINITE)
        {
            if (manualReset)
            {
                signaled.wait(false);
            }
            else
            {
                while (true)
                {
                    bool expected = true;
                    if (signaled.compare_exchange_weak(expected, false))
                        break;

                    signaled.wait(expected);
                }
            }
        }
        else
        {
            assert(false && "Unhandled timeout value.");
        }'''
        new_ev_wait = '''        // MARATHON_IOS_ARM64_CAS_FIX: su ARM64 LL/SC compare_exchange_weak può fallire spuriamente lasciando expected==true -> signaled.wait(true) freeza per sempre!
        else if (timeout == INFINITE)
        {
            if (manualReset)
            {
                while (!signaled.load())
                    signaled.wait(false);
            }
            else
            {
                while (true)
                {
                    bool expected = true;
                    if (signaled.compare_exchange_strong(expected, false))
                        break;

                    if (!expected)
                        signaled.wait(false);
                }
            }
        }
        else
        {
            auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout);
            while (true)
            {
                if (manualReset)
                {
                    if (signaled.load())
                        return STATUS_SUCCESS;
                }
                else
                {
                    bool expected = true;
                    if (signaled.compare_exchange_strong(expected, false))
                        return STATUS_SUCCESS;
                }
                if (std::chrono::steady_clock::now() >= deadline)
                    return STATUS_TIMEOUT;
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        }'''
        assert old_ev_wait in isrc, "Failed to locate Event::Wait in kernel/imports.cpp"
        isrc = isrc.replace(old_ev_wait, new_ev_wait, 1)

        old_sem_wait = '''        if (timeout == 0)
        {
            uint32_t currentCount = count.load();
            if (currentCount != 0)
            {
                if (count.compare_exchange_weak(currentCount, currentCount - 1))
                    return STATUS_SUCCESS;
            }

            return STATUS_TIMEOUT;
        }
        else if (timeout == INFINITE)
        {
            uint32_t currentCount;
            while (true)
            {
                currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_weak(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                }
                else
                {
                    count.wait(0);
                }
            }

            return STATUS_SUCCESS;
        }
        else
        {
            assert(false && "Unhandled timeout value.");
            return STATUS_TIMEOUT;
        }'''
        new_sem_wait = '''        if (timeout == 0)
        {
            uint32_t currentCount = count.load();
            while (currentCount != 0)
            {
                if (count.compare_exchange_strong(currentCount, currentCount - 1))
                    return STATUS_SUCCESS;
            }

            return STATUS_TIMEOUT;
        }
        else if (timeout == INFINITE)
        {
            uint32_t currentCount;
            while (true)
            {
                currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_strong(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                }
                else
                {
                    count.wait(0);
                }
            }

            return STATUS_SUCCESS;
        }
        else
        {
            auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout);
            while (true)
            {
                uint32_t currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_strong(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                    continue;
                }
                if (std::chrono::steady_clock::now() >= deadline)
                    return STATUS_TIMEOUT;
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        }'''
        assert old_sem_wait in isrc, "Failed to locate Semaphore::Wait in kernel/imports.cpp"
        isrc = isrc.replace(old_sem_wait, new_sem_wait, 1)

        old_enter_cs = '''    while (true) 
    {
        be<uint32_t> previousOwner = 0;

        if (owningThread.compare_exchange_weak(previousOwner, thisThread) || previousOwner == thisThread)
        {
            cs->RecursionCount = cs->RecursionCount.get() + 1;
            return;
        }

        owningThread.wait(previousOwner);
    }'''
        new_enter_cs = '''    while (true)
    {
        be<uint32_t> previousOwner = 0;

        if (owningThread.compare_exchange_strong(previousOwner, thisThread) || previousOwner == thisThread)
        {
            cs->RecursionCount = cs->RecursionCount.get() + 1;
            return;
        }

        if (previousOwner != 0)
            owningThread.wait(previousOwner);
    }'''
        assert old_enter_cs in isrc, "Failed to locate RtlEnterCriticalSection in kernel/imports.cpp"
        isrc = isrc.replace(old_enter_cs, new_enter_cs, 1)

        old_try_cs = "    if (owningThread.compare_exchange_weak(previousOwner, thisThread) || previousOwner == thisThread)"
        new_try_cs = "    if (owningThread.compare_exchange_strong(previousOwner, thisThread) || previousOwner == thisThread)"
        assert old_try_cs in isrc, "Failed to locate RtlTryEnterCriticalSection in kernel/imports.cpp"
        isrc = isrc.replace(old_try_cs, new_try_cs, 1)

        isrc = isrc.replace(
            "if (spinLockRef.compare_exchange_weak(expected, g_ppcContext->r13.u32))",
            "if (spinLockRef.compare_exchange_strong(expected, g_ppcContext->r13.u32))"
        )
        imp_p.write_text(isrc, encoding="utf-8")
        print("Patched kernel/imports.cpp: fixed ARM64 compare_exchange_weak spurious-failure deadlocks in Event::Wait, Semaphore::Wait, RtlEnterCriticalSection.")

# 6c. app.cpp: Heartbeat Freeze Watchdog + rilevamento dinamico personaggio Sonic / Shadow / Silver per il tema del controller
app_p = pathlib.Path(sys.argv[7])
if app_p.exists():
    asrc = app_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_CHARACTER_THEME" not in asrc:
        assert '#include "app.h"' in asrc, "Failed to locate #include \\"app.h\\" in app.cpp"
        asrc = asrc.replace(
            '#include "app.h"',
            '#include "app.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#define MARATHON_IOS_CHARACTER_THEME 1\\n'
            '#include <string_view>\\n'
            '#include <ios_virtual_controller.h>\\n'
            '#endif',
            1
        )
        old_app_upd = '''void App::Update(double in_deltaTime)
{
    if (HostThread::GetCurrentID() == g_mainThreadId)
    {
        SDL_PumpEvents();
        SDL_FlushEvents(SDL_EVENT_FIRST, SDL_EVENT_LAST);

        GameWindow::Update();
    }'''
        new_app_upd = '''void App::Update(double in_deltaTime)
{
#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("App::Update");
#endif
    if (HostThread::GetCurrentID() == g_mainThreadId)
    {
        SDL_PumpEvents();
        SDL_FlushEvents(SDL_EVENT_FIRST, SDL_EVENT_LAST);
#if defined(MARATHON_IOS_PORT)
        if (MarathonIOS_IsAppSuspended())
        {
            MarathonIOS_WaitUntilActive();
            SDL_PumpEvents();
            SDL_FlushEvents(SDL_EVENT_FIRST, SDL_EVENT_LAST);
        }
#endif

        GameWindow::Update();
    }'''
        assert old_app_upd in asrc, "Failed to locate App::Update in app.cpp"
        asrc = asrc.replace(old_app_upd, new_app_upd, 1)

        old_dt_fix = '''    App::s_deltaTime = ctx.f1.f64;'''
        new_dt_fix = '''#if defined(MARATHON_IOS_PORT)
    if (ctx.f1.f64 > 0.1 || ctx.f1.f64 < 0.0)
        ctx.f1.f64 = 1.0 / static_cast<double>(Config::FPS.Value > 0 ? Config::FPS.Value : 60);
#endif
    App::s_deltaTime = ctx.f1.f64;'''
        assert old_dt_fix in asrc, "Failed to locate App::s_deltaTime assignment in app.cpp"
        asrc = asrc.replace(old_dt_fix, new_dt_fix, 1)

        old_gamemode = '''    if (const auto pGameMode = pDoc->GetDocMode<Sonicteam::GameMode>("GameMode"))
    {
        switch (pGameMode->GetGame()->m_State)'''
        new_gamemode = '''    if (const auto pGameMode = pDoc->GetDocMode<Sonicteam::GameMode>("GameMode"))
    {
#if defined(MARATHON_IOS_PORT)
        if (const auto pGame = pGameMode->GetGame())
        {
            std::string_view charName;
            if (pGame->m_spActorManager.get() != nullptr && pGame->m_PlayerData[0].ActorID != 0)
            {
                if (const auto pPlayer = pGame->GetPlayer(0))
                {
                    if (!pPlayer->m_Name.empty())
                        charName = pPlayer->m_Name.c_str();
                }
            }
            if (charName.empty() && !pGame->m_PlayerInfo[0].StartPlayer.empty())
            {
                charName = pGame->m_PlayerInfo[0].StartPlayer.c_str();
            }
            if (!charName.empty())
            {
                int theme = MARATHON_THEME_SONIC;
                if (charName.find("shadow") != std::string_view::npos ||
                    charName.find("rouge") != std::string_view::npos ||
                    charName.find("omega") != std::string_view::npos)
                {
                    theme = MARATHON_THEME_SHADOW;
                }
                else if (charName.find("silver") != std::string_view::npos ||
                         charName.find("blaze") != std::string_view::npos ||
                         charName.find("amy") != std::string_view::npos)
                {
                    theme = MARATHON_THEME_SILVER;
                }
                static int s_lastIOSTheme = -1;
                if (theme != s_lastIOSTheme)
                {
                    s_lastIOSTheme = theme;
                    MarathonIOS_SetCharacterTheme(theme);
                }
            }
        }
#endif
        switch (pGameMode->GetGame()->m_State)'''
        assert old_gamemode in asrc, "Failed to locate GameMode block in app.cpp"
        asrc = asrc.replace(old_gamemode, new_gamemode, 1)
        app_p.write_text(asrc, encoding="utf-8")
        print("Patched app.cpp: added Freeze Watchdog heartbeat + dynamic Sonic/Shadow/Silver controller theming.")

sa = pathlib.Path(sys.argv[2])
if sa.exists():
    sa_src = sa.read_text(encoding="utf-8")
    if "MARATHON_IOS_ATOMIC_REF_POLYFILL" not in sa_src:
        polyfill = '''
#if defined(__APPLE__) && defined(__cplusplus) && !defined(__cpp_lib_atomic_ref) && !defined(MARATHON_IOS_ATOMIC_REF_POLYFILL)
#define MARATHON_IOS_ATOMIC_REF_POLYFILL 1
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <type_traits>
namespace std {
namespace marathon_atomic_detail {
struct WaitBucket {
    std::mutex mtx;
    std::condition_variable cv;
};
inline WaitBucket& get_wait_bucket(const void* addr) noexcept {
    static auto* buckets = new WaitBucket[256]();
    const std::uint64_t h = static_cast<std::uint64_t>(reinterpret_cast<std::uintptr_t>(addr)) * 0x9E3779B97F4A7C15ull;
    const auto idx = static_cast<std::size_t>((h >> 56) & 255u);
    return buckets[idx];
}
constexpr memory_order fail_order_from_success(memory_order o) noexcept {
    if (o == memory_order_acq_rel) return memory_order_acquire;
    if (o == memory_order_release) return memory_order_relaxed;
    return o;
}
constexpr memory_order load_order_for_wait(memory_order o) noexcept {
    return (o == memory_order_relaxed) ? memory_order_acquire : o;
}
} // namespace marathon_atomic_detail

template <typename T>
class atomic_ref {
    static_assert(std::is_trivially_copyable_v<T>, "std::atomic_ref requires a trivially copyable type");
    T* ptr_;
public:
    using value_type = T;
    static constexpr std::size_t required_alignment = alignof(T);
    static constexpr bool is_always_lock_free = __atomic_always_lock_free(sizeof(T), nullptr);

    explicit atomic_ref(T& obj) noexcept : ptr_(&obj) {}
    atomic_ref(const atomic_ref&) noexcept = default;
    atomic_ref& operator=(const atomic_ref&) = delete;

    bool is_lock_free() const noexcept {
        return __atomic_is_lock_free(sizeof(T), ptr_);
    }

    T load(memory_order m = memory_order_seq_cst) const noexcept {
        T out{};
        __atomic_load(ptr_, &out, static_cast<int>(m));
        return out;
    }

    void store(T val, memory_order m = memory_order_seq_cst) const noexcept {
        __atomic_store(ptr_, &val, static_cast<int>(m));
    }

    T operator=(T desired) const noexcept {
        store(desired);
        return desired;
    }

    operator T() const noexcept {
        return load();
    }

    T exchange(T val, memory_order m = memory_order_seq_cst) const noexcept {
        T prev{};
        __atomic_exchange(ptr_, &val, &prev, static_cast<int>(m));
        return prev;
    }

    bool compare_exchange_strong(T& exp, T des, memory_order s, memory_order f) const noexcept {
        return __atomic_compare_exchange(ptr_, &exp, &des, false, static_cast<int>(s), static_cast<int>(f));
    }

    bool compare_exchange_strong(T& exp, T des, memory_order o = memory_order_seq_cst) const noexcept {
        return compare_exchange_strong(exp, des, o, marathon_atomic_detail::fail_order_from_success(o));
    }

    bool compare_exchange_weak(T& exp, T des, memory_order s, memory_order f) const noexcept {
        return __atomic_compare_exchange(ptr_, &exp, &des, true, static_cast<int>(s), static_cast<int>(f));
    }

    bool compare_exchange_weak(T& exp, T des, memory_order o = memory_order_seq_cst) const noexcept {
        return compare_exchange_weak(exp, des, o, marathon_atomic_detail::fail_order_from_success(o));
    }

    void wait(T old, memory_order m = memory_order_seq_cst) const noexcept {
        const memory_order loadOrder = marathon_atomic_detail::load_order_for_wait(m);
        T cur = load(loadOrder);
        if (std::memcmp(&cur, &old, sizeof(T)) != 0) return;
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        std::unique_lock<std::mutex> lk(bucket.mtx);
        for (;;) {
            cur = load(loadOrder);
            if (std::memcmp(&cur, &old, sizeof(T)) != 0) break;
            bucket.cv.wait(lk);
        }
    }

    // In a hashed wait-bucket table, multiple distinct addresses share one condition_variable.
    // notify_one() MUST call bucket.cv.notify_all() so a waiter on a colliding critical section
    // can never steal the wakeup and permanently deadlock another Xbox 360 guest thread.
    void notify_one() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_all();
    }

    void notify_all() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_all();
    }

    T fetch_add(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_add(ptr_, v, static_cast<int>(m));
    }
    T fetch_sub(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_sub(ptr_, v, static_cast<int>(m));
    }
    T fetch_or(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_or(ptr_, v, static_cast<int>(m));
    }
    T fetch_and(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_and(ptr_, v, static_cast<int>(m));
    }
    T fetch_xor(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_xor(ptr_, v, static_cast<int>(m));
    }
    T operator+=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(v) + v; }
    T operator-=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(v) - v; }
    T operator|=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_or(v) | v; }
    T operator&=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_and(v) & v; }
    T operator^=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_xor(v) ^ v; }
    T operator++() const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(1) + 1; }
    T operator++(int) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(1); }
    T operator--() const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(1) - 1; }
    T operator--(int) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(1); }
};
} // namespace std
#endif
'''
        sa.write_text(sa_src + polyfill, encoding="utf-8")
        print("Patched stdafx.h with deadlock-free C++20 Apple libc++ std::atomic_ref polyfill (256 buckets, notify_all).")

# 8. apu/driver/sdl3_driver.cpp: eliminate 187.5 Hz audio busy-spin (huge thermal/battery win!), 1024-frame CoreAudio buffer, QoS & suspend pause
aud_p = pathlib.Path(sys.argv[8])
if aud_p.exists():
    asrc = aud_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_AUDIO_OPT" not in asrc:
        assert '#include <user/config.h>' in asrc, "Failed to locate #include <user/config.h> in apu/driver/sdl3_driver.cpp"
        asrc = asrc.replace(
            '#include <user/config.h>',
            '#include <user/config.h>\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#include <pthread/qos.h>\\n'
            '#include <ios_virtual_controller.h>\\n'
            '#endif',
            1
        )
        old_audio_init = '    SDL_SetHint(SDL_HINT_AUDIO_CATEGORY, "playback");'
        new_audio_init = (
            '    SDL_SetHint(SDL_HINT_AUDIO_CATEGORY, "playback");\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '    // MARATHON_IOS_AUDIO_OPT: 1024-frame CoreAudio buffer (~21.3ms at 48kHz) cuts audio DSP wakeups & battery drain\\n'
            '    SDL_SetHint(SDL_HINT_AUDIO_DEVICE_SAMPLE_FRAMES, "1024");\\n'
            '#endif'
        )
        assert old_audio_init in asrc, "Failed to locate SDL_HINT_AUDIO_CATEGORY in apu/driver/sdl3_driver.cpp"
        asrc = asrc.replace(old_audio_init, new_audio_init, 1)

        old_audio_loop = '''    GuestThreadContext ctx(0);

    size_t channels = g_downMixToStereo ? 2 : XAUDIO_NUM_CHANNELS;

    while (!g_audioThreadShouldExit)
    {'''
        new_audio_loop = '''    GuestThreadContext ctx(0);
#if defined(MARATHON_IOS_PORT)
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
#endif

    size_t channels = g_downMixToStereo ? 2 : XAUDIO_NUM_CHANNELS;

    while (!g_audioThreadShouldExit)
    {
#if defined(MARATHON_IOS_PORT)
        if (MarathonIOS_IsAppSuspended())
        {
            std::this_thread::sleep_for(20ms);
            continue;
        }
#endif'''
        assert old_audio_loop in asrc, "Failed to locate AudioThread loop in apu/driver/sdl3_driver.cpp"
        asrc = asrc.replace(old_audio_loop, new_audio_loop, 1)

        old_audio_spin = '''        std::this_thread::sleep_for(std::chrono::floor<std::chrono::milliseconds>(next - now));

        while (std::chrono::steady_clock::now() < next)
            std::this_thread::yield();'''
        new_audio_spin = '''#if defined(MARATHON_IOS_PORT)
        // Zero busy-spin on iOS: sleep_until avoids burning an A18 Pro core 187.5 times/sec
        std::this_thread::sleep_until(next);
#else
        std::this_thread::sleep_for(std::chrono::floor<std::chrono::milliseconds>(next - now));

        while (std::chrono::steady_clock::now() < next)
            std::this_thread::yield();
#endif'''
        assert old_audio_spin in asrc, "Failed to locate AudioThread busy-spin in apu/driver/sdl3_driver.cpp"
        asrc = asrc.replace(old_audio_spin, new_audio_spin, 1)
        aud_p.write_text(asrc, encoding="utf-8")
        print("Patched apu/driver/sdl3_driver.cpp: eliminated 187.5Hz busy-spin + 1024-frame CoreAudio buffer + QoS.")

# 9. kernel/heap.cpp: return freed >=64KB interior pages back to iOS Jetsam via madvise(MADV_FREE) without touching o1heap headers
heap_p = pathlib.Path(sys.argv[9])
if heap_p.exists():
    hsrc = heap_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_JETSAM_DISCARD" not in hsrc:
        assert '#include "xdm.h"' in hsrc, "Failed to locate #include \\"xdm.h\\" in kernel/heap.cpp"
        hsrc = hsrc.replace(
            '#include "xdm.h"',
            '#include "xdm.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#include <cstdint>\\n'
            '#include <sys/mman.h>\\n'
            '// MARATHON_IOS_JETSAM_DISCARD: reclaim interior 16KB pages of freed >=64KB blocks for iOS Jetsam\\n'
            '// Skips the first 64 bytes so o1heap fragment headers & intrusive free-list pointers are NEVER touched.\\n'
            'static inline void MarathonIOSDiscardFreedPages(void* rawPtr, size_t payloadSize)\\n'
            '{\\n'
            '    if (!rawPtr || payloadSize < 65536) return;\\n'
            '    constexpr uintptr_t kPageSize = 16384;\\n'
            '    const uintptr_t start = (reinterpret_cast<uintptr_t>(rawPtr) + 64u + (kPageSize - 1u)) & ~(kPageSize - 1u);\\n'
            '    const uintptr_t end = (reinterpret_cast<uintptr_t>(rawPtr) + payloadSize) & ~(kPageSize - 1u);\\n'
            '    if (end > start)\\n'
            '    {\\n'
            '        madvise(reinterpret_cast<void*>(start), static_cast<size_t>(end - start), MADV_FREE);\\n'
            '    }\\n'
            '}\\n'
            '#endif',
            1
        )
        old_heap_free = '''void Heap::Free(void* ptr)
{
    if (ptr >= physicalHeap)
    {
        std::lock_guard lock(physicalMutex);
        o1heapFree(physicalHeap, *((void**)ptr - 1));
    }
    else
    {
        std::lock_guard lock(mutex);
        o1heapFree(heap, ptr);
    }
}'''
        new_heap_free = '''void Heap::Free(void* ptr)
{
    if (ptr >= physicalHeap)
    {
        std::lock_guard lock(physicalMutex);
        void* rawPtr = *((void**)ptr - 1);
#if defined(MARATHON_IOS_PORT)
        const size_t rawSize = rawPtr ? (*((size_t*)rawPtr - 2) - O1HEAP_ALIGNMENT) : 0;
#endif
        o1heapFree(physicalHeap, rawPtr);
#if defined(MARATHON_IOS_PORT)
        MarathonIOSDiscardFreedPages(rawPtr, rawSize);
#endif
    }
    else
    {
        std::lock_guard lock(mutex);
#if defined(MARATHON_IOS_PORT)
        const size_t rawSize = ptr ? (*((size_t*)ptr - 2) - O1HEAP_ALIGNMENT) : 0;
#endif
        o1heapFree(heap, ptr);
#if defined(MARATHON_IOS_PORT)
        MarathonIOSDiscardFreedPages(ptr, rawSize);
#endif
    }
}'''
        assert old_heap_free in hsrc, "Failed to locate Heap::Free in kernel/heap.cpp"
        hsrc = hsrc.replace(old_heap_free, new_heap_free, 1)
        heap_p.write_text(hsrc, encoding="utf-8")
        print("Patched kernel/heap.cpp: added safe 16KB interior MADV_FREE Jetsam page reclamation.")

# 10. cpu/guest_thread.cpp: pin PowerPC guest threads to A18 Pro P-cores (QOS_CLASS_USER_INTERACTIVE) + ObjC autorelease pool guard
gt_p = pathlib.Path(sys.argv[10])
if gt_p.exists():
    gtsrc = gt_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_QOS_THREAD" not in gtsrc:
        assert '#include "ppc_context.h"' in gtsrc, "Failed to locate #include \\"ppc_context.h\\" in cpu/guest_thread.cpp"
        gtsrc = gtsrc.replace(
            '#include "ppc_context.h"',
            '#include "ppc_context.h"\\n'
            '#if defined(MARATHON_IOS_PORT)\\n'
            '#include <pthread/qos.h>\\n'
            'extern "C" void* objc_autoreleasePoolPush(void);\\n'
            'extern "C" void objc_autoreleasePoolPop(void*);\\n'
            '#endif',
            1
        )
        old_gt_start = '''uint32_t GuestThread::Start(const GuestThreadParams& params)
{
    const auto procMask = (uint8_t)(params.flags >> 24);'''
        new_gt_start = '''uint32_t GuestThread::Start(const GuestThreadParams& params)
{
#if defined(MARATHON_IOS_PORT)
    // MARATHON_IOS_QOS_THREAD: schedule PowerPC guest threads on Apple Silicon P-cores + drain ObjC autorelease pool on exit
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
    struct IOSAutoreleaseGuard {
        void* pool;
        IOSAutoreleaseGuard() : pool(objc_autoreleasePoolPush()) {}
        ~IOSAutoreleaseGuard() { if (pool) objc_autoreleasePoolPop(pool); }
    } iosPoolGuard;
#endif
    const auto procMask = (uint8_t)(params.flags >> 24);'''
        assert old_gt_start in gtsrc, "Failed to locate GuestThread::Start in cpu/guest_thread.cpp"
        gtsrc = gtsrc.replace(old_gt_start, new_gt_start, 1)
        gt_p.write_text(gtsrc, encoding="utf-8")
        print("Patched cpu/guest_thread.cpp: Apple Silicon P-core QoS + ObjC autorelease pool guard.")
PY_PATHS

echo "==> [7/8] Patch thirdparty/plume (UIKit CAMetalLayer landscape fix + ProMotion), SDL3 UIKit LiveContainer layout/rotation, game_window.cpp e video.cpp..."
python3 - \\
  "\${UPSTREAM_DIR}/thirdparty/plume/plume_apple.mm" \\
  "\${UPSTREAM_DIR}/thirdparty/plume/plume_metal.cpp" \\
  "\${UPSTREAM_DIR}/thirdparty/plume/CMakeLists.txt" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/game_window.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/gpu/video.cpp" \\
  "\${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitvideo.m" \\
  "\${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitmetalview.m" \\
  "\${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitwindow.m" << 'PY_PLUME'
import sys, pathlib

mm = pathlib.Path(sys.argv[1])
metal_cpp = pathlib.Path(sys.argv[2])
cm = pathlib.Path(sys.argv[3])
gw_cpp = pathlib.Path(sys.argv[4])
vid_cpp = pathlib.Path(sys.argv[5])
sdl_uikit = pathlib.Path(sys.argv[6])
sdl_metalview = pathlib.Path(sys.argv[7])
sdl_window = pathlib.Path(sys.argv[8])

# 1. plume_apple.mm: UIKit + CAMetalLayer real bounds*contentsScale (fixes LiveContainer portrait-squished half-screen!)
if mm.exists():
    src = mm.read_text(encoding="utf-8")
    if "MARATHON_PLUME_IOS_UIKIT" not in src:
        ios_impl = r'''#include <TargetConditionals.h>
#if TARGET_OS_IOS && !TARGET_OS_MACCATALYST
#define MARATHON_PLUME_IOS_UIKIT 1
#include "plume_apple.h"
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <Metal/Metal.h>
#include <cmath>
#include <atomic>

extern "C" double MarathonIOS_GetEffectiveContentScale(double nativeScale);
extern "C" float MarathonIOS_GetOutputResolutionScale(void);

namespace plume {

void presentIOSDrawable(void *drawablePtr, int targetFps) {
    (void)targetFps;
    id<MTLDrawable> drawable = (__bridge id<MTLDrawable>)drawablePtr;
    if (!drawable) return;
    // CRITICAL: Always call plain [drawable present]!
    // Using presentAfterMinimumDuration stacked on top of the CPU frame pacer stalls CoreAnimation's
    // 3-drawable ring across VBlanks and collapses 60 FPS -> 33-40 FPS and 30 FPS -> 22 FPS!
    [drawable present];
}

RenderDeviceVendor getRenderDeviceVendor(uint64_t) {
    return RenderDeviceVendor::APPLE;
}

static CGFloat getIOSScaleFactor(UIWindow *uiWindow) {
#ifdef PLUME_APPLE_RETINA_ENABLED
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    // Dynamic OutputResolutionScale (0.75..1.00 of native Retina scale) controls swapchain pixel budget
    // cleanly for A18 Pro thermal headroom (e.g. 0.75 * 3.0 = 2.25x -> ~1966x904 vs 2622x1206).
    CGFloat native = screen ? screen.nativeScale : 1.0;
    return (CGFloat)MarathonIOS_GetEffectiveContentScale((double)native);
#else
    (void)uiWindow;
    return 1.0;
#endif
}

static std::atomic<uint32_t> g_iosMetalCachedW{0};
static std::atomic<uint32_t> g_iosMetalCachedH{0};
static std::atomic<bool> g_iosMetalSyncPending{false};
static std::atomic<double> g_iosMetalLastSyncSec{0.0};
static std::atomic<float> g_iosLastSyncedOutScale{0.0f};

// Safely syncs UIWindow + SDL_uikitmetalview + CAMetalLayer on main thread (fixes LiveContainer portrait-squished half-screen!)
static void syncIOSMetalViewOnMainThread(CAMetalLayer *metalLayer) {
    if (!metalLayer) return;

    UIView *metalView = [metalLayer.delegate isKindOfClass:[UIView class]] ? (UIView *)metalLayer.delegate : nil;
    UIWindow *win = metalView ? metalView.window : nil;

    if (@available(iOS 13.0, *)) {
        UIWindowScene *scene = win ? win.windowScene : nil;
        if (scene) {
            CGRect sceneBounds = scene.coordinateSpace.bounds;
            // On iOS 16+ inside LiveContainer, host scene may still be Portrait right after launch; gently request Landscape.
            if (@available(iOS 16.0, *)) {
                if (sceneBounds.size.height > sceneBounds.size.width) {
                    static int s_rotateAttempts = 0;
                    static CFAbsoluteTime s_lastRotateReq = 0.0;
                    CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
                    if (s_rotateAttempts < 5 && (now - s_lastRotateReq) >= 0.35) {
                        s_rotateAttempts++;
                        s_lastRotateReq = now;
                        if (win.rootViewController) {
                            [win.rootViewController setNeedsUpdateOfSupportedInterfaceOrientations];
                        }
                        UIWindowSceneGeometryPreferencesIOS *prefs =
                            [[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:UIInterfaceOrientationMaskLandscape];
                        [scene requestGeometryUpdateWithPreferences:prefs errorHandler:^(NSError *error) {
                            (void)error;
                        }];
                    }
                }
            }
            // Keep UIWindow.frame aligned with UIWindowScene.coordinateSpace.bounds (never stuck at Portrait 402x874 on Landscape 874x402!)
            if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                !CGRectEqualToRect(win.frame, sceneBounds)) {
                win.frame = sceneBounds;
                [win setNeedsLayout];
                [win layoutIfNeeded];
            }
        }
    }

    // Never mutate metalLayer.frame directly on a UIView-backed layer; update via UIView when unrotated.
    if (metalView && metalView.superview && CGAffineTransformIsIdentity(metalView.transform)) {
        CGRect superBounds = metalView.superview.bounds;
        if (superBounds.size.width > 0 && superBounds.size.height > 0 &&
            !CGRectEqualToRect(metalView.frame, superBounds)) {
            metalView.frame = superBounds;
            [metalView setNeedsLayout];
            [metalView layoutIfNeeded];
        }
    }

    CGRect bounds = metalView ? metalView.bounds : metalLayer.bounds;
    CGFloat scale = getIOSScaleFactor(win);
    if (scale <= 0.0) scale = 1.0;
    if (metalLayer.contentsScale != scale) {
        metalLayer.contentsScale = scale;
    }
    // Apple Silicon 120 FPS swapchain tuning: triple buffering (3 drawables) + ALWAYS framebufferOnly = YES!
    // Native MetalFX reads Plume's private intermediary backbuffer & writes to drawable via render pass -> keeps full A18 Pro AFBC compression!
    if (metalLayer.maximumDrawableCount != 3) {
        metalLayer.maximumDrawableCount = 3;
    }
    if (!metalLayer.framebufferOnly) {
        metalLayer.framebufferOnly = YES;
    }

    uint32_t w = (uint32_t)std::lround(bounds.size.width * scale);
    uint32_t h = (uint32_t)std::lround(bounds.size.height * scale);
    if (w > 0 && h > 0) {
        CGSize expected = CGSizeMake((CGFloat)w, (CGFloat)h);
        if (!CGSizeEqualToSize(metalLayer.drawableSize, expected)) {
            metalLayer.drawableSize = expected;
        }
        g_iosMetalCachedW.store(w, std::memory_order_release);
        g_iosMetalCachedH.store(h, std::memory_order_release);
    }
    g_iosLastSyncedOutScale.store(MarathonIOS_GetOutputResolutionScale(), std::memory_order_release);
}

void getIOSMetalLayerSize(void *layerPtr, uint32_t &dstWidth, uint32_t &dstHeight) {
    CAMetalLayer *metalLayer = (__bridge CAMetalLayer *)layerPtr;
    if (!metalLayer) {
        dstWidth = 0;
        dstHeight = 0;
        return;
    }

    if ([NSThread isMainThread]) {
        syncIOSMetalViewOnMainThread(metalLayer);
    } else {
        // Once cached, throttle main-thread UIKit layout sync to 4 Hz (250ms), OR immediately when OutputResolutionScale changes!
        const bool hasCache = (g_iosMetalCachedW.load(std::memory_order_relaxed) > 0 &&
                               g_iosMetalCachedH.load(std::memory_order_relaxed) > 0);
        const float curOutScale = MarathonIOS_GetOutputResolutionScale();
        const bool scaleChanged = (std::fabs(curOutScale - g_iosLastSyncedOutScale.load(std::memory_order_acquire)) > 0.005f);
        const double nowSec = CFAbsoluteTimeGetCurrent();
        const double lastSec = g_iosMetalLastSyncSec.load(std::memory_order_relaxed);
        if (!hasCache || scaleChanged || (nowSec - lastSec) >= 0.25) {
            bool expected = false;
            if (g_iosMetalSyncPending.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
                g_iosMetalLastSyncSec.store(nowSec, std::memory_order_relaxed);
                dispatch_async(dispatch_get_main_queue(), ^{
                    syncIOSMetalViewOnMainThread(metalLayer);
                    g_iosMetalSyncPending.store(false, std::memory_order_release);
                });
            }
        }
    }

    uint32_t w = g_iosMetalCachedW.load(std::memory_order_acquire);
    uint32_t h = g_iosMetalCachedH.load(std::memory_order_acquire);
    if (w == 0 || h == 0) {
        CGRect b = metalLayer.bounds;
        CGFloat sc = metalLayer.contentsScale > 0.0 ? metalLayer.contentsScale : 1.0;
        w = (uint32_t)std::lround(b.size.width * sc);
        h = (uint32_t)std::lround(b.size.height * sc);
        if (w == 0 || h == 0) {
            CGSize ds = metalLayer.drawableSize;
            w = (uint32_t)std::lround(ds.width);
            h = (uint32_t)std::lround(ds.height);
        }
    }
    dstWidth = w;
    dstHeight = h;
}

static void readIOSWindowMetrics(void *windowHandle, CocoaWindowAttributes &outAttrs, int &outRefreshRate) {
    UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    // Prefer rootViewController.view.bounds (matches rotated container in LiveContainer) over raw uiWindow.bounds
    CGRect bounds = CGRectZero;
    if (uiWindow && uiWindow.rootViewController && uiWindow.rootViewController.view) {
        bounds = uiWindow.rootViewController.view.bounds;
    }
    if (bounds.size.width <= 0 || bounds.size.height <= 0) {
        bounds = uiWindow ? uiWindow.bounds : (screen ? screen.bounds : CGRectMake(0, 0, 1280, 720));
    }
    CGFloat scale = getIOSScaleFactor(uiWindow);
    outAttrs.x = (int)std::lround(bounds.origin.x);
    outAttrs.y = (int)std::lround(bounds.origin.y);
    outAttrs.width = (int)std::lround(bounds.size.width * scale);
    outAttrs.height = (int)std::lround(bounds.size.height * scale);
    outRefreshRate = screen ? (int)[screen maximumFramesPerSecond] : 60;
    if (outRefreshRate <= 0) outRefreshRate = 60;
}

CocoaWindow::CocoaWindow(void *window)
    : windowHandle(window), cachedRefreshRate(60) {
    cachedAttributes = {0, 0, 1280, 720};
    if ([NSThread isMainThread]) {
        int hz = 60;
        readIOSWindowMetrics(windowHandle, cachedAttributes, hz);
        cachedRefreshRate.store(hz);
    } else {
        updateWindowAttributesInternal(true);
        updateRefreshRateInternal(true);
    }
}

CocoaWindow::~CocoaWindow() {}

void CocoaWindow::updateWindowAttributesInternal(bool forceSync) {
    auto updateBlock = ^{
        CocoaWindowAttributes attrs{};
        int hz = 60;
        readIOSWindowMetrics(windowHandle, attrs, hz);
        std::lock_guard<std::mutex> lock(attributesMutex);
        cachedAttributes = attrs;
        cachedRefreshRate.store(hz);
    };
    if (forceSync) {
        dispatch_sync(dispatch_get_main_queue(), updateBlock);
    } else {
        dispatch_async(dispatch_get_main_queue(), updateBlock);
    }
}

void CocoaWindow::updateRefreshRateInternal(bool forceSync) {
    auto updateBlock = ^{
        UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
        UIScreen *screen = uiWindow ? uiWindow.screen : [UIScreen mainScreen];
        int hz = screen ? (int)[screen maximumFramesPerSecond] : 60;
        cachedRefreshRate.store(hz > 0 ? hz : 60);
    };
    if (forceSync) {
        dispatch_sync(dispatch_get_main_queue(), updateBlock);
    } else {
        dispatch_async(dispatch_get_main_queue(), updateBlock);
    }
}

void CocoaWindow::getWindowAttributes(CocoaWindowAttributes *attributes) const {
    if (!attributes) return;
    if ([NSThread isMainThread]) {
        CocoaWindowAttributes attrs{};
        int hz = 60;
        readIOSWindowMetrics(windowHandle, attrs, hz);
        std::lock_guard<std::mutex> lock(attributesMutex);
        const_cast<CocoaWindow *>(this)->cachedAttributes = attrs;
        const_cast<CocoaWindow *>(this)->cachedRefreshRate.store(hz);
        *attributes = attrs;
    } else {
        {
            std::lock_guard<std::mutex> lock(attributesMutex);
            *attributes = cachedAttributes;
        }
        const_cast<CocoaWindow *>(this)->updateWindowAttributesInternal(false);
    }
}

int CocoaWindow::getRefreshRate() const {
    if ([NSThread isMainThread]) {
        UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
        UIScreen *screen = uiWindow ? uiWindow.screen : [UIScreen mainScreen];
        int hz = screen ? (int)[screen maximumFramesPerSecond] : 60;
        if (hz <= 0) hz = 60;
        const_cast<CocoaWindow *>(this)->cachedRefreshRate.store(hz);
        return hz;
    }
    int rate = cachedRefreshRate.load();
    const_cast<CocoaWindow *>(this)->updateRefreshRateInternal(false);
    return rate > 0 ? rate : 60;
}

void CocoaWindow::toggleFullscreen() {
    // iOS apps always run fullscreen inside UIWindowScene.
}

} // namespace plume
#else
'''
        mm.write_text(ios_impl + src + "\\n#endif\\n", encoding="utf-8")
        print("Patched thirdparty/plume/plume_apple.mm with CAMetalLayer real pixel sizing + UIKit ProMotion.")

# 2. plume_metal.cpp: guard macOS-only Metal APIs + read CAMetalLayer size + sync actual nextDrawable texture size on iOS
if metal_cpp.exists():
    msrc = metal_cpp.read_text(encoding="utf-8")
    if "MARATHON_PLUME_IOS_METAL_PATCH" not in msrc:
        assert "namespace plume {" in msrc, "Failed to locate namespace plume in plume_metal.cpp"
        msrc = msrc.replace(
            "namespace plume {",
            "// MARATHON_PLUME_IOS_METAL_PATCH\\n"
            "#if !PLUME_MACOS\\n"
            "#include <atomic>\\n"
            "#include <cstdio>\\n"
            "#include <vector>\\n"
            'extern "C" void MarathonIOS_LogLine(const char* tag, const char* msg);\\n'
            'extern "C" bool MarathonIOS_IsAppSuspended(void);\\n'
            'extern "C" int MarathonIOS_GetTargetFPS(void);\\n'
            'extern "C" int MarathonIOS_GetEffectiveTargetFPS(void);\\n'
            'extern "C" void MarathonIOS_LosslessRecordPresentedFrame(void);\\n'
            "#endif\\n"
            "namespace plume {\\n"
            "#if !PLUME_MACOS\\n"
            "    void getIOSMetalLayerSize(void *layerPtr, uint32_t &dstWidth, uint32_t &dstHeight);\\n"
            "    void presentIOSDrawable(void *drawablePtr, int targetFps);\\n"
            "    MTL::ResourceUsage mapResourceUsage(RenderDescriptorRangeType type);\\n"
            "    static std::mutex g_iosDescriptorSetMutex;\\n"
            "    static std::atomic<uint64_t> g_iosAddressableGen{1};\\n"
            "    static std::atomic<uint64_t> g_iosDescriptorGen{1};\\n"
            "    static thread_local const MTL::CommandEncoder* g_iosLastRenderEncoder = nullptr;\\n"
            "    static thread_local uint64_t g_iosLastRenderAddrGen = 0;\\n"
            "    static thread_local uint64_t g_iosLastRenderDescGen = 0;\\n"
            "    static thread_local const MTL::CommandEncoder* g_iosLastComputeEncoder = nullptr;\\n"
            "    static thread_local uint64_t g_iosLastComputeAddrGen = 0;\\n"
            "    static thread_local uint64_t g_iosLastComputeDescGen = 0;\\n"
            "    static std::atomic<uint32_t> g_iosMetalCmdErrCount{0};\\n"
            "    static void logIOSMetalCmdBufferError(const char* stage, MTL::CommandBuffer* cmdBuffer) {\\n"
            "        if (!cmdBuffer || cmdBuffer->status() != MTL::CommandBufferStatusError) return;\\n"
            "        const uint32_t n = g_iosMetalCmdErrCount.fetch_add(1, std::memory_order_relaxed);\\n"
            "        if (n >= 24) return;\\n"
            "        const char* lbl = (cmdBuffer->label() && cmdBuffer->label()->utf8String()) ? cmdBuffer->label()->utf8String() : \\"(unlabeled)\\";\\n"
            "        const char* errDesc = (cmdBuffer->error() && cmdBuffer->error()->localizedDescription())\\n"
            "            ? cmdBuffer->error()->localizedDescription()->utf8String() : \\"unknown GPU command buffer error\\";\\n"
            "        char buf[512];\\n"
            "        std::snprintf(buf, sizeof(buf), \\"[%s:%s #%u] %s\\", stage, lbl, n + 1, errDesc);\\n"
            "        MarathonIOS_LogLine(\\"METAL_ERR\\", buf);\\n"
            "        if (n == 23) {\\n"
            "            MarathonIOS_LogLine(\\"METAL_ERR\\", \\"Further GPU command buffer errors suppressed (limit 24 reached)\\");\\n"
            "        }\\n"
            "    }\\n"
            "    // Batched useResources() replaces N individual ObjC msgSend driver calls with 1-3 C-array calls per encoder!\\n"
            "    static inline void bindIOSAddressableResources(MTL::CommandEncoder* encoder, bool isCompute, MetalDevice* device) {\\n"
            "        if (encoder == nullptr || device == nullptr) return;\\n"
            "        static thread_local std::vector<const MTL::Resource*> s_addrBatch;\\n"
            "        s_addrBatch.clear();\\n"
            "        std::lock_guard<std::mutex> lock(device->resourcesMutex);\\n"
            "        s_addrBatch.reserve(device->gpuAddressableResources.size());\\n"
            "        for (const auto* resource : device->gpuAddressableResources) {\\n"
            "            if (resource != nullptr) s_addrBatch.push_back(resource);\\n"
            "        }\\n"
            "        if (s_addrBatch.empty()) return;\\n"
            "        const MTL::ResourceUsage usage = MTL::ResourceUsageRead | MTL::ResourceUsageWrite;\\n"
            "        if (isCompute) {\\n"
            "            static_cast<MTL::ComputeCommandEncoder*>(encoder)->useResources(\\n"
            "                s_addrBatch.data(), static_cast<NS::UInteger>(s_addrBatch.size()), usage);\\n"
            "        } else {\\n"
            "            static_cast<MTL::RenderCommandEncoder*>(encoder)->useResources(\\n"
            "                s_addrBatch.data(), static_cast<NS::UInteger>(s_addrBatch.size()), usage,\\n"
            "                MTL::RenderStageVertex | MTL::RenderStageFragment);\\n"
            "        }\\n"
            "    }\\n"
            "    static inline void bindIOSDescriptorSetResources(MTL::CommandEncoder* encoder, bool isCompute, const MetalDescriptorSet* descriptorSet) {\\n"
            "        if (encoder == nullptr || descriptorSet == nullptr) return;\\n"
            "        static thread_local std::vector<const MTL::Resource*> s_readBatch;\\n"
            "        static thread_local std::vector<const MTL::Resource*> s_writeBatch;\\n"
            "        static thread_local std::vector<const MTL::Resource*> s_rwBatch;\\n"
            "        s_readBatch.clear();\\n"
            "        s_writeBatch.clear();\\n"
            "        s_rwBatch.clear();\\n"
            "        std::lock_guard<std::mutex> lock(g_iosDescriptorSetMutex);\\n"
            "        for (const auto& entry : descriptorSet->resourceEntries) {\\n"
            "            if (entry.resource == nullptr) continue;\\n"
            "            const MTL::ResourceUsage usage = mapResourceUsage(entry.type);\\n"
            "            if (usage == MTL::ResourceUsageRead) {\\n"
            "                s_readBatch.push_back(entry.resource);\\n"
            "            } else if (usage == MTL::ResourceUsageWrite) {\\n"
            "                s_writeBatch.push_back(entry.resource);\\n"
            "            } else {\\n"
            "                s_rwBatch.push_back(entry.resource);\\n"
            "            }\\n"
            "        }\\n"
            "        auto flushBatch = [&](const std::vector<const MTL::Resource*>& batch, MTL::ResourceUsage usage) {\\n"
            "            if (batch.empty()) return;\\n"
            "            if (isCompute) {\\n"
            "                static_cast<MTL::ComputeCommandEncoder*>(encoder)->useResources(\\n"
            "                    batch.data(), static_cast<NS::UInteger>(batch.size()), usage);\\n"
            "            } else {\\n"
            "                static_cast<MTL::RenderCommandEncoder*>(encoder)->useResources(\\n"
            "                    batch.data(), static_cast<NS::UInteger>(batch.size()), usage,\\n"
            "                    MTL::RenderStageVertex | MTL::RenderStageFragment);\\n"
            "            }\\n"
            "        };\\n"
            "        flushBatch(s_readBatch, MTL::ResourceUsageRead);\\n"
            "        flushBatch(s_writeBatch, MTL::ResourceUsageWrite);\\n"
            "        flushBatch(s_rwBatch, MTL::ResourceUsageRead | MTL::ResourceUsageWrite);\\n"
            "    }\\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "        layer->setDisplaySyncEnabled(vsyncEnabled);",
            "#if PLUME_MACOS\\n        layer->setDisplaySyncEnabled(vsyncEnabled);\\n#else\\n        (void)vsyncEnabled;\\n#endif"
        )
        msrc = msrc.replace(
            "        return layer->displaySyncEnabled();",
            "#if PLUME_MACOS\\n        return layer->displaySyncEnabled();\\n#else\\n        return true;\\n#endif"
        )
        # Use real CAMetalLayer size in MetalSwapChain::getWindowSize on iOS
        old_gws = '''    void MetalSwapChain::getWindowSize(uint32_t &dstWidth, uint32_t &dstHeight) const {
        MetalAutoreleasePool releasePool;
        CocoaWindowAttributes attributes;
        windowWrapper->getWindowAttributes(&attributes);
        dstWidth = attributes.width;
        dstHeight = attributes.height;
    }'''
        new_gws = '''    void MetalSwapChain::getWindowSize(uint32_t &dstWidth, uint32_t &dstHeight) const {
        MetalAutoreleasePool releasePool;
#if !PLUME_MACOS
        if (layer != nullptr) {
            uint32_t lw = 0, lh = 0;
            getIOSMetalLayerSize(layer, lw, lh);
            if (lw > 0 && lh > 0) {
                dstWidth = lw;
                dstHeight = lh;
                return;
            }
        }
#endif
        CocoaWindowAttributes attributes;
        windowWrapper->getWindowAttributes(&attributes);
        dstWidth = attributes.width;
        dstHeight = attributes.height;
    }'''
        assert old_gws in msrc, "Failed to locate MetalSwapChain::getWindowSize in plume_metal.cpp"
        msrc = msrc.replace(old_gws, new_gws, 1)

        # Also check CAMetalLayer drawableSize in MetalSwapChain::needsResize on iOS
        old_needs_resize = '''    bool MetalSwapChain::needsResize() const {
        MetalAutoreleasePool releasePool;
        uint32_t windowWidth, windowHeight;
        getWindowSize(windowWidth, windowHeight);
        return (layer == nullptr) || (width != windowWidth) || (height != windowHeight);
    }'''
        new_needs_resize = '''    bool MetalSwapChain::needsResize() const {
        MetalAutoreleasePool releasePool;
        uint32_t windowWidth, windowHeight;
        getWindowSize(windowWidth, windowHeight);
        if ((layer == nullptr) || (width != windowWidth) || (height != windowHeight)) {
            return true;
        }
#if !PLUME_MACOS
        const CGSize ds = layer->drawableSize();
        if (static_cast<uint32_t>(ds.width + 0.5) != width || static_cast<uint32_t>(ds.height + 0.5) != height) {
            return true;
        }
#endif
        return false;
    }'''
        assert old_needs_resize in msrc, "Failed to locate MetalSwapChain::needsResize in plume_metal.cpp"
        msrc = msrc.replace(old_needs_resize, new_needs_resize, 1)

        # 2a. MetalBuffer / MetalBufferFormattedView / MetalTexture / MetalTextureView:
        #     - Fix Depth32Float_Stencil8 illegally receiving MTL::TextureUsageShaderWrite on iOS (root cause of Invalid Resource 00000009!)
        #     - Add MTL::TextureUsagePixelFormatView on iOS for swizzled/reinterpreted views (D3DFMT_L8 YUV movies, sRGB, depth/stencil)
        #     - Log any null Metal allocation directly to ios_debug.log & add null guards
        old_buf_ctor = '''        this->mtl = device->mtl->newBuffer(desc.size, mapResourceOption(desc.heapType));

        addressable = desc.flags & RenderBufferFlag::DEVICE_ADDRESSABLE;
        device->addResource(mtl, addressable);
    }

    MetalBuffer::~MetalBuffer() {
        MetalAutoreleasePool releasePool;
        device->removeResource(mtl, addressable);
        mtl->release();
    }'''
        new_buf_ctor = '''        this->mtl = device->mtl->newBuffer(desc.size, mapResourceOption(desc.heapType));
#if !PLUME_MACOS
        if (this->mtl == nullptr) {
            char errBuf[192];
            std::snprintf(errBuf, sizeof(errBuf), "newBuffer FAILED: size=%llu heap=%d flags=0x%x",
                static_cast<unsigned long long>(desc.size), static_cast<int>(desc.heapType), static_cast<unsigned>(desc.flags));
            MarathonIOS_LogLine("METAL_ERR", errBuf);
        }
#endif

        addressable = desc.flags & RenderBufferFlag::DEVICE_ADDRESSABLE;
        device->addResource(mtl, addressable);
    }

    MetalBuffer::~MetalBuffer() {
        MetalAutoreleasePool releasePool;
        device->removeResource(mtl, addressable);
        if (mtl != nullptr) {
            mtl->release();
        }
    }'''
        assert old_buf_ctor in msrc, "Failed to locate MetalBuffer ctor/dtor in plume_metal.cpp"
        msrc = msrc.replace(old_buf_ctor, new_buf_ctor, 1)

        old_bfv = '''        // Create texture with configured descriptor and alignment
        MTL::TextureDescriptor *descriptor = MTL::TextureDescriptor::textureBufferDescriptor(pixelFormat, width, options, usage);
        this->texture = buffer->mtl->newTexture(descriptor, 0, bytesPerRow);
    }

    MetalBufferFormattedView::~MetalBufferFormattedView() {
        MetalAutoreleasePool releasePool;
        texture->release();
    }'''
        new_bfv = '''        // Create texture with configured descriptor and alignment
        MTL::TextureDescriptor *descriptor = MTL::TextureDescriptor::textureBufferDescriptor(pixelFormat, width, options, usage);
        this->texture = (buffer->mtl != nullptr) ? buffer->mtl->newTexture(descriptor, 0, bytesPerRow) : nullptr;
#if !PLUME_MACOS
        if (this->texture == nullptr) {
            char errBuf[192];
            std::snprintf(errBuf, sizeof(errBuf), "MetalBufferFormattedView newTexture FAILED: fmt=%d w=%u bpr=%llu",
                static_cast<int>(format), width, static_cast<unsigned long long>(bytesPerRow));
            MarathonIOS_LogLine("METAL_ERR", errBuf);
        }
#endif
    }

    MetalBufferFormattedView::~MetalBufferFormattedView() {
        MetalAutoreleasePool releasePool;
        if (texture != nullptr) {
            texture->release();
        }
    }'''
        assert old_bfv in msrc, "Failed to locate MetalBufferFormattedView in plume_metal.cpp"
        msrc = msrc.replace(old_bfv, new_bfv, 1)

        old_tex_ctor = '''        descriptor->setTextureType(textureType);
        descriptor->setStorageMode(MTL::StorageModePrivate);
        descriptor->setPixelFormat(mapPixelFormat(desc.format));
        descriptor->setWidth(desc.width);
        descriptor->setHeight(desc.height);
        descriptor->setDepth(desc.depth);
        descriptor->setMipmapLevelCount(desc.mipLevels);
        descriptor->setArrayLength(desc.arraySize);
        descriptor->setSampleCount(desc.multisampling.sampleCount);

        MTL::TextureUsage usage = mapTextureUsage(desc.flags);
        // Add shader write usage if this texture might be used as a resolve target
        if (desc.multisampling.sampleCount == 1 && (usage & MTL::TextureUsageRenderTarget)) {
            usage |= MTL::TextureUsageShaderWrite;
        }
        descriptor->setUsage(usage);

        this->mtl = device->mtl->newTexture(descriptor);
        device->addResource(mtl);

        // Release resources
        descriptor->release();
    }

    MetalTexture::~MetalTexture() {
        MetalAutoreleasePool releasePool;
        device->removeResource(mtl);
        mtl->release();
    }'''
        new_tex_ctor = '''        const MTL::PixelFormat pixelFormat = mapPixelFormat(desc.format);
        descriptor->setTextureType(textureType);
        descriptor->setStorageMode(MTL::StorageModePrivate);
        descriptor->setPixelFormat(pixelFormat);
        descriptor->setWidth(desc.width);
        descriptor->setHeight(desc.height);
        descriptor->setDepth(desc.depth);
        descriptor->setMipmapLevelCount(desc.mipLevels);
        descriptor->setArrayLength(desc.arraySize);
        descriptor->setSampleCount(desc.multisampling.sampleCount);

        MTL::TextureUsage usage = mapTextureUsage(desc.flags);
        const bool isDepthPixelFormat =
            (pixelFormat == MTL::PixelFormatDepth16Unorm) ||
            (pixelFormat == MTL::PixelFormatDepth32Float) ||
            (pixelFormat == MTL::PixelFormatDepth32Float_Stencil8);
        // Add shader write usage ONLY for single-sample color render targets (depth/stencil formats forbid ShaderWrite on iOS Metal!)
        if (desc.multisampling.sampleCount == 1 && (desc.flags & RenderTextureFlag::RENDER_TARGET) && !isDepthPixelFormat) {
            usage |= MTL::TextureUsageShaderWrite;
        }
        if (isDepthPixelFormat) {
            usage &= ~MTL::TextureUsageShaderWrite;
        }
#if !PLUME_MACOS
        // Enable swizzled & pixel-format-reinterpreted views (D3DFMT_L8 YUV planes, sRGB views, depth/stencil views)
        usage |= MTL::TextureUsagePixelFormatView;
#endif
        descriptor->setUsage(usage);

        this->mtl = device->mtl->newTexture(descriptor);
#if !PLUME_MACOS
        if (this->mtl == nullptr) {
            char errBuf[256];
            std::snprintf(errBuf, sizeof(errBuf),
                "newTexture FAILED: fmt=%d mtlFmt=%lu %ux%ux%u mips=%u arr=%u samples=%u flags=0x%x usage=0x%lx",
                static_cast<int>(desc.format), static_cast<unsigned long>(pixelFormat),
                desc.width, desc.height, desc.depth, desc.mipLevels, desc.arraySize,
                desc.multisampling.sampleCount, static_cast<unsigned>(desc.flags), static_cast<unsigned long>(usage));
            MarathonIOS_LogLine("METAL_ERR", errBuf);
        }
#endif
        device->addResource(mtl);

        // Release resources
        descriptor->release();
    }

    MetalTexture::~MetalTexture() {
        MetalAutoreleasePool releasePool;
        device->removeResource(mtl);
        if (mtl != nullptr) {
            mtl->release();
        }
    }'''
        assert old_tex_ctor in msrc, "Failed to locate MetalTexture ctor/dtor in plume_metal.cpp"
        msrc = msrc.replace(old_tex_ctor, new_tex_ctor, 1)

        msrc = msrc.replace(
            "    void MetalTexture::setName(const std::string &name) {\\n        MetalAutoreleasePool releasePool;\\n        mtl->setLabel(NS::String::string(name.c_str(), NS::UTF8StringEncoding));\\n    }",
            "    void MetalTexture::setName(const std::string &name) {\\n        if (mtl == nullptr) return;\\n        MetalAutoreleasePool releasePool;\\n        mtl->setLabel(NS::String::string(name.c_str(), NS::UTF8StringEncoding));\\n    }",
            1
        )

        old_tex_view = '''        this->texture = texture->mtl->newTextureView(
            mapPixelFormat(desc.format),
            mapTextureViewType(desc.dimension, texture->desc.multisampling.sampleCount, arraySize),
            { desc.mipSlice, mipLevels },
            { desc.arrayIndex, arraySize },
            mapTextureSwizzleChannels(desc.componentMapping)
        );
    }

    MetalTextureView::~MetalTextureView() {
        MetalAutoreleasePool releasePool;
        texture->release();
    }'''
        new_tex_view = '''        this->texture = (texture->mtl != nullptr) ? texture->mtl->newTextureView(
            mapPixelFormat(desc.format),
            mapTextureViewType(desc.dimension, texture->desc.multisampling.sampleCount, arraySize),
            { desc.mipSlice, mipLevels },
            { desc.arrayIndex, arraySize },
            mapTextureSwizzleChannels(desc.componentMapping)
        ) : nullptr;
#if !PLUME_MACOS
        if (this->texture == nullptr) {
            char errBuf[256];
            std::snprintf(errBuf, sizeof(errBuf),
                "newTextureView FAILED: parentNull=%d viewFmt=%d parentFmt=%d dim=%d mips=%u/%u arr=%u/%u",
                texture->mtl == nullptr ? 1 : 0, static_cast<int>(desc.format), static_cast<int>(texture->desc.format),
                static_cast<int>(desc.dimension), desc.mipSlice, mipLevels, desc.arrayIndex, arraySize);
            MarathonIOS_LogLine("METAL_ERR", errBuf);
        }
#endif
    }

    MetalTextureView::~MetalTextureView() {
        MetalAutoreleasePool releasePool;
        if (texture != nullptr) {
            texture->release();
        }
    }'''
        assert old_tex_view in msrc, "Failed to locate MetalTextureView ctor/dtor in plume_metal.cpp"
        msrc = msrc.replace(old_tex_view, new_tex_view, 1)

        # 2b. MetalShader / MetalComputePipeline / MetalGraphicsPipeline: avoid dispatch_get_main_queue() leak & log shader/PSO errors to ios_debug.log
        old_shader_dispatch = '''        NS::Error *error = nullptr;
        const dispatch_data_t dispatchData = dispatch_data_create(data, size, dispatch_get_main_queue(), ^{});
        library = device->mtl->newLibrary(dispatchData, &error);

        if (error != nullptr) {
            fprintf(stderr, "MTLDevice newLibraryWithSource: failed with error %s.\\\\n", error->localizedDescription()->utf8String());
            return;
        }'''
        new_shader_dispatch = '''        NS::Error *error = nullptr;
        const dispatch_data_t dispatchData = dispatch_data_create(data, size, nullptr, DISPATCH_DATA_DESTRUCTOR_DEFAULT);
        library = device->mtl->newLibrary(dispatchData, &error);
        if (dispatchData != nullptr) {
            dispatch_release(dispatchData);
        }

        if (error != nullptr || library == nullptr) {
            const char* errStr = (error && error->localizedDescription()) ? error->localizedDescription()->utf8String() : "null MTLLibrary";
            fprintf(stderr, "MTLDevice newLibraryWithSource: failed with error %s.\\\\n", errStr);
#if !PLUME_MACOS
            MarathonIOS_LogLine("METAL_ERR", errStr);
#endif
            return;
        }'''
        assert old_shader_dispatch in msrc, "Failed to locate dispatch_data_create in MetalShader"
        msrc = msrc.replace(old_shader_dispatch, new_shader_dispatch, 1)

        msrc = msrc.replace(
            "        functionName->release();\\n        library->release();",
            "        if (functionName != nullptr) functionName->release();\\n        if (library != nullptr) library->release();",
            1
        )

        old_create_fn = '''        NS::Error *error = nullptr;
        MTL::Function *function = library->newFunction(functionName, values, &error);
        values->release();

        if (error != nullptr) {
            fprintf(stderr, "MTLLibrary newFunction: failed with error: %s.\\\\n", error->localizedDescription()->utf8String());
            return nullptr;
        }'''
        new_create_fn = '''        if (library == nullptr) {
            values->release();
            return nullptr;
        }
        NS::Error *error = nullptr;
        MTL::Function *function = library->newFunction(functionName, values, &error);
        values->release();

        if (error != nullptr || function == nullptr) {
            const char* errStr = (error && error->localizedDescription()) ? error->localizedDescription()->utf8String() : "null MTLFunction";
            fprintf(stderr, "MTLLibrary newFunction: failed with error: %s.\\\\n", errStr);
#if !PLUME_MACOS
            MarathonIOS_LogLine("METAL_ERR", errStr);
#endif
            return nullptr;
        }'''
        assert old_create_fn in msrc, "Failed to locate MetalShader::createFunction in plume_metal.cpp"
        msrc = msrc.replace(old_create_fn, new_create_fn, 1)

        old_cpso_err = '''        if (error != nullptr) {
            fprintf(stderr, "MTLDevice newComputePipelineStateWithDescriptor: failed with error %s.\\\\n", error->localizedDescription()->utf8String());
            return;
        }'''
        new_cpso_err = '''        if (error != nullptr || state.pipelineState == nullptr) {
            const char* errStr = (error && error->localizedDescription()) ? error->localizedDescription()->utf8String() : "null ComputePipelineState";
            fprintf(stderr, "MTLDevice newComputePipelineStateWithDescriptor: failed with error %s.\\\\n", errStr);
#if !PLUME_MACOS
            MarathonIOS_LogLine("METAL_ERR", errStr);
#endif
            return;
        }'''
        assert old_cpso_err in msrc, "Failed to locate MetalComputePipeline error check in plume_metal.cpp"
        msrc = msrc.replace(old_cpso_err, new_cpso_err, 1)

        old_gpso_err = '''        if (error != nullptr) {
            fprintf(stderr, "MTLDevice newRenderPipelineState: failed with error %s.\\\\n", error->localizedDescription()->utf8String());
            return;
        }'''
        new_gpso_err = '''        if (error != nullptr || state.renderPipelineState == nullptr) {
            const char* errStr = (error && error->localizedDescription()) ? error->localizedDescription()->utf8String() : "null RenderPipelineState";
            fprintf(stderr, "MTLDevice newRenderPipelineState: failed with error %s.\\\\n", errStr);
#if !PLUME_MACOS
            MarathonIOS_LogLine("METAL_ERR", errStr);
#endif
            return;
        }'''
        assert old_gpso_err in msrc, "Failed to locate MetalGraphicsPipeline error check in plume_metal.cpp"
        msrc = msrc.replace(old_gpso_err, new_gpso_err, 1)

        # 2c. MetalDescriptorSet: thread-safe resourceEntries mutex + null guards + generation counter for pre-draw useResource()
        old_ds_dtor = '''    MetalDescriptorSet::~MetalDescriptorSet() {
        MetalAutoreleasePool releasePool;
        for (const auto &entry : resourceEntries) {
            if (entry.resource != nullptr) {
                entry.resource->release();
            }
        }

        if (argumentBuffer.mtl != nullptr) {
            argumentBuffer.mtl->release();
        }
    }'''
        new_ds_dtor = '''    MetalDescriptorSet::~MetalDescriptorSet() {
        MetalAutoreleasePool releasePool;
        std::vector<MTL::Resource*> toRelease;
        {
#if !PLUME_MACOS
            std::lock_guard<std::mutex> lock(g_iosDescriptorSetMutex);
#endif
            toRelease.reserve(resourceEntries.size());
            for (auto &entry : resourceEntries) {
                if (entry.resource != nullptr) {
                    toRelease.push_back(entry.resource);
                    entry.resource = nullptr;
                }
            }
        }
        for (MTL::Resource* res : toRelease) {
            res->release();
        }

        if (argumentBuffer.mtl != nullptr) {
            argumentBuffer.mtl->release();
        }
    }'''
        assert old_ds_dtor in msrc, "Failed to locate MetalDescriptorSet::~MetalDescriptorSet in plume_metal.cpp"
        msrc = msrc.replace(old_ds_dtor, new_ds_dtor, 1)

        old_ds_set = '''            switch (dtype) {
                case MTL::DataTypeTexture: {
                    const TextureDescriptor *textureDescriptor = static_cast<const TextureDescriptor *>(descriptor);
                    nativeResource = textureDescriptor->texture;
                    MTL::Texture *nativeTexture = static_cast<MTL::Texture *>(nativeResource);
                    if (device->useArgumentBuffersTier2) {
                        *reinterpret_cast<MTL::ResourceID*>(bufferPtr + argumentOffset) = nativeTexture->gpuResourceID();
                    } else {
                        argumentBuffer.argumentEncoder->setTexture(nativeTexture, argumentIndex);
                    }
                    nativeTexture->retain();
                    break;
                }
                case MTL::DataTypePointer: {
                    const BufferDescriptor *bufferDescriptor = static_cast<const BufferDescriptor *>(descriptor);
                    nativeResource = bufferDescriptor->buffer;
                    MTL::Buffer *nativeBuffer = static_cast<MTL::Buffer *>(nativeResource);
                    if (device->useDirectBufferAddresses) {
                        uint64_t gpuAddress = nativeBuffer->gpuAddress() + bufferDescriptor->offset;
                        *reinterpret_cast<uint64_t*>(bufferPtr + argumentOffset) = gpuAddress;
                    } else {
                        argumentBuffer.argumentEncoder->setBuffer(nativeBuffer, bufferDescriptor->offset, argumentIndex);
                    }
                    nativeBuffer->retain();
                    break;
                }
                case MTL::DataTypeSampler: {
                    const SamplerDescriptor *samplerDescriptor = static_cast<const SamplerDescriptor *>(descriptor);
                    if (device->useArgumentBuffersTier2) {
                        *reinterpret_cast<MTL::ResourceID*>(bufferPtr + argumentOffset) = samplerDescriptor->state->gpuResourceID();
                    } else {
                        argumentBuffer.argumentEncoder->setSamplerState(samplerDescriptor->state, argumentIndex);
                    }
                    break;
                }

                default:
                    assert(false && "Unsupported descriptor type.");
            }
        }

        if (argumentBuffer.mtl->storageMode() == MTL::StorageModeManaged) {
            argumentBuffer.mtl->didModifyRange(NS::Range(argumentBuffer.offset, argumentBuffer.mtl->length() - argumentBuffer.offset));
        }

        MTL::Resource *oldResource = resourceEntries[descriptorIndex].resource;
        if (oldResource != nullptr) {
            oldResource->release();
        }

        resourceEntries[descriptorIndex].resource = nativeResource;
        resourceEntries[descriptorIndex].type = descriptorType;'''
        new_ds_set = '''            switch (dtype) {
                case MTL::DataTypeTexture: {
                    const TextureDescriptor *textureDescriptor = static_cast<const TextureDescriptor *>(descriptor);
                    nativeResource = textureDescriptor->texture;
                    MTL::Texture *nativeTexture = static_cast<MTL::Texture *>(nativeResource);
                    if (nativeTexture != nullptr) {
                        if (device->useArgumentBuffersTier2) {
                            *reinterpret_cast<MTL::ResourceID*>(bufferPtr + argumentOffset) = nativeTexture->gpuResourceID();
                        } else {
                            argumentBuffer.argumentEncoder->setTexture(nativeTexture, argumentIndex);
                        }
                        nativeTexture->retain();
                    } else {
#if !PLUME_MACOS
                        MarathonIOS_LogLine("METAL_ERR", "setDescriptor received null MTL::Texture");
#endif
                    }
                    break;
                }
                case MTL::DataTypePointer: {
                    const BufferDescriptor *bufferDescriptor = static_cast<const BufferDescriptor *>(descriptor);
                    nativeResource = bufferDescriptor->buffer;
                    MTL::Buffer *nativeBuffer = static_cast<MTL::Buffer *>(nativeResource);
                    if (nativeBuffer != nullptr) {
                        if (device->useDirectBufferAddresses) {
                            uint64_t gpuAddress = nativeBuffer->gpuAddress() + bufferDescriptor->offset;
                            *reinterpret_cast<uint64_t*>(bufferPtr + argumentOffset) = gpuAddress;
                        } else {
                            argumentBuffer.argumentEncoder->setBuffer(nativeBuffer, bufferDescriptor->offset, argumentIndex);
                        }
                        nativeBuffer->retain();
                    } else {
#if !PLUME_MACOS
                        MarathonIOS_LogLine("METAL_ERR", "setDescriptor received null MTL::Buffer");
#endif
                    }
                    break;
                }
                case MTL::DataTypeSampler: {
                    const SamplerDescriptor *samplerDescriptor = static_cast<const SamplerDescriptor *>(descriptor);
                    if (samplerDescriptor->state != nullptr) {
                        if (device->useArgumentBuffersTier2) {
                            *reinterpret_cast<MTL::ResourceID*>(bufferPtr + argumentOffset) = samplerDescriptor->state->gpuResourceID();
                        } else {
                            argumentBuffer.argumentEncoder->setSamplerState(samplerDescriptor->state, argumentIndex);
                        }
                    }
                    break;
                }

                default:
                    assert(false && "Unsupported descriptor type.");
            }
        }

        if (argumentBuffer.mtl->storageMode() == MTL::StorageModeManaged) {
            argumentBuffer.mtl->didModifyRange(NS::Range(argumentBuffer.offset, argumentBuffer.mtl->length() - argumentBuffer.offset));
        }

        MTL::Resource *oldResource = nullptr;
        {
#if !PLUME_MACOS
            std::lock_guard<std::mutex> lock(g_iosDescriptorSetMutex);
#endif
            oldResource = resourceEntries[descriptorIndex].resource;
            resourceEntries[descriptorIndex].resource = nativeResource;
            resourceEntries[descriptorIndex].type = descriptorType;
        }
#if !PLUME_MACOS
        if (nativeResource != nullptr) {
            g_iosDescriptorGen.fetch_add(1, std::memory_order_release);
        }
#endif
        if (oldResource != nullptr) {
            oldResource->release();
        }'''
        assert old_ds_set in msrc, "Failed to locate MetalDescriptorSet::setDescriptor in plume_metal.cpp"
        msrc = msrc.replace(old_ds_set, new_ds_set, 1)

        # 2d. MetalSwapChain::present: transfer drawable ownership, RETAINED commandBuffer() on iOS, log Metal errors
        old_present_drawable = '''        const MetalDrawable &drawable = drawables[textureIndex];
        assert(drawable.mtl != nullptr && "Cannot present without a valid drawable.");

        // Create a new command buffer just for presenting
        MTL::CommandBuffer *presentBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        presentBuffer->setLabel(MTLSTR("Present Command Buffer"));
        presentBuffer->enqueue();

        for (uint32_t i = 0; i < waitSemaphoreCount; i++) {
            MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(waitSemaphores[i]);
            presentBuffer->encodeWait(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue++);
        }

        const uint64_t presentId = ++currentPresentId;

        // According to Apple, presenting via scheduled handler is more performant than using the presentDrawable method.
        // We grab the underlying drawable because we might've acquired a new one by now and the old one would have been released.
        CA::MetalDrawable *drawableMtl = drawable.mtl->retain();'''
        new_present_drawable = '''        MetalDrawable &drawable = drawables[textureIndex];
        CA::MetalDrawable *drawableMtl = drawable.mtl;
        drawable.mtl = nullptr;
        if (drawableMtl == nullptr) {
            return false;
        }

        // Create a new command buffer just for presenting (RETAINED references on iOS to prevent InvalidResource faults!)
#if !PLUME_MACOS
        MTL::CommandBuffer *presentBuffer = commandQueue->mtl->commandBuffer();
#else
        MTL::CommandBuffer *presentBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
#endif
        presentBuffer->setLabel(MTLSTR("Present Command Buffer"));
        presentBuffer->enqueue();

        for (uint32_t i = 0; i < waitSemaphoreCount; i++) {
            MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(waitSemaphores[i]);
            presentBuffer->encodeWait(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue++);
        }

        const uint64_t presentId = ++currentPresentId;'''
        assert old_present_drawable in msrc, "Failed to locate drawable retain in MetalSwapChain::present"
        msrc = msrc.replace(old_present_drawable, new_present_drawable, 1)

        old_present_sched = '''        presentBuffer->addScheduledHandler([drawableMtl](MTL::CommandBuffer* cmdBuffer) {
            drawableMtl->present();
        });'''
        new_present_sched = '''        presentBuffer->addScheduledHandler([drawableMtl](MTL::CommandBuffer* cmdBuffer) {
#if !PLUME_MACOS
            presentIOSDrawable(drawableMtl, MarathonIOS_GetEffectiveTargetFPS());
            MarathonIOS_LosslessRecordPresentedFrame();
#else
            drawableMtl->present();
#endif
        });'''
        assert old_present_sched in msrc, "Failed to locate presentBuffer scheduled handler in plume_metal.cpp"
        msrc = msrc.replace(old_present_sched, new_present_sched, 1)

        old_present_done = '''        presentBuffer->addCompletedHandler([drawableMtl, presentId, this](MTL::CommandBuffer* cmdBuffer) {
            currentAvailableDrawableIndex = (currentAvailableDrawableIndex + 1) % MAX_DRAWABLES;
            drawableMtl->release();'''
        new_present_done = '''        presentBuffer->addCompletedHandler([drawableMtl, presentId, this](MTL::CommandBuffer* cmdBuffer) {
#if !PLUME_MACOS
            logIOSMetalCmdBufferError("present", cmdBuffer);
#endif
            drawableMtl->release();'''
        assert old_present_done in msrc, "Failed to locate presentBuffer completed handler in plume_metal.cpp"
        msrc = msrc.replace(old_present_done, new_present_done, 1)

        # 2e. MetalSwapChain::acquireTexture: skip while suspended + release stale slot before nextDrawable() + RETAINED commandBuffer() on iOS
        old_acq_full = '''        // Create a command buffer just to encode the signal
        MetalAutoreleasePool releasePool;
        MTL::CommandBuffer *acquireBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        acquireBuffer->setLabel(MTLSTR("Acquire Drawable Command Buffer"));
        const MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(signalSemaphore);
        acquireBuffer->enqueue();
        acquireBuffer->encodeSignalEvent(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue);
        acquireBuffer->commit();

        CA::MetalDrawable *nextDrawable = layer->nextDrawable();
        if (nextDrawable == nullptr) {
            fprintf(stderr, "No more drawables available for rendering.\\\\n");
            return false;
        }

        // Set the texture index and drawable data
        *textureIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[currentAvailableDrawableIndex];
        drawable.desc.width = width;
        drawable.desc.height = height;
        drawable.desc.flags = RenderTextureFlag::RENDER_TARGET;
        drawable.desc.format = mapRenderFormat(nextDrawable->texture()->pixelFormat());
        if (drawable.mtl) {
            // Release our reference before replacing.
            drawable.mtl->release();
        }
        drawable.mtl = nextDrawable;

        drawable.mtl->retain();

        return true;'''
        new_acq_full = '''        MetalAutoreleasePool releasePool;
#if !PLUME_MACOS
        if (MarathonIOS_IsAppSuspended()) {
            return false;
        }
#endif
        const uint32_t slotIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[slotIndex];
        if (drawable.mtl != nullptr) {
            // Release any previous drawable before asking iOS CAMetalLayer (3-drawable pool) for the next one.
            drawable.mtl->release();
            drawable.mtl = nullptr;
        }

        CA::MetalDrawable *nextDrawable = layer->nextDrawable();
        if (nextDrawable == nullptr) {
            fprintf(stderr, "No more drawables available for rendering.\\\\n");
            return false;
        }
#if !PLUME_MACOS
        if (nextDrawable->texture() != nullptr) {
            const uint32_t texW = static_cast<uint32_t>(nextDrawable->texture()->width());
            const uint32_t texH = static_cast<uint32_t>(nextDrawable->texture()->height());
            if (texW != width || texH != height) {
                return false;
            }
        }
#endif
        // Signal acquire semaphore only once a valid drawable has been obtained.
#if !PLUME_MACOS
        MTL::CommandBuffer *acquireBuffer = commandQueue->mtl->commandBuffer();
#else
        MTL::CommandBuffer *acquireBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
#endif
        acquireBuffer->setLabel(MTLSTR("Acquire Drawable Command Buffer"));
        const MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(signalSemaphore);
        acquireBuffer->enqueue();
        acquireBuffer->encodeSignalEvent(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue);
        acquireBuffer->commit();

        // Set the texture index and drawable data, then advance round-robin index safely on render thread
        *textureIndex = slotIndex;
        currentAvailableDrawableIndex = (slotIndex + 1) % MAX_DRAWABLES;
        drawable.desc.width = width;
        drawable.desc.height = height;
        drawable.desc.flags = RenderTextureFlag::RENDER_TARGET;
        drawable.desc.format = mapRenderFormat(nextDrawable->texture()->pixelFormat());
        drawable.mtl = nextDrawable;
        drawable.mtl->retain();

        return true;'''
        assert old_acq_full in msrc, "Failed to locate acquireTexture body in plume_metal.cpp"
        msrc = msrc.replace(old_acq_full, new_acq_full, 1)

        # 2f. MetalCommandList::begin & MetalCommandQueue::executeCommandLists: RETAINED commandBuffer() on iOS!
        old_cl_begin = '''        startedEncoding = false;
        mtl = queue->mtl->commandBufferWithUnretainedReferences();'''
        new_cl_begin = '''        startedEncoding = false;
#if !PLUME_MACOS
        mtl = queue->mtl->commandBuffer();
#else
        mtl = queue->mtl->commandBufferWithUnretainedReferences();
#endif'''
        assert old_cl_begin in msrc, "Failed to locate MetalCommandList::begin commandBuffer in plume_metal.cpp"
        msrc = msrc.replace(old_cl_begin, new_cl_begin, 1)

        old_wait_cb = '''        // Create a new command buffer to encode the wait semaphores into
        MetalAutoreleasePool releasePool;
        MTL::CommandBuffer* cmdBuffer = mtl->commandBufferWithUnretainedReferences();'''
        new_wait_cb = '''        // Create a new command buffer to encode the wait semaphores into
        MetalAutoreleasePool releasePool;
#if !PLUME_MACOS
        MTL::CommandBuffer* cmdBuffer = mtl->commandBuffer();
#else
        MTL::CommandBuffer* cmdBuffer = mtl->commandBufferWithUnretainedReferences();
#endif'''
        assert old_wait_cb in msrc, "Failed to locate MetalCommandQueue::executeCommandLists wait cmdBuffer in plume_metal.cpp"
        msrc = msrc.replace(old_wait_cb, new_wait_cb, 1)

        # 2g. CRITICAL FIX: Declare useResource() BEFORE draw/dispatch calls (NOT after draws inside endActive*Encoder!)
        #     + Fix deprecated 2-arg renderEncoder->useResource() to 3-arg with RenderStageVertex | RenderStageFragment
        #     + Lock g_iosDescriptorSetMutex around resourceEntries iteration
        old_compute_enc = '''        // Descriptor sets
        if (dirtyComputeState.descriptorSets) {
            activeComputePipelineLayout->bindDescriptorSets(activeComputeEncoder, computeDescriptorSets, MAX_DESCRIPTOR_SET_BINDINGS, true, dirtyComputeState.descriptorSetDirtyIndex, currentEncoderDescriptorSets, device->residencySet != nullptr);
            dirtyComputeState.descriptorSets = 0;
            dirtyComputeState.descriptorSetDirtyIndex = MAX_DESCRIPTOR_SET_BINDINGS;
        }'''
        new_compute_enc = '''        // Descriptor sets
        if (dirtyComputeState.descriptorSets) {
            activeComputePipelineLayout->bindDescriptorSets(activeComputeEncoder, computeDescriptorSets, MAX_DESCRIPTOR_SET_BINDINGS, true, dirtyComputeState.descriptorSetDirtyIndex, currentEncoderDescriptorSets, device->residencySet != nullptr);
            dirtyComputeState.descriptorSets = 0;
            dirtyComputeState.descriptorSetDirtyIndex = MAX_DESCRIPTOR_SET_BINDINGS;
        }
#if !PLUME_MACOS
        if (device->residencySet == nullptr && activeComputeEncoder != nullptr) {
            const uint64_t addrGen = g_iosAddressableGen.load(std::memory_order_acquire);
            const uint64_t descGen = g_iosDescriptorGen.load(std::memory_order_acquire);
            if (g_iosLastComputeEncoder != activeComputeEncoder) {
                bindEncoderResources(activeComputeEncoder, true);
                g_iosLastComputeEncoder = activeComputeEncoder;
                g_iosLastComputeAddrGen = addrGen;
                g_iosLastComputeDescGen = descGen;
            } else {
                if (addrGen != g_iosLastComputeAddrGen) {
                    bindIOSAddressableResources(activeComputeEncoder, true, device);
                    g_iosLastComputeAddrGen = addrGen;
                }
                if (descGen != g_iosLastComputeDescGen) {
                    for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                        bindIOSDescriptorSetResources(activeComputeEncoder, true, descriptorSet);
                    }
                    g_iosLastComputeDescGen = descGen;
                }
            }
        }
#endif'''
        assert old_compute_enc in msrc, "Failed to locate compute descriptorSets block in plume_metal.cpp"
        msrc = msrc.replace(old_compute_enc, new_compute_enc, 1)

        old_end_compute = '''    void MetalCommandList::endActiveComputeEncoder() {
        if (activeComputeEncoder != nullptr) {
            bindEncoderResources(activeComputeEncoder, true);'''
        new_end_compute = '''    void MetalCommandList::endActiveComputeEncoder() {
        if (activeComputeEncoder != nullptr) {
#if PLUME_MACOS
            bindEncoderResources(activeComputeEncoder, true);
#else
            g_iosLastComputeEncoder = nullptr;
#endif'''
        assert old_end_compute in msrc, "Failed to locate endActiveComputeEncoder in plume_metal.cpp"
        msrc = msrc.replace(old_end_compute, new_end_compute, 1)

        old_render_ds = '''        // Descriptor sets
        if (dirtyGraphicsState.descriptorSets) {
            if (activeGraphicsPipelineLayout) {
                activeGraphicsPipelineLayout->bindDescriptorSets(activeRenderEncoder, renderDescriptorSets, MAX_DESCRIPTOR_SET_BINDINGS, false, dirtyGraphicsState.descriptorSetDirtyIndex, currentEncoderDescriptorSets, device->residencySet != nullptr);
            }
            dirtyGraphicsState.descriptorSets = 0;
            dirtyGraphicsState.descriptorSetDirtyIndex = MAX_DESCRIPTOR_SET_BINDINGS;
        }'''
        new_render_ds = '''        // Descriptor sets
        if (dirtyGraphicsState.descriptorSets) {
            if (activeGraphicsPipelineLayout) {
                activeGraphicsPipelineLayout->bindDescriptorSets(activeRenderEncoder, renderDescriptorSets, MAX_DESCRIPTOR_SET_BINDINGS, false, dirtyGraphicsState.descriptorSetDirtyIndex, currentEncoderDescriptorSets, device->residencySet != nullptr);
            }
            dirtyGraphicsState.descriptorSets = 0;
            dirtyGraphicsState.descriptorSetDirtyIndex = MAX_DESCRIPTOR_SET_BINDINGS;
        }
#if !PLUME_MACOS
        if (device->residencySet == nullptr && activeRenderEncoder != nullptr) {
            const uint64_t addrGen = g_iosAddressableGen.load(std::memory_order_acquire);
            const uint64_t descGen = g_iosDescriptorGen.load(std::memory_order_acquire);
            if (g_iosLastRenderEncoder != activeRenderEncoder) {
                bindEncoderResources(activeRenderEncoder, false);
                g_iosLastRenderEncoder = activeRenderEncoder;
                g_iosLastRenderAddrGen = addrGen;
                g_iosLastRenderDescGen = descGen;
            } else {
                if (addrGen != g_iosLastRenderAddrGen) {
                    bindIOSAddressableResources(activeRenderEncoder, false, device);
                    g_iosLastRenderAddrGen = addrGen;
                }
                if (descGen != g_iosLastRenderDescGen) {
                    for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                        bindIOSDescriptorSetResources(activeRenderEncoder, false, descriptorSet);
                    }
                    g_iosLastRenderDescGen = descGen;
                }
            }
        }
#endif'''
        assert old_render_ds in msrc, "Failed to locate graphics descriptorSets block in plume_metal.cpp"
        msrc = msrc.replace(old_render_ds, new_render_ds, 1)

        old_end_render = '''    void MetalCommandList::endActiveRenderEncoder() {
        if (activeRenderEncoder != nullptr) {
            bindEncoderResources(activeRenderEncoder, false);'''
        new_end_render = '''    void MetalCommandList::endActiveRenderEncoder() {
        if (activeRenderEncoder != nullptr) {
#if PLUME_MACOS
            bindEncoderResources(activeRenderEncoder, false);
#else
            g_iosLastRenderEncoder = nullptr;
#endif'''
        assert old_end_render in msrc, "Failed to locate endActiveRenderEncoder in plume_metal.cpp"
        msrc = msrc.replace(old_end_render, new_end_render, 1)

        old_bind_enc = '''    void MetalCommandList::bindEncoderResources(MTL::CommandEncoder* encoder, bool isCompute) {
        if (device->residencySet != nullptr) {
            // No need to do anything if residency sets are in use.
            return;
        }

        if (isCompute) {
            auto* computeEncoder = static_cast<MTL::ComputeCommandEncoder*>(encoder);
            {
                std::lock_guard lock(device->resourcesMutex);
                for (const auto* resource : device->gpuAddressableResources) {
                    computeEncoder->useResource(resource, MTL::ResourceUsageRead | MTL::ResourceUsageWrite);
                }
            }
            for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                for (const auto& entry : descriptorSet->resourceEntries) {
                    if (entry.resource != nullptr) {
                        computeEncoder->useResource(entry.resource, mapResourceUsage(entry.type));
                    }
                }
            }
        } else {
            auto* renderEncoder = static_cast<MTL::RenderCommandEncoder*>(encoder);
            {
                std::lock_guard lock(device->resourcesMutex);
                for (const auto* resource : device->gpuAddressableResources) {
                    renderEncoder->useResource(resource, MTL::ResourceUsageRead | MTL::ResourceUsageWrite);
                }
            }
            for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                for (const auto& entry : descriptorSet->resourceEntries) {
                    if (entry.resource != nullptr) {
                        renderEncoder->useResource(entry.resource, mapResourceUsage(entry.type), MTL::RenderStageVertex | MTL::RenderStageFragment);
                    }
                }
            }
        }
    }'''
        new_bind_enc = '''    void MetalCommandList::bindEncoderResources(MTL::CommandEncoder* encoder, bool isCompute) {
        if (device->residencySet != nullptr || encoder == nullptr) {
            // No need to do anything if residency sets are in use.
            return;
        }

#if !PLUME_MACOS
        bindIOSAddressableResources(encoder, isCompute, device);
        for (const auto* descriptorSet : currentEncoderDescriptorSets) {
            bindIOSDescriptorSetResources(encoder, isCompute, descriptorSet);
        }
#else
        if (isCompute) {
            auto* computeEncoder = static_cast<MTL::ComputeCommandEncoder*>(encoder);
            {
                std::lock_guard lock(device->resourcesMutex);
                for (const auto* resource : device->gpuAddressableResources) {
                    if (resource != nullptr) {
                        computeEncoder->useResource(resource, MTL::ResourceUsageRead | MTL::ResourceUsageWrite);
                    }
                }
            }
            for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                for (const auto& entry : descriptorSet->resourceEntries) {
                    if (entry.resource != nullptr) {
                        computeEncoder->useResource(entry.resource, mapResourceUsage(entry.type));
                    }
                }
            }
        } else {
            auto* renderEncoder = static_cast<MTL::RenderCommandEncoder*>(encoder);
            {
                std::lock_guard lock(device->resourcesMutex);
                for (const auto* resource : device->gpuAddressableResources) {
                    if (resource != nullptr) {
                        renderEncoder->useResource(resource, MTL::ResourceUsageRead | MTL::ResourceUsageWrite, MTL::RenderStageVertex | MTL::RenderStageFragment);
                    }
                }
            }
            for (const auto* descriptorSet : currentEncoderDescriptorSets) {
                for (const auto& entry : descriptorSet->resourceEntries) {
                    if (entry.resource != nullptr) {
                        renderEncoder->useResource(entry.resource, mapResourceUsage(entry.type), MTL::RenderStageVertex | MTL::RenderStageFragment);
                    }
                }
            }
        }
#endif
    }'''
        assert old_bind_enc in msrc, "Failed to locate MetalCommandList::bindEncoderResources in plume_metal.cpp"
        msrc = msrc.replace(old_bind_enc, new_bind_enc, 1)

        old_bind_ds_track = '''            if (!usingResidencySets) {
                // Track descriptor set for later resource binding
                encoderDescriptorSets.insert(const_cast<MetalDescriptorSet*>(descriptorSet));
            }'''
        new_bind_ds_track = '''            if (!usingResidencySets) {
                // Track descriptor set and IMMEDIATELY declare its resources BEFORE draw/dispatch on iOS!
                const bool inserted = encoderDescriptorSets.insert(const_cast<MetalDescriptorSet*>(descriptorSet)).second;
#if !PLUME_MACOS
                if (inserted) {
                    bindIOSDescriptorSetResources(encoder, isCompute, descriptorSet);
                }
#else
                (void)inserted;
#endif
            }'''
        assert old_bind_ds_track in msrc, "Failed to locate MetalPipelineLayout::bindDescriptorSets tracking in plume_metal.cpp"
        msrc = msrc.replace(old_bind_ds_track, new_bind_ds_track, 1)

        # 2h. Log Metal command buffer errors on signaled fences (zero extra GCD block allocations on fence-less command buffers!)
        old_exec_done = '''        if (signalFence != nullptr) {
            interfaceCommandList->mtl->addCompletedHandler([signalFence](MTL::CommandBuffer* cmdBuffer) {
                dispatch_semaphore_signal(static_cast<MetalCommandFence *>(signalFence)->semaphore);
            });
        }'''
        new_exec_done = '''        if (signalFence != nullptr) {
            interfaceCommandList->mtl->addCompletedHandler([signalFence](MTL::CommandBuffer* cmdBuffer) {
#if !PLUME_MACOS
                logIOSMetalCmdBufferError("exec", cmdBuffer);
#endif
                dispatch_semaphore_signal(static_cast<MetalCommandFence *>(signalFence)->semaphore);
            });
        }'''
        assert old_exec_done in msrc, "Failed to locate executeCommandLists completed handler in plume_metal.cpp"
        msrc = msrc.replace(old_exec_done, new_exec_done, 1)

        old_wait_fence = '''    void MetalCommandQueue::waitForCommandFence(RenderCommandFence *fence) {
        MetalAutoreleasePool releasePool;
        const MetalCommandFence *metalFence = static_cast<MetalCommandFence *>(fence);
        dispatch_semaphore_wait(metalFence->semaphore, DISPATCH_TIME_FOREVER);
    }'''
        new_wait_fence = '''    void MetalCommandQueue::waitForCommandFence(RenderCommandFence *fence) {
        MetalAutoreleasePool releasePool;
        const MetalCommandFence *metalFence = static_cast<MetalCommandFence *>(fence);
#if !PLUME_MACOS
        while (dispatch_semaphore_wait(metalFence->semaphore, dispatch_time(DISPATCH_TIME_NOW, 5LL * NSEC_PER_SEC)) != 0) {
            if (!MarathonIOS_IsAppSuspended()) {
                MarathonIOS_LogLine("METAL_WARN", "waitForCommandFence stalled >5s waiting for GPU completion");
            }
        }
#else
        dispatch_semaphore_wait(metalFence->semaphore, DISPATCH_TIME_FOREVER);
#endif
    }'''
        assert old_wait_fence in msrc, "Failed to locate MetalCommandQueue::waitForCommandFence in plume_metal.cpp"
        msrc = msrc.replace(old_wait_fence, new_wait_fence, 1)

        # 2i. Disable unguarded cross-thread MTLResidencySet on iOS 18+ so Plume uses retained commandBuffer() + pre-draw useResource()
        old_ios_residency = "        const bool supportsResidencySets = osVersion.majorVersion >= 18 && mtl->supportsFamily(MTL::GPUFamilyApple6);"
        new_ios_residency = "        const bool supportsResidencySets = false; // MARATHON_IOS_DISABLE_RESIDENCY_SET: usa commandBuffer() retained + pre-draw useResource() su iOS"
        assert old_ios_residency in msrc, "Failed to locate iOS supportsResidencySets in plume_metal.cpp"
        msrc = msrc.replace(old_ios_residency, new_ios_residency, 1)

        # Log Metal GPU capabilities once on iOS device creation
        old_null_buf = "        nullBuffer = createBuffer(RenderBufferDesc::DefaultBuffer(16, RenderBufferFlag::VERTEX));"
        new_null_buf = '''        nullBuffer = createBuffer(RenderBufferDesc::DefaultBuffer(16, RenderBufferFlag::VERTEX));
#if !PLUME_MACOS
        {
            char gpuBuf[256];
            std::snprintf(gpuBuf, sizeof(gpuBuf),
                "GPU=%s argTier2=%d directAddr=%d bda=%d metal3=%d apple6=%d uma=%d",
                description.name.c_str(), useArgumentBuffersTier2 ? 1 : 0, useDirectBufferAddresses ? 1 : 0,
                capabilities.bufferDeviceAddress ? 1 : 0,
                mtl->supportsFamily(MTL::GPUFamilyMetal3) ? 1 : 0,
                mtl->supportsFamily(MTL::GPUFamilyApple6) ? 1 : 0,
                capabilities.uma ? 1 : 0);
            MarathonIOS_LogLine("METAL_INFO", gpuBuf);
        }
#endif'''
        assert old_null_buf in msrc, "Failed to locate nullBuffer creation in MetalDevice::MetalDevice"
        msrc = msrc.replace(old_null_buf, new_null_buf, 1)

        # 2j. Defensive null-guards for MetalQueryPool, timestampCounterSet, and addResource/removeResource (+ addressable generation counter)
        old_qp = '''        MTL::CounterSampleBufferDescriptor *sampleBufferDesc = MTL::CounterSampleBufferDescriptor::alloc()->init();
        sampleBufferDesc->setCounterSet(device->timestampCounterSet);
        sampleBufferDesc->setStorageMode(MTL::StorageModeShared);
        sampleBufferDesc->setSampleCount(queryCount);
        sampleBuffer = device->mtl->newCounterSampleBuffer(sampleBufferDesc, nullptr);
        sampleBufferDesc->release();

        results.resize(queryCount, 0);
    }

    MetalQueryPool::~MetalQueryPool() {
        MetalAutoreleasePool releasePool;
        sampleBuffer->release();
    }

    void MetalQueryPool::queryResults() {
        MetalAutoreleasePool releasePool;
        const NS::Data* data = sampleBuffer->resolveCounterRange(NS::Range(0, results.size()));
        std::memcpy(results.data(), data->mutableBytes(), results.size() * sizeof(uint64_t));
    }'''
        new_qp = '''        if (device->timestampCounterSet != nullptr) {
            MTL::CounterSampleBufferDescriptor *sampleBufferDesc = MTL::CounterSampleBufferDescriptor::alloc()->init();
            sampleBufferDesc->setCounterSet(device->timestampCounterSet);
            sampleBufferDesc->setStorageMode(MTL::StorageModeShared);
            sampleBufferDesc->setSampleCount(queryCount);
            sampleBuffer = device->mtl->newCounterSampleBuffer(sampleBufferDesc, nullptr);
            sampleBufferDesc->release();
        } else {
            sampleBuffer = nullptr;
        }

        results.resize(queryCount, 0);
    }

    MetalQueryPool::~MetalQueryPool() {
        MetalAutoreleasePool releasePool;
        if (sampleBuffer != nullptr) {
            sampleBuffer->release();
        }
    }

    void MetalQueryPool::queryResults() {
        if (sampleBuffer == nullptr) {
            return;
        }
        MetalAutoreleasePool releasePool;
        const NS::Data* data = sampleBuffer->resolveCounterRange(NS::Range(0, results.size()));
        if (data != nullptr && data->mutableBytes() != nullptr) {
            std::memcpy(results.data(), data->mutableBytes(), results.size() * sizeof(uint64_t));
        }
    }'''
        assert old_qp in msrc, "Failed to locate MetalQueryPool in plume_metal.cpp"
        msrc = msrc.replace(old_qp, new_qp, 1)

        old_wt = '''        const MetalQueryPool *interfaceQueryPool = static_cast<const MetalQueryPool *>(queryPool);

        MTL::ComputeCommandEncoder *computeEncoder = activeComputeEncoder != nullptr ? activeComputeEncoder : activeResolveComputeEncoder;'''
        new_wt = '''        const MetalQueryPool *interfaceQueryPool = static_cast<const MetalQueryPool *>(queryPool);
        if (interfaceQueryPool->sampleBuffer == nullptr) {
            return;
        }

        MTL::ComputeCommandEncoder *computeEncoder = activeComputeEncoder != nullptr ? activeComputeEncoder : activeResolveComputeEncoder;'''
        assert old_wt in msrc, "Failed to locate MetalCommandList::writeTimestamp in plume_metal.cpp"
        msrc = msrc.replace(old_wt, new_wt, 1)

        msrc = msrc.replace(
            "    MTL::CounterSet* MetalDevice::findTimestampCounterSet() const {\\n        for (uint32_t setIndex = 0; setIndex < mtl->counterSets()->count(); setIndex++){",
            "    MTL::CounterSet* MetalDevice::findTimestampCounterSet() const {\\n        if (mtl->counterSets() == nullptr) return nullptr;\\n        for (uint32_t setIndex = 0; setIndex < mtl->counterSets()->count(); setIndex++){",
            1
        )
        old_add_res = '''    void MetalDevice::addResource(MTL::Resource *resource, bool addressable) {
        if (residencySet != nullptr || addressable) {
            std::lock_guard lock(resourcesMutex);
            if (residencySet != nullptr) {
                residencySet->addAllocation(resource);
                residencySet->commit();
            }
            if (addressable) {
                gpuAddressableResources.push_back(resource);
            }
        }
    }'''
        new_add_res = '''    void MetalDevice::addResource(MTL::Resource *resource, bool addressable) {
        if (resource == nullptr) return;
        if (residencySet != nullptr || addressable) {
            std::lock_guard lock(resourcesMutex);
            if (residencySet != nullptr) {
                residencySet->addAllocation(resource);
                residencySet->commit();
            }
            if (addressable) {
                gpuAddressableResources.push_back(resource);
#if !PLUME_MACOS
                g_iosAddressableGen.fetch_add(1, std::memory_order_release);
#endif
            }
        }
    }'''
        assert old_add_res in msrc, "Failed to locate MetalDevice::addResource in plume_metal.cpp"
        msrc = msrc.replace(old_add_res, new_add_res, 1)

        msrc = msrc.replace(
            "    void MetalDevice::removeResource(MTL::Resource *resource, bool addressable) {\\n        if (residencySet != nullptr || addressable) {",
            "    void MetalDevice::removeResource(MTL::Resource *resource, bool addressable) {\\n        if (resource == nullptr) return;\\n        if (residencySet != nullptr || addressable) {",
            1
        )

        old_dev_sel = '''        // Device Selection
        NS::Array* devices = MTL::CopyAllDevices();
        MTL::Device *preferredDevice = nullptr;
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            MTL::Device *device = (MTL::Device *)devices->object(i);
            const NS::String *preferredDeviceNameNS = NS::String::string(preferredDeviceName.c_str(), NS::UTF8StringEncoding);
            if (device->name()->isEqualToString(preferredDeviceNameNS)) {
                preferredDevice = device;
                break;
            }
        }

        mtl = preferredDevice ? preferredDevice : MTL::CreateSystemDefaultDevice();
        mtl->retain();
        devices->release();'''
        new_dev_sel = '''        // Device Selection
#if PLUME_MACOS
        NS::Array* devices = MTL::CopyAllDevices();
        MTL::Device *preferredDevice = nullptr;
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            MTL::Device *device = (MTL::Device *)devices->object(i);
            const NS::String *preferredDeviceNameNS = NS::String::string(preferredDeviceName.c_str(), NS::UTF8StringEncoding);
            if (device->name()->isEqualToString(preferredDeviceNameNS)) {
                preferredDevice = device;
                break;
            }
        }

        mtl = preferredDevice ? preferredDevice : MTL::CreateSystemDefaultDevice();
        mtl->retain();
        devices->release();
#else
        (void)preferredDeviceName;
        mtl = MTL::CreateSystemDefaultDevice();
        if (mtl) {
            mtl->retain();
        }
#endif'''
        if old_dev_sel in msrc:
            msrc = msrc.replace(old_dev_sel, new_dev_sel, 1)

        old_iface_devs = '''        // Fill device names.
        const NS::Array* devices = MTL::CopyAllDevices();
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            NS::String* deviceName = ((MTL::Device *)devices->object(i))->name();
            deviceNames.push_back(std::string(deviceName->utf8String()));
        }'''
        new_iface_devs = '''        // Fill device names.
#if PLUME_MACOS
        const NS::Array* devices = MTL::CopyAllDevices();
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            NS::String* deviceName = ((MTL::Device *)devices->object(i))->name();
            deviceNames.push_back(std::string(deviceName->utf8String()));
        }
#else
        MTL::Device* defaultDev = MTL::CreateSystemDefaultDevice();
        if (defaultDev) {
            deviceNames.push_back(std::string(defaultDev->name()->utf8String()));
            defaultDev->release();
        }
#endif'''
        if old_iface_devs in msrc:
            msrc = msrc.replace(old_iface_devs, new_iface_devs, 1)

        # 2k. Expose zero-overhead Metal object accessors & encoder flush for native Apple MetalFX in gpu/video.cpp
        old_tail = '''    std::unique_ptr<RenderInterface> CreateMetalInterface() {
        std::unique_ptr<MetalInterface> createdInterface = std::make_unique<MetalInterface>();
        return createdInterface->isValid() ? std::move(createdInterface) : nullptr;
    }
}'''
        new_tail = '''    std::unique_ptr<RenderInterface> CreateMetalInterface() {
        std::unique_ptr<MetalInterface> createdInterface = std::make_unique<MetalInterface>();
        return createdInterface->isValid() ? std::move(createdInterface) : nullptr;
    }

#if !PLUME_MACOS
    void* getIOSMetalTexturePtr(const RenderTexture* tex) {
        if (!tex) return nullptr;
        return static_cast<const ExtendedRenderTexture*>(tex)->getTexture();
    }

    void* getIOSMetalCommandBufferPtr(const RenderCommandList* cl) {
        if (!cl) return nullptr;
        return static_cast<const MetalCommandList*>(cl)->mtl;
    }

    void* getIOSMetalCommandQueuePtr(const RenderCommandQueue* q) {
        if (!q) return nullptr;
        return static_cast<const MetalCommandQueue*>(q)->mtl;
    }

    void* getIOSMetalLayerPtr(const RenderSwapChain* sc) {
        if (!sc) return nullptr;
        return static_cast<const MetalSwapChain*>(sc)->layer;
    }

    void* getIOSMetalDrawableTexturePtr(const RenderSwapChain* sc, uint32_t index) {
        if (!sc) return nullptr;
        const auto* msc = static_cast<const MetalSwapChain*>(sc);
        if (index >= msc->drawables.size()) return nullptr;
        return msc->drawables[index].mtl ? msc->drawables[index].mtl->texture() : nullptr;
    }

    void flushIOSMetalCommandListEncoders(RenderCommandList* cl) {
        if (!cl) return;
        auto* mcl = static_cast<MetalCommandList*>(cl);
        mcl->endActiveRenderEncoder();
        mcl->endActiveComputeEncoder();
        mcl->endActiveBlitEncoder();
        mcl->endActiveResolveTextureComputeEncoder();
    }
#endif
}'''
        assert old_tail in msrc, "Failed to locate CreateMetalInterface tail in plume_metal.cpp"
        msrc = msrc.replace(old_tail, new_tail, 1)

        metal_cpp.write_text(msrc, encoding="utf-8")
        print("Patched thirdparty/plume/plume_metal.cpp for iOS Metal + MetalFX native accessors.")

# 3. thirdparty/plume/CMakeLists.txt: skip plume_vulkan.cpp on iOS when building pure Metal 3
if cm.exists():
    csrc = cm.read_text(encoding="utf-8")
    if 'NOT CMAKE_SYSTEM_NAME STREQUAL "iOS"' not in csrc and "plume_vulkan.cpp" in csrc:
        csrc = csrc.replace(
            "set(PLUME_SOURCES\\n    plume_vulkan.cpp\\n    plume_vulkan.h\\n)",
            'set(PLUME_SOURCES)\\nif(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n    list(APPEND PLUME_SOURCES plume_vulkan.cpp plume_vulkan.h)\\nendif()'
        )
        cm.write_text(csrc, encoding="utf-8")
        print("Patched thirdparty/plume/CMakeLists.txt to use pure Metal 3 on iOS.")

# 4. MarathonRecomp/ui/game_window.cpp: Fullscreen Landscape Metal SDL flags + UIKit window + live window size sync + background/foreground lifecycle
if gw_cpp.exists():
    gsrc = gw_cpp.read_text(encoding="utf-8")
    if "SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER" not in gsrc:
        gsrc = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#include <ios_virtual_controller.h>\\n"
            "#endif\\n" + gsrc
        )
        # 4a. Set Landscape orientations & touch-to-mouse hints before SDL_InitSubSystem(SDL_INIT_VIDEO)
        gsrc = gsrc.replace(
            "    if (!SDL_InitSubSystem(SDL_INIT_VIDEO) && sdlVideoDriver)",
            "#if defined(MARATHON_IOS_PORT)\\n"
            '    SDL_SetHint(SDL_HINT_ORIENTATIONS, "LandscapeLeft LandscapeRight");\\n'
            '    SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "1");\\n'
            '    SDL_SetHint(SDL_HINT_MOUSE_TOUCH_EVENTS, "0");\\n'
            '    SDL_SetHint(SDL_HINT_IOS_HIDE_HOME_INDICATOR, "2");\\n'
            "#endif\\n"
            "    if (!SDL_InitSubSystem(SDL_INIT_VIDEO) && sdlVideoDriver)",
            1
        )
        # 4b. UIKit window handle & Metal layer
        gsrc = gsrc.replace(
            "#elif defined(__APPLE__)\\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));",
            "#elif defined(MARATHON_IOS_PORT)\\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER, nullptr);\\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));\\n#elif defined(__APPLE__)\\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));",
            1
        )
        # 4c. Sync actual iOS window size & focus right after SDL_ShowWindow
        gsrc = gsrc.replace(
            "    SDL_ShowWindow(s_pWindow);",
            "    SDL_ShowWindow(s_pWindow);\\n#if defined(MARATHON_IOS_PORT)\\n    SDL_GetWindowSize(s_pWindow, &s_width, &s_height);\\n    s_isFocused = true;\\n#endif",
            1
        )
        # 4d. Always create fullscreen high-DPI Metal window on iOS (keep flags in scope for subsequent lines)
        gsrc = gsrc.replace(
            "    SDL_WindowFlags flags = SDL_WINDOW_HIDDEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY;",
            "    SDL_WindowFlags flags =\\n"
            "#if defined(MARATHON_IOS_PORT)\\n"
            "        SDL_WINDOW_FULLSCREEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_METAL;\\n"
            "    return flags;\\n"
            "#else\\n"
            "        SDL_WINDOW_HIDDEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY;\\n"
            "#endif",
            1
        )
        # 4e. Also handle SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED on iOS rotation + iOS background/foreground lifecycle events
        gsrc = gsrc.replace(
            "        case SDL_EVENT_WINDOW_RESIZED:\\n            g_isResizing = true;\\n            Config::WindowSize = -1;\\n            GameWindow::s_width = event->window.data1;\\n            GameWindow::s_height = event->window.data2;",
            "        case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:\\n        case SDL_EVENT_WINDOW_RESIZED:\\n            g_isResizing = true;\\n            Config::WindowSize = -1;\\n            SDL_GetWindowSize(GameWindow::s_pWindow, &GameWindow::s_width, &GameWindow::s_height);",
            1
        )
        old_focus_lost = '''        case SDL_EVENT_WINDOW_FOCUS_LOST:
            GameWindow::s_isFocused = false;
            SDL_ShowCursor();
            break;

        case SDL_EVENT_WINDOW_FOCUS_GAINED:
            GameWindow::s_isFocused = true;
            break;'''
        new_focus_lost = '''        case SDL_EVENT_WINDOW_FOCUS_LOST:
            GameWindow::s_isFocused = false;
            SDL_ShowCursor();
            break;

        case SDL_EVENT_WINDOW_FOCUS_GAINED:
            GameWindow::s_isFocused = true;
            break;

#if defined(MARATHON_IOS_PORT)
        case SDL_EVENT_WILL_ENTER_BACKGROUND:
        case SDL_EVENT_DID_ENTER_BACKGROUND:
            GameWindow::s_isFocused = false;
            MarathonIOS_SetAppSuspended(true);
            break;

        case SDL_EVENT_WILL_ENTER_FOREGROUND:
        case SDL_EVENT_DID_ENTER_FOREGROUND:
            GameWindow::s_isFocused = true;
            MarathonIOS_SetAppSuspended(false);
            break;
#endif'''
        assert old_focus_lost in gsrc, "Failed to locate SDL_EVENT_WINDOW_FOCUS_LOST in ui/game_window.cpp"
        gsrc = gsrc.replace(old_focus_lost, new_focus_lost, 1)
        gw_cpp.write_text(gsrc, encoding="utf-8")
        print("Patched MarathonRecomp/ui/game_window.cpp for iOS Fullscreen Landscape Metal + live resize sync + background lifecycle.")

# 5. MarathonRecomp/gpu/video.cpp: pure Metal 3 + live ImGui touch coordinate scaling + watchdog heartbeats + MarathonIOS_MapWindowPointToImGui
if vid_cpp.exists():
    vsrc = vid_cpp.read_text(encoding="utf-8")
    if "MARATHON_IOS_NATIVE_METAL" not in vsrc:
        vsrc = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#include <algorithm>\\n"
            "#include <chrono>\\n"
            "#include <cmath>\\n"
            "#include <pthread/qos.h>\\n"
            "#include <ios_virtual_controller.h>\\n"
            "#include <ios_lossless_scaler.h>\\n"
            'extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY);\\n'
            'extern "C" void* objc_autoreleasePoolPush(void);\\n'
            'extern "C" void objc_autoreleasePoolPop(void*);\\n'
            "namespace plume {\\n"
            "    struct RenderTexture;\\n"
            "    struct RenderCommandList;\\n"
            "    struct RenderCommandQueue;\\n"
            "    struct RenderSwapChain;\\n"
            "    void* getIOSMetalTexturePtr(const RenderTexture* tex);\\n"
            "    void* getIOSMetalCommandBufferPtr(const RenderCommandList* cl);\\n"
            "    void* getIOSMetalCommandQueuePtr(const RenderCommandQueue* q);\\n"
            "    void* getIOSMetalLayerPtr(const RenderSwapChain* sc);\\n"
            "    void* getIOSMetalDrawableTexturePtr(const RenderSwapChain* sc, uint32_t index);\\n"
            "    void flushIOSMetalCommandListEncoders(RenderCommandList* cl);\\n"
            "}\\n"
            "#endif\\n" + vsrc
        )
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\\n                g_backend = (interfaceFunction == CreateVulkanInterface) ? Backend::VULKAN : Backend::METAL;",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\\n                g_backend = Backend::METAL;\\n#elif defined(MARATHON_RECOMP_METAL)\\n                g_backend = (interfaceFunction == CreateVulkanInterface) ? Backend::VULKAN : Backend::METAL;"
        )
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\\n    g_backend = Config::GraphicsAPI == EGraphicsAPI::Vulkan ? Backend::VULKAN : Backend::METAL;",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\\n    g_backend = Backend::METAL;\\n#elif defined(MARATHON_RECOMP_METAL)\\n    g_backend = Config::GraphicsAPI == EGraphicsAPI::Vulkan ? Backend::VULKAN : Backend::METAL;"
        )
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateVulkanInterface : CreateMetalInterface);\\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateMetalInterface : CreateVulkanInterface);",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\\n    interfaceFunctions.push_back(CreateMetalInterface);\\n#elif defined(MARATHON_RECOMP_METAL)\\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateVulkanInterface : CreateMetalInterface);\\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateMetalInterface : CreateVulkanInterface);"
        )
        # Default to triple buffering (3 drawables) on iOS Metal Auto mode to avoid nextDrawable() VBlank stalls at 120Hz
        old_metal_tb = '''        case Backend::METAL:
            bufferCount = 2;
            break;'''
        new_metal_tb = '''        case Backend::METAL:
#if defined(MARATHON_IOS_PORT)
            bufferCount = 3;
#else
            bufferCount = 2;
#endif
            break;'''
        assert old_metal_tb in vsrc, "Failed to locate Backend::METAL triple buffering switch in gpu/video.cpp"
        vsrc = vsrc.replace(old_metal_tb, new_metal_tb, 1)
        # Live SDL_GetWindowSize in DrawImGui() + viewport sync on iOS rotation
        old_mouse_scale = '''    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
    float mousePosScaleX = static_cast<float>(width) / static_cast<float>(GameWindow::s_width);
    float mousePosScaleY = static_cast<float>(height) / static_cast<float>(GameWindow::s_height);'''
        new_mouse_scale = '''    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
#if defined(MARATHON_IOS_PORT)
    if (width > 0 && height > 0 && (Video::s_viewportWidth == 0 || Video::s_viewportHeight == 0 ||
        (Config::AspectRatio != EAspectRatio::Original && (Video::s_viewportWidth != width || Video::s_viewportHeight != height))))
    {
        Video::ComputeViewportDimensions();
        io.DisplaySize = { static_cast<float>(Video::s_viewportWidth), static_cast<float>(Video::s_viewportHeight) };
    }
    int liveWinW = GameWindow::s_width;
    int liveWinH = GameWindow::s_height;
    if (GameWindow::s_pWindow != nullptr)
    {
        SDL_GetWindowSize(GameWindow::s_pWindow, &liveWinW, &liveWinH);
        if (liveWinW > 0 && liveWinH > 0)
        {
            GameWindow::s_width = liveWinW;
            GameWindow::s_height = liveWinH;
        }
    }
    float mousePosScaleX = (liveWinW > 0) ? (static_cast<float>(width) / static_cast<float>(liveWinW)) : 1.0f;
    float mousePosScaleY = (liveWinH > 0) ? (static_cast<float>(height) / static_cast<float>(liveWinH)) : 1.0f;
#else
    float mousePosScaleX = static_cast<float>(width) / static_cast<float>(GameWindow::s_width);
    float mousePosScaleY = static_cast<float>(height) / static_cast<float>(GameWindow::s_height);
#endif'''
        assert old_mouse_scale in vsrc, "Failed to locate DrawImGui mousePosScale in gpu/video.cpp"
        vsrc = vsrc.replace(old_mouse_scale, new_mouse_scale, 1)

        # Enhanced Sonic '06 styled top-left FPS HUD overlay for iOS (safe-area + LB-clearance aware, smooth 0.25s refresh, suspend-spike proof)
        old_draw_fps = '''static void DrawFPS()
{
    if (!Config::ShowFPS)
        return;

    double time = ImGui::GetTime();
    static double updateTime = time;
    static double fps = 0;
    static double totalDeltaTime = 0.0;
    static uint32_t totalDeltaCount = 0;

    totalDeltaTime += g_presentProfiler.value.load();
    totalDeltaCount++;

    if (time - updateTime >= 1.0f)
    {
        fps = 1000.0 / std::max(totalDeltaTime / static_cast<double>(totalDeltaCount), 1.0);
        updateTime = time;
        totalDeltaTime = 0.0;
        totalDeltaCount = 0;
    }

    auto drawList = ImGui::GetBackgroundDrawList();

    auto fmt = fmt::format("FPS: {:.2f}", fps);
    auto fontSize = Scale(10);
    auto textSize = g_pFntRodin->CalcTextSizeA(fontSize, FLT_MAX, 0, fmt.c_str());

    ImVec2 min = { Scale(40), Scale(30) };
    ImVec2 max = { min.x + std::max(Scale(75), textSize.x + Scale(10)), min.y + Scale(15) };
    ImVec2 textPos = { min.x + Scale(2), CENTRE_TEXT_VERT(min, max, textSize) + Scale(0.2f) };

    drawList->AddRectFilled(min, max, IM_COL32(0, 0, 0, 200));
    drawList->AddText(g_pFntRodin, fontSize, textPos, IM_COL32_WHITE, fmt.c_str());
}'''
        new_draw_fps = '''#if defined(MARATHON_IOS_PORT)
static void DrawFPS()
{
    // MARATHON_IOS_FPS_OVERLAY: Sonic '06 styled top-left FPS HUD overlay (safe-area & touch-control aware)
    static bool s_hasPrevSample = false;
    static std::chrono::steady_clock::time_point s_prevFrameTime{};
    static double s_accumSec = 0.0;
    static uint32_t s_accumFrames = 0;
    static double s_displayFps = 0.0;
    static double s_displayMs = 0.0;

    if (!Config::ShowFPS)
    {
        s_hasPrevSample = false;
        s_accumSec = 0.0;
        s_accumFrames = 0;
        s_displayFps = 0.0;
        s_displayMs = 0.0;
        return;
    }

    if (!g_pFntRodin)
        return;

    const auto now = std::chrono::steady_clock::now();
    if (s_hasPrevSample)
    {
        const double dt = std::chrono::duration<double>(now - s_prevFrameTime).count();
        if (dt > 0.0005 && dt < 0.5)
        {
            s_accumSec += dt;
            s_accumFrames++;
            if (s_accumSec >= 0.25 || (s_displayFps <= 0.0 && s_accumFrames >= 2))
            {
                s_displayFps = static_cast<double>(s_accumFrames) / s_accumSec;
                s_displayMs = (s_accumSec * 1000.0) / static_cast<double>(s_accumFrames);
                s_accumSec = 0.0;
                s_accumFrames = 0;
            }
        }
    }
    s_prevFrameTime = now;
    s_hasPrevSample = true;

    auto* drawList = ImGui::GetBackgroundDrawList();
    if (!drawList)
        return;

    const int fgBaseTarget = MarathonIOS_GetFrameGenBaseFPS();
    const int fgOutTarget = MarathonIOS_GetFrameGenOutputFPS();
    const int fgMult = MarathonIOS_GetFrameGenMultiplier();
    const char* mfxTag = MarathonIOS_GetActiveBackendTag();
    const int shownBaseFps = static_cast<int>(std::lround(s_displayFps));

    std::string label;
    double evalFps = s_displayFps;
    double targetFps = 60.0;
    if (fgBaseTarget > 0 && fgOutTarget > 0 && fgMult >= 2)
    {
        double measuredOut = MarathonIOS_GetMeasuredOutputFPS();
        if (measuredOut <= 1.0 && s_displayFps > 0.0)
            measuredOut = s_displayFps * static_cast<double>(fgMult);
        const int shownOutFps = static_cast<int>(std::lround(measuredOut));
        label = (s_displayFps > 0.0)
            ? fmt::format("FPS {:>2}/{:>3} [{}]", shownBaseFps, shownOutFps, mfxTag)
            : fmt::format("FPS --/--- [{}]", mfxTag);
        evalFps = measuredOut;
        targetFps = static_cast<double>(fgOutTarget);
    }
    else if (MarathonIOS_IsMetalFXActive())
    {
        label = (s_displayFps > 0.0)
            ? fmt::format("FPS {:>3} [{}]", shownBaseFps, mfxTag)
            : fmt::format("FPS  -- [{}]", mfxTag);
        const int effectiveTarget = MarathonIOS_GetEffectiveTargetFPS();
        targetFps = static_cast<double>(effectiveTarget > 0 ? effectiveTarget : (Config::FPS.Value > 0 ? Config::FPS.Value : 60));
    }
    else
    {
        label = (s_displayFps > 0.0)
            ? fmt::format("FPS {:>3}  {:.1f}ms", shownBaseFps, s_displayMs)
            : std::string("FPS  --  --.-ms");
        const int effectiveTarget = MarathonIOS_GetEffectiveTargetFPS();
        targetFps = static_cast<double>(effectiveTarget > 0 ? effectiveTarget : (Config::FPS.Value > 0 ? Config::FPS.Value : 60));
    }

    const float fontSize = Scale(18.0f, true);
    const ImVec2 textSize = g_pFntRodin->CalcTextSizeA(fontSize, FLT_MAX, 0.0f, label.c_str());

    float anchorWinX = 24.0f;
    float anchorWinY = 18.0f;
    MarathonIOS_GetFPSOverlayAnchorPoints(&anchorWinX, &anchorWinY);

    float posX = 0.0f;
    float posY = 0.0f;
    MarathonIOS_MapWindowPointToImGui(anchorWinX, anchorWinY, &posX, &posY);

    const float minMarginX = Scale(16.0f, true);
    const float minMarginY = Scale(12.0f, true);
    posX = std::max(posX, minMarginX);
    posY = std::max(posY, minMarginY);

    const float padLeft = Scale(13.0f, true);
    const float padRight = Scale(10.0f, true);
    const float padY = Scale(5.0f, true);
    const float boxW = std::max(Scale(156.0f, true), textSize.x + padLeft + padRight);
    const float boxH = textSize.y + padY * 2.0f;

    const ImVec2 disp = ImGui::GetIO().DisplaySize;
    if (disp.x > boxW + minMarginX)
        posX = std::min(posX, disp.x - boxW - minMarginX);
    if (disp.y > boxH + minMarginY)
        posY = std::min(posY, disp.y - boxH - minMarginY);

    const ImVec2 minPos = { posX, posY };
    const ImVec2 maxPos = { posX + boxW, posY + boxH };
    const float rounding = Scale(4.0f, true);

    const double ratio = (evalFps > 0.0 && targetFps > 0.0) ? (evalFps / targetFps) : 1.0;
    ImU32 accentCol = IM_COL32(82, 245, 148, 255);
    if (ratio < 0.70)
        accentCol = IM_COL32(255, 92, 92, 255);
    else if (ratio < 0.90)
        accentCol = IM_COL32(255, 210, 64, 255);

    SetShaderModifier(IMGUI_SHADER_MODIFIER_NONE);
    ResetGradient();

    drawList->AddRectFilled(minPos, maxPos, IM_COL32(8, 14, 28, 210), rounding);
    drawList->AddRectFilled(
        ImVec2(minPos.x + Scale(3.0f, true), minPos.y + Scale(3.5f, true)),
        ImVec2(minPos.x + Scale(6.5f, true), maxPos.y - Scale(3.5f, true)),
        accentCol,
        Scale(1.5f, true)
    );
    drawList->AddRect(minPos, maxPos, IM_COL32(64, 156, 255, 200), rounding, 0, Scale(1.2f, true));

    const ImVec2 textPos = {
        minPos.x + padLeft,
        CENTRE_TEXT_VERT(minPos, maxPos, textSize) + Scale(0.5f, true)
    };
    const float shadowOff = Scale(1.2f, true);
    drawList->AddText(g_pFntRodin, fontSize, ImVec2(textPos.x + shadowOff, textPos.y + shadowOff), IM_COL32(0, 0, 0, 220), label.c_str());
    drawList->AddText(g_pFntRodin, fontSize, textPos, IM_COL32_WHITE, label.c_str());
}
#else
static void DrawFPS()
{
    if (!Config::ShowFPS)
        return;

    double time = ImGui::GetTime();
    static double updateTime = time;
    static double fps = 0;
    static double totalDeltaTime = 0.0;
    static uint32_t totalDeltaCount = 0;

    totalDeltaTime += g_presentProfiler.value.load();
    totalDeltaCount++;

    if (time - updateTime >= 1.0f)
    {
        fps = 1000.0 / std::max(totalDeltaTime / static_cast<double>(totalDeltaCount), 1.0);
        updateTime = time;
        totalDeltaTime = 0.0;
        totalDeltaCount = 0;
    }

    auto drawList = ImGui::GetBackgroundDrawList();

    auto fmt = fmt::format("FPS: {:.2f}", fps);
    auto fontSize = Scale(10);
    auto textSize = g_pFntRodin->CalcTextSizeA(fontSize, FLT_MAX, 0, fmt.c_str());

    ImVec2 min = { Scale(40), Scale(30) };
    ImVec2 max = { min.x + std::max(Scale(75), textSize.x + Scale(10)), min.y + Scale(15) };
    ImVec2 textPos = { min.x + Scale(2), CENTRE_TEXT_VERT(min, max, textSize) + Scale(0.2f) };

    drawList->AddRectFilled(min, max, IM_COL32(0, 0, 0, 200));
    drawList->AddText(g_pFntRodin, fontSize, textPos, IM_COL32_WHITE, fmt.c_str());
}
#endif'''
        assert old_draw_fps in vsrc, "Failed to locate DrawFPS() in gpu/video.cpp"
        vsrc = vsrc.replace(old_draw_fps, new_draw_fps, 1)

        # Skip desktop ApplyLowEndDefaults() on iOS (replaced by smart first-launch iOS hardware auto-config in config.cpp)
        vsrc = vsrc.replace(
            "    if (lowEndType || lowEndMemory || lowEndUMA)\\n    {\\n        // Switch to low end defaults if a non-discrete GPU was detected or a low amount of VRAM was detected.\\n        // Checking for UMA on D3D12 seems to be a reliable way to detect integrated GPUs.\\n        ApplyLowEndDefaults();\\n    }",
            "#if !defined(MARATHON_IOS_PORT)\\n    if (lowEndType || lowEndMemory || lowEndUMA)\\n    {\\n        // Switch to low end defaults if a non-discrete GPU was detected or a low amount of VRAM was detected.\\n        // Checking for UMA on D3D12 seems to be a reliable way to detect integrated GPUs.\\n        ApplyLowEndDefaults();\\n    }\\n#endif",
            1
        )

        # Freeze watchdog heartbeats + background pause guard in Video::Present() & RenderThread ExecuteCommandList
        old_vid_present = '''void Video::Present()
{
    g_readyForCommands = false;

    g_renderQueue.enqueue(RenderCommands::ExecutePendingStretchRectCommands{});

    DrawImGui();

    g_renderQueue.enqueue(RenderCommands::ExecuteCommandList{});

    g_executedCommandList.wait(false);
    g_executedCommandList = false;'''
        new_vid_present = '''void Video::Present()
{
#if defined(MARATHON_IOS_PORT)
    if (MarathonIOS_IsAppSuspended())
    {
        MarathonIOS_WaitUntilActive();
    }
    MarathonIOS_Heartbeat("Video::Present:Begin");
#endif
    g_readyForCommands = false;

    g_renderQueue.enqueue(RenderCommands::ExecutePendingStretchRectCommands{});

    DrawImGui();

    g_renderQueue.enqueue(RenderCommands::ExecuteCommandList{});

#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("Video::Present:WaitRender");
#endif
    g_executedCommandList.wait(false);
    g_executedCommandList = false;
#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("Video::Present:SwapPresent");
#endif'''
        assert old_vid_present in vsrc, "Failed to locate Video::Present in gpu/video.cpp"
        vsrc = vsrc.replace(old_vid_present, new_vid_present, 1)

        old_vid_fence = '''    if (g_commandListStates[g_frame])
    {
        g_frameFenceProfiler.Begin();
        g_queue->waitForCommandFence(g_commandFences[g_frame].get());'''
        new_vid_fence = '''    if (g_commandListStates[g_frame])
    {
#if defined(MARATHON_IOS_PORT)
        MarathonIOS_Heartbeat("Video::Present:WaitFence");
#endif
        g_frameFenceProfiler.Begin();
        g_queue->waitForCommandFence(g_commandFences[g_frame].get());'''
        assert old_vid_fence in vsrc, "Failed to locate waitForCommandFence in gpu/video.cpp"
        vsrc = vsrc.replace(old_vid_fence, new_vid_fence, 1)

        old_present_chk = '''    g_quadIndexData.reset();

    CheckSwapChain();'''
        new_present_chk = '''    g_quadIndexData.reset();
#if defined(MARATHON_IOS_PORT)
    if (MarathonIOS_IsAppSuspended())
    {
        MarathonIOS_WaitUntilActive();
    }
    // SINGLE AUTHORITATIVE iOS BASE-FPS PACER (BEFORE CheckSwapChain!):
    // Sleeping BEFORE CheckSwapChain() guarantees the game holds ZERO CAMetalLayer drawables while waiting,
    // preventing both 60->33 FPS / 30->22 FPS drawable starvation AND leaving all 3 drawables free for 2x FrameGen!
    {
        using namespace std::chrono_literals;
        const int32_t fgBaseFps = MarathonIOS_GetFrameGenBaseFPS();
        int32_t targetBaseFps = 0;
        if (fgBaseFps > 0)
        {
            targetBaseFps = fgBaseFps; // 60 (for 120 out), 40 (for 80 out), or 30 (for 60 out)
        }
        else if (Config::FPS >= FPS_MIN && Config::FPS < FPS_MAX)
        {
            const int32_t userTargetFps = Config::FPS.Value > 0 ? Config::FPS.Value : 60;
            MarathonIOS_SetTargetFPS(userTargetFps);
            const int32_t eff = MarathonIOS_GetEffectiveTargetFPS();
            // At 120 FPS (FG Off), do NOT artificially CPU-sleep — let hardware 120Hz ProMotion VSync own cadence!
            if (eff > 0 && eff < 115)
            {
                targetBaseFps = eff;
            }
        }

        static std::chrono::steady_clock::time_point s_iosPaceNext{};
        static int32_t s_iosLastTargetFps = 0;

        if (targetBaseFps > 0)
        {
            const auto period = std::chrono::nanoseconds(1000000000LL / targetBaseFps);
            auto now = std::chrono::steady_clock::now();
            if (s_iosLastTargetFps != targetBaseFps || s_iosPaceNext.time_since_epoch().count() == 0)
            {
                s_iosLastTargetFps = targetBaseFps;
                s_iosPaceNext = now + period;
            }
            else
            {
                if (now < s_iosPaceNext)
                {
                    // Wake 1.2ms early so OS sleep jitter never overshoots the 120Hz VBlank boundary
                    const auto wake = s_iosPaceNext - 1200us;
                    if (now < wake)
                    {
                        std::this_thread::sleep_until(wake);
                    }
                    while ((now = std::chrono::steady_clock::now()) < s_iosPaceNext)
                    {
                        std::this_thread::yield();
                    }
                }
                s_iosPaceNext += period;
                if (s_iosPaceNext < now)
                {
                    // Frame overran target period -> resync cleanly without catch-up bursts or beat-frequency halving!
                    s_iosPaceNext = now + period;
                }
            }
        }
        else
        {
            s_iosLastTargetFps = 0;
            s_iosPaceNext = {};
        }
    }
#endif
    CheckSwapChain();'''
        assert old_present_chk in vsrc, "Failed to locate Video::Present CheckSwapChain in gpu/video.cpp"
        vsrc = vsrc.replace(old_present_chk, new_present_chk, 1)

        # Trigger live internal/output resolution resize whenever MetalFXUpscaling or OutputResolutionScale changes in Video Options
        old_vid_cfg_cb = '''    Video::s_needsResize |=
        config == &Config::AspectRatio ||
        config == &Config::ResolutionScale ||'''
        new_vid_cfg_cb = '''    Video::s_needsResize |=
        config == &Config::AspectRatio ||
        config == &Config::ResolutionScale ||
        config == &Config::MetalFXUpscaling ||
        config == &Config::OutputResolutionScale ||'''
        assert old_vid_cfg_cb in vsrc, "Failed to locate VideoConfigValueChangedCallback in gpu/video.cpp"
        vsrc = vsrc.replace(old_vid_cfg_cb, new_vid_cfg_cb, 1)

        # Native Apple MetalFX: pre-allocated UI overlay texture (clean HUD separation), 3D depth capture, and ExecuteCommandList MetalFX encode hook
        old_begin_cl = '''static void BeginCommandList()
{
    g_renderTarget = g_backBuffer;
    g_depthStencil = nullptr;
    g_framebuffer = nullptr;'''
        new_begin_cl = '''#if defined(MARATHON_IOS_PORT)
static std::unique_ptr<RenderTexture> g_iosUiOverlayTexture;
static std::unique_ptr<RenderFramebuffer> g_iosUiOverlayFramebuffer;
static uint32_t g_iosUiOverlayWidth = 0;
static uint32_t g_iosUiOverlayHeight = 0;
static bool g_iosUiOverlayHasContent = false;
static RenderTexture* g_iosFrameDepthTexture = nullptr;
#endif

static void BeginCommandList()
{
#if defined(MARATHON_IOS_PORT)
    g_iosUiOverlayHasContent = false;
    g_iosFrameDepthTexture = nullptr;
#endif
    g_renderTarget = g_backBuffer;
    g_depthStencil = nullptr;
    g_framebuffer = nullptr;'''
        assert old_begin_cl in vsrc, "Failed to locate BeginCommandList() in gpu/video.cpp"
        vsrc = vsrc.replace(old_begin_cl, new_begin_cl, 1)

        old_intermed_alloc = '''            g_intermediaryBackBufferTextureWidth = width;
            g_intermediaryBackBufferTextureHeight = height;

            g_backBuffer->framebuffers.clear();
            PurgeSurfaceVariantFramebuffers();'''
        new_intermed_alloc = '''            g_intermediaryBackBufferTextureWidth = width;
            g_intermediaryBackBufferTextureHeight = height;
#if defined(MARATHON_IOS_PORT)
            if (width > 0 && height > 0 && (g_iosUiOverlayWidth != width || g_iosUiOverlayHeight != height || !g_iosUiOverlayTexture))
            {
                g_iosUiOverlayFramebuffer.reset();
                g_iosUiOverlayTexture = g_device->createTexture(RenderTextureDesc::Texture2D(width, height, 1, BACKBUFFER_FORMAT, RenderTextureFlag::RENDER_TARGET));
                if (g_iosUiOverlayTexture)
                {
                    const RenderTexture* uiAtt = g_iosUiOverlayTexture.get();
                    RenderFramebufferDesc uiFbDesc{};
                    uiFbDesc.colorAttachments = &uiAtt;
                    uiFbDesc.colorAttachmentsCount = 1;
                    g_iosUiOverlayFramebuffer = g_device->createFramebuffer(uiFbDesc);
                    g_iosUiOverlayWidth = width;
                    g_iosUiOverlayHeight = height;
                }
            }
            g_iosFrameDepthTexture = nullptr;
#endif

            g_backBuffer->framebuffers.clear();
            PurgeSurfaceVariantFramebuffers();'''
        assert old_intermed_alloc in vsrc, "Failed to locate intermediary backbuffer resize in gpu/video.cpp"
        vsrc = vsrc.replace(old_intermed_alloc, new_intermed_alloc, 1)

        old_set_fb = '''static void SetFramebuffer(GuestSurface* renderTarget, GuestSurface* depthStencil, bool settingForClear)
{
    if (settingForClear || g_dirtyStates.renderTargetAndDepthStencil)'''
        new_set_fb = '''static void SetFramebuffer(GuestSurface* renderTarget, GuestSurface* depthStencil, bool settingForClear)
{
#if defined(MARATHON_IOS_PORT)
    if (depthStencil != nullptr && depthStencil->texture != nullptr && depthStencil->width >= 256 && depthStencil->height >= 144)
    {
        g_iosFrameDepthTexture = depthStencil->texture;
    }
#endif
    if (settingForClear || g_dirtyStates.renderTargetAndDepthStencil)'''
        assert old_set_fb in vsrc, "Failed to locate SetFramebuffer in gpu/video.cpp"
        vsrc = vsrc.replace(old_set_fb, new_set_fb, 1)

        old_draw_imgui_cmd = '''static void ProcRenderCommand(const RenderCommands::DrawImGui& args)
{
    // Make sure the backbuffer is the current target.
    AddBarrier(g_backBuffer, RenderTextureLayout::COLOR_WRITE);
    FlushBarriers();
    SetFramebuffer(g_backBuffer, nullptr, false);'''
        new_draw_imgui_cmd = '''static void ProcRenderCommand(const RenderCommands::DrawImGui& args)
{
#if defined(MARATHON_IOS_PORT)
    // Clean UI/HUD separation for MetalFX: render ImGui (HUD, FPS, Options, Menus) into a dedicated transparent
    // premultiplied RGBA overlay texture so MTLFXTemporalScaler & MTLFXFrameInterpolator NEVER warp or ghost text!
    const bool iosSeparateUi =
        MarathonIOS_IsMetalFXActive() &&
        g_backBuffer != nullptr &&
        g_backBuffer->texture == g_intermediaryBackBufferTexture.get() &&
        g_iosUiOverlayTexture != nullptr &&
        g_iosUiOverlayFramebuffer != nullptr;
    if (iosSeparateUi)
    {
        auto& uiCmd = g_commandLists[g_frame];
        uiCmd->barriers(RenderBarrierStage::GRAPHICS, RenderTextureBarrier(g_iosUiOverlayTexture.get(), RenderTextureLayout::COLOR_WRITE));
        uiCmd->setFramebuffer(g_iosUiOverlayFramebuffer.get());
        uiCmd->clearColor(0, RenderColor(0.0f, 0.0f, 0.0f, 0.0f));
        g_framebuffer = g_iosUiOverlayFramebuffer.get();
        g_dirtyStates.renderTargetAndDepthStencil = true;
        g_iosUiOverlayHasContent = true;
    }
    else
#endif
    {
        // Make sure the backbuffer is the current target.
        AddBarrier(g_backBuffer, RenderTextureLayout::COLOR_WRITE);
        FlushBarriers();
        SetFramebuffer(g_backBuffer, nullptr, false);
    }'''
        assert old_draw_imgui_cmd in vsrc, "Failed to locate ProcRenderCommand(DrawImGui) in gpu/video.cpp"
        vsrc = vsrc.replace(old_draw_imgui_cmd, new_draw_imgui_cmd, 1)

        old_exec_gamma = '''            auto &commandList = g_commandLists[g_frame];
            commandList->barriers(RenderBarrierStage::GRAPHICS, srcBarriers, std::size(srcBarriers));
            commandList->setGraphicsPipelineLayout(g_pipelineLayout.get());
            commandList->setPipeline(g_gammaCorrectionPipeline.get());
            commandList->setGraphicsDescriptorSet(g_textureDescriptorSet.get(), 0);
            SetRootDescriptor(g_uploadAllocators[g_frame].allocate<false>(&constants, sizeof(constants), 0x100), 2);
            commandList->setFramebuffer(framebuffer.get());
            commandList->setViewports(RenderViewport(0.0f, 0.0f, g_swapChain->getWidth(), g_swapChain->getHeight()));
            commandList->setScissors(RenderRect(0, 0, g_swapChain->getWidth(), g_swapChain->getHeight()));
            commandList->drawInstanced(3, 1, 0, 0);
            commandList->barriers(RenderBarrierStage::GRAPHICS, RenderTextureBarrier(swapChainTexture, RenderTextureLayout::PRESENT));'''
        new_exec_gamma = '''            auto &commandList = g_commandLists[g_frame];
            bool iosMetalFXEncoded = false;
#if defined(MARATHON_IOS_PORT)
            if (g_backend == Backend::METAL && MarathonIOS_IsMetalFXActive())
            {
                commandList->barriers(RenderBarrierStage::GRAPHICS, srcBarriers, std::size(srcBarriers));
                if (g_iosUiOverlayHasContent && g_iosUiOverlayTexture != nullptr)
                {
                    commandList->barriers(RenderBarrierStage::GRAPHICS, RenderTextureBarrier(g_iosUiOverlayTexture.get(), RenderTextureLayout::SHADER_READ));
                }
                RenderTexture* depthTex = g_iosFrameDepthTexture ? g_iosFrameDepthTexture : (g_depthStencil ? g_depthStencil->texture : nullptr);
                if (depthTex != nullptr)
                {
                    commandList->barriers(RenderBarrierStage::GRAPHICS, RenderTextureBarrier(depthTex, RenderTextureLayout::SHADER_READ));
                }
                plume::flushIOSMetalCommandListEncoders(commandList.get());

                const auto internalSize = RenderResolution::GetInternalSize();
                MarathonIOSMetalFXFrameInput mfxIn{};
                mfxIn.commandQueueMtl = plume::getIOSMetalCommandQueuePtr(g_queue.get());
                mfxIn.metalLayerPtr = plume::getIOSMetalLayerPtr(g_swapChain.get());
                mfxIn.commandBufferMtl = plume::getIOSMetalCommandBufferPtr(commandList.get());
                mfxIn.sceneColorTexMtl = plume::getIOSMetalTexturePtr(g_intermediaryBackBufferTexture.get());
                mfxIn.depthTexMtl = depthTex ? plume::getIOSMetalTexturePtr(depthTex) : nullptr;
                mfxIn.uiOverlayTexMtl = (g_iosUiOverlayHasContent && g_iosUiOverlayTexture) ? plume::getIOSMetalTexturePtr(g_iosUiOverlayTexture.get()) : nullptr;
                mfxIn.drawableTexMtl = plume::getIOSMetalDrawableTexturePtr(g_swapChain.get(), g_backBufferIndex);
                mfxIn.internalWidth = internalSize.Width;
                mfxIn.internalHeight = internalSize.Height;
                mfxIn.outputWidth = g_swapChain->getWidth();
                mfxIn.outputHeight = g_swapChain->getHeight();
                mfxIn.viewportOffsetX = constants.viewportOffsetX;
                mfxIn.viewportOffsetY = constants.viewportOffsetY;
                mfxIn.viewportWidth = static_cast<uint32_t>(constants.viewportWidth);
                mfxIn.viewportHeight = static_cast<uint32_t>(constants.viewportHeight);
                mfxIn.gamma = constants.gamma;
                mfxIn.deltaTimeSec = static_cast<float>(App::s_deltaTime > 0.0001 ? App::s_deltaTime : (1.0 / 60.0));
                mfxIn.isLoading = App::s_isLoading;
                mfxIn.hasValidCameraMatrices = false;
                mfxIn.cameraJitterApplied = false;
                mfxIn.jitterOffsetX = 0.0f;
                mfxIn.jitterOffsetY = 0.0f;

                iosMetalFXEncoded = MarathonIOS_MetalFXEncodeFrame(&mfxIn);
            }
#endif
            if (!iosMetalFXEncoded)
            {
                commandList->barriers(RenderBarrierStage::GRAPHICS, srcBarriers, std::size(srcBarriers));
                commandList->setGraphicsPipelineLayout(g_pipelineLayout.get());
                commandList->setPipeline(g_gammaCorrectionPipeline.get());
                commandList->setGraphicsDescriptorSet(g_textureDescriptorSet.get(), 0);
                SetRootDescriptor(g_uploadAllocators[g_frame].allocate<false>(&constants, sizeof(constants), 0x100), 2);
                commandList->setFramebuffer(framebuffer.get());
                commandList->setViewports(RenderViewport(0.0f, 0.0f, g_swapChain->getWidth(), g_swapChain->getHeight()));
                commandList->setScissors(RenderRect(0, 0, g_swapChain->getWidth(), g_swapChain->getHeight()));
                commandList->drawInstanced(3, 1, 0, 0);
            }
            commandList->barriers(RenderBarrierStage::GRAPHICS, RenderTextureBarrier(swapChainTexture, RenderTextureLayout::PRESENT));'''
        assert old_exec_gamma in vsrc, "Failed to locate gamma correction blit in ProcRenderCommand(ExecuteCommandList)"
        vsrc = vsrc.replace(old_exec_gamma, new_exec_gamma, 1)

        # Zero-busy-spin iOS FPS limiter synced with Thermal Guardian & ProMotion 120Hz hardware VBlank (skipped when FrameGen paced above)
        old_fps_wait = '''    if (Config::FPS >= FPS_MIN && Config::FPS < FPS_MAX)
    {
        using namespace std::chrono_literals;

        static std::chrono::steady_clock::time_point s_next;

        auto now = std::chrono::steady_clock::now();

        if (now < s_next)
        {
            std::this_thread::sleep_for(std::chrono::floor<std::chrono::milliseconds>(s_next - now - 2ms));

            while ((now = std::chrono::steady_clock::now()) < s_next)
                std::this_thread::yield();
        }
        else
        {
            s_next = now;
        }

        s_next += 1000000000ns / Config::FPS;
    }'''
        new_fps_wait = '''#if !defined(MARATHON_IOS_PORT)
    if (Config::FPS >= FPS_MIN && Config::FPS < FPS_MAX)
    {
        using namespace std::chrono_literals;

        static std::chrono::steady_clock::time_point s_next;

        auto now = std::chrono::steady_clock::now();

        if (now < s_next)
        {
            std::this_thread::sleep_for(std::chrono::floor<std::chrono::milliseconds>(s_next - now - 2ms));

            while ((now = std::chrono::steady_clock::now()) < s_next)
                std::this_thread::yield();
        }
        else
        {
            s_next = now;
        }

        s_next += 1000000000ns / Config::FPS;
    }
#endif'''
        assert old_fps_wait in vsrc, "Failed to locate FPS limiter block in gpu/video.cpp"
        vsrc = vsrc.replace(old_fps_wait, new_fps_wait, 1)

        # Pin g_renderThread to Apple Silicon P-cores (QOS_CLASS_USER_INTERACTIVE) + drain ObjC autorelease pool per batch
        old_render_thread = '''static HostThread g_renderThread("Render Thread", []
    {
        HostThread::SetCurrentThreadPriority(HostThreadPriority::High);

        RenderCommand commands[32];

        while (true)
        {
            size_t count = g_renderQueue.wait_dequeue_bulk(commands, std::size(commands));

            for (size_t i = 0; i < count; i++)
                std::visit([](const auto& cmd) { ProcRenderCommand(cmd); }, commands[i]);
        }
    });'''
        new_render_thread = '''static HostThread g_renderThread("Render Thread", []
    {
        HostThread::SetCurrentThreadPriority(HostThreadPriority::High);
#if defined(MARATHON_IOS_PORT)
        pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
#endif

        RenderCommand commands[32];

        while (true)
        {
            size_t count = g_renderQueue.wait_dequeue_bulk(commands, std::size(commands));
#if defined(MARATHON_IOS_PORT)
            void* pool = objc_autoreleasePoolPush();
#endif
            for (size_t i = 0; i < count; i++)
                std::visit([](const auto& cmd) { ProcRenderCommand(cmd); }, commands[i]);
#if defined(MARATHON_IOS_PORT)
            objc_autoreleasePoolPop(pool);
#endif
        }
    });'''
        assert old_render_thread in vsrc, "Failed to locate g_renderThread in gpu/video.cpp"
        vsrc = vsrc.replace(old_render_thread, new_render_thread, 1)

        vsrc = vsrc.replace(
            "    g_renderQueue.enqueue(RenderCommands::BeginCommandList{});",
            "    g_renderQueue.enqueue(RenderCommands::BeginCommandList{});\\n#if defined(MARATHON_IOS_PORT)\\n    MarathonIOS_Heartbeat(\\"Video::Present:Done\\");\\n#endif",
            1
        )
        vsrc = vsrc.replace(
            "static void ProcRenderCommand(const RenderCommands::ExecuteCommandList& cmd)\\n{",
            "static void ProcRenderCommand(const RenderCommands::ExecuteCommandList& cmd)\\n{\\n#if defined(MARATHON_IOS_PORT)\\n    MarathonIOS_RenderHeartbeat(\\"Render:ExecuteCommandList\\");\\n#endif",
            1
        )

        # Export exact 0-frame-lag touch coordinate mapper for InstallerWizard & MessageWindow
        vsrc += '''
#if defined(MARATHON_IOS_PORT)
extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY)
{
    if (!outX || !outY) return;
    if (!g_swapChain)
    {
        *outX = winX;
        *outY = winY;
        return;
    }
    int liveWinW = GameWindow::s_width;
    int liveWinH = GameWindow::s_height;
    if (GameWindow::s_pWindow != nullptr)
    {
        SDL_GetWindowSize(GameWindow::s_pWindow, &liveWinW, &liveWinH);
        if (liveWinW > 0 && liveWinH > 0)
        {
            GameWindow::s_width = liveWinW;
            GameWindow::s_height = liveWinH;
        }
    }
    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
    float scaleX = (liveWinW > 0) ? (static_cast<float>(width) / static_cast<float>(liveWinW)) : 1.0f;
    float scaleY = (liveWinH > 0) ? (static_cast<float>(height) / static_cast<float>(liveWinH)) : 1.0f;
    float offsetX = (static_cast<float>(width) - static_cast<float>(Video::s_viewportWidth)) / 2.0f;
    float offsetY = (static_cast<float>(height) - static_cast<float>(Video::s_viewportHeight)) / 2.0f;
    *outX = winX * scaleX - offsetX;
    *outY = winY * scaleY - offsetY;
}
#endif
'''
        vid_cpp.write_text(vsrc, encoding="utf-8")
        print("Patched MarathonRecomp/gpu/video.cpp for pure Metal 3 + watchdog heartbeats + live iOS touch coordinate mapping.")

# 6. SDL_uikitvideo.m: filter external AirPlay/HDMI scenes in UIKit_GetActiveWindowScene (Feather stability)
if sdl_uikit.exists():
    ssrc = sdl_uikit.read_text(encoding="utf-8")
    if "MARATHON_IOS_AIRPLAY_SCENE_FIX" not in ssrc:
        old_scene = '''            if ([scene isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *windowScene = (UIWindowScene *)scene;
                if (windowScene.activationState == UISceneActivationStateForegroundActive) {'''
        new_scene = '''            /* MARATHON_IOS_AIRPLAY_SCENE_FIX */
            if ([scene isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *windowScene = (UIWindowScene *)scene;
                if (![windowScene.session.role isEqualToString:UIWindowSceneSessionRoleApplication]) continue;
                if (windowScene.activationState == UISceneActivationStateForegroundActive) {'''
        if old_scene in ssrc:
            ssrc = ssrc.replace(old_scene, new_scene, 1)
            sdl_uikit.write_text(ssrc, encoding="utf-8")
            print("Patched SDL_uikitvideo.m to filter non-application window scenes on iOS.")

# 7. SDL_uikitmetalview.m: initialize Metal view with live UIWindowScene/computed frame & sync superview/window bounds in layoutSubviews
if sdl_metalview.exists():
    mvsrc = sdl_metalview.read_text(encoding="utf-8")
    if "MARATHON_IOS_METALVIEW_LAYOUT_FIX" not in mvsrc:
        assert '#import "SDL_uikitwindow.h"' in mvsrc, "Failed to locate SDL_uikitwindow.h import in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(
            '#import "SDL_uikitwindow.h"',
            '#import "SDL_uikitvideo.h"\\n#import "SDL_uikitwindow.h"',
            1
        )
        old_layout = '''- (void)layoutSubviews
{
    [super layoutSubviews];
    [self updateDrawableSize];
}'''
        new_layout = '''- (void)layoutSubviews
{
    /* MARATHON_IOS_METALVIEW_LAYOUT_FIX */
    [super layoutSubviews];
#ifndef SDL_PLATFORM_VISIONOS
    if (@available(iOS 13.0, tvOS 13.0, *)) {
        UIWindow *win = self.window;
        UIWindowScene *scene = win ? win.windowScene : nil;
        if (scene) {
            CGRect sceneBounds = scene.coordinateSpace.bounds;
            if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                !CGRectEqualToRect(win.frame, sceneBounds)) {
                win.frame = sceneBounds;
            }
        }
    }
    if (self.superview && CGAffineTransformIsIdentity(self.transform)) {
        CGRect superBounds = self.superview.bounds;
        if (superBounds.size.width > 0 && superBounds.size.height > 0 &&
            !CGRectEqualToRect(self.frame, superBounds)) {
            self.frame = superBounds;
        }
    }
#endif
    [self updateDrawableSize];
}'''
        assert old_layout in mvsrc, "Failed to locate layoutSubviews in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(old_layout, new_layout, 1)

        old_init = '''        metalview = [[SDL_uikitmetalview alloc] initWithFrame:data.uiwindow.bounds
                                                        scale:scale];'''
        new_init = '''        CGRect viewFrame = data.uiwindow.bounds;
#ifndef SDL_PLATFORM_VISIONOS
        if (@available(iOS 13.0, tvOS 13.0, *)) {
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene && scene.coordinateSpace.bounds.size.width > 0 && scene.coordinateSpace.bounds.size.height > 0) {
                viewFrame = scene.coordinateSpace.bounds;
                if (!CGRectEqualToRect(data.uiwindow.frame, viewFrame)) {
                    data.uiwindow.frame = viewFrame;
                }
            }
        }
        if (viewFrame.size.width <= 0 || viewFrame.size.height <= 0) {
            viewFrame = UIKit_ComputeViewFrame(window, data.uiwindow.screen);
        }
        if (scale > 2.25) {
            scale = 2.25;
        }
#endif
        metalview = [[SDL_uikitmetalview alloc] initWithFrame:viewFrame
                                                        scale:scale];'''
        assert old_init in mvsrc, "Failed to locate initWithFrame in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(old_init, new_init, 1)
        sdl_metalview.write_text(mvsrc, encoding="utf-8")
        print("Patched SDL_uikitmetalview.m for LiveContainer scene-aligned frame + layoutSubviews sync.")

# 8. SDL_uikitwindow.m: actively request iOS 16+ Landscape geometry update + sync UIWindow.frame in UIKit_ShowWindow
if sdl_window.exists():
    wsrc = sdl_window.read_text(encoding="utf-8")
    if "MARATHON_IOS_WINDOW_ROTATION_FIX" not in wsrc:
        old_show = '''void UIKit_ShowWindow(SDL_VideoDevice *_this, SDL_Window *window)
{
    @autoreleasepool {
        SDL_UIKitWindowData *data = (__bridge SDL_UIKitWindowData *)window->internal;
        [data.uiwindow makeKeyAndVisible];'''
        new_show = '''void UIKit_ShowWindow(SDL_VideoDevice *_this, SDL_Window *window)
{
    @autoreleasepool {
        /* MARATHON_IOS_WINDOW_ROTATION_FIX */
        SDL_UIKitWindowData *data = (__bridge SDL_UIKitWindowData *)window->internal;
        [data.uiwindow makeKeyAndVisible];
#if !defined(SDL_PLATFORM_TVOS) && !defined(SDL_PLATFORM_VISIONOS)
        if (@available(iOS 16.0, *)) {
            [data.viewcontroller setNeedsUpdateOfSupportedInterfaceOrientations];
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene) {
                NSUInteger orients = UIKit_GetSupportedOrientations(window);
                BOOL supportsLandscape = (orients & UIInterfaceOrientationMaskLandscape) != 0;
                BOOL supportsPortrait = (orients & (UIInterfaceOrientationMaskPortrait | UIInterfaceOrientationMaskPortraitUpsideDown)) != 0;
                if (supportsLandscape && !supportsPortrait) {
                    UIWindowSceneGeometryPreferencesIOS *prefs =
                        [[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:UIInterfaceOrientationMaskLandscape];
                    [scene requestGeometryUpdateWithPreferences:prefs errorHandler:^(NSError *error) {
                        (void)error;
                    }];
                }
            }
        }
        if (@available(iOS 13.0, *)) {
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene) {
                CGRect sceneBounds = scene.coordinateSpace.bounds;
                if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                    !CGRectEqualToRect(data.uiwindow.frame, sceneBounds)) {
                    data.uiwindow.frame = sceneBounds;
                }
            }
        }
        [data.uiwindow setNeedsLayout];
        [data.uiwindow layoutIfNeeded];
#endif'''
        assert old_show in wsrc, "Failed to locate UIKit_ShowWindow in SDL_uikitwindow.m"
        wsrc = wsrc.replace(old_show, new_show, 1)
        sdl_window.write_text(wsrc, encoding="utf-8")
        print("Patched SDL_uikitwindow.m with iOS 16+ Landscape geometry request + UIWindow frame sync.")
PY_PLUME

echo "==> [8/8] Integrazione CMake iOS (FreeType/FFmpeg/NFD/CURL, Host Tools Override, Metal iOS SDK, SDL_main)..."
python3 - \\
  "\${UPSTREAM_DIR}/CMakeLists.txt" \\
  "\${UPSTREAM_DIR}/thirdparty/CMakeLists.txt" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/CMakeLists.txt" \\
  "\${UPSTREAM_DIR}/MarathonRecompLib/CMakeLists.txt" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/install/update_checker.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/main.cpp" << 'PY_CMAKE'
import sys, pathlib

root_cm = pathlib.Path(sys.argv[1])
tp_cm = pathlib.Path(sys.argv[2])
app_cm = pathlib.Path(sys.argv[3])
lib_cm = pathlib.Path(sys.argv[4])
upd_cpp = pathlib.Path(sys.argv[5])
main_cpp = pathlib.Path(sys.argv[6])

# 1. Root CMakeLists.txt: include iOS config BEFORE thirdparty/tools, split host tools vs iOS cross-compile
rsrc = root_cm.read_text(encoding="utf-8")
if "MARATHON_IOS_HOST_TOOLS_ONLY" not in rsrc:
    rsrc = rsrc.replace(
        'add_subdirectory(\${MARATHON_RECOMP_THIRDPARTY_ROOT})\\nadd_subdirectory(\${MARATHON_RECOMP_TOOLS_ROOT})',
        'option(MARATHON_IOS_HOST_TOOLS_ONLY "Build only macOS host tools" OFF)\\n'
        'include("\${CMAKE_SOURCE_DIR}/cmake/MarathonRecompIOS.cmake" OPTIONAL)\\n'
        'include("\${CMAKE_SOURCE_DIR}/cmake/iOSPortTarget.cmake" OPTIONAL)\\n'
        'if(NOT MARATHON_IOS_HOST_TOOLS_ONLY)\\n'
        '    add_subdirectory(\${MARATHON_RECOMP_THIRDPARTY_ROOT})\\n'
        'endif()\\n'
        'if(CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    marathon_setup_ios_host_tools()\\n'
        'else()\\n'
        '    add_subdirectory(\${MARATHON_RECOMP_TOOLS_ROOT})\\n'
        '    if(TARGET XenosRecomp)\\n'
        '        target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)\\n'
        '    endif()\\n'
        'endif()'
    )
    rsrc = rsrc.replace(
        'add_subdirectory("MarathonRecompLib")\\nadd_subdirectory("MarathonRecomp")',
        'if(NOT MARATHON_IOS_HOST_TOOLS_ONLY)\\n'
        '    add_subdirectory("MarathonRecompLib")\\n'
        '    add_subdirectory("MarathonRecomp")\\n'
        'endif()'
    )
    root_cm.write_text(rsrc, encoding="utf-8")
    print("Patched root CMakeLists.txt for iOS FreeType/FFmpeg/NFD/CURL + host-tools split build.")

# 2. thirdparty/CMakeLists.txt: skip AppKit nativefiledialog-extended & desktop ffmpeg-core on iOS
tsrc = tp_cm.read_text(encoding="utf-8")
if "marathon_setup_ios_thirdparty" not in tsrc:
    tsrc = tsrc.replace(
        'add_subdirectory("\${MARATHON_RECOMP_THIRDPARTY_ROOT}/nativefiledialog-extended")',
        'if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    add_subdirectory("\${MARATHON_RECOMP_THIRDPARTY_ROOT}/nativefiledialog-extended")\\n'
        'endif()'
    )
    tsrc = tsrc.replace(
        'add_subdirectory("\${MARATHON_RECOMP_THIRDPARTY_ROOT}/ffmpeg-core")',
        'if(CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    marathon_setup_ios_thirdparty()\\n'
        'else()\\n'
        '    add_subdirectory("\${MARATHON_RECOMP_THIRDPARTY_ROOT}/ffmpeg-core")\\n'
        'endif()'
    )
    tp_cm.write_text(tsrc, encoding="utf-8")
    print("Patched thirdparty/CMakeLists.txt to replace nativefiledialog-extended and ffmpeg-core on iOS.")

# 3. MarathonRecomp/CMakeLists.txt: SDL_MAIN_HANDLED, iOS OS sources + SKIP_PCH, iOS bundle, CURL stub, iPhoneOS metal SDK
asrc = app_cm.read_text(encoding="utf-8")
if "os/ios/ios_platform.mm" not in asrc:
    # 3a. Let SDL3 drive UIApplicationMain on iOS + unlock FMA/NEON vectorization (-ffp-model=precise) for host engine ONLY (recompiled PPC keeps strict FP!)
    asrc = asrc.replace(
        "    add_compile_options(-ffp-model=strict)",
        '    if (CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '        add_compile_options(-ffp-model=precise)\\n'
        '    else()\\n'
        '        add_compile_options(-ffp-model=strict)\\n'
        '    endif()',
        1
    )
    asrc = asrc.replace(
        "add_compile_definitions(\\n    SDL_MAIN_HANDLED",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    add_compile_definitions(SDL_MAIN_HANDLED)\\n'
        'endif()\\n'
        'add_compile_definitions('
    )
    # 3b. First elseif (APPLE): OS sources (abilita -fobjc-arc su tutti i .mm iOS per prevenire crash MRC al primo avvio!)
    asrc = asrc.replace(
        'elseif (APPLE)\\n    set(MARATHON_RECOMP_OS_CXX_SOURCES',
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    set(MARATHON_RECOMP_OS_CXX_SOURCES\\n'
        '        "os/ios/ios_platform.mm"\\n'
        '        "os/ios/nfd_ios.mm"\\n'
        '        "os/ios/curl_ios_stub.mm"\\n'
        '        "os/ios/ios_virtual_controller.mm"\\n'
        '        "os/ios/ios_mod_manager.mm"\\n'
        '        "os/ios/ios_lossless_scaler.mm"\\n'
        '    )\\n'
        '    set_source_files_properties(\${MARATHON_RECOMP_OS_CXX_SOURCES} PROPERTIES\\n'
        '        SKIP_PRECOMPILE_HEADERS ON\\n'
        '        COMPILE_OPTIONS "-fobjc-arc"\\n'
        '    )\\n'
        'elseif (APPLE)\\n    set(MARATHON_RECOMP_OS_CXX_SOURCES',
        1
    )
    # 3c. Second elseif (APPLE): add_executable MACOSX_BUNDLE without macOS icns/plist
    asrc = asrc.replace(
        'elseif (APPLE)\\n    # Create version number for app bundle.',
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    add_executable(MarathonRecomp MACOSX_BUNDLE \${MARATHON_RECOMP_CXX_SOURCES})\\n'
        'elseif (APPLE)\\n    # Create version number for app bundle.',
        1
    )
    # 3d. Skip desktop find_package(CURL REQUIRED) on iOS (uses CURL::libcurl NSURLSession stub)
    asrc = asrc.replace(
        "find_package(CURL REQUIRED)",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    find_package(CURL REQUIRED)\\n'
        'endif()'
    )
    # 3e. Compile helper Metal shaders with iPhoneOS SDK on iOS instead of macosx SDK
    asrc = asrc.replace(
        '    set(XCRUN_TOOL "/usr/bin/xcrun")',
        '    set(XCRUN_TOOL "/usr/bin/xcrun")\\n'
        '    if (CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '        set(MARATHON_METAL_SDK "iphoneos")\\n'
        '        set(MARATHON_METAL_IOS_FLAG "-mios-version-min=${p.deploymentTarget}")\\n'
        '    else()\\n'
        '        set(MARATHON_METAL_SDK "macosx")\\n'
        '        set(MARATHON_METAL_IOS_FLAG "")\\n'
        '    endif()'
    )
    asrc = asrc.replace(
        "COMMAND \${XCRUN_TOOL} -sdk macosx metal -o \${MSL_FILE_OUT_PATH}.ir -c \${MSL_FILE_PATH}",
        "COMMAND \${XCRUN_TOOL} -sdk \${MARATHON_METAL_SDK} metal \${MARATHON_METAL_IOS_FLAG} -o \${MSL_FILE_OUT_PATH}.ir -c \${MSL_FILE_PATH}"
    )
    asrc = asrc.replace(
        "COMMAND \${XCRUN_TOOL} -sdk macosx metallib -o \${MSL_FILE_OUT_PATH}.metallib \${MSL_FILE_OUT_PATH}.ir",
        "COMMAND \${XCRUN_TOOL} -sdk \${MARATHON_METAL_SDK} metallib -o \${MSL_FILE_OUT_PATH}.metallib \${MSL_FILE_OUT_PATH}.ir"
    )
    asrc += '\\nif(COMMAND marathon_configure_ios_target)\\n    marathon_configure_ios_target(MarathonRecomp)\\nendif()\\n'
    app_cm.write_text(asrc, encoding="utf-8")
    print("Patched MarathonRecomp/CMakeLists.txt with iOS OS sources, bundle, CURL stub, and iPhoneOS Metal helper shaders.")

# 4. MarathonRecompLib/CMakeLists.txt: do not call target_compile_definitions on IMPORTED XenosRecomp
lsrc = lib_cm.read_text(encoding="utf-8")
if 'NOT CMAKE_SYSTEM_NAME STREQUAL "iOS"' not in lsrc:
    lsrc = lsrc.replace(
        "target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)\\n'
        'endif()'
    )
    lib_cm.write_text(lsrc, encoding="utf-8")
    print("Patched MarathonRecompLib/CMakeLists.txt for IMPORTED XenosRecomp compatibility on iOS.")

# 5. update_checker.cpp: std::system() is unavailable on iOS SDK -> use MarathonIOS_OpenURL
if upd_cpp.exists():
    usrc = upd_cpp.read_text(encoding="utf-8")
    if "MarathonIOS_OpenURL" not in usrc:
        usrc = usrc.replace(
            "#elif defined(__APPLE__)\\n    std::string command = \\"open \\" + std::string(VISIT_URL) + \\" &\\";\\n    std::system(command.c_str());",
            "#elif defined(MARATHON_IOS_PORT)\\n    MarathonIOS_OpenURL(VISIT_URL);\\n#elif defined(__APPLE__)\\n    std::string command = \\"open \\" + std::string(VISIT_URL) + \\" &\\";\\n    std::system(command.c_str());"
        )
        upd_cpp.write_text(usrc, encoding="utf-8")
        print("Patched install/update_checker.cpp to use MarathonIOS_OpenURL instead of unavailable std::system().")

# 6. main.cpp: include <SDL3/SDL_main.h> + writable Documents/MarathonRecomp cwd on iOS (fixes Feather read-only bundle!) + attach touch gamepad on game start
if main_cpp.exists():
    msrc = main_cpp.read_text(encoding="utf-8")
    if "SDL3/SDL_main.h" not in msrc:
        msrc = (
            "#if defined(MARATHON_IOS_PORT)\\n"
            "#include <SDL3/SDL_main.h>\\n"
            "#include <pthread/qos.h>\\n"
            "#include <ios_virtual_controller.h>\\n"
            "#endif\\n" + msrc
        )
        msrc = msrc.replace(
            "std::filesystem::current_path(os::process::GetExecutablePath().parent_path(), ec);",
            "#if defined(MARATHON_IOS_PORT)\\n"
            "        std::filesystem::current_path(os::process::GetWorkingDirectory(), ec);\\n"
            "#else\\n"
            "        std::filesystem::current_path(os::process::GetExecutablePath().parent_path(), ec);\\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "    if (timeDifferenceSeconds > TimeBetweenUpdateChecksInSeconds)\\n"
            "    {\\n"
            "        UpdateChecker::initialize();\\n"
            "        UpdateChecker::start();\\n"
            "        Config::LastChecked = timeNow;\\n"
            "        Config::Save();\\n"
            "    }",
            "#if !defined(MARATHON_IOS_PORT)\\n"
            "    if (timeDifferenceSeconds > TimeBetweenUpdateChecksInSeconds)\\n"
            "    {\\n"
            "        UpdateChecker::initialize();\\n"
            "        UpdateChecker::start();\\n"
            "        Config::LastChecked = timeNow;\\n"
            "        Config::Save();\\n"
            "    }\\n"
            "#else\\n"
            "    // MARATHON_IOS_SKIP_DESKTOP_UPDATE_CHECK: evita il thread UpdateChecker desktop al primo avvio su LiveContainer\\n"
            "    (void)timeDifferenceSeconds;\\n"
            "    (void)timeNow;\\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "    // TODO: Remove this when FPS change is supported.\\n    Config::FPS = 60;",
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    if (Config::FPS <= 35) Config::FPS = 30;\\n"
            "    else if (Config::FPS <= 48) Config::FPS = 40;\\n"
            "    else if (Config::FPS >= 100) Config::FPS = 120;\\n"
            "    else Config::FPS = 60;\\n"
            "    MarathonIOS_SetTargetFPS(Config::FPS);\\n"
            "#else\\n"
            "    // TODO: Remove this when FPS change is supported.\\n"
            "    Config::FPS = 60;\\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "    KiSystemStartup();",
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);\\n"
            "    MarathonIOS_LogLine(\\"BOOT\\", \\"Starting KiSystemStartup()...\\");\\n"
            "#endif\\n"
            "    KiSystemStartup();",
            1
        )
        msrc = msrc.replace(
            "GuestThread::Start({ entry, 0, 0 });",
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    MarathonIOS_LogLine(\\"BOOT\\", \\"Attaching Sonic '06 virtual controller and starting GuestThread...\\");\\n"
            "    MarathonIOS_AttachVirtualController(nullptr);\\n"
            "#endif\\n"
            "    GuestThread::Start({ entry, 0, 0 });",
            1
        )
        main_cpp.write_text(msrc, encoding="utf-8")
        print("Patched main.cpp: SDL3/SDL_main.h, writable iOS cwd, skip desktop UpdateChecker on first launch, boot diagnostics, and virtual controller attach.")
PY_CMAKE

echo "==> Patch iOS Clean-Room applicata con successo!"
`;
}

export function generateReadmeMd(p: WorkflowTemplateParams): string {
  return `# ${p.appName} — MarathonRecomp v1.0.0 for iOS & iPadOS

Porting nativo **clean-room** per iOS / iPadOS (\`arm64\` · ${p.rendererBackend === 'metal3-native' ? 'Metal 3 Nativo (Plume)' : 'Vulkan -> MoltenVK -> Metal 3'} · ${p.enable120HzProMotion ? '120Hz ProMotion' : '60Hz'}) di [sonicnext-dev/MarathonRecomp](${p.upstreamRepoUrl}) **v1.0.0** (*Sonic the Hedgehog 2006* Xbox 360 Static Recompilation).

Progettato da zero con architettura **overlay pulita** ispirata a [hiperema95-ctrl/edgyios](https://github.com/hiperema95-ctrl/edgyios):
- **Nessun fork obsoleto**: clona sempre \`sonicnext-dev/MarathonRecomp\` (${p.upstreamRef} / v1.0.0) fresco in CI e applica le patch iOS in modo modulare.
- **Zero file protetti da copyright nel repository pubblico**: \`default.xex\`, \`shader.arc\` e \`shader_lt.arc\` vengono scaricati in modo effimero solo durante la build GitHub Actions tramite GitHub Secrets e cancellati prima del packaging.
- **Importazione diretta \`.xiso\` / \`.iso\` nel launcher iOS**: non serve scompattare l'immagine su PC! Il lettore streaming \`pread()\` legge immagini Xbox 360 da 6+ GB usando meno di 4 MB di RAM.
- **DLC separati nel launcher**: tutti i 7 pacchetti DLC ufficiali Xbox 360 (*Very Hard* Sonic/Shadow/Silver, *Team Attack Amigo*, *Mission Packs*) si importano separatamente nello step dedicato del launcher.

---

## Come Compilare l'.ipa su GitHub Actions (Senza Mac)

1. Fai **push** di questo repository su GitHub (anche **Public** — \`.gitignore\` e lo step di audit bloccano qualsiasi binario Xbox 360).
2. Estrai dalla **tua copia legale** di *Sonic the Hedgehog (2006)* Xbox 360 i 3 file richiesti da \`MarathonRecompLib/CMakeLists.txt\`:
   - \`default.xex\` (root del disco)
   - \`shader.arc\` (\`/xenon/archives/shader.arc\`)
   - \`shader_lt.arc\` (\`/xenon/archives/shader_lt.arc\`)
3. Vai su **GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret**:
   ${
     p.secretMode === 'single-archive'
       ? `- Crea il secret **\`GAME_FILES_ARCHIVE_URL\`** con un link diretto privato a un \`.zip\` contenente \`default.xex\`, \`shader.arc\` e \`shader_lt.arc\`.\n   - **Se usi Google Drive**: imposta il file su *"Chiunque abbia il link (Visualizzatore)"* e usa il formato:\n     \`https://drive.usercontent.google.com/download?id=ID_DEL_FILE&export=download&confirm=t\`\n     *(Il workflow normalizza comunque in automatico anche il link standard \`https://drive.google.com/file/d/ID_DEL_FILE/view?usp=sharing\`)*.\n   - *(In alternativa supporta anche i 3 secret separati: \`DEFAULT_XEX_URL\`, \`SHADER_ARC_URL\`, \`SHADER_LT_ARC_URL\`)*`
       : `- Crea i 3 secret con link diretti privati:\n     - **\`DEFAULT_XEX_URL\`**\n     - **\`SHADER_ARC_URL\`**\n     - **\`SHADER_LT_ARC_URL\`**\n   - **Se usi Google Drive**: imposta i file su *"Chiunque abbia il link"* e usa \`https://drive.usercontent.google.com/download?id=ID_DEL_FILE&export=download&confirm=t\` (il workflow converte comunque anche i link standard \`/file/d/ID/view\`).\n   - *(In alternativa supporta anche il secret unico \`GAME_FILES_ARCHIVE_URL\`)*`
   }
4. Apri il tab **Actions -> Build ${p.appName} iOS IPA -> Run workflow**.
5. Scarica l'artefatto **\`${p.appName}-v${p.appVersion}-iOS-arm64.ipa\`** e installalo su iPhone/iPad tramite **Feather** o **LiveContainer**.

---

## Installazione Dati di Gioco su iPhone / iPad

1. Avvia **${p.appName}** su iPhone o iPad (iOS ${p.deploymentTarget}+).
2. **Gioco Base (XISO Diretto)**: nello step iniziale del launcher, seleziona direttamente il tuo file **\`.xiso\` / \`.iso\`** dall'app File di iOS (oppure copialo prima in \`Su questo iPhone -> ${p.appName} -> MarathonRecomp/\` per la rilevazione istantanea zero-copy).
3. **DLC (Separati)**: nello step **Select DLC** del launcher, aggiungi separatamente i file STFS/XContent o le cartelle dei DLC Xbox 360 desiderati.
4. **Mod Manager**: copia eventuali mod in \`App File -> ${p.appName} -> MarathonRecomp/mods/\` e attivale dal pannello Quick-HUD (\`06 -> Mods\`).

---

## Note Legali

Vedi [LEGAL.md](LEGAL.md). Nessun file di gioco, eseguibile, shader o asset SEGA / Sonic Team è incluso in questo repository.
`;
}

export function generateLegalMd(p: WorkflowTemplateParams): string {
  return `# Legal & Copyright Notice — ${p.appName}

## Zero Copyrighted Assets Policy

This repository contains **only** original clean-room iOS platform integration code, CMake build recipes, GitHub Actions CI workflows, and documentation.

**This repository DOES NOT contain, distribute, or host:**
- Original Xbox 360 executables (\`default.xex\`) or Xbox OG executables (\`default.xbe\`)
- Game shader archives (\`shader.arc\`, \`shader_lt.arc\`)
- Disc images (\`.iso\`, \`.xiso\`), textures, models, audio, cutscenes, or DLC packages
- Any copyrighted intellectual property belonging to SEGA Corporation, Sonic Team, or Microsoft Corporation

## User Responsibility

To compile or run **${p.appName}**, you must supply files extracted exclusively from **your own legally acquired copy** of *Sonic the Hedgehog (2006)* for Xbox 360.

During cloud compilation via GitHub Actions:
1. Build inputs are fetched transiently inside an ephemeral runner VM via private user-configured GitHub Secrets.
2. Temporary game inputs are deleted before the \`.ipa\` artifact is packaged.
3. \`.gitignore\` and an automated CI audit step prevent accidental commits of protected binaries into the public repository.

## Upstream Credits & Licenses

- **MarathonRecomp** (\`sonicnext-dev/MarathonRecomp\`): GPL-3.0 / upstream open-source static recompilation runtime.
- **XenonRecomp / XenosRecomp**: Static PowerPC & Xenos shader recompilers.
- **Plume / SDL3 / FFmpeg / FreeType**: Respective open-source licenses.
- **Architecture Inspiration**: Clean-room iOS overlay workflow inspired by \`hiperema95-ctrl/edgyios\`.
`;
}
