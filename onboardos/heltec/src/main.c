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

/* Onboard OS for ESP32-S3 based Heltec IOT Wireless Tracker */
/* Main program to execute */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
 * 1.0 Headers
 * 2.0 Pin mappings
 * 3.0 Definitions
 * 4.0 Main Method 
 */

 /* ==================== 1.0 Headers ====================  */

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/rtc_io.h"
#include "esp_sleep.h"

#include "bluetooth_mode.h"
#include "recording_mode.h"

/* ==================== 2.0 Pin Mappings ==================== */
#define PIN_MODE_BT GPIO_NUM_0  
#define PIN_MODE_REC GPIO_NUM_1  

#define PIN_LED_BT GPIO_NUM_35
#define PIN_LED_REC GPIO_NUM_37

/* ==================== 3.0 Global Definitions & Variables ==================== */
#define WAKEUP_BITMASK ((1ULL << PIN_MODE_BT) | (1ULL << PIN_MODE_REC))

/* ==================== 4.0 Main Method ==================== */
void app_main(void) {
    gpio_reset_pin(PIN_LED_REC); gpio_reset_pin(PIN_LED_BT);
    gpio_set_direction(PIN_LED_REC, GPIO_MODE_OUTPUT); gpio_set_direction(PIN_LED_BT, GPIO_MODE_OUTPUT);

    gpio_reset_pin(PIN_MODE_BT);
    gpio_set_direction(PIN_MODE_BT, GPIO_MODE_INPUT);
    gpio_set_pull_mode(PIN_MODE_BT, GPIO_PULLUP_ONLY);

    gpio_reset_pin(PIN_MODE_REC);
    gpio_set_direction(PIN_MODE_REC, GPIO_MODE_INPUT);
    gpio_set_pull_mode(PIN_MODE_REC, GPIO_PULLUP_ONLY);

    vTaskDelay(pdMS_TO_TICKS(250));

    while (1) {
        if (gpio_get_level(PIN_MODE_BT) == 0) {
            vTaskDelay(pdMS_TO_TICKS(500)); 
            
            if (gpio_get_level(PIN_MODE_BT) == 0) { 
                gpio_set_level(PIN_LED_BT, 1);
                bluetooth_mode_main(); 
                gpio_set_level(PIN_LED_BT, 0);
            } 
            else { break; } 
        } 
        else if (gpio_get_level(PIN_MODE_REC) == 0) {
            vTaskDelay(pdMS_TO_TICKS(500)); 
            
            if (gpio_get_level(PIN_MODE_REC) == 0) { 
                gpio_set_level(PIN_LED_REC, 1);
                recording_mode_main();
                gpio_set_level(PIN_LED_REC, 0);
            } 
            else { break; }
        } 
        else {
            gpio_set_level(PIN_LED_REC, 0);
            gpio_set_level(PIN_LED_BT, 0);
            break; 
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    if (rtc_gpio_is_valid_gpio(PIN_MODE_REC)) {
        rtc_gpio_pullup_en(PIN_MODE_REC);
        rtc_gpio_pulldown_dis(PIN_MODE_REC);
    }
    esp_sleep_enable_ext1_wakeup(WAKEUP_BITMASK, ESP_EXT1_WAKEUP_ANY_LOW);
    esp_deep_sleep_start();
}