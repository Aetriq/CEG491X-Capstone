/*
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│    _______   ________  ___  ___  ________  ___       ________  ________          ________  _________  ________  ________         │
│   |\  ___ \ |\   ____\|\  \|\  \|\   __  \|\  \     |\   __  \|\   ____\        |\   __  \|\___   ___\\   __  \|\   ____\        │
│   \ \   __/|\ \  \___|\ \  \\\  \ \  \|\  \ \  \    \ \  \|\  \ \  \___|        \ \  \|\  \|___ \  \_\ \  \|\  \ \  \___|_       │
│    \ \  \_|/_\ \  \    \ \   __  \ \  \\\  \ \  \    \ \  \\\  \ \  \  ___       \ \   _  _\   \ \  \ \ \  \\\  \ \_____  \      │
│     \ \  \_|\ \ \  \____\ \  \ \  \ \  \____\ \  \\\  \ \  \|\  \       \ \  \\  \|   \ \  \ \ \  \\\  \|____|\  \     │
│      \ \_______\ \_______\ \__\ \__\ \_______\ \_______\ \_______\ \_______\       \ \__\\ _\    \ \__\ \ \_______\____\_\  \    │
│       \|_______|\|_______|\|__|\|__|\|_______|\|_______|\|_______|\|_______|        \|__|\|__|    \|__|  \|_______|\_________\   │
│                                                                                                                   \|_________|   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
*/

/* Team EchoLog (Group 2) */
/* CEG4912/3 Capstone Project */
/* School of Electrical Engineering and Computer Science at the University of Ottawa */

/* Onboard OS for ESP32-S3 based ESP-32 S3 Supermini */
/* Autonomous Audio Recording Mode with I2S & SPI Switching */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes & Definitions
   2.0 Variables & Structs
   3.0 Hardware Setup & Control
   4.0 Recording Mode Main
========================================*/

/* ==================== 1.0 Includes & Definitions ==================== */
#include <stdio.h>
#include <string.h>
#include <sys/unistd.h>
#include <sys/stat.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h" 
#include "esp_log.h"
#include "driver/i2s_std.h"
#include "driver/spi_master.h"
#include "driver/sdspi_host.h"
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "globals.h"
#include "rtc_module.h"
#include "config_manager.h"

#define MOUNT_POINT "/sdcard"
#define SAMPLE_RATE 16000
#define SAMPLES_PER_READ 1024
#define WAKEUP_HOLD_TIME_US 500000 
#define STARTUP_DELAY_SEC 5

/* ==================== 2.0 Variables & Structs ==================== */
static spi_device_handle_t adxl_spi_handle = NULL;
static sdmmc_card_t *card = NULL;
static i2s_chan_handle_t g_rx_handle = NULL;

typedef struct {
    char riff[4]; uint32_t overall_size; char wave[4]; char fmt_chunk_marker[4];
    uint32_t length_of_fmt; uint16_t format_type; uint16_t channels;
    uint32_t sample_rate; uint32_t byterate; uint16_t block_align;
    uint16_t bits_per_sample; char data_chunk_header[4]; uint32_t data_size;
} wav_header_t;

/* ==================== 3.0 Hardware Setup & Control ==================== */
static void park_cs_pins() { gpio_set_direction(SD_PIN_NUM_CS, GPIO_MODE_OUTPUT); gpio_set_level(SD_PIN_NUM_CS, 1); gpio_set_direction(ADXL_PIN_NUM_CS, GPIO_MODE_OUTPUT); gpio_set_level(ADXL_PIN_NUM_CS, 1); }
static void adxl_write_reg(uint8_t reg, uint8_t value) { if(!adxl_spi_handle) return; spi_transaction_t t; memset(&t, 0, sizeof(t)); t.length = 8 * 3; t.flags = SPI_TRANS_USE_TXDATA; t.tx_data[0] = 0x0A; t.tx_data[1] = reg; t.tx_data[2] = value; spi_device_polling_transmit(adxl_spi_handle, &t); }
static uint8_t adxl_read_reg(uint8_t reg) { if(!adxl_spi_handle) return 0; spi_transaction_t t; memset(&t, 0, sizeof(t)); t.length = 8 * 3; t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA; t.tx_data[0] = 0x0B; t.tx_data[1] = reg; t.tx_data[2] = 0; spi_device_polling_transmit(adxl_spi_handle, &t); return t.rx_data[2]; }

void init_adxl(device_config_t *cfg) {
    park_cs_pins();
    spi_bus_config_t buscfg = {.miso_io_num = SPI_PIN_NUM_MISO, .mosi_io_num = SPI_PIN_NUM_MOSI, .sclk_io_num = SPI_PIN_NUM_CLK, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = 32};
    spi_device_interface_config_t devcfg = {.clock_speed_hz = 1 * 1000 * 1000, .mode = 0, .spics_io_num = ADXL_PIN_NUM_CS, .queue_size = 1};
    spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO); spi_bus_add_device(SPI2_HOST, &devcfg, &adxl_spi_handle);
    gpio_config_t int_conf = {.intr_type = GPIO_INTR_DISABLE, .mode = GPIO_MODE_INPUT, .pin_bit_mask = (1ULL << ADXL_PIN_NUM_INT1), .pull_down_en = 0, .pull_up_en = 0}; gpio_config(&int_conf);

    adxl_write_reg(0x1F, 0x52); vTaskDelay(pdMS_TO_TICKS(50)); 
    if(cfg->accel_act_thresh == 0) { cfg->accel_act_thresh = 1800; cfg->accel_act_time = 10; cfg->accel_inact_thresh = 1500; cfg->accel_inact_time = 10; }
    adxl_write_reg(0x20, cfg->accel_act_thresh & 0xFF); adxl_write_reg(0x21, (cfg->accel_act_thresh >> 8) & 0x07); adxl_write_reg(0x22, cfg->accel_act_time);
    adxl_write_reg(0x23, cfg->accel_inact_thresh & 0xFF); adxl_write_reg(0x24, (cfg->accel_inact_thresh >> 8) & 0x07); adxl_write_reg(0x25, cfg->accel_inact_time & 0xFF); adxl_write_reg(0x26, (cfg->accel_inact_time >> 8) & 0xFF);
    adxl_write_reg(0x2A, 0x40); adxl_write_reg(0x27, 0x3F); adxl_write_reg(0x2D, adxl_read_reg(0x2D) | 0x06);
    vTaskDelay(pdMS_TO_TICKS(100)); adxl_read_reg(0x0B);
}

void deinit_adxl() { if(adxl_spi_handle) { spi_bus_remove_device(adxl_spi_handle); adxl_spi_handle = NULL; } spi_bus_free(SPI2_HOST); }

bool init_sd_card() {
    park_cs_pins();
    esp_vfs_fat_sdmmc_mount_config_t mount_config = {.format_if_mount_failed=false, .max_files=5, .allocation_unit_size=16*1024};
    gpio_set_pull_mode(SPI_PIN_NUM_MISO, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SPI_PIN_NUM_MOSI, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SPI_PIN_NUM_CLK, GPIO_PULLUP_ONLY); 
    sdmmc_host_t host = SDSPI_HOST_DEFAULT(); host.slot = SPI2_HOST; host.max_freq_khz = 20000;
    spi_bus_config_t bus_cfg = {.mosi_io_num=SPI_PIN_NUM_MOSI, .miso_io_num=SPI_PIN_NUM_MISO, .sclk_io_num=SPI_PIN_NUM_CLK, .quadwp_io_num=-1, .quadhd_io_num=-1, .max_transfer_sz=4096+8};
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);
    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT(); slot_config.gpio_cs=SD_PIN_NUM_CS; slot_config.host_id=host.slot;
    esp_err_t ret = esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card);
    if (ret != ESP_OK) { spi_bus_free(host.slot); return false; }
    return true;
}

void deinit_sd_card() { if(card) { esp_vfs_fat_sdcard_unmount(MOUNT_POINT, card); card = NULL; } spi_bus_free(SPI2_HOST); }

void write_wav_header(FILE *f, uint32_t data_size) {
    wav_header_t header; memcpy(header.riff, "RIFF", 4); header.overall_size = data_size + 36; memcpy(header.wave, "WAVE", 4); memcpy(header.fmt_chunk_marker, "fmt ", 4);
    header.length_of_fmt = 16; header.format_type = 1; header.channels = 1; header.sample_rate = SAMPLE_RATE; header.bits_per_sample = 16;
    header.byterate = SAMPLE_RATE * 1 * 16 / 8; header.block_align = 1 * 16 / 8; memcpy(header.data_chunk_header, "data", 4); header.data_size = data_size;
    fseek(f, 0, SEEK_SET); fwrite(&header, sizeof(wav_header_t), 1, f);
}

void init_mic() {
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER); i2s_new_channel(&chan_cfg, NULL, &g_rx_handle);
    i2s_std_config_t std_cfg = { .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE), .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO), .gpio_cfg = { .mclk=I2S_GPIO_UNUSED, .bclk=I2S_BCK_PIN, .ws=I2S_WS_PIN, .dout=I2S_GPIO_UNUSED, .din=I2S_DATA_PIN, .invert_flags={0} } };
    std_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT; i2s_channel_init_std_mode(g_rx_handle, &std_cfg); i2s_channel_enable(g_rx_handle);
}

/* ==================== 4.0 Recording Mode Main ==================== */
void recording_mode_main(void) {
    rtc_init_and_sync(); init_mic(); device_config_t cfg; load_config(&cfg);
    while(gpio_get_level(PIN_MODE_SEL) == 1) {
        sys_led_state = LED_REC_IDLE; init_adxl(&cfg); bool triggered = false;
        while(gpio_get_level(PIN_MODE_SEL) == 1) {
            if(gpio_get_level(ADXL_PIN_NUM_INT1) == 1) {
                int64_t start = esp_timer_get_time(); bool holds = true;
                while((esp_timer_get_time() - start) < WAKEUP_HOLD_TIME_US) { if(gpio_get_level(ADXL_PIN_NUM_INT1) == 0) { holds = false; break; } vTaskDelay(pdMS_TO_TICKS(10)); }
                if(holds) { triggered = true; adxl_read_reg(0x0B); break; }
            }
            vTaskDelay(pdMS_TO_TICKS(50));
        }
        deinit_adxl();
        if(triggered && gpio_get_level(PIN_MODE_SEL) == 1) {
            sys_led_state = LED_REC_STARTUP;
            for(int i = 0; i < STARTUP_DELAY_SEC * 10; i++) { if(gpio_get_level(PIN_MODE_SEL) == 0) break; vTaskDelay(pdMS_TO_TICKS(100)); }
            if(gpio_get_level(PIN_MODE_SEL) == 0) continue;
            
            if(!init_sd_card()) { sys_led_state = LED_REC_ERROR; vTaskDelay(pdMS_TO_TICKS(1500)); continue; }
            sys_led_state = LED_REC_ACTIVE;
            
            char filename[64]; time_t now; struct tm ti; time(&now); localtime_r(&now, &ti);
            snprintf(filename, sizeof(filename), "%s/%04d%02d%02d_%02d%02d%02d.wav", MOUNT_POINT, ti.tm_year+1900, ti.tm_mon+1, ti.tm_mday, ti.tm_hour, ti.tm_min, ti.tm_sec);
            FILE *f = fopen(filename, "wb");
            if(f) {
                write_wav_header(f, 0); int32_t *i2s_buf = calloc(SAMPLES_PER_READ, 4); int16_t *wav_buf = calloc(SAMPLES_PER_READ, 2); size_t br = 0; uint32_t tot_bytes = 0;
                int64_t end_t = esp_timer_get_time() + ((int64_t)cfg.record_length_sec * 1000000);
                while(esp_timer_get_time() < end_t && gpio_get_level(PIN_MODE_SEL) == 1) {
                    if(i2s_channel_read(g_rx_handle, i2s_buf, SAMPLES_PER_READ * 4, &br, 100) == ESP_OK) {
                        int smp = br / 4; for(int i=0; i<smp; i++) wav_buf[i] = (int16_t)(i2s_buf[i] >> 14);
                        fwrite(wav_buf, 2, smp, f); tot_bytes += smp * 2;
                    }
                }
                write_wav_header(f, tot_bytes); fclose(f); free(i2s_buf); free(wav_buf);
            }
            deinit_sd_card();
        }
    }
    i2s_channel_disable(g_rx_handle); i2s_del_channel(g_rx_handle); 
    return;
}