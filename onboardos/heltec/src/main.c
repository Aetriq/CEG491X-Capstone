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

/* ===== DO NOT FLASH TO OTHER BOARDS OR VIA ARDUINO IDE; YOU MAY WRECK YOUR HARDWARE! ===== */

/* Accelerometer: ADXL362 by Analog Devices
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
/* References: 
    [1] https://github.com/annem/ADXL362/blob/master/examples/ADXL362_MotionActivatedSleep/ADXL362_MotionActivatedSleep.ino 
    [2] https://github.com/annem/ADXL362/blob/master/ADXL362.cpp 
    
    
*/

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "esp_sleep.h" 
#include "esp_timer.h" 

#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"

#include <sys/unistd.h>
#include <sys/stat.h>
/* Changed to I2S standard API header to resolve deprecation warning */
#include "driver/i2s_std.h" 
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "driver/sdspi_host.h"

#define GPIO_PIN_LED GPIO_NUM_38 
#define WAKEUP_HOLD_TIME_US 500000 
#define NORMAL_MODE_DURATION_MS 30000

/* ==================== Pin mappings ====================  */
/* @Tdoo: Optimize the pins used. Multiple SPI devices can be connected to one, but CS must be different */

/* ADXL362 */
#define PIN_NUM_MISO GPIO_NUM_6
#define PIN_NUM_MOSI GPIO_NUM_5
#define PIN_NUM_CLK  GPIO_NUM_4
#define PIN_NUM_CS   GPIO_NUM_7
#define PIN_NUM_INT1 GPIO_NUM_15

/* AUDIO/SD */
/* I2S Pins (SPH0645) */
#define I2S_BCK_PIN     GPIO_NUM_46
#define I2S_WS_PIN      GPIO_NUM_44   
#define I2S_DATA_PIN    GPIO_NUM_45   
#define I2S_PORT        I2S_NUM_0
#define SAMPLE_RATE     16000

/* SD Card Pins */
#define SD_CLK_PIN      GPIO_NUM_12
#define SD_MOSI_PIN     GPIO_NUM_14
#define SD_MISO_PIN     GPIO_NUM_13
#define SD_CS_PIN       GPIO_NUM_43

/* ==================== Component Definitions ==================== */

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

/* WAV Header Structure*/
typedef struct __attribute__((packed)) {
    char riff[4];             
    uint32_t chunkSize;       
    char wave[4];             
    char fmt[4];              
    uint32_t subchunk1Size;   
    uint16_t audioFormat;     
    uint16_t numChannels;    
    uint32_t sampleRate;      
    uint32_t byteRate;        
    uint16_t blockAlign;      
    uint16_t bitsPerSample;   
    char data[4];            
    uint32_t subchunk2Size; 
} wav_header_t;

/* ==================== Public & Static Variables ==================== */

static const char *TAG = "ADXL362";
static QueueHandle_t gpio_evt_queue = NULL;

/* Handle for the SPI device */
spi_device_handle_t spi_handle;

/* I2S Channel Handle */
i2s_chan_handle_t g_rx_handle = NULL;

/* ==================== Functions ==================== */

/* Write byte to ADXL362 reg */
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

/* Read byte from ADXL362 reg */
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

/* Configure the LED GPIO pin as an output */
static void led_init(void) {
    gpio_config_t io_conf;
    io_conf.intr_type = GPIO_INTR_DISABLE;
    io_conf.mode = GPIO_MODE_OUTPUT;
    io_conf.pin_bit_mask = (1ULL << GPIO_PIN_LED);
    io_conf.pull_down_en = 0;
    io_conf.pull_up_en = 0;
    gpio_config(&io_conf);
    gpio_set_level(GPIO_PIN_LED, 0); // Default off
}

/* Configure the INT1 pin as a standard input (for polling after wakeup) */
static void wakeup_pin_as_input(void) {
    gpio_config_t io_conf;
    io_conf.intr_type = GPIO_INTR_DISABLE;
    io_conf.mode = GPIO_MODE_INPUT;
    io_conf.pin_bit_mask = (1ULL << PIN_NUM_INT1);
    io_conf.pull_down_en = 0; // Match original config
    io_conf.pull_up_en = 0;   // Match original config      
    gpio_config(&io_conf);
}

/* === NEW FUNCTION: Read 2 bytes (16-bit) from ADXL362 === */
/* Reads LSB from 'reg_l' and MSB from 'reg_l + 1' */
static int16_t adxl_read_16bit_reg(uint8_t reg_l) {
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    
    t.length = 8 * 4; // CMD (1) + ADDR (1) + LSB (1) + MSB (1)
    t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA;
    t.tx_data[0] = ADXL362_REG_READ;
    t.tx_data[1] = reg_l; // Address of LSB
    t.tx_data[2] = 0;     // Dummy clock for LSB
    t.tx_data[3] = 0;     // Dummy clock for MSB
    
    esp_err_t ret = spi_device_polling_transmit(spi_handle, &t);
    assert(ret == ESP_OK);
    
    // Data comes back in rx_data[2] (LSB) and rx_data[3] (MSB)
    uint8_t lsb = t.rx_data[2];
    uint8_t msb = t.rx_data[3];
    
    // Combine them into a 16-bit signed integer.
    // The sensor sign-extends the 12-bit value to 16 bits.
    int16_t value = (int16_t)((msb << 8) | lsb);
    return value; 
}

/* Configure SPI master for the ADXL362 */
static void spi_init(void) {
    /* Initial bus configuration: pins */
    spi_bus_config_t buscfg = {.miso_io_num = PIN_NUM_MISO, .mosi_io_num = PIN_NUM_MOSI, .sclk_io_num = PIN_NUM_CLK, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = 32};

    /* Initial bus configuration: parameters */
    spi_device_interface_config_t devcfg = {.clock_speed_hz = 1 * 1000 * 1000, .mode = 0, .spics_io_num = PIN_NUM_CS, .queue_size = 1};

    /* Initialize the SPI bus (using SPI2_HOST) */
    /* Check examples for ESP32 S3 if this changes */
    esp_err_t ret = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO);
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
/* Modified revision of replaces xl.setupDCActivityInterrupt from example */
void adxl_setup_activity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_ACT_L, thresh & 0xFF);           
    adxl_write_reg(ADXL362_REG_THRESH_ACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_ACT, time);                      
}

/* Set up inactivity detection */
/* Modified revision of replaces xl.setupDCInActivityInterrupt from example */
void adxl_setup_inactivity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_INACT_L, thresh & 0xFF);        
    adxl_write_reg(ADXL362_REG_THRESH_INACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_INACT_L, time & 0xFF);            
    adxl_write_reg(ADXL362_REG_TIME_INACT_H, (time >> 8) & 0xFF);
}
 
/* Start ADXL362 measurement */
/* Modified revision of replaces replaces xl.beginMeasure from example */

void adxl_begin_measure(void) {
    uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
    power_ctl |= 0x02;                                                 
    adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
}

/* ISR handler for the GPIO pin
   This function is called by the hardware interrupt. It must be fast!
   It just sends the pin number to our queue to be handled by the main task.
 */
static void IRAM_ATTR gpio_isr_handler(void* arg)
{
    uint32_t gpio_num = (uint32_t) arg;
    xQueueSendFromISR(gpio_evt_queue, &gpio_num, NULL);
}

/* Write the nessecary values for the .wav extension header */
void write_wav_header(FILE *f, uint32_t total_data_bytes) {
    wav_header_t header;
    memcpy(header.riff, "RIFF", 4);
    memcpy(header.wave, "WAVE", 4);
    memcpy(header.fmt, "fmt ", 4);
    memcpy(header.data, "data", 4);

    header.subchunk1Size = 16;
    header.audioFormat = 1; 
    header.numChannels = 1;
    header.sampleRate = SAMPLE_RATE;
    header.bitsPerSample = 16;
    header.byteRate = SAMPLE_RATE * 1 * 16 / 8;
    header.blockAlign = 1 * 16 / 8;
    header.subchunk2Size = total_data_bytes;
    header.chunkSize = 36 + total_data_bytes;

    fseek(f, 0, SEEK_SET);
    fwrite(&header, sizeof(wav_header_t), 1, f);
}

/* Intialize the microphone and sd module connections and drivers */
void init_mic_and_sd() {
    /* 1. Initialize I2S (Standard Mode for MEMS Mic) */
    
    /* Corrected: Use I2S_STD_MSB_SLOT_DEFAULT_CONFIG and I2S_STD_SLOT_LEFT */
    i2s_std_config_t i2s_config = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
        .slot_cfg = { .data_bit_width = I2S_STD_SLOT_LEFT, .slot_bit_width = I2S_SLOT_BIT_WIDTH_AUTO, .slot_mode = I2S_DIR_RX, .slot_mask = I2S_STD_SLOT_BOTH, .ws_width = I2S_STD_SLOT_LEFT, .ws_pol = 0, .bit_shift = 0, .left_align = 1, .big_endian = 0, .bit_order_lsb = 0 },
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,        /* Not needed for SPH0645 */
            .bclk = I2S_BCK_PIN,
            .ws = I2S_WS_PIN,
            .dout = I2S_GPIO_UNUSED,        /* Only RX (data in) is used */
            .din = I2S_DATA_PIN,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };
    
    /* Channel creation and initialization */
    i2s_new_channel(&(i2s_chan_config_t){.id = I2S_PORT, .role = I2S_ROLE_MASTER}, NULL, &g_rx_handle);
    i2s_channel_init_std_mode(g_rx_handle, &i2s_config);
    i2s_channel_enable(g_rx_handle);

    /* 2. Initialize SD Card */
    esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = true,
        .max_files = 2,
        .allocation_unit_size = 16 * 1024
    };
    sdmmc_card_t *card;
    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI3_HOST; 

    spi_bus_config_t bus_cfg = {
        .mosi_io_num = SD_MOSI_PIN,
        .miso_io_num = SD_MISO_PIN,
        .sclk_io_num = SD_CLK_PIN,
        .quadwp_io_num = -1, .quadhd_io_num = -1,
        .max_transfer_sz = 4000,
    };
    
    /* Initialize SPI3 bus with our specific pins */
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);

    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot_config.gpio_cs = SD_CS_PIN;
    slot_config.host_id = host.slot;

    if (esp_vfs_fat_sdspi_mount("/sdcard", &host, &slot_config, &mount_config, &card) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to mount SD card");
    } else {
        ESP_LOGI(TAG, "SD Card mounted successfully");
    }
}

/* Record the audio file as a .wav and generate unique filename based on timestamp */
void record_wav_file(int duration_ms) {
    /* Generate unique filename based on timestamp */
    char filename[64]; /* Increased buffer size to prevent overflow error */
    sprintf(filename, "/sdcard/rec_%lld.wav", esp_timer_get_time() / 1000);
    
    FILE *f = fopen(filename, "wb");
    if (f == NULL) {
        ESP_LOGE(TAG, "Failed to open file: %s", filename);
        return;
    }

    /* Reserve header space */
    fseek(f, sizeof(wav_header_t), SEEK_SET);

    int32_t *i2s_buffer = (int32_t *)malloc(1024 * sizeof(int32_t));
    int16_t *file_buffer = (int16_t *)malloc(1024 * sizeof(int16_t));
    size_t bytes_read;
    uint32_t total_bytes_written = 0;
    
    int64_t end_time = esp_timer_get_time() + ((int64_t)duration_ms * 1000);

    ESP_LOGI(TAG, "Recording...");
    
    /* Recording Loop */
    while (esp_timer_get_time() < end_time) {
        /* Read 32-bit samples from I2S using the new channel API */
        i2s_channel_read(g_rx_handle, i2s_buffer, 1024 * sizeof(int32_t), &bytes_read, portMAX_DELAY);
        int samples = bytes_read / 4;

        /* Convert to 16-bit PCM (Shift Right 16) */
        for (int i = 0; i < samples; i++) {
            /* SPH0645 is 24-bit left-justified in 32-bit word, so shifting down 8 bits (32-24) gets the 24-bit value, then shifting 8 more gets the 16-bit value. Total shift is 16. */
            file_buffer[i] = (int16_t)(i2s_buffer[i] >> 16);
        }
        
        fwrite(file_buffer, sizeof(int16_t), samples, f);
        total_bytes_written += samples * sizeof(int16_t);
    }

    /* Write header and cleanup */
    write_wav_header(f, total_bytes_written);
    fclose(f);
    free(i2s_buffer);
    free(file_buffer);
    ESP_LOGI(TAG, "Recording saved: %s", filename);
}


/* ==================== Main Method ==================== */

void app_main(void) {

    /* Check what caused the wakeup */
    esp_sleep_wakeup_cause_t wakeup_cause = esp_sleep_get_wakeup_cause();

    if (wakeup_cause == ESP_SLEEP_WAKEUP_EXT0) {
        /* WOKE UP FROM DEEP SLEEP */
        /* We are awake *because* the pin went high; Now we must check if it *stays* high for 0.5s. */
        
        /* Initalize only core functions */
        led_init(); 
        wakeup_pin_as_input();

        int64_t start_time = esp_timer_get_time();
        bool time_elapsed = false;

        /* Checking the hold time */
        while (gpio_get_level(PIN_NUM_INT1) == 1) {
            if (esp_timer_get_time() - start_time > WAKEUP_HOLD_TIME_US) {
                time_elapsed = true;
                break; 
            }
            vTaskDelay(pdMS_TO_TICKS(10)); 
        }

        /* ==================== RECORDING MODE (TIMED) ==================== */
        if (time_elapsed) {
                /* Pin was held long enough. Stay awake for a fixed time. */
                ESP_LOGI(TAG, "Mode: Normal. LED ON for %d seconds.", NORMAL_MODE_DURATION_MS / 1000);
                
                /* Turn LED ON to indicate normal mode (TESTING) */
                gpio_set_level(GPIO_PIN_LED, 1);
                
                /* --- ADXL RE-INIT AND CLEAR INTERRUPT --- */
                /* 1. SPI bus needs to be re-initialized after deep sleep */
                spi_init(); 
                
                /* 2. Reading this register clears the pending interrupt flag on the ADXL362. */
                adxl_read_reg(ADXL362_REG_INTMAP1); 
                ESP_LOGI(TAG, "ADXL SPI re-initialized and interrupt cleared.");

                /* ==================== NORMAL MODE BEGINS FOR DURATION ==================== */
                /* --- RECORDING START --- */
                /* Initialize Audio and SD (Safe pins: 46, 45, 26, 37, 48, 47, 17) */
                init_mic_and_sd();

                /* Record for the duration (This blocks, replacing the vTaskDelay) */
                record_wav_file(NORMAL_MODE_DURATION_MS); // Execution pauses here for 30 seconds

                /* Unmount to flush data safely */
                esp_vfs_fat_sdcard_unmount("/sdcard", NULL);
                
                /* 4. Uninstall I2S driver to save power/state */
                i2s_channel_disable(g_rx_handle);
                i2s_del_channel(g_rx_handle);
                g_rx_handle = NULL;
                /* --- RECORDING END --- */

                // NOTE: THE REDUNDANT vTaskDelay HAS BEEN REMOVED HERE.
                // The NORMAL_MODE_DURATION is handled by record_wav_file().

                /* --- TIME'S UP, GO BACK TO SLEEP --- */
                ESP_LOGI(TAG, "Mode: Normal duration expired. Returning to deep sleep.");

                /* Turn LED OFF */
                gpio_set_level(GPIO_PIN_LED, 0);

                /* Re-config the pin for deep sleep wakeup */
                gpio_reset_pin(PIN_NUM_INT1); 
                esp_sleep_enable_ext0_wakeup(PIN_NUM_INT1, 1); /* 1 = Wake on HIGH */
                
                vTaskDelay(pdMS_TO_TICKS(100)); /* Allow log to print, remove this later */
                esp_deep_sleep_start();
            }
        
        else {
            /* --- FAILED WAKEUP, GO BACK TO SLEEP (Pin went low before the 0.5s timer expired.) --- */
            ESP_LOGI(TAG, "Mode: Deepsleep (Wakeup detected but not long enough)");
           
            /* Re-configure the pin for deep sleep wakeup. We must reset the pin first to remove GPIO driver */
            gpio_reset_pin(PIN_NUM_INT1); 
            esp_sleep_enable_ext0_wakeup(PIN_NUM_INT1, 1); /* 1 = Wake on HIGH */
            
            esp_deep_sleep_start();
        }

    } 
    
    else {
        /* --- FIRST BOOT / COLD BOOT --- */
        ESP_LOGI(TAG, "EchoLog Real-Time Operating System (RTOS)");
        ESP_LOGI(TAG, "Mode: Normal (Configuring First Boot)");

        /* Init hardware */
        led_init();

        /* Init stuff */
        spi_init();
        int_pin_init();

        /* Begin ADXL362 Setup */
        adxl_write_reg(ADXL362_REG_SOFT_RESET, 0x52); 
        vTaskDelay(pdMS_TO_TICKS(1000));
        
        /* Setup Activity and Inactivity thresholds */

        /* ACTIVITY: (threshold, time)    
        Threshold: Acceleration (in mg) required to trigger
        Time: Amount of time (in samples) acceleration must stay above thresh to trigger (e.g. 10 samples @ 100Hz = 0.1s)
        */
        adxl_setup_activity(1800, 10);

        /* INACTIVITY: (threshold, time)    
        Threshold: Acceleration (in mg) to stay under without triggering anything for deepsleep
        Time: Amount of time (in samples) acceleration must stay below thresh to remain in state
        */
        adxl_setup_inactivity(1500, 10);
        ESP_LOGI(TAG, "Activity/Inactivity thresholds set.");
        adxl_write_reg(ADXL362_REG_INTMAP1, 0x40); 
        adxl_write_reg(ADXL362_REG_ACT_INACT_CTL, 0x35);
        uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
        power_ctl |= 0x04; 
        adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
        adxl_begin_measure();
        vTaskDelay(pdMS_TO_TICKS(100));
        ESP_LOGI(TAG, "ADXL362 setup complete. Starting interrupt loop.");

        /* Configure ESP32 deep sleep to wake up on INT1 high */
        ESP_LOGI(TAG, "Configuring deep sleep wakeup on GPIO %d", PIN_NUM_INT1);
        esp_sleep_enable_ext0_wakeup(PIN_NUM_INT1, 1); // 1 = Wake on HIGH

        ESP_LOGI(TAG, "Entering deep sleep. Awaiting motion...");
        vTaskDelay(pdMS_TO_TICKS(100)); // Short delay to allow log to print

        /* Go to sleep */
        esp_deep_sleep_start();
    }
}
