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
 * GPS: GNSS UC6580 
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

#define GPIO_PIN_LED GPIO_NUM_1 
#define WAKEUP_HOLD_TIME_US 500000 
#define NORMAL_MODE_DURATION_MS 30000

/* ==================== Pin mappings ====================  */

/* ADXL362 */
#define PIN_NUM_MISO GPIO_NUM_6
#define PIN_NUM_MOSI GPIO_NUM_5
#define PIN_NUM_CLK  GPIO_NUM_4
#define PIN_NUM_CS   GPIO_NUM_7
#define PIN_NUM_INT1 GPIO_NUM_15

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

/* ==================== Public & Static Variables ==================== */

static const char *TAG = "ADXL362";
static QueueHandle_t gpio_evt_queue = NULL;

/* Handle for the SPI device */
spi_device_handle_t spi_handle;


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
                
                /* Turn LED ON to indicate normal mode (testing, remove later, probably replace w/ onboard LED) */
                gpio_set_level(GPIO_PIN_LED, 1);

                // Wait for the fixed duration
                // You can still add other "normal mode" logic here if needed.
                vTaskDelay(pdMS_TO_TICKS(NORMAL_MODE_DURATION_MS));

                /* --- TIME'S UP, GO BACK TO SLEEP --- */
                ESP_LOGI(TAG, "Mode: Normal duration expired. Returning to deep sleep.");

                /* Turn LED OFF */
                gpio_set_level(GPIO_PIN_LED, 0);

                /* Re-config the pin for deep sleep wakeup (This is the same code as the "FAILED WAKEUP" block) */
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
