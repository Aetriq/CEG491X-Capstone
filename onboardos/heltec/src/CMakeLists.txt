# This file was automatically generated for projects
# without default 'CMakeLists.txt' file.

FILE(GLOB_RECURSE app_sources ${CMAKE_SOURCE_DIR}/src/*.*)

idf_component_register(SRCS "main.c" "bluetooth_mode.c" "recording_mode.c"
                    INCLUDE_DIRS ".")
