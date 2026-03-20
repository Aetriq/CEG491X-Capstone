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
/* Self-Test Diagnostics Implementation */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes & Externals
   2.0 Self Test Routine
========================================*/

/* ==================== 1.0 Includes & Externals ==================== */
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/spi_master.h"
#include "driver/i2s_std.h"
#include "driver/i2c.h"
#include "globals.h"
#include "esp_log.h"
#include "self_test.h"

extern esp_err_t send_notification(uint8_t *data, size_t len);

static void send_test_result(const char* comp, int attempt, const char* res) {
    char buf[32];
    int len = snprintf(buf, sizeof(buf), "TEST|%s|%d|%s", comp, attempt, res);
    send_notification((uint8_t*)buf, len);
}

/* ==================== 2.0 Self Test Routine ==================== */
void run_self_test(void) {
    sys_led_state = LED_SELF_TEST; 
    // ADDED "GPS" to the end of the array
    const char* comps[] = {"SD", "ADXL", "MIC", "RTC", "GPS"};
    
    // INCREASED loop boundary from 4 to 5
    for (int c = 0; c < 5; c++) {
        for (int i = 1; i <= 3; i++) {
            bool pass = true;

            if (c == 0) {
                // MicroSD: Write and read back to verify data lines
                FILE* f = fopen("/sdcard/test.txt", "w+");
                if (f) { 
                    fprintf(f, "Echo"); fflush(f); fseek(f, 0, SEEK_SET);
                    char r[5] = {0}; fread(r, 1, 4, f); fclose(f); remove("/sdcard/test.txt");
                    if(strcmp(r, "Echo") != 0) pass = false;
                } else pass = false;
            } 
            else if (c == 1) {
                // ADXL: Read DEVID_AD register (0x00), should return 0xAD
                spi_device_interface_config_t devcfg = {.clock_speed_hz = 1*1000*1000, .mode = 0, .spics_io_num = ADXL_PIN_NUM_CS, .queue_size = 1};
                spi_device_handle_t adxl;
                if(spi_bus_add_device(SPI2_HOST, &devcfg, &adxl) == ESP_OK) {
                    spi_transaction_t t; memset(&t, 0, sizeof(t)); t.length = 24; t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA; 
                    t.tx_data[0] = 0x0B; t.tx_data[1] = 0x00; t.tx_data[2] = 0x00;
                    if(spi_device_polling_transmit(adxl, &t) == ESP_OK) { if(t.rx_data[2] != 0xAD) pass = false; } else pass = false;
                    spi_bus_remove_device(adxl);
                } else pass = false;
            } 
            else if (c == 2) {
                // I2S Mic: Read block, check for non-zero/non-FF (floating/dead) data
                i2s_chan_handle_t rx;
                i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER); 
                if(i2s_new_channel(&chan_cfg, NULL, &rx) == ESP_OK) {
                    i2s_std_config_t std_cfg = { .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000), .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO), .gpio_cfg = { .mclk=I2S_GPIO_UNUSED, .bclk=I2S_BCK_PIN, .ws=I2S_WS_PIN, .dout=I2S_GPIO_UNUSED, .din=I2S_DATA_PIN, .invert_flags={0} } };
                    std_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT; 
                    i2s_channel_init_std_mode(rx, &std_cfg); i2s_channel_enable(rx);
                    int32_t buf[64]; size_t br; 
                    if(i2s_channel_read(rx, buf, sizeof(buf), &br, 100) == ESP_OK) {
                        bool has_audio = false;
                        for(int j=0; j<(br/4); j++) { if(buf[j] != 0 && buf[j] != -1) { has_audio = true; break; } }
                        if(!has_audio) pass = false;
                    } else pass = false;
                    i2s_channel_disable(rx); i2s_del_channel(rx);
                } else pass = false;
            } 
            else if (c == 3) {
                // RTC I2C: Check ACK from 0x68 on I2C_NUM_0
                i2c_config_t conf = { .mode = I2C_MODE_MASTER, .sda_io_num = I2C_MASTER_SDA_IO, .sda_pullup_en = 1, .scl_io_num = I2C_MASTER_SCL_IO, .scl_pullup_en = 1, .master.clk_speed = 100000 };
                i2c_param_config(I2C_NUM_0, &conf); i2c_driver_install(I2C_NUM_0, conf.mode, 0, 0, 0);
                uint8_t data; i2c_cmd_handle_t cmd = i2c_cmd_link_create();
                i2c_master_start(cmd); i2c_master_write_byte(cmd, (0x68 << 1) | I2C_MASTER_READ, true); 
                i2c_master_read_byte(cmd, &data, I2C_MASTER_LAST_NACK); i2c_master_stop(cmd);
                esp_err_t ret = i2c_master_cmd_begin(I2C_NUM_0, cmd, 100 / portTICK_PERIOD_MS); 
                if(ret != ESP_OK) pass = false;
                i2c_cmd_link_delete(cmd); i2c_driver_delete(I2C_NUM_0);
            }
            else if (c == 4) {
                // Permanently gag the logger to prevent UART0 deadlock on pins 43/44
                esp_log_level_set("*", ESP_LOG_NONE); 

                i2c_config_t conf_gps = { .mode = I2C_MODE_MASTER, .sda_io_num = I2C_GPS_SDA_IO, .sda_pullup_en = 1, .scl_io_num = I2C_GPS_SCL_IO, .scl_pullup_en = 1, .master.clk_speed = 100000 };
                i2c_param_config(I2C_NUM_1, &conf_gps); i2c_driver_install(I2C_NUM_1, conf_gps.mode, 0, 0, 0);
                i2c_cmd_handle_t cmd_gps = i2c_cmd_link_create();
                i2c_master_start(cmd_gps); i2c_master_write_byte(cmd_gps, (0x10 << 1) | I2C_MASTER_WRITE, true); i2c_master_stop(cmd_gps);
                esp_err_t ret_gps = i2c_master_cmd_begin(I2C_NUM_1, cmd_gps, 100 / portTICK_PERIOD_MS); 
                if(ret_gps != ESP_OK) pass = false;
                i2c_cmd_link_delete(cmd_gps); i2c_driver_delete(I2C_NUM_1);

                // DO NOT UN-GAG THE LOGGER!
            }

            send_test_result(comps[c], i, pass ? "PASS" : "FAIL");
            if (i < 3) vTaskDelay(pdMS_TO_TICKS(1000));
        }
        // INCREASED bounds check from 3 to 4
        if (c < 4) vTaskDelay(pdMS_TO_TICKS(2000));
    }
    
    sys_led_state = LED_BT_PAIRED;
}