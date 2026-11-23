// Clean-room libcurl compatibility header for MarathonRecomp v1.0.0 on iOS
// Backed by native NSURLSession in ios/curl_ios_stub.mm (used by install/update_checker.cpp)
#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void CURL;

typedef enum {
    CURLE_OK = 0,
    CURLE_UNSUPPORTED_PROTOCOL = 1,
    CURLE_FAILED_INIT = 2,
    CURLE_URL_MALFORMAT = 3,
    CURLE_COULDNT_CONNECT = 7,
    CURLE_OUT_OF_MEMORY = 27,
    CURLE_OPERATION_TIMEDOUT = 28,
    CURLE_HTTP_RETURNED_ERROR = 22
} CURLcode;

typedef int CURLoption;
enum {
    CURLOPT_URL = 10002,
    CURLOPT_WRITEDATA = 10001,
    CURLOPT_USERAGENT = 10018,
    CURLOPT_WRITEFUNCTION = 20011,
    CURLOPT_FOLLOWLOCATION = 52
};

#define CURL_GLOBAL_DEFAULT 3L

typedef size_t (*curl_write_callback)(void* contents, size_t size, size_t nmemb, void* userdata);

CURLcode curl_global_init(long flags);
void curl_global_cleanup(void);
CURL* curl_easy_init(void);
CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...);
CURLcode curl_easy_perform(CURL* handle);
void curl_easy_cleanup(CURL* handle);
const char* curl_easy_strerror(CURLcode code);

// Replaces unavailable std::system("open ...") in UpdateChecker::visitWebsite() on iOS
void MarathonIOS_OpenURL(const char* url);

#ifdef __cplusplus
}
#endif
