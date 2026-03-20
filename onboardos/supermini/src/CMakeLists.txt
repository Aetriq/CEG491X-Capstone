# ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
# │    _______   ________  ___  ___  ________  ___       ________  ________          ________  _________  ________  ________         │
# │   |\  ___ \ |\   ____\|\  \|\  \|\   __  \|\  \     |\   __  \|\   ____\        |\   __  \|\___   ___\\   __  \|\   ____\        │
# │   \ \   __/|\ \  \___|\ \  \\\  \ \  \|\  \ \  \    \ \  \|\  \ \  \___|        \ \  \|\  \|___ \  \_\ \  \|\  \ \  \___|_       │
# │    \ \  \_|/_\ \  \    \ \   __  \ \  \\\  \ \  \    \ \  \\\  \ \  \  ___       \ \   _  _\   \ \  \ \ \  \\\  \ \_____  \      │
# │     \ \  \_|\ \ \  \____\ \  \ \  \ \  \\\  \ \  \____\ \  \\\  \ \  \|\  \       \ \  \\  \|   \ \  \ \ \  \\\  \|____|\  \     │
# │      \ \_______\ \_______\ \__\ \__\ \_______\ \_______\ \_______\ \_______\       \ \__\\ _\    \ \__\ \ \_______\____\_\  \    │
# │       \|_______|\|_______|\|__|\|__|\|_______|\|_______|\|_______|\|_______|        \|__|\|__|    \|__|  \|_______|\_________\   │
# │                                                                                                                   \|_________|   │
# └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
# Team EchoLog (Group 2) 
# CEG4912/3 Capstone Project 
#
# School of Electrical Engineering and Computer Science at the University of Ottawa 
# Onboard OS for ESP32-S3 based ESP-32 S3 Supermini 
#
# This file was NOT automatically generated for projects!
#
# CMake Source Registration 
# Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. 

FILE(GLOB_RECURSE app_sources ${CMAKE_SOURCE_DIR}/src/*.*)

idf_component_register(SRCS "main.c" "bluetooth_mode.c" "recording_mode.c" "rtc_module.c" "config_manager.c" "self_test.c" "gps_module.c"
                    INCLUDE_DIRS "."
                    REQUIRES "led_strip" "nvs_flash" "bt" "driver" "fatfs")