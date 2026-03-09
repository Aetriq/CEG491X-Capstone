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
/* Global Pin Mappings and External Variables */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes
   2.0 Pin Definitions
   3.0 External Variables
========================================*/

/* ==================== 1.0 Includes ==================== */
#ifndef GLOBALS_H
#define GLOBALS_H
#include "driver/gpio.h"
#include "led_strip.h"

/* ==================== 2.0 Pin Definitions ==================== */
#define PIN_MODE_SEL      GPIO_NUM_1
#define SPI_PIN_NUM_MOSI  GPIO_NUM_6
#define SPI_PIN_NUM_CLK   GPIO_NUM_5
#define SPI_PIN_NUM_MISO  GPIO_NUM_4
#define SD_PIN_NUM_CS     GPIO_NUM_7
#define ADXL_PIN_NUM_CS   GPIO_NUM_8 
#define ADXL_PIN_NUM_INT1 GPIO_NUM_9 
#define I2S_BCK_PIN       GPIO_NUM_10
#define I2S_WS_PIN        GPIO_NUM_11
#define I2S_DATA_PIN      GPIO_NUM_12
#define I2C_MASTER_SDA_IO GPIO_NUM_13
#define I2C_MASTER_SCL_IO GPIO_NUM_2
#define RGB_LED_PIN       GPIO_NUM_48

/* ==================== 3.0 External Variables ==================== */
typedef enum { LED_IDLE, LED_BT_UNPAIRED, LED_BT_PAIRED, LED_BT_DISCONNECTING, LED_REC_IDLE, LED_REC_STARTUP, LED_REC_ACTIVE, LED_REC_ERROR } led_state_t;
extern volatile led_state_t sys_led_state;
extern led_strip_handle_t led_strip;

#endif