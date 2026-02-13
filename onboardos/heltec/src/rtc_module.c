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
/* RTC Logic */

/* ========== HARDWARE OVERVIEW ========== 
 * RTC Module: HW-111 TinyRTC Module
 *
 * This is not an executable program (no main method). Only the functions should be called to re-init or fetch RTC data.
 * 
 * Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
 * 1.0 Headers
 * 2.0 Pin mappings
 * 3.0 Definitions
 * 4.0 Functions
 */
/* ==================== 1.0 Headers ====================  */
#include "rtc_module.h"
#include "driver/i2c.h"
#include "sys/time.h"

/* ==================== 2.0 Pin Mappings ==================== */
#define I2C_MASTER_SDA_IO  GPIO_NUM_33
#define I2C_MASTER_SCL_IO  GPIO_NUM_34

/* ==================== 3.0 Global Definitions & Variables ==================== */
#define I2C_MASTER_NUM     I2C_NUM_0
#define I2C_MASTER_FREQ_HZ 100000
#define RTC_ADDR           0x68

static uint8_t dec2bcd(uint8_t val) { return ((val / 10 * 16) + (val % 10)); }
static uint8_t bcd2dec(uint8_t val) { return ((val / 16 * 10) + (val % 16)); }

/* ==================== 4.0 Functions ==================== */
static void i2c_init_once(void) {
    static bool initialized = false;
    if (initialized) return;

    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
        .clk_flags = 0,
    };
    i2c_param_config(I2C_MASTER_NUM, &conf);
    i2c_driver_install(I2C_MASTER_NUM, conf.mode, 0, 0, 0);
    initialized = true;
}

void rtc_init_and_sync(void) {
    i2c_init_once();

    uint8_t data[7];
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RTC_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, 0x00, true); 
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RTC_ADDR << 1) | I2C_MASTER_READ, true);
    i2c_master_read(cmd, data, 6, I2C_MASTER_ACK);
    i2c_master_read_byte(cmd, &data[6], I2C_MASTER_LAST_NACK);
    i2c_master_stop(cmd);
    esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, 1000 / portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    if (ret == ESP_OK) {
        struct tm tm_info = {0};
        tm_info.tm_sec  = bcd2dec(data[0] & 0x7F);
        tm_info.tm_min  = bcd2dec(data[1]);
        tm_info.tm_hour = bcd2dec(data[2] & 0x3F);
        tm_info.tm_mday = bcd2dec(data[4]);
        tm_info.tm_mon  = bcd2dec(data[5] & 0x1F) - 1; 
        tm_info.tm_year = bcd2dec(data[6]) + 100;      
        
        time_t t = mktime(&tm_info);
        struct timeval now = { .tv_sec = t, .tv_usec = 0 };
        settimeofday(&now, NULL);
    }
}

void rtc_set_time_manual(int year, int month, int day, int hour, int min, int sec) {
    i2c_init_once();
    
    int year_short = (year > 2000) ? year - 2000 : year;

    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (RTC_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write_byte(cmd, 0x00, true); 
    i2c_master_write_byte(cmd, dec2bcd(sec), true);
    i2c_master_write_byte(cmd, dec2bcd(min), true);
    i2c_master_write_byte(cmd, dec2bcd(hour), true);
    i2c_master_write_byte(cmd, dec2bcd(1), true); 
    i2c_master_write_byte(cmd, dec2bcd(day), true);
    i2c_master_write_byte(cmd, dec2bcd(month), true);
    i2c_master_write_byte(cmd, dec2bcd(year_short), true);
    i2c_master_stop(cmd);
    i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, 1000 / portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    rtc_init_and_sync();
}