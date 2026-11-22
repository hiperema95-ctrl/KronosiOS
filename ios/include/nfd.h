// Clean-room Native File Dialog Extended (NFD) compatible header for iOS 17+
// Implements single and multi-selection file/folder APIs used by MarathonRecomp v1.0.0 installer_wizard.cpp
#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef char nfdu8char_t;
typedef nfdu8char_t nfdnchar_t;
typedef size_t nfdfiltersize_t;
typedef size_t nfdpathsetsize_t;

typedef struct {
    const nfdu8char_t* name;
    const nfdu8char_t* spec;
} nfdu8filteritem_t;

typedef nfdu8filteritem_t nfdnfilteritem_t;
typedef void nfdpathset_t;

typedef enum {
    NFD_ERROR = 0,
    NFD_OKAY = 1,
    NFD_CANCEL = 2
} nfdresult_t;

nfdresult_t NFD_Init(void);
void NFD_Quit(void);
const char* NFD_GetError(void);
void NFD_ClearError(void);

void NFD_FreePathU8(nfdu8char_t* filePath);
#define NFD_FreePathN NFD_FreePathU8

nfdresult_t NFD_OpenDialogU8(
    nfdu8char_t** outPath,
    const nfdu8filteritem_t* filterList,
    nfdfiltersize_t filterCount,
    const nfdu8char_t* defaultPath
);

nfdresult_t NFD_PickFolderU8(
    nfdu8char_t** outPath,
    const nfdu8char_t* defaultPath
);

nfdresult_t NFD_OpenDialogMultipleN(
    const nfdpathset_t** outPaths,
    const nfdnfilteritem_t* filterList,
    nfdfiltersize_t filterCount,
    const nfdnchar_t* defaultPath
);

nfdresult_t NFD_PickFolderMultipleN(
    const nfdpathset_t** outPaths,
    const nfdnchar_t* defaultPath
);

nfdresult_t NFD_PathSet_GetCount(const nfdpathset_t* pathSet, nfdpathsetsize_t* count);
nfdresult_t NFD_PathSet_GetPathN(const nfdpathset_t* pathSet, nfdpathsetsize_t index, nfdnchar_t** outPath);
void NFD_PathSet_FreePathN(nfdnchar_t* filePath);
void NFD_PathSet_Free(const nfdpathset_t* pathSet);

// iOS-specific helper: sets launcher hint so SelectGame prioritizes direct .xiso/.iso
// while SelectDLC allows multi-selection of Xbox 360 STFS DLC packages or folders.
typedef enum {
    MARATHON_IOS_PICKER_MODE_GENERIC = 0,
    MARATHON_IOS_PICKER_MODE_GAME_XISO = 1,
    MARATHON_IOS_PICKER_MODE_DLC_SEPARATE = 2
} MarathonIOSPickerMode;

void MarathonIOS_SetPickerMode(MarathonIOSPickerMode mode);

#ifdef __cplusplus
}
#endif
