# Clean-room iOS arm64 CMake configuration for sonicnext-dev/MarathonRecomp v1.0.0
# Included automatically by MarathonRecomp/CMakeLists.txt when MARATHON_IOS_PORT is ON

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    message(STATUS "Configuring MarathonRecomp v1.0.0 for iOS arm64 (Deployment Target: 17.0)")

    add_compile_definitions(
        MARATHON_IOS_PORT=1
        MARATHON_RECOMP_METAL=1
    MARATHON_IOS_NATIVE_METAL=1
        MARATHON_IOS_STREAMING_XISO=1
    )

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
    )

    if(DEFINED MARATHON_IOS_FFMPEG_ROOT AND EXISTS "${MARATHON_IOS_FFMPEG_ROOT}/lib/libavcodec.a")
        set(MARATHON_IOS_FFMPEG_LIBS
            "${MARATHON_IOS_FFMPEG_ROOT}/lib/libavcodec.a"
            "${MARATHON_IOS_FFMPEG_ROOT}/lib/libavutil.a"
            "${MARATHON_IOS_FFMPEG_ROOT}/lib/libswresample.a"
        )
        message(STATUS "Using static iOS FFmpeg (XMA decoder): ${MARATHON_IOS_FFMPEG_ROOT}")
    endif()

    if(DEFINED MARATHON_IOS_FREETYPE_ROOT AND EXISTS "${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        set(MARATHON_IOS_FREETYPE_LIB "${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        message(STATUS "Using static iOS FreeType: ${MARATHON_IOS_FREETYPE_LIB}")
    endif()
endif()
