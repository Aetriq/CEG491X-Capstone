/**
* ////////////////////////////////////////////////////////////////////
* // _____     _           _                  ____ _____ ___  ____  //
* //| ____|___| |__   ___ | |    ___   __ _  |  _ \_   _/ _ \/ ___| //
* //|  _| / __| '_ \ / _ \| |   / _ \ / _` | | |_) || || | | \___ \ //
* //| |__| (__| | | | (_) | |__| (_) | (_| | |  _ < | || |_| |___) |//
* //|_____\___|_| |_|\___/|_____\___/ \__, | |_| \_\|_| \___/|____/ //
* //                                  |___/                         //
* ////////////////////////////////////////////////////////////////////
*/

/* Team EchoLog (Group 2) */
/* CEG4912/3 Capstone Project */
/* School of Electrical Engineering and Computer Science at the University of Ottawa */

/* Onboard OS for ESP32-S3 based Heltec IOT Wireless Tracker */
/* Main program to execute */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 

 */

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/rtc_io.h"
#include "esp_sleep.h"

#include "bluetooth_mode.h"
#include "recording_mode.h"

#define PIN_MODE_BT GPIO_NUM_0  // Middle Position
#define PIN_MODE_REC GPIO_NUM_1  // Right Position

#define PIN_LED_BT GPIO_NUM_40
#define PIN_LED_REC GPIO_NUM_38

#define WAKEUP_BITMASK ((1ULL << PIN_MODE_BT) | (1ULL << PIN_MODE_REC))

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
        // 1. Check PIN_MODE_BT (Active Low)
        if (gpio_get_level(PIN_MODE_BT) == 0) {
            vTaskDelay(pdMS_TO_TICKS(500)); 
            
            if (gpio_get_level(PIN_MODE_BT) == 0) { 
                gpio_set_level(PIN_LED_BT, 1);
                bluetooth_mode_main(); 
                gpio_set_level(PIN_LED_BT, 0);
            } 
            else { break; } 
        } 
        // 2. Check PIN_MODE_REC (Active Low)
        else if (gpio_get_level(PIN_MODE_REC) == 0) {
            vTaskDelay(pdMS_TO_TICKS(500)); 
            
            if (gpio_get_level(PIN_MODE_REC) == 0) { 
                gpio_set_level(PIN_LED_REC, 1);
                recording_mode_main();
                gpio_set_level(PIN_LED_REC, 0);
            } 
            else { break; }
        } 
        // 3. Neither Active -> Sleep
        else {
            gpio_set_level(PIN_LED_REC, 0);
            gpio_set_level(PIN_LED_BT, 0);
            break; 
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    // Go to Deep Sleep
    // We only reach here if the 'break' statement above was hit. 
    if (rtc_gpio_is_valid_gpio(PIN_MODE_REC)) {
        rtc_gpio_pullup_en(PIN_MODE_REC);
        rtc_gpio_pulldown_dis(PIN_MODE_REC);
    }
    esp_sleep_enable_ext1_wakeup(WAKEUP_BITMASK, ESP_EXT1_WAKEUP_ANY_LOW);
    esp_deep_sleep_start();
}