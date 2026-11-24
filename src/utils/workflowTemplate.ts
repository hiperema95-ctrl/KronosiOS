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

cp "\${PORT_DIR}/ios/include/nfd.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/nfd.h"
cp "\${PORT_DIR}/ios/include/curl/curl.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/curl/curl.h"
cp "\${PORT_DIR}/ios/include/ios_virtual_controller.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_virtual_controller.h"
cp "\${PORT_DIR}/ios/include/ios_mod_manager.h" "\${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_mod_manager.h"

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
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), nullptr)',
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), environ)'
        )
        if "extern char** environ;" not in src:
            src = '#include <unistd.h>\\nextern char** environ;\\n' + src
        p.write_text(src, encoding="utf-8")
        print("Patched XenosRecomp/air_compiler.cpp for iPhoneOS Metal SDK.")
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

echo "==> [5/8] Patch UI Touch Smartphone (InstallerWizard tap diretto + ButtonWindow Indietro cliccabile + MessageWindow + HID + Crediti iOS multilingua)..."
python3 - \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/installer_wizard.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.h" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/ui/message_window.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/hid/hid.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/kernel/memory.cpp" \\
  "\${UPSTREAM_DIR}/MarathonRecomp/locale/locale.cpp" << 'PY_WIZ'
import sys, pathlib

wiz_p = pathlib.Path(sys.argv[1])
bw_h  = pathlib.Path(sys.argv[2])
bw_c  = pathlib.Path(sys.argv[3])
mw_c  = pathlib.Path(sys.argv[4])
hid_c = pathlib.Path(sys.argv[5])
mem_c = pathlib.Path(sys.argv[6])
loc_c = pathlib.Path(sys.argv[7])

# 5a. ui/button_window.h & .cpp: salva il rettangolo renderizzato per rendere cliccabile con tap il bottone "Indietro / Back"
if bw_h.exists() and bw_c.exists():
    bwh = bw_h.read_text(encoding="utf-8")
    if "HitTest(" not in bwh:
        bwh = bwh.replace(
            "static void Close();",
            "static void Close();\\n"
            "    static inline float s_hitMinX = 0.0f;\\n"
            "    static inline float s_hitMinY = 0.0f;\\n"
            "    static inline float s_hitMaxX = 0.0f;\\n"
            "    static inline float s_hitMaxY = 0.0f;\\n"
            "    static bool HitTest(float x, float y);"
        )
        bw_h.write_text(bwh, encoding="utf-8")
    bwc = bw_c.read_text(encoding="utf-8")
    if "ButtonWindow::HitTest" not in bwc:
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
        print("Patched button_window.{h,cpp} for direct smartphone tap on Back/Cancel/Quit button.")

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

# 5d. hid/hid.cpp: su iOS non bloccare mai l'input se SDL_EVENT_WINDOW_FOCUS_GAINED non viene emesso subito
if hid_c.exists():
    hsrc = hid_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_PORT" not in hsrc:
        hsrc = hsrc.replace(
            "return GameWindow::s_isFocused || Config::AllowBackgroundInput;",
            "#if defined(MARATHON_IOS_PORT)\\n        return true;\\n#else\\n        return GameWindow::s_isFocused || Config::AllowBackgroundInput;\\n#endif",
            1
        )
        hid_c.write_text(hsrc, encoding="utf-8")
        print("Patched hid/hid.cpp so touch/input is never blocked on iOS.")

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
PY_WIZ

echo "==> [6/8] Patch paths.cpp, paths.h e stdafx.h (Documents/MarathonRecomp + Apple libc++ std::atomic_ref)..."
python3 - "\${UPSTREAM_DIR}/MarathonRecomp/user/paths.cpp" "\${UPSTREAM_DIR}/MarathonRecomp/stdafx.h" << 'PY_PATHS'
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
    static auto* buckets = new WaitBucket[64]();
    const auto idx = (reinterpret_cast<std::uintptr_t>(addr) >> 2) & 63u;
    return buckets[idx];
}
constexpr memory_order fail_order_from_success(memory_order o) noexcept {
    if (o == memory_order_acq_rel) return memory_order_acquire;
    if (o == memory_order_release) return memory_order_relaxed;
    return o;
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
        T cur = load(m);
        if (std::memcmp(&cur, &old, sizeof(T)) != 0) return;
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        std::unique_lock<std::mutex> lk(bucket.mtx);
        for (;;) {
            cur = load(m);
            if (std::memcmp(&cur, &old, sizeof(T)) != 0) break;
            bucket.cv.wait(lk);
        }
    }

    void notify_one() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_one();
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
        print("Patched stdafx.h with full C++20 Apple libc++ std::atomic_ref polyfill.")
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
#include <cmath>
#include <atomic>

namespace plume {

RenderDeviceVendor getRenderDeviceVendor(uint64_t) {
    return RenderDeviceVendor::APPLE;
}

static CGFloat getIOSScaleFactor(UIWindow *uiWindow) {
#ifdef PLUME_APPLE_RETINA_ENABLED
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    return screen ? screen.nativeScale : 1.0;
#else
    (void)uiWindow;
    return 1.0;
#endif
}

static std::atomic<uint32_t> g_iosMetalCachedW{0};
static std::atomic<uint32_t> g_iosMetalCachedH{0};
static std::atomic<bool> g_iosMetalSyncPending{false};

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
        // Trigger non-blocking main-thread layout sync from render thread (never dispatch_sync -> zero deadlocks!)
        bool expected = false;
        if (g_iosMetalSyncPending.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
            dispatch_async(dispatch_get_main_queue(), ^{
                syncIOSMetalViewOnMainThread(metalLayer);
                g_iosMetalSyncPending.store(false, std::memory_order_release);
            });
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
            "namespace plume {\\n"
            "#if !PLUME_MACOS\\n"
            "    void getIOSMetalLayerSize(void *layerPtr, uint32_t &dstWidth, uint32_t &dstHeight);\\n"
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

        # Reject mismatched drawable dimensions instead of silently mutating width/height, so CheckSwapChain() runs a full clean resize
        old_acq = '''        *textureIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[currentAvailableDrawableIndex];
        drawable.desc.width = width;
        drawable.desc.height = height;'''
        new_acq = '''#if !PLUME_MACOS
        if (nextDrawable->texture() != nullptr) {
            const uint32_t texW = static_cast<uint32_t>(nextDrawable->texture()->width());
            const uint32_t texH = static_cast<uint32_t>(nextDrawable->texture()->height());
            if (texW != width || texH != height) {
                return false;
            }
        }
#endif
        *textureIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[currentAvailableDrawableIndex];
        drawable.desc.width = width;
        drawable.desc.height = height;'''
        assert old_acq in msrc, "Failed to locate acquireTexture drawable size in plume_metal.cpp"
        msrc = msrc.replace(old_acq, new_acq, 1)

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

        metal_cpp.write_text(msrc, encoding="utf-8")
        print("Patched thirdparty/plume/plume_metal.cpp for iOS Metal (CAMetalLayer size, drawable sync, CreateSystemDefaultDevice).")

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

# 4. MarathonRecomp/ui/game_window.cpp: Fullscreen Landscape Metal SDL flags + UIKit window + live window size sync
if gw_cpp.exists():
    gsrc = gw_cpp.read_text(encoding="utf-8")
    if "SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER" not in gsrc:
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
        # 4e. Also handle SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED on iOS rotation
        gsrc = gsrc.replace(
            "        case SDL_EVENT_WINDOW_RESIZED:\\n            g_isResizing = true;\\n            Config::WindowSize = -1;\\n            GameWindow::s_width = event->window.data1;\\n            GameWindow::s_height = event->window.data2;",
            "        case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:\\n        case SDL_EVENT_WINDOW_RESIZED:\\n            g_isResizing = true;\\n            Config::WindowSize = -1;\\n            SDL_GetWindowSize(GameWindow::s_pWindow, &GameWindow::s_width, &GameWindow::s_height);",
            1
        )
        gw_cpp.write_text(gsrc, encoding="utf-8")
        print("Patched MarathonRecomp/ui/game_window.cpp for iOS Fullscreen Landscape Metal + live resize sync.")

# 5. MarathonRecomp/gpu/video.cpp: pure Metal 3 + live ImGui touch coordinate scaling + MarathonIOS_MapWindowPointToImGui
if vid_cpp.exists():
    vsrc = vid_cpp.read_text(encoding="utf-8")
    if "MARATHON_IOS_NATIVE_METAL" not in vsrc:
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
        print("Patched MarathonRecomp/gpu/video.cpp for pure Metal 3 + live iOS touch coordinate mapping.")

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
    # 3a. Let SDL3 drive UIApplicationMain on iOS
    asrc = asrc.replace(
        "add_compile_definitions(\\n    SDL_MAIN_HANDLED",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    add_compile_definitions(SDL_MAIN_HANDLED)\\n'
        'endif()\\n'
        'add_compile_definitions('
    )
    # 3b. First elseif (APPLE): OS sources
    asrc = asrc.replace(
        'elseif (APPLE)\\n    set(MARATHON_RECOMP_OS_CXX_SOURCES',
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\\n'
        '    set(MARATHON_RECOMP_OS_CXX_SOURCES\\n'
        '        "os/ios/ios_platform.mm"\\n'
        '        "os/ios/nfd_ios.mm"\\n'
        '        "os/ios/curl_ios_stub.mm"\\n'
        '        "os/ios/ios_virtual_controller.mm"\\n'
        '        "os/ios/ios_mod_manager.mm"\\n'
        '    )\\n'
        '    set_source_files_properties(\${MARATHON_RECOMP_OS_CXX_SOURCES} PROPERTIES SKIP_PRECOMPILE_HEADERS ON)\\n'
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
            "GuestThread::Start({ entry, 0, 0 });",
            "#if defined(MARATHON_IOS_PORT)\\n"
            "    MarathonIOS_AttachVirtualController(nullptr);\\n"
            "#endif\\n"
            "    GuestThread::Start({ entry, 0, 0 });",
            1
        )
        main_cpp.write_text(msrc, encoding="utf-8")
        print("Patched main.cpp: SDL3/SDL_main.h, writable iOS cwd (Feather fix), and post-installer virtual controller attach.")
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
