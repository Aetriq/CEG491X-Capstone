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
/* NVS Non-Volatile Memory Read/Write Wrapper */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes & Definitions
   2.0 Config Functions
========================================*/

/* ==================== 1.0 Includes & Definitions ==================== */
#include "config_manager.h"
#include "nvs_flash.h"
#include "nvs.h"

#define NVS_NAMESPACE "echolog_cfg"
#define NVS_KEY "dev_cfg"

/* ==================== 2.0 Config Functions ==================== */
void load_config(device_config_t *cfg) {
    nvs_handle_t my_handle; esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &my_handle);
    cfg->accel_act_thresh = 1800; cfg->accel_act_time = 10; cfg->accel_inact_thresh = 1500; cfg->accel_inact_time = 10; cfg->record_length_sec = 30;
    if(err == ESP_OK) {
        size_t required_size = 0; nvs_get_blob(my_handle, NVS_KEY, NULL, &required_size);
        if(required_size == sizeof(device_config_t)) { nvs_get_blob(my_handle, NVS_KEY, cfg, &required_size); }
        nvs_close(my_handle);
    }
}

void save_config(device_config_t *cfg) {
    nvs_handle_t my_handle;
    if(nvs_open(NVS_NAMESPACE, NVS_READWRITE, &my_handle) == ESP_OK) { nvs_set_blob(my_handle, NVS_KEY, cfg, sizeof(device_config_t)); nvs_commit(my_handle); nvs_close(my_handle); }
}