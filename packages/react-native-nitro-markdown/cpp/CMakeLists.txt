cmake_minimum_required(VERSION 3.22.1)
project(MD4CParserTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Define the path to our C++ sources
set(CPP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")

# Collect source files
file(GLOB MD4C_SOURCES "${CPP_ROOT}/md4c/*.c")
file(GLOB CORE_SOURCES "${CPP_ROOT}/core/*.cpp")
# Exclude the test file from the library sources
list(FILTER CORE_SOURCES EXCLUDE REGEX ".*Test\.cpp$")

# Create the core library
add_library(MD4CCore STATIC
    ${MD4C_SOURCES}
    ${CORE_SOURCES}
)

# Include directories for the library
target_include_directories(MD4CCore PUBLIC
    "${CPP_ROOT}/md4c"
    "${CPP_ROOT}/core"
)

# Preprocessor definitions
target_compile_definitions(MD4CCore PRIVATE
    MD4C_USE_UTF8=1
    NITRO_MARKDOWN_TESTING=1
)

# Create the test executable
add_executable(MD4CParserTest
    core/MD4CParserTest.cpp
)

# Link the test executable to the core library
target_link_libraries(MD4CParserTest PRIVATE MD4CCore)

# Include directories for the test
target_include_directories(MD4CParserTest PRIVATE
    "${CPP_ROOT}/core"
)
