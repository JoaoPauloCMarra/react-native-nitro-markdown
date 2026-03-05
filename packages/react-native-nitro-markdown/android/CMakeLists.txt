cmake_minimum_required(VERSION 3.18.1...3.28)
project(NitroMarkdown)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Define the path to our C++ sources
set(CPP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")

# Collect source files
file(GLOB MD4C_SOURCES "${CPP_ROOT}/md4c/*.c")
file(GLOB CORE_SOURCES "${CPP_ROOT}/core/*.cpp")
file(GLOB BINDING_SOURCES "${CPP_ROOT}/bindings/*.cpp")

# Create the shared library with our sources
add_library(${PROJECT_NAME} SHARED
    ${MD4C_SOURCES}
    ${CORE_SOURCES}
    ${BINDING_SOURCES}
    # JNI adapter
    src/main/cpp/cpp-adapter.cpp
)

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    "${CPP_ROOT}/md4c"
    "${CPP_ROOT}/core"
    "${CPP_ROOT}/bindings"
)

# Preprocessor definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
    MD4C_USE_UTF8=1
)

# Include Nitro autolinking (adds nitrogen sources, definitions, and links)
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/NitroMarkdown+autolinking.cmake)

