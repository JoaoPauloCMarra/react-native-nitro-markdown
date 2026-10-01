cmake_minimum_required(VERSION 3.18.1...3.28)
project(NitroMarkdown)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Define the path to our C++ sources
set(CPP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")

# Collect source files
file(GLOB MD4C_SOURCES "${CPP_ROOT}/nitromd/*.c")
file(GLOB CORE_SOURCES "${CPP_ROOT}/core/*.cpp")
file(GLOB BINDING_SOURCES "${CPP_ROOT}/bindings/*.cpp")
list(FILTER CORE_SOURCES EXCLUDE REGEX ".*Test\\.cpp$")

# Create the shared library with our sources
add_library(${PROJECT_NAME} SHARED
    ${MD4C_SOURCES}
    ${CORE_SOURCES}
    ${BINDING_SOURCES}
    # JNI adapter
    src/main/cpp/cpp-adapter.cpp
)

if(ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "x86_64")
    target_link_options(${PROJECT_NAME} PRIVATE "-Wl,-z,max-page-size=16384")
endif()

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    "${CPP_ROOT}/nitromd"
    "${CPP_ROOT}/core"
    "${CPP_ROOT}/bindings"
)

# Preprocessor definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
    MD4C_USE_UTF8=1
)

# Include Nitro autolinking (adds nitrogen sources, definitions, and links)
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/NitroMarkdown+autolinking.cmake)
