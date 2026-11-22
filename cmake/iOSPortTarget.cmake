# Target-level iOS linking & app bundle metadata helper
function(marathon_configure_ios_target TARGET_NAME)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
        return()
    endif()

    target_include_directories(${TARGET_NAME} PRIVATE
        "${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
    )

    target_link_libraries(${TARGET_NAME} PRIVATE
        ${MARATHON_IOS_FRAMEWORKS}
        ${MARATHON_IOS_FFMPEG_LIBS}
        ${MARATHON_IOS_FREETYPE_LIB}
        "-lz"
        "-lbz2"
        "-liconv"
    )

    set_target_properties(${TARGET_NAME} PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_INFO_PLIST "${CMAKE_SOURCE_DIR}/ios/Info.plist"
        XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "com.hiperema.kronos06.ios"
        XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET "17.0"
        XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS "${CMAKE_SOURCE_DIR}/ios/Entitlements.plist"
    )
endfunction()
