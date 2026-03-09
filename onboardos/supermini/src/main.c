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
/* Master Entry Point and Mode Switcher */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes
   2.0 Variables
   3.0 Persistent LED Task
   4.0 Main Application
========================================*/

/* ==================== 1.0 Includes ==================== */
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "esp_system.h"
#include "globals.h"
#include "bluetooth_mode.h"
#include "recording_mode.h"

/* ==================== 2.0 Variables ==================== */
led_strip_handle_t led_strip;
volatile led_state_t sys_led_state = LED_IDLE;

/* ==================== 3.0 Persistent LED Task ==================== */
void persistent_led_task(void *pvParameters) {
    bool tog = false;
    while(1) {
        switch(sys_led_state) {
            case LED_IDLE: led_strip_clear(led_strip); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(100)); break;
            case LED_BT_UNPAIRED: led_strip_set_pixel(led_strip, 0, tog?50:0, 0, tog?0:50); led_strip_refresh(led_strip); tog = !tog; vTaskDelay(pdMS_TO_TICKS(500)); break;
            case LED_BT_PAIRED: led_strip_set_pixel(led_strip, 0, 0, 0, 50); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(250)); break;
            case LED_BT_DISCONNECTING: for(int i=0; i<2; i++) { led_strip_set_pixel(led_strip, 0, 50, 0, 0); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(150)); led_strip_clear(led_strip); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(150)); } sys_led_state = LED_BT_UNPAIRED; break;
            case LED_REC_IDLE: led_strip_set_pixel(led_strip, 0, 0, 50, 0); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(250)); break;
            case LED_REC_STARTUP: led_strip_set_pixel(led_strip, 0, 50, 0, 0); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(500)); led_strip_clear(led_strip); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(500)); break;
            case LED_REC_ACTIVE: led_strip_set_pixel(led_strip, 0, 50, 0, 0); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(250)); break;
            case LED_REC_ERROR: led_strip_set_pixel(led_strip, 0, 50, 50, 50); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(1500)); sys_led_state = LED_REC_IDLE; break;
        }
    }
}

/* ==================== 4.0 Main Application ==================== */
void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(1000));
    led_strip_config_t strip_config = {.strip_gpio_num = RGB_LED_PIN, .max_leds = 1}; 
    led_strip_rmt_config_t rmt_config = {.resolution_hz = 10 * 1000 * 1000};
    ESP_ERROR_CHECK(led_strip_new_rmt_device(&strip_config, &rmt_config, &led_strip)); led_strip_clear(led_strip);

    esp_err_t ret = nvs_flash_init(); 
    if(ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) { ESP_ERROR_CHECK(nvs_flash_erase()); nvs_flash_init(); }

    gpio_reset_pin(PIN_MODE_SEL); gpio_set_direction(PIN_MODE_SEL, GPIO_MODE_INPUT); gpio_set_pull_mode(PIN_MODE_SEL, GPIO_PULLUP_ONLY);

    xTaskCreate(persistent_led_task, "sys_led", 2048, NULL, 5, NULL);

    if(gpio_get_level(PIN_MODE_SEL) == 0) { 
        sys_led_state = LED_BT_UNPAIRED; 
        bluetooth_mode_main(); 
    } else { 
        sys_led_state = LED_REC_IDLE; 
        recording_mode_main(); 
    }
    
    sys_led_state = LED_IDLE; 
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
}