/*
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│    _______   ________  ___  ___  ________  ___       ________  ________          ________  _________  ________  ________         │
│   |\  ___ \ |\   ____\|\  \|\  \|\   __  \|\  \     |\   __  \|\   ____\        |\   __  \|\___   ___\\   __  \|\   ____\        │
│   \ \   __/|\ \  \___|\ \  \\\  \ \  \|\  \ \  \    \ \  \|\  \ \  \___|        \ \  \|\  \|___ \  \_\ \  \|\  \ \  \___|_       │
│    \ \  \_|/_\ \  \    \ \   __  \ \  \\\  \ \  \    \ \  \\\  \ \  \  ___       \ \   _  _\   \ \  \ \ \  \\\  \ \_____  \      │
│     \ \  \_|\ \ \  \____\ \  \ \  \ \  \\\  \ \  \____\ \  \\\  \ \  \|\  \       \ \  \\  \|   \ \  \ \ \  \\\  \|____|\  \     │
│      \ \_______\ \_______\ \__\ \__\ \_______\ \_______\ \_______\ \_______\       \ \__\\ _\    \ \__\ \ \_______\____\_\  \    │
│       \|_______|\|_______|\|__|\|__|\|_______|\|_______|\|_______|\|_______|        \|__|\|__|    \|__|  \|_______|\_________\   │
│                                                                                                                   \|_________|   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
*/

/* Team EchoLog (Group 2) */
/* CEG4912/3 Capstone Project */
/* School of Electrical Engineering and Computer Science at the University of Ottawa */

/* Onboard OS for ESP32-S3 based ESP-32 S3 Supermini */
/* NVS Configuration Manager Header */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes
   2.0 Structs
   3.0 Prototypes
========================================*/

/* ==================== 1.0 Includes ==================== */
#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H
#include <stdint.h>

/* ==================== 2.0 Structs ==================== */
typedef struct {
    uint16_t accel_act_thresh;
    uint16_t accel_act_time;
    uint16_t accel_inact_thresh;
    uint16_t accel_inact_time;
    uint16_t record_length_sec;
} device_config_t;

/* ==================== 3.0 Prototypes ==================== */
void load_config(device_config_t *cfg);
void save_config(device_config_t *cfg);

#endif