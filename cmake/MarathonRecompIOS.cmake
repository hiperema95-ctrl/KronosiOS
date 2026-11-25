# Clean-room iOS arm64 CMake configuration for sonicnext-dev/MarathonRecomp v1.0.0
# Included at root CMakeLists.txt BEFORE thirdparty/ and tools/ so iOS cross-compilation
# finds static FreeType, FFmpeg, NFD, CURL, and macOS host tools cleanly.

option(MARATHON_IOS_PORT "Enable iOS arm64 clean-room port" ON)

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    message(STATUS "Configuring MarathonRecomp v1.0.0 for iOS arm64 (Deployment Target: 17.0)")

    # Allow find_package(Freetype) and static iOS deps outside Xcode iPhoneOS.sdk sysroot
    set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)

    if(DEFINED MARATHON_IOS_FREETYPE_ROOT AND EXISTS "${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        list(APPEND CMAKE_FIND_ROOT_PATH "${MARATHON_IOS_FREETYPE_ROOT}")
        list(APPEND CMAKE_PREFIX_PATH "${MARATHON_IOS_FREETYPE_ROOT}")
        set(FREETYPE_LIBRARY "${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a" CACHE FILEPATH "Static iOS FreeType library" FORCE)
        set(FREETYPE_INCLUDE_DIRS "${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "Static iOS FreeType headers" FORCE)
        set(FREETYPE_INCLUDE_DIR_ft2build "${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "FreeType ft2build.h dir" FORCE)
        set(FREETYPE_INCLUDE_DIR_freetype2 "${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "FreeType freetype2 headers dir" FORCE)
        set(MARATHON_IOS_FREETYPE_LIB "${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        message(STATUS "Using static iOS FreeType: ${MARATHON_IOS_FREETYPE_LIB}")
    endif()

    if(DEFINED MARATHON_IOS_FFMPEG_ROOT AND EXISTS "${MARATHON_IOS_FFMPEG_ROOT}/include/libavcodec/avcodec.h")
        list(APPEND CMAKE_FIND_ROOT_PATH "${MARATHON_IOS_FFMPEG_ROOT}")
        message(STATUS "Using static iOS FFmpeg (XMA decoder): ${MARATHON_IOS_FFMPEG_ROOT}")
    endif()

    add_compile_definitions(
        MARATHON_IOS_PORT=1
        MARATHON_IOS_PROMOTION_120HZ=1
        MARATHON_RECOMP_METAL=1
    MARATHON_IOS_NATIVE_METAL=1
        MARATHON_IOS_STREAMING_XISO=1
    )

    # Apple Silicon ARMv8.5-A codegen (LSE single-instruction atomics, RCPC2, FRINTTS, FP16, dotprod, P-core scheduling)
    # Runs cleanly on iPhone 12..16 Pro (A14..A18 Pro) and M-series iPads while slashing atomic/CPU overhead at 120 FPS.
    add_compile_options(-mcpu=apple-a14 -fno-math-errno)

    # Position-independent executable required for both Feather and LiveContainer
    add_compile_options(-fPIC)
    add_link_options(-Wl,-pie)

    set(MARATHON_IOS_FRAMEWORKS
        "-framework Foundation"
        "-framework UIKit"
        "-framework Metal"
        "-framework QuartzCore"
        "-framework CoreGraphics"
        "-framework CoreFoundation"
        "-framework CoreHaptics"
        "-framework GameController"
        "-framework AVFoundation"
        "-framework AudioToolbox"
        "-framework UniformTypeIdentifiers"
        "-framework CoreMedia"
        "-framework CoreVideo"
        "-framework VideoToolbox"
        "-framework IOSurface"
        "-framework Security"
    )
endif()

# Called from thirdparty/CMakeLists.txt when cross-compiling for iOS
function(marathon_setup_ios_thirdparty)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
        return()
    endif()

    # 1. Native iOS Files Picker (nfd::nfd) replacing desktop nativefiledialog-extended
    if(NOT TARGET nfd)
        add_library(nfd INTERFACE)
        add_library(nfd::nfd ALIAS nfd)
        target_include_directories(nfd INTERFACE
            "${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
        )
    endif()

    # 2. Static iOS arm64 FFmpeg (ffmpeg) replacing desktop prebuilt ffmpeg-core
    if(NOT TARGET ffmpeg)
        if(NOT DEFINED MARATHON_IOS_FFMPEG_ROOT OR NOT EXISTS "${MARATHON_IOS_FFMPEG_ROOT}/include/libavcodec/avcodec.h")
            message(FATAL_ERROR "Missing iOS FFmpeg root. Set MARATHON_IOS_FFMPEG_ROOT to the static arm64 FFmpeg install prefix.")
        endif()
        add_library(ffmpeg INTERFACE)
        target_include_directories(ffmpeg INTERFACE "${MARATHON_IOS_FFMPEG_ROOT}/include")
        foreach(component avformat avcodec swscale avutil swresample)
            set(archive "${MARATHON_IOS_FFMPEG_ROOT}/lib/lib${component}.a")
            if(NOT EXISTS "${archive}")
                message(FATAL_ERROR "Missing static iOS FFmpeg archive: ${archive}")
            endif()
            target_link_libraries(ffmpeg INTERFACE "${archive}")
        endforeach()
        target_link_libraries(ffmpeg INTERFACE
            z bz2 iconv
            "-framework AudioToolbox"
            "-framework CoreMedia"
            "-framework VideoToolbox"
            "-framework CoreVideo"
            "-framework Security"
        )
    endif()

    # 3. Clean-room NSURLSession libcurl compatibility target (CURL::libcurl)
    if(NOT TARGET CURL::libcurl)
        add_library(marathon_ios_curl INTERFACE)
        add_library(CURL::libcurl ALIAS marathon_ios_curl)
        target_include_directories(marathon_ios_curl INTERFACE
            "${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
        )
    endif()
endfunction()

# Called from root CMakeLists.txt instead of add_subdirectory(tools) when cross-compiling for iOS
macro(marathon_setup_ios_host_tools)
    if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
        set(_HOST_TOOL_MAP
            "file_to_c:MARATHON_HOST_FILE_TO_C"
            "u8extract:MARATHON_HOST_U8EXTRACT"
            "XenonRecomp:MARATHON_HOST_XENON_RECOMP"
            "XenosRecomp:MARATHON_HOST_XENOS_RECOMP"
        )
        foreach(_entry IN LISTS _HOST_TOOL_MAP)
            string(REPLACE ":" ";" _pair "${_entry}")
            list(GET _pair 0 _tool_name)
            list(GET _pair 1 _tool_var)
            if(NOT DEFINED ${_tool_var} OR NOT EXISTS "${${_tool_var}}")
                message(FATAL_ERROR "Missing macOS host tool ${_tool_name} (${_tool_var}='${${_tool_var}}'). Build host tools first.")
            endif()
            if(NOT TARGET ${_tool_name})
                add_executable(${_tool_name} IMPORTED GLOBAL)
                set_target_properties(${_tool_name} PROPERTIES IMPORTED_LOCATION "${${_tool_var}}")
            endif()
        endforeach()

        # Cross-compile only the runtime libraries from tools/ needed by MarathonRecomp
        set(THIRDPARTY_ROOT "${CMAKE_SOURCE_DIR}/tools/XenonRecomp/thirdparty")
        add_subdirectory("${THIRDPARTY_ROOT}" "xenon-thirdparty")
        add_subdirectory("${CMAKE_SOURCE_DIR}/tools/XenonRecomp/XenonUtils" "xenon-utils")
        add_subdirectory("${CMAKE_SOURCE_DIR}/tools/XenosRecomp/thirdparty/zstd/build/cmake" "zstd")

        # Keep host macOS dxc-macos available for compile_shader SPIR-V generation
        set(DXC_HOST_ROOT "${CMAKE_SOURCE_DIR}/tools/XenosRecomp/thirdparty/dxc-bin")
        if(CMAKE_HOST_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
            set(DXC_HOST_ARCH arm64)
        else()
            set(DXC_HOST_ARCH x64)
        endif()
        set(DIRECTX_DXC_TOOL
            "DYLD_LIBRARY_PATH=${DXC_HOST_ROOT}/lib/${DXC_HOST_ARCH}"
            "${DXC_HOST_ROOT}/bin/${DXC_HOST_ARCH}/dxc-macos"
            CACHE INTERNAL "Host macOS DXC compiler for iOS cross-compile" FORCE
        )
    endif()
endmacro()
