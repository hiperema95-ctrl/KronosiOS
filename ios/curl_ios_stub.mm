// Clean-room NSURLSession-backed libcurl compatibility layer for iOS 17+
// Eliminates desktop libcurl dependency while keeping UpdateChecker functional on iOS.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#include <curl/curl.h>

#include <cstdarg>
#include <memory>
#include <mutex>
#include <string>

struct MarathonCurlHandle {
    std::string url;
    std::string userAgent;
    curl_write_callback writeFn = nullptr;
    void* writeData = nullptr;
    long followLocation = 1;
};

struct MarathonCurlAsyncState {
    std::mutex mtx;
    std::string body;
    NSInteger statusCode = 0;
    bool hasError = false;
    bool hasData = false;
};

extern "C" {

CURLcode curl_global_init(long) {
    return CURLE_OK;
}

void curl_global_cleanup(void) {}

CURL* curl_easy_init(void) {
    return new MarathonCurlHandle();
}

CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...) {
    if (!handle) return CURLE_FAILED_INIT;
    auto* ctx = static_cast<MarathonCurlHandle*>(handle);
    va_list args;
    va_start(args, option);
    switch (option) {
        case CURLOPT_URL: {
            const char* s = va_arg(args, const char*);
            ctx->url = s ? s : "";
            break;
        }
        case CURLOPT_USERAGENT: {
            const char* s = va_arg(args, const char*);
            ctx->userAgent = s ? s : "";
            break;
        }
        case CURLOPT_WRITEFUNCTION: {
            ctx->writeFn = va_arg(args, curl_write_callback);
            break;
        }
        case CURLOPT_WRITEDATA: {
            ctx->writeData = va_arg(args, void*);
            break;
        }
        case CURLOPT_FOLLOWLOCATION: {
            ctx->followLocation = va_arg(args, long);
            break;
        }
        default:
            break;
    }
    va_end(args);
    return CURLE_OK;
}

CURLcode curl_easy_perform(CURL* handle) {
    if (!handle) return CURLE_FAILED_INIT;
    auto* ctx = static_cast<MarathonCurlHandle*>(handle);
    if (ctx->url.empty()) return CURLE_URL_MALFORMAT;

    @autoreleasepool {
        NSString* urlStr = [NSString stringWithUTF8String:ctx->url.c_str()];
        NSURL* nsUrl = [NSURL URLWithString:urlStr];
        if (!nsUrl) return CURLE_URL_MALFORMAT;

        NSMutableURLRequest* req = [NSMutableURLRequest requestWithURL:nsUrl];
        req.timeoutInterval = 12.0;
        if (!ctx->userAgent.empty()) {
            NSString* ua = [NSString stringWithUTF8String:ctx->userAgent.c_str()];
            [req setValue:ua forHTTPHeaderField:@"User-Agent"];
        }

        // Use an ephemeral NSURLSession (RAM-only, no Library/Caches SQLite DB creation on first launch in LiveContainer)
        // and copy response bytes into heap-owned std::shared_ptr inside the completion handler to guarantee zero use-after-free.
        NSURLSessionConfiguration* cfg = [NSURLSessionConfiguration ephemeralSessionConfiguration];
        cfg.timeoutIntervalForRequest = 12.0;
        cfg.timeoutIntervalForResource = 15.0;
        NSURLSession* session = [NSURLSession sessionWithConfiguration:cfg];

        auto state = std::make_shared<MarathonCurlAsyncState>();
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        NSURLSessionDataTask* task = [session
            dataTaskWithRequest:req
              completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
                  {
                      std::lock_guard<std::mutex> lock(state->mtx);
                      state->hasError = (error != nil);
                      if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                          state->statusCode = ((NSHTTPURLResponse*)response).statusCode;
                      }
                      if (data != nil) {
                          state->hasData = true;
                          if (data.length > 0 && data.bytes != nullptr) {
                              state->body.assign(static_cast<const char*>(data.bytes), static_cast<size_t>(data.length));
                          }
                      }
                  }
                  dispatch_semaphore_signal(sem);
              }];
        [task resume];

        if (dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(15 * NSEC_PER_SEC))) != 0) {
            [task cancel];
            [session invalidateAndCancel];
            return CURLE_OPERATION_TIMEDOUT;
        }
        [session finishTasksAndInvalidate];

        std::string bodyCopy;
        NSInteger statusCode = 0;
        bool hasError = false;
        bool hasData = false;
        {
            std::lock_guard<std::mutex> lock(state->mtx);
            hasError = state->hasError;
            hasData = state->hasData;
            statusCode = state->statusCode;
            bodyCopy = std::move(state->body);
        }

        if (hasError || !hasData) {
            return CURLE_COULDNT_CONNECT;
        }
        if (statusCode >= 400) {
            return CURLE_HTTP_RETURNED_ERROR;
        }

        if (ctx->writeFn && !bodyCopy.empty()) {
            ctx->writeFn(bodyCopy.data(), 1, bodyCopy.size(), ctx->writeData);
        }
        return CURLE_OK;
    }
}

void curl_easy_cleanup(CURL* handle) {
    delete static_cast<MarathonCurlHandle*>(handle);
}

const char* curl_easy_strerror(CURLcode code) {
    switch (code) {
        case CURLE_OK: return "No error";
        case CURLE_URL_MALFORMAT: return "Malformed URL";
        case CURLE_COULDNT_CONNECT: return "Couldn't connect to server";
        case CURLE_OPERATION_TIMEDOUT: return "Operation timed out";
        case CURLE_HTTP_RETURNED_ERROR: return "HTTP server returned error";
        default: return "iOS NSURLSession request error";
    }
}

void MarathonIOS_OpenURL(const char* url) {
    if (!url || !url[0]) return;
    NSString* urlStr = [NSString stringWithUTF8String:url];
    NSURL* nsUrl = [NSURL URLWithString:urlStr];
    if (!nsUrl) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:nsUrl options:@{} completionHandler:nil];
    });
}

} // extern "C"
