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
/* GPS Background Tracking Module Implementation */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes & Variables
   2.0 NMEA Parser
   3.0 Tracking Task & Lifecycle
========================================*/

/* ==================== 1.0 Includes & Variables ==================== */
#include "gps_module.h"
#include "globals.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "esp_log.h"

#define I2C_GPS_NUM  I2C_NUM_1
#define PA1010D_ADDR 0x10

static volatile double current_lat = 0.0;
static volatile double current_lon = 0.0;
static volatile int current_fix = 0;
static TaskHandle_t gps_task_handle = NULL;
static bool gps_running = false;

/* ==================== 2.0 NMEA Parser ==================== */
static double convert_to_decimal_degrees(const char* nmea_coord, const char* direction) {
    if (!nmea_coord || !direction || strlen(nmea_coord) < 4) return 0.0;
    double raw_value = atof(nmea_coord); int degrees = (int)(raw_value / 100);             
    double decimal_degrees = degrees + ((raw_value - (degrees * 100)) / 60.0);
    if (direction[0] == 'S' || direction[0] == 'W') decimal_degrees = -decimal_degrees;
    return decimal_degrees;
}

static void parse_nmea_sentence(char *sentence) {
    if (strncmp(sentence, "$GNGGA", 6) == 0 || strncmp(sentence, "$GPGGA", 6) == 0) {
        char *tokens[15] = {0}; int idx = 0; tokens[idx++] = sentence;
        for(char *p = sentence; *p; p++) { if(*p == ',') { *p = '\0'; if(idx < 15) tokens[idx++] = p + 1; } }
        
        if (idx > 6) current_fix = atoi(tokens[6]);
        if (current_fix > 0 && strlen(tokens[2]) > 0 && strlen(tokens[4]) > 0) {
            current_lat = convert_to_decimal_degrees(tokens[2], tokens[3]);
            current_lon = convert_to_decimal_degrees(tokens[4], tokens[5]);
        }
    }
}

/* ==================== 3.0 Tracking Task & Lifecycle ==================== */
static void gps_read_task(void *pvParameters) {
    uint8_t data[32]; char line_buf[128]; int pos = 0;
    while (gps_running) {
        if (i2c_master_read_from_device(I2C_GPS_NUM, PA1010D_ADDR, data, sizeof(data), pdMS_TO_TICKS(100)) == ESP_OK) {
            for (int i = 0; i < sizeof(data); i++) {
                char c = data[i]; if (c == 0xFF) continue; 
                if (c == '\n') { line_buf[pos] = '\0'; if (pos > 0) parse_nmea_sentence(line_buf); pos = 0; } 
                else if (c != '\r' && pos < sizeof(line_buf) - 1) { line_buf[pos++] = c; }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(100)); 
    }
    vTaskDelete(NULL);
}

void gps_init(void) {
    if (gps_running) return;
    esp_log_level_set("*", ESP_LOG_NONE);
    i2c_config_t gps_conf = { .mode = I2C_MODE_MASTER, .sda_io_num = I2C_GPS_SDA_IO, .scl_io_num = I2C_GPS_SCL_IO, .sda_pullup_en = 1, .scl_pullup_en = 1, .master.clk_speed = 100000 };
    i2c_param_config(I2C_GPS_NUM, &gps_conf); 
    i2c_driver_install(I2C_GPS_NUM, gps_conf.mode, 0, 0, 0);
    
    uint8_t dummy = 0; i2c_master_write_to_device(I2C_GPS_NUM, PA1010D_ADDR, &dummy, 1, pdMS_TO_TICKS(100));
    vTaskDelay(pdMS_TO_TICKS(50));
    
    gps_running = true; 
    xTaskCreate(gps_read_task, "gps_trk", 8192, NULL, 4, &gps_task_handle);
}

void gps_deinit(void) {
    if (gps_running) {
        gps_running = false; vTaskDelay(pdMS_TO_TICKS(200)); 
        const char* sleep_cmd = "$PMTK161,0*28\r\n";
        i2c_master_write_to_device(I2C_GPS_NUM, PA1010D_ADDR, (const uint8_t*)sleep_cmd, strlen(sleep_cmd), pdMS_TO_TICKS(100));
        i2c_driver_delete(I2C_GPS_NUM); gps_task_handle = NULL;
    }
}

void gps_force_sleep(void) {
    if (gps_running) return; 
    esp_log_level_set("*", ESP_LOG_NONE);
    i2c_config_t gps_conf = { .mode = I2C_MODE_MASTER, .sda_io_num = I2C_GPS_SDA_IO, .scl_io_num = I2C_GPS_SCL_IO, .sda_pullup_en = 1, .scl_pullup_en = 1, .master.clk_speed = 100000 };
    i2c_param_config(I2C_GPS_NUM, &gps_conf); i2c_driver_install(I2C_GPS_NUM, gps_conf.mode, 0, 0, 0);
    const char* sleep_cmd = "$PMTK161,0*28\r\n";
    i2c_master_write_to_device(I2C_GPS_NUM, PA1010D_ADDR, (const uint8_t*)sleep_cmd, strlen(sleep_cmd), pdMS_TO_TICKS(100));
    i2c_driver_delete(I2C_GPS_NUM);
}

void gps_get_coords_str(char* buf) {
    if (current_fix > 0) snprintf(buf, 32, "%.6f_%.6f", current_lat, current_lon);
    else snprintf(buf, 32, "XXXXXXXX_XXXXXXXX"); 
}