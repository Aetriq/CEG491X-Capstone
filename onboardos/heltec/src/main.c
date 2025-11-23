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

/* ========== HARDWARE OVERVIEW ========== 
 * Accelerometer: ADXL362 by Analog Devices
 * SPI Mode 
 * When motion reaches a certain threshold, toggle INT1 pin 
 *
 * Microphone: I2S MEMS by Adafruit Technologies 
 * I2S Mode 
 * Interpret high-quality audio while actively cancelling noise and interference 
 *
 * Storage: MicroSD card breakout board+ by Adafruit Technologies 
 * SPI Mode 
 * Stores all tracking/audio data
 *
 * GPS: GNSS UC6580 Built-Into the board
 * UART Mode 
 * Interprets geographical location when possible */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
 * 0.0 Premable
 * 1.0 Headers
 * 2.0 Pin mappings
 * 3.0 Definitions
 *  3.5 Public & Static Variables
 * 4.0 Functions
 * 5.0 Main Method 
 */

/* ==================== 0.0 Preamble ====================  */

/* ========== UPDATE LOG (v0.5.1) ==========
 * get_and_update_index : 
 *      - Uses idx.dat instead of iteratively checking each file.
 *      - Efficiency went from O(n) O(1) for read access.
 *      - Basic binary file for now, will change later when other data is implemented.
 * init_sd_card :
 *      - Changed to 4000kHz to improve stability temporarily. (20000kHz will be used in next version).
 *      - Return type is now a bool so we can init the sd multiple times.
 *      - SD Card gets the HW SPI for fastest speed and performance.
 * spi_adxl_init :
 *      - Disabling DMA for now to avoid contention with microsd breakout
 *      - ADXL usually doesn't need it unless we are writing alot of data at once
 *      - Changed ADXL to SPI2 which is a SW channel since we only write 2 bytes in this code.    
 */

/* References: 
    [1] ADXL362 Motion Activated Sleep Example by Analog Devices: https://github.com/annem/ADXL362/blob/master/examples/ADXL362_MotionActivatedSleep/ADXL362_MotionActivatedSleep.ino 
    [2] ADXL362 Documentation by Analog Devices: https://github.com/annem/ADXL362/blob/master/ADXL362.cpp 
    [3] Wireless Tracker v1.1 Documentation by jhiggason: https://github.com/jhiggason/lorawirelesstracker
    [4] Wireless Tracker, ESP32S3 + SX1262 + GPS LoRa Node by Heltec Automation: https://heltec.org/project/wireless-tracker/
*/

/* ==================== 1.0 Headers ====================  */
#include <stdio.h>
#include <string.h>

#include <sys/unistd.h>
#include <sys/stat.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "esp_sleep.h" 
#include "esp_timer.h" 

#include "driver/i2s_std.h"
#include "driver/spi_master.h"
#include "driver/sdspi_host.h"
#include "driver/gpio.h"
#include "esp_log.h"

#include "sdmmc_cmd.h"
#include "esp_vfs_fat.h"
#include "esp_timer.h"

#include <errno.h>

/* ==================== 2.0 Pin mappings ====================  */

/* ADXL362 */
#define PIN_NUM_MISO GPIO_NUM_47
#define PIN_NUM_MOSI GPIO_NUM_6
#define PIN_NUM_CLK  GPIO_NUM_5
#define PIN_NUM_CS   GPIO_NUM_4
#define PIN_NUM_INT1 GPIO_NUM_7

/* I2S Microphone (Adafruit SPH0645) */
#define I2S_BCK_PIN     GPIO_NUM_8
#define I2S_WS_PIN      GPIO_NUM_10
#define I2S_DATA_PIN    GPIO_NUM_9

#define I2S_PORT        I2S_NUM_0
#define SAMPLE_RATE     16000

/* SD Card Pins */
#define SD_CLK_PIN      GPIO_NUM_16
#define SD_MOSI_PIN     GPIO_NUM_17
#define SD_MISO_PIN     GPIO_NUM_26
#define SD_CS_PIN       GPIO_NUM_15

/* LED Indicators */
#define GPIO_RECORDING_LED  GPIO_NUM_39
#define GPIO_NORMALOP_LED GPIO_NUM_38 

/* ==================== 3.0 Definitions ==================== */

/* ADXL362 Register Addresses */
#define ADXL362_REG_WRITE       0x0A
#define ADXL362_REG_READ        0x0B
#define ADXL362_REG_THRESH_ACT_L 0x20
#define ADXL362_REG_THRESH_ACT_H 0x21
#define ADXL362_REG_TIME_ACT     0x22
#define ADXL362_REG_THRESH_INACT_L 0x23
#define ADXL362_REG_THRESH_INACT_H 0x24
#define ADXL362_REG_TIME_INACT_L 0x25
#define ADXL362_REG_TIME_INACT_H 0x26
#define ADXL362_REG_ACT_INACT_CTL 0x27
#define ADXL362_REG_INTMAP1     0x2A
#define ADXL362_REG_POWER_CTL   0x2D
#define ADXL362_REG_SOFT_RESET  0x1F

/* System Wide Delays */
#define WAKEUP_HOLD_TIME_US 500000 
#define NORMAL_MODE_DURATION_MS 30000

/* File System Definitions */
#define MOUNT_POINT     "/sdcard"
#define INDEX_FILE_PATH MOUNT_POINT"/idx.dat"

/* File writing fragmentation: Read 1024 samples (32-bit) -> Convert to 1024 samples (16-bit) -> Write to SD */
#define SAMPLES_PER_READ    1024
#define RECORD_TIME_SEC     30   
#define STARTUP_DELAY_SEC   5    

/* WAV HEADER STRUCT */
typedef struct {
    char riff[4];
    uint32_t overall_size;
    char wave[4];
    char fmt_chunk_marker[4];
    uint32_t length_of_fmt;
    uint16_t format_type;
    uint16_t channels;
    uint32_t sample_rate;
    uint32_t byterate;
    uint16_t block_align;
    uint16_t bits_per_sample;
    char data_chunk_header[4];
    uint32_t data_size;
} wav_header_t;

/* ========== 3.5 Public & Static Variables ========== */

static const char *TAG = "ADXL362";

spi_device_handle_t spi_handle;

i2s_chan_handle_t g_rx_handle = NULL;
sdmmc_card_t *card;

/* ==================== 4.0 Functions ==================== */

/* General Function to blink LED x times for y frequency. */
void blink_led(int times, int freq) {
    for(int i=0; i<times; i++) {
        gpio_set_level(GPIO_RECORDING_LED, 1);
        vTaskDelay(pdMS_TO_TICKS(freq));
        gpio_set_level(GPIO_RECORDING_LED, 0);
        vTaskDelay(pdMS_TO_TICKS(freq));
    }
}

/* Reads or initializes the index file to determine the next filename. */
uint32_t get_and_update_index() {
    uint32_t file_index = 1; 

    /* 1. Attempt to read existing index */
    FILE *f = fopen(INDEX_FILE_PATH, "rb");
    if (f != NULL) {
        if (fread(&file_index, sizeof(uint32_t), 1, f) == 1) { ESP_LOGI(TAG, "Found index file. Next ID: %lu", file_index); } 
        else { ESP_LOGW(TAG, "Index file empty/corrupt. Resetting to 1."); }
        fclose(f);
    } 
    else { ESP_LOGI(TAG, "No index file found. Starting new sequence at 1."); }

    /* 2. Check existing files to avoid overwrites */
    struct stat st;
    char test_name[64];
    while (1) {
        snprintf(test_name, sizeof(test_name), "%s/log%lu.wav", MOUNT_POINT, file_index);
        if (stat(test_name, &st) == 0) { file_index++; } 
        else { break; }
    }

    /* 3. Write new index */
    uint32_t next_index = file_index + 1;
    f = fopen(INDEX_FILE_PATH, "wb");
    
    if (f != NULL) {
        fwrite(&next_index, sizeof(uint32_t), 1, f);
        fclose(f);
    } 
    /* Error = 30: Read-only file system. The card is locked or corrupted.
     * Error = 5: I/O error. It's a wiring/power stability issue. */
    else { ESP_LOGE(TAG, "Failed to update index file! Error: %d (%s)", errno, strerror(errno)); }
    return file_index;
}

/* Initialize microphone component */
void init_microphone() {    
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_PORT, I2S_ROLE_MASTER);
    chan_cfg.dma_desc_num = 8;    
    chan_cfg.dma_frame_num = 512; 

    ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, NULL, &g_rx_handle));

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S_BCK_PIN,
            .ws = I2S_WS_PIN,
            .dout = I2S_GPIO_UNUSED,
            .din = I2S_DATA_PIN,
            .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
        },
    };
    std_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

    ESP_ERROR_CHECK(i2s_channel_init_std_mode(g_rx_handle, &std_cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(g_rx_handle));
    
    gpio_set_pull_mode(I2S_DATA_PIN, GPIO_PULLDOWN_ONLY);
}

/* Initialize sd component */
bool init_sd_card() {
    ESP_LOGI(TAG, "Initializing SD Card...");
    
    /* 1. Force Internal Pull-ups */
    gpio_set_pull_mode(SD_MISO_PIN, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(SD_MOSI_PIN, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(SD_CLK_PIN, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(SD_CS_PIN, GPIO_PULLUP_ONLY);

    esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = true,
        .max_files = 2, 
        .allocation_unit_size = 16 * 1024 
    };

    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI3_HOST; 
    
    /* THIS IS TEMPORARY!!! CHANGE THIS BACK TO 20000  */
    host.max_freq_khz = 4000; 

    spi_bus_config_t bus_cfg = {
        .mosi_io_num = SD_MOSI_PIN,
        .miso_io_num = SD_MISO_PIN,
        .sclk_io_num = SD_CLK_PIN,
        .quadwp_io_num = -1, .quadhd_io_num = -1,
        .max_transfer_sz = 4096 + 8, 
    };
    
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);

    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot_config.gpio_cs = SD_CS_PIN;
    slot_config.host_id = host.slot;

    esp_err_t ret = esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card);
    
    /* 2. Return true/false instead of just printing error */
    if (ret != ESP_OK) { ESP_LOGE(TAG, "SD Mount Failed: %s", esp_err_to_name(ret)); return false; }
    return true; 
}

/* Method to write the initial wav header to file. */
void write_wav_header(FILE *f, uint32_t data_size) {
    wav_header_t header;
    memcpy(header.riff, "RIFF", 4);
    header.overall_size = data_size + 36;
    memcpy(header.wave, "WAVE", 4);
    memcpy(header.fmt_chunk_marker, "fmt ", 4);
    header.length_of_fmt = 16;
    header.format_type = 1; 
    header.channels = 1;  
    header.sample_rate = SAMPLE_RATE;
    header.bits_per_sample = 16;
    header.byterate = SAMPLE_RATE * 1 * 16 / 8;
    header.block_align = 1 * 16 / 8;
    memcpy(header.data_chunk_header, "data", 4);
    header.data_size = data_size;

    fseek(f, 0, SEEK_SET);
    fwrite(&header, sizeof(wav_header_t), 1, f);
}

/* Method to open a new file and record from mic */
void record_wav_file(const char *filename, int duration_sec) {
    FILE *f = fopen(filename, "wb");
    if (f == NULL) { ESP_LOGE(TAG, "Failed to open file: %s", filename); return; }

    size_t bytes_to_read = SAMPLES_PER_READ * sizeof(int32_t);
    size_t i2s_bytes_read = 0;
    
    /* These temporary buffers are essential for wav fragmentation. */
    int32_t *i2s_buffer = (int32_t *)calloc(SAMPLES_PER_READ, sizeof(int32_t));
    int16_t *wav_buffer = (int16_t *)calloc(SAMPLES_PER_READ, sizeof(int16_t));

    if (!i2s_buffer || !wav_buffer) {
        ESP_LOGE(TAG, "Failed to allocate memory");
        fclose(f);
        return;
    }

    fseek(f, sizeof(wav_header_t), SEEK_SET); 

    /* Begin recording, indicated by recording LED */
    gpio_set_level(GPIO_RECORDING_LED, 1); 

    int64_t end_time = esp_timer_get_time() + ((int64_t)duration_sec * 1000000);
    uint32_t total_bytes_written = 0;

    while (esp_timer_get_time() < end_time) {
        if (i2s_channel_read(g_rx_handle, i2s_buffer, bytes_to_read, &i2s_bytes_read, portMAX_DELAY) == ESP_OK) {
            int samples = i2s_bytes_read / 4;
            for (int i = 0; i < samples; i++) { wav_buffer[i] = (int16_t)(i2s_buffer[i] >> 14); }

            fwrite(wav_buffer, sizeof(int16_t), samples, f);
            total_bytes_written += samples * sizeof(int16_t);
        }
    }

    gpio_set_level(GPIO_RECORDING_LED, 0); 
    ESP_LOGI(TAG, "Recording Complete.");

    /* Make file actually usable by writing the wav header to the raw data */
    write_wav_header(f, total_bytes_written);
    fclose(f);
    
    /* Flush buffers */
    free(i2s_buffer);
    free(wav_buffer);
}

/* Helper function to write byte to ADXL362 reg */
static void adxl_write_reg(uint8_t reg, uint8_t value) {
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = 8 * 3;                 
    t.flags = SPI_TRANS_USE_TXDATA;
    t.tx_data[0] = ADXL362_REG_WRITE;   
    t.tx_data[1] = reg;                 
    t.tx_data[2] = value;              
    
    esp_err_t ret = spi_device_polling_transmit(spi_handle, &t);
    assert(ret == ESP_OK);
}

/* Helper function to read byte from ADXL362 reg */
static uint8_t adxl_read_reg(uint8_t reg) {
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = 8 * 3;                  
    t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA;
    t.tx_data[0] = ADXL362_REG_READ;   
    t.tx_data[1] = reg;                
    t.tx_data[2] = 0;                  
    
    esp_err_t ret = spi_device_polling_transmit(spi_handle, &t);
    assert(ret == ESP_OK);
    
    return t.rx_data[2];               
}

/* Configure the LED GPIO pin as an output. Allows for modularity in case you need to switch the pin map for any reason */
static void led_normalop_init(void) {
    gpio_config_t io_conf;
    io_conf.intr_type = GPIO_INTR_DISABLE;
    io_conf.mode = GPIO_MODE_OUTPUT;
    io_conf.pin_bit_mask = (1ULL << GPIO_NORMALOP_LED);
    io_conf.pull_down_en = 0;
    io_conf.pull_up_en = 0;
    gpio_config(&io_conf);
    gpio_set_level(GPIO_NORMALOP_LED, 0); 
}

/* Configure the LED GPIO pin as an output. Allows for modularity in case you need to switch the pin map for any reason */
static void led_recording_init() {
    gpio_reset_pin(GPIO_RECORDING_LED);
    gpio_set_direction(GPIO_RECORDING_LED, GPIO_MODE_OUTPUT);
    gpio_set_level(GPIO_RECORDING_LED, 0);
}

/* Configure the INT1 pin as a standard input (for polling after wakeup). Allows for modularity in case you need to switch the pin map for any reason */
static void wakeup_pin_as_input(void) {
    gpio_config_t io_conf;
    io_conf.intr_type = GPIO_INTR_DISABLE;
    io_conf.mode = GPIO_MODE_INPUT;
    io_conf.pin_bit_mask = (1ULL << PIN_NUM_INT1);
    io_conf.pull_down_en = 0; 
    io_conf.pull_up_en = 0;       
    gpio_config(&io_conf);
}

/* Configure SPI master for the ADXL362 */
static void spi_adxl_init(void) {
    
    /* Initial bus configuration: pins and parameters. These values are pretty stable and thus shouldn't be changed */
    spi_bus_config_t buscfg = {.miso_io_num = PIN_NUM_MISO, .mosi_io_num = PIN_NUM_MOSI, .sclk_io_num = PIN_NUM_CLK, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = 32};
    spi_device_interface_config_t devcfg = {.clock_speed_hz = 1 * 1000 * 1000, .mode = 0, .spics_io_num = PIN_NUM_CS, .queue_size = 1};

    /* Initialize the SPI bus (using SPI2_HOST). */
    esp_err_t ret = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_DISABLED);
    ESP_ERROR_CHECK(ret);
    ret = spi_bus_add_device(SPI2_HOST, &devcfg, &spi_handle);
    ESP_ERROR_CHECK(ret);
}

/* Configure the INT1 GPIO pin as an input */
static void int_pin_init(void) {
    gpio_config_t io_conf;
    io_conf.intr_type = GPIO_INTR_ANYEDGE;
    io_conf.mode = GPIO_MODE_INPUT;
    io_conf.pin_bit_mask = (1ULL << PIN_NUM_INT1);
    io_conf.pull_down_en = 0;
    io_conf.pull_up_en = 0;               
    gpio_config(&io_conf);
}

/* Set up activity detection */
void adxl_setup_activity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_ACT_L, thresh & 0xFF);           
    adxl_write_reg(ADXL362_REG_THRESH_ACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_ACT, time);                      
}

/* Set up inactivity detection */
void adxl_setup_inactivity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_INACT_L, thresh & 0xFF);        
    adxl_write_reg(ADXL362_REG_THRESH_INACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_INACT_L, time & 0xFF);            
    adxl_write_reg(ADXL362_REG_TIME_INACT_H, (time >> 8) & 0xFF);
}
 
/* Start ADXL362 measurement */
void adxl_begin_measure(void) {
    uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
    power_ctl |= 0x02;                                                 
    adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
}

/* ==================== 5.0 Main Method ==================== */
void app_main(void) {
    /* ------ COLD BOOT: Power-on self-test ------ */
        ESP_LOGI(TAG, "Mode: BOOTING...");

        /* Init hardware */
        led_normalop_init();
        led_recording_init();
        spi_adxl_init();
        int_pin_init();
        
        /* 50ms delay between ADXL init as a safety buffer. This should be reduced in the future, or ideally 0ms. */
        vTaskDelay(pdMS_TO_TICKS(50)); 
        adxl_write_reg(ADXL362_REG_SOFT_RESET, 0x52); 
        vTaskDelay(pdMS_TO_TICKS(50)); 
        
        /* Setup Activity and Inactivity thresholds */
        /* ACTIVITY: (threshold, time)    
        Threshold: Acceleration (in mg) required to trigger
        Time: Amount of time (in samples) acceleration must stay above thresh to trigger (e.g. 10 samples @ 100Hz = 0.1s) */
        adxl_setup_activity(1800, 10);

        /* INACTIVITY: (threshold, time)    
        Threshold: Acceleration (in mg) to stay under without triggering anything for deepsleep
        Time: Amount of time (in samples) acceleration must stay below thresh to remain in state */
        adxl_setup_inactivity(1500, 10);
        
        /* Write final registers for pin and power config*/
        adxl_write_reg(ADXL362_REG_INTMAP1, 0x40); 
        adxl_write_reg(ADXL362_REG_ACT_INACT_CTL, 0x35);
        uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
        power_ctl |= 0x04; 
        adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
        adxl_begin_measure();
        vTaskDelay(pdMS_TO_TICKS(50));

        init_microphone();

        /* Configure ESP32 deep sleep to wake up on INT1 high */
        ESP_LOGI(TAG, "Mode: ACTIVE (POST Success!)");

    /* Change back to app_main after deepsleep is implemented again. */
    while (1) {
        bool pin_wakeup = gpio_get_level(PIN_NUM_INT1);
        
        if (pin_wakeup) {
        /* We are awake *because* the pin went high; Now we must check if it *stays* high for 0.5s. */
        /* Initalize only core functions */
        wakeup_pin_as_input();

        int64_t start_time = esp_timer_get_time();
        bool time_elapsed = false;

        /* Check hold time */
        while (gpio_get_level(PIN_NUM_INT1) == 1) {
            if (esp_timer_get_time() - start_time > WAKEUP_HOLD_TIME_US) {
                time_elapsed = true;
                break; 
            }
            vTaskDelay(pdMS_TO_TICKS(10)); 
        }

        /* ------ RECORDING MODE (TIMED) ------ */
        if (time_elapsed) {
                /* Pin was held long enough. Stay awake for a fixed time. */
                ESP_LOGI(TAG, "Mode: ACTIVE. (LED ON for %d seconds)", NORMAL_MODE_DURATION_MS / 1000);
                
                /* Turn LED ON to indicate normal mode (testing, remove later, probably replace w/ onboard LED) */
                gpio_set_level(GPIO_NORMALOP_LED, 1);

                /* Try to initialize SD card up to 3 times */
                bool sd_ok = false;
                for (int attempt = 1; attempt <= 3; attempt++) {
                    if (init_sd_card()) {
                        sd_ok = true;
                        break; 
                    }
                    ESP_LOGW(TAG, "[!] WARNING: SD Mount Attempt %d/3 Failed. Retrying...", attempt);
                    vTaskDelay(pdMS_TO_TICKS(500)); 
                }

                /* Guard Clause */
                if (!sd_ok) {
                    ESP_LOGE(TAG, "[!] ERROR: Failed to mount SD after 3 attempts. Returning to idle; is the SD unplugged?");
                    for(int i=0; i<5; i++) {
                        gpio_set_level(GPIO_RECORDING_LED, 1); vTaskDelay(pdMS_TO_TICKS(100));
                        gpio_set_level(GPIO_RECORDING_LED, 0); vTaskDelay(pdMS_TO_TICKS(100));
                    }
                    
                    gpio_set_level(GPIO_NORMALOP_LED, 0);
                    continue; 
                }

                /* ------ Startup Delay Buffer ------ */
                for(int i = STARTUP_DELAY_SEC; i>0; i--) {
                    blink_led(1, 200);
                    vTaskDelay(pdMS_TO_TICKS(600));
                }

                /* Determine Filename */
                uint32_t session_id = get_and_update_index();
                char filename[64];
                snprintf(filename, sizeof(filename), "%s/log%lu.wav", MOUNT_POINT, session_id);
                
                /* Start Recording */
                record_wav_file(filename, RECORD_TIME_SEC);
                
                for(int i = 0; i < 2; i++) {
                    gpio_set_level(GPIO_RECORDING_LED, 1);
                    vTaskDelay(pdMS_TO_TICKS(50));
                    gpio_set_level(GPIO_RECORDING_LED, 0);
                    vTaskDelay(pdMS_TO_TICKS(2000));
                }

                /* ------ TIME'S UP, GO BACK TO SLEEP ------ */
                ESP_LOGI(TAG, "Mode: INACTIVE.");

                /* Unmount the filesystem */
                    esp_vfs_fat_sdcard_unmount(MOUNT_POINT, card);
                    
                    /* Free the SPI Bus (CRITICAL for the loop to work next time) */
                    spi_bus_free(SPI3_HOST);

                gpio_set_level(GPIO_NORMALOP_LED, 0);
                vTaskDelay(pdMS_TO_TICKS(100)); /* Allow unmount to occur and log to print, so we can unplug the sd card while still on */
            }
        
        else { /* ------ FAILED WAKEUP, GO BACK TO SLEEP (Pin went low before the 0.5s timer expired.) ------ */ }
    } 
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
