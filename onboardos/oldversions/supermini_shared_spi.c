#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/unistd.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <dirent.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h" // Added for your timer logic
#include "nvs_flash.h"
#include "esp_log.h"
#include "esp_bt.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_bt_defs.h"
#include "esp_bt_main.h"
#include "esp_gatt_common_api.h"
#include "driver/gpio.h"
#include "driver/sdspi_host.h"
#include "driver/spi_common.h"
#include "driver/spi_master.h"
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "led_strip.h"

/* ==================== 1.0 Pin Mappings ====================  */

/* Shared SPI Pins */
#define SPI_PIN_NUM_MOSI GPIO_NUM_6
#define SPI_PIN_NUM_CLK  GPIO_NUM_5
#define SPI_PIN_NUM_MISO GPIO_NUM_4

/* SD Card Pins */
#define SD_PIN_NUM_CS    GPIO_NUM_7

/* ADXL362 Pins */
#define ADXL_PIN_NUM_CS   GPIO_NUM_8 
#define ADXL_PIN_NUM_INT1 GPIO_NUM_9 

/* LEDs */
#define RGB_LED_PIN       GPIO_NUM_48
#define TEST_LED_PIN      GPIO_NUM_10

/* ==================== 2.0 Definitions ==================== */

#define MOUNT_POINT "/sdcard"
#define TRANSFER_BLOCK_SIZE 490

/* ADXL362 Register Addresses */
#define ADXL362_REG_WRITE          0x0A
#define ADXL362_REG_READ           0x0B
#define ADXL362_REG_THRESH_ACT_L   0x20
#define ADXL362_REG_THRESH_ACT_H   0x21
#define ADXL362_REG_TIME_ACT       0x22
#define ADXL362_REG_THRESH_INACT_L 0x23
#define ADXL362_REG_THRESH_INACT_H 0x24
#define ADXL362_REG_TIME_INACT_L   0x25
#define ADXL362_REG_TIME_INACT_H   0x26
#define ADXL362_REG_ACT_INACT_CTL  0x27
#define ADXL362_REG_INTMAP1        0x2A
#define ADXL362_REG_POWER_CTL      0x2D
#define ADXL362_REG_SOFT_RESET     0x1F

/* User Trigger Delays */
#define WAKEUP_HOLD_TIME_US 500000 
#define RECORD_TIME_SEC     30   
#define STARTUP_DELAY_SEC   5    

static const char *TAG = "SUPERMINI_BLE_SD_ADXL";

/* ==================== 3.0 Variables ==================== */

static const uint8_t service_uuid[16] = {0x4b,0x91,0x31,0xc3,0xc9,0xc5,0xcc,0x8f,0x9e,0x45,0xb5,0x1f,0x01,0xc2,0xaf,0x4f};
static const uint8_t char_cmd_uuid[16] = {0xa8,0x26,0x1b,0x36,0x07,0xea,0xf5,0xb7,0x88,0x46,0xe1,0x36,0x3e,0x48,0xb5,0xbe};
static const uint8_t char_data_uuid[16] = {0x3b,0x70,0x7c,0x68,0xb9,0x70,0x42,0x94,0x22,0x4c,0xc4,0x03,0x7c,0x28,0x9a,0x82};
static const uint8_t char_upload_uuid[16] = {0x0f,0x41,0xb3,0x04,0x10,0x00,0x20,0x81,0x03,0x49,0x83,0x58,0x12,0x1b,0x2e,0xce};
enum { IDX_SVC, IDX_CHAR_CMD, IDX_CHAR_VAL_CMD, IDX_CHAR_DATA, IDX_CHAR_VAL_DATA, IDX_CHAR_CFG_DATA, IDX_CHAR_UPLOAD, IDX_CHAR_VAL_UPLOAD, HRS_IDX_NB };

static uint16_t conn_id = 0, echo_handle_table[HRS_IDX_NB];
static esp_gatt_if_t gatts_if_handle = 0;
static bool device_connected = false, is_downloading = false, is_uploading = false, cmd_ready = false;
FILE *transfer_file = NULL;
char pending_cmd[128] = {0};

static sdmmc_card_t *card = NULL;
spi_device_handle_t adxl_spi_handle = NULL; // Renamed from your spi_handle for global clarity

typedef enum { BLE_UNPAIRED, BLE_PAIRED, BLE_DISCONNECTED_BLINK } ble_led_state_t;
volatile ble_led_state_t current_ble_state = BLE_UNPAIRED;
led_strip_handle_t led_strip;


/* ==================== 4.0 BLE / SD Functions ==================== */

esp_err_t send_notification(uint8_t *data, size_t len) {
    if(device_connected) return esp_ble_gatts_send_indicate(gatts_if_handle, conn_id, echo_handle_table[IDX_CHAR_VAL_DATA], len, data, false);
    return ESP_FAIL;
}
void send_eof() { send_notification((uint8_t*)"EOF", 3); }

void mount_sd() {
    ESP_LOGI(TAG, "Mounting SD Card...");
    esp_vfs_fat_sdmmc_mount_config_t mount_config = {.format_if_mount_failed=false, .max_files=5, .allocation_unit_size=16*1024};
    
    gpio_set_pull_mode(SPI_PIN_NUM_MISO, GPIO_PULLUP_ONLY); 
    gpio_set_pull_mode(SPI_PIN_NUM_MOSI, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(SPI_PIN_NUM_CLK, GPIO_PULLUP_ONLY); 
    gpio_set_pull_mode(SD_PIN_NUM_CS, GPIO_PULLUP_ONLY);
    
    sdmmc_host_t host = SDSPI_HOST_DEFAULT(); 
    host.slot = SPI2_HOST; 
    host.max_freq_khz = 4000;
    
    spi_bus_config_t bus_cfg = {.mosi_io_num=SPI_PIN_NUM_MOSI, .miso_io_num=SPI_PIN_NUM_MISO, .sclk_io_num=SPI_PIN_NUM_CLK, .quadwp_io_num=-1, .quadhd_io_num=-1, .max_transfer_sz=4000};
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);
    
    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT(); 
    slot_config.gpio_cs=SD_PIN_NUM_CS; 
    slot_config.host_id=host.slot;
    
    if(esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card)==ESP_OK) {
        ESP_LOGI(TAG, "SD Card mounted successfully.");
    } else {
        ESP_LOGE(TAG, "Failed to mount SD card.");
    }
}

void unmount_sd() {
    if (card) {
        esp_vfs_fat_sdcard_unmount(MOUNT_POINT, card);
        card = NULL;
    }
    spi_bus_free(SPI2_HOST);
    ESP_LOGI(TAG, "SD Card unmounted and SPI bus freed.");
}


/* ==================== 5.0 ADXL362 Functions ==================== */

void blink_led(int times, int freq) {
    for(int i=0; i<times; i++) {
        gpio_set_level(TEST_LED_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(freq));
        gpio_set_level(TEST_LED_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(freq));
    }
}

static void adxl_write_reg(uint8_t reg, uint8_t value) {
    if(!adxl_spi_handle) return;
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = 8 * 3;                 
    t.flags = SPI_TRANS_USE_TXDATA;
    t.tx_data[0] = ADXL362_REG_WRITE;   
    t.tx_data[1] = reg;                 
    t.tx_data[2] = value;              
    
    esp_err_t ret = spi_device_polling_transmit(adxl_spi_handle, &t);
    assert(ret == ESP_OK);
}

static uint8_t adxl_read_reg(uint8_t reg) {
    if(!adxl_spi_handle) return 0;
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = 8 * 3;                  
    t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA;
    t.tx_data[0] = ADXL362_REG_READ;   
    t.tx_data[1] = reg;                
    t.tx_data[2] = 0;                  
    
    esp_err_t ret = spi_device_polling_transmit(adxl_spi_handle, &t);
    assert(ret == ESP_OK);
    
    return t.rx_data[2];               
}

void adxl_setup_activity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_ACT_L, thresh & 0xFF);           
    adxl_write_reg(ADXL362_REG_THRESH_ACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_ACT, time);                      
}

void adxl_setup_inactivity(uint16_t thresh, uint16_t time) {
    adxl_write_reg(ADXL362_REG_THRESH_INACT_L, thresh & 0xFF);        
    adxl_write_reg(ADXL362_REG_THRESH_INACT_H, (thresh >> 8) & 0x07);
    adxl_write_reg(ADXL362_REG_TIME_INACT_L, time & 0xFF);            
    adxl_write_reg(ADXL362_REG_TIME_INACT_H, (time >> 8) & 0xFF);
}

void adxl_begin_measure(void) {
    uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
    power_ctl |= 0x02;                                                 
    adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
}

void init_adxl() {
    ESP_LOGI(TAG, "Initializing ADXL362 on SPI...");

    /* Pins Init */
    gpio_config_t int_conf = {
        .intr_type = GPIO_INTR_DISABLE, 
        .mode = GPIO_MODE_INPUT,
        .pin_bit_mask = (1ULL << ADXL_PIN_NUM_INT1),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_DISABLE
    };
    gpio_config(&int_conf);

    gpio_reset_pin(TEST_LED_PIN);
    gpio_set_direction(TEST_LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(TEST_LED_PIN, 0);
    
    /* Hardware Init */
    spi_bus_config_t buscfg = {
        .miso_io_num = SPI_PIN_NUM_MISO, 
        .mosi_io_num = SPI_PIN_NUM_MOSI, 
        .sclk_io_num = SPI_PIN_NUM_CLK, 
        .quadwp_io_num = -1, 
        .quadhd_io_num = -1, 
        .max_transfer_sz = 32
    };
    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = 1 * 1000 * 1000, 
        .mode = 0, 
        .spics_io_num = ADXL_PIN_NUM_CS, 
        .queue_size = 1
    };

    esp_err_t ret = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO); // Using CH_AUTO for stability with other tasks
    ESP_ERROR_CHECK(ret);
    ret = spi_bus_add_device(SPI2_HOST, &devcfg, &adxl_spi_handle);
    ESP_ERROR_CHECK(ret);

    /* Logic matching your working code */
    vTaskDelay(pdMS_TO_TICKS(50)); 
    adxl_write_reg(ADXL362_REG_SOFT_RESET, 0x52); 
    vTaskDelay(pdMS_TO_TICKS(50)); 
    
    uint16_t accel_act_thresh = 1800;
    uint16_t accel_act_time = 10;
    uint16_t accel_inact_thresh = 1500;
    uint16_t accel_inact_time = 10;

    adxl_setup_activity(accel_act_thresh, accel_act_time);
    adxl_setup_inactivity(accel_inact_thresh, accel_inact_time);
    
    adxl_write_reg(ADXL362_REG_INTMAP1, 0x40); 
    adxl_write_reg(ADXL362_REG_ACT_INACT_CTL, 0x35); 
    
    uint8_t power_ctl = adxl_read_reg(ADXL362_REG_POWER_CTL);
    power_ctl |= 0x04; 
    adxl_write_reg(ADXL362_REG_POWER_CTL, power_ctl);
    adxl_begin_measure();
    vTaskDelay(pdMS_TO_TICKS(50));

    ESP_LOGI(TAG, "ADXL362 Active and Mapped.");
}

void deinit_adxl() {
    // This is required to properly free the bus for the SD card
    if (adxl_spi_handle) {
        spi_bus_remove_device(adxl_spi_handle);
        adxl_spi_handle = NULL;
    }
    spi_bus_free(SPI2_HOST);
    ESP_LOGI(TAG, "ADXL362 removed and SPI bus freed.");
}


/* ==================== 6.0 BLE/System Tasks ==================== */

void rgb_led_task(void *pvParameters) {
    bool toggle = false;
    while(1) {
        switch(current_ble_state) {
            case BLE_UNPAIRED:
                led_strip_set_pixel(led_strip, 0, toggle?50:0, 0, toggle?0:50); led_strip_refresh(led_strip); toggle = !toggle; vTaskDelay(pdMS_TO_TICKS(500)); break;
            case BLE_PAIRED:
                led_strip_set_pixel(led_strip, 0, 0, 0, 50); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(250)); break;
            case BLE_DISCONNECTED_BLINK:
                for(int i=0; i<2; i++) { led_strip_set_pixel(led_strip, 0, 100, 0, 0); led_strip_refresh(led_strip); vTaskDelay(pdMS_TO_TICKS(150)); led_strip_clear(led_strip); vTaskDelay(pdMS_TO_TICKS(150)); }
                current_ble_state = BLE_UNPAIRED; break;
        }
    }
}

void process_command_task(void *pvParameters) {
    uint8_t *fileBuf = malloc(TRANSFER_BLOCK_SIZE); char filepath[300];
    while(1) {
        if(cmd_ready) {
            if(!strcmp(pending_cmd, "ls")) { DIR *dir = opendir(MOUNT_POINT); if(dir) { struct dirent *entry; while((entry=readdir(dir))) { if(entry->d_type==DT_REG) { snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, entry->d_name); struct stat st; if(!stat(filepath, &st)) { char line[300]; int len=snprintf(line, sizeof(line), "%s|%ld", entry->d_name, st.st_size); send_notification((uint8_t*)line, len); vTaskDelay(pdMS_TO_TICKS(20)); } } } closedir(dir); } send_eof(); }
            else if(!strncmp(pending_cmd, "get ", 4)) { char *fname = pending_cmd+4; snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname); if(transfer_file) fclose(transfer_file); transfer_file = fopen(filepath, "rb"); if(transfer_file) is_downloading = true; else send_eof(); }
            else if(!strncmp(pending_cmd, "time ", 5)) { int y, m, d, hh, mm, ss; if(sscanf(pending_cmd+5, "%d %d %d %d %d %d", &y, &m, &d, &hh, &mm, &ss)==6) { struct tm tm_info = {.tm_year=y-1900, .tm_mon=m-1, .tm_mday=d, .tm_hour=hh, .tm_min=mm, .tm_sec=ss}; struct timeval now = {.tv_sec=mktime(&tm_info), .tv_usec=0}; settimeofday(&now, NULL); char reply[20]; int len=snprintf(reply, sizeof(reply), "SET:%04d%02d%02d", y, m, d); send_notification((uint8_t*)reply, len); } else send_notification((uint8_t*)"TIME_ERR", 8); send_eof(); }
            else if(!strncmp(pending_cmd, "upload ", 7)) { char *fname = pending_cmd+7; snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname); if(transfer_file) fclose(transfer_file); unlink(filepath); transfer_file = fopen(filepath, "wb"); if(transfer_file) { is_uploading = true; send_notification((uint8_t*)"READY", 5); } else send_notification((uint8_t*)"ERROR", 5); }
            else if(!strcmp(pending_cmd, "end_upload")) { if(transfer_file) { fclose(transfer_file); transfer_file = NULL; } is_uploading = false; send_eof(); }
            cmd_ready = false;
        }
        if(is_downloading && device_connected && transfer_file) {
            int len = fread(fileBuf, 1, TRANSFER_BLOCK_SIZE, transfer_file);
            if(len > 0) { esp_err_t err = send_notification(fileBuf, len); if(err == ESP_FAIL || err == ESP_ERR_NO_MEM) { fseek(transfer_file, -len, SEEK_CUR); vTaskDelay(1); } }
            else { fclose(transfer_file); transfer_file = NULL; is_downloading = false; send_eof(); }
        } else vTaskDelay(pdMS_TO_TICKS(10));
    }
}

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
    if(event == ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT) esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){.adv_int_min=0x20, .adv_int_max=0x40, .adv_type=ADV_TYPE_IND, .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL, .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY});
}

static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    switch(event) {
    case ESP_GATTS_REG_EVT: {
        gatts_if_handle = gatts_if; esp_ble_gap_set_device_name("SuperMini_SD");
        esp_ble_gap_config_adv_data(&(esp_ble_adv_data_t){.set_scan_rsp=false, .include_name=true, .include_txpower=false, .min_interval=0x0006, .max_interval=0x0010, .appearance=0x00, .manufacturer_len=0, .p_manufacturer_data=NULL, .service_data_len=0, .p_service_data=NULL, .service_uuid_len=16, .p_service_uuid=(uint8_t*)service_uuid, .flag=(ESP_BLE_ADV_FLAG_GEN_DISC|ESP_BLE_ADV_FLAG_BREDR_NOT_SPT)});
        static const uint16_t primary_service_uuid=ESP_GATT_UUID_PRI_SERVICE, character_declaration_uuid=ESP_GATT_UUID_CHAR_DECLARE, character_client_config_uuid=ESP_GATT_UUID_CHAR_CLIENT_CONFIG;
        static const uint8_t char_prop_write=ESP_GATT_CHAR_PROP_BIT_WRITE, char_prop_read_notify=ESP_GATT_CHAR_PROP_BIT_READ|ESP_GATT_CHAR_PROP_BIT_NOTIFY, ccc_value[2]={0x00, 0x00};
        const esp_gatts_attr_db_t gatt_db[HRS_IDX_NB] = {
            [IDX_SVC]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&primary_service_uuid,ESP_GATT_PERM_READ,16,16,(uint8_t*)service_uuid}},
            [IDX_CHAR_CMD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_write}},
            [IDX_CHAR_VAL_CMD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_cmd_uuid,ESP_GATT_PERM_WRITE,200,0,NULL}},
            [IDX_CHAR_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_read_notify}},
            [IDX_CHAR_VAL_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_data_uuid,ESP_GATT_PERM_READ,200,0,NULL}},
            [IDX_CHAR_CFG_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_client_config_uuid,ESP_GATT_PERM_READ|ESP_GATT_PERM_WRITE,2,2,(uint8_t*)ccc_value}},
            [IDX_CHAR_UPLOAD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_write}},
            [IDX_CHAR_VAL_UPLOAD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_upload_uuid,ESP_GATT_PERM_WRITE,512,0,NULL}},
        };
        esp_ble_gatts_create_attr_tab(gatt_db, gatts_if, HRS_IDX_NB, 0); break;
    }
    case ESP_GATTS_CREAT_ATTR_TAB_EVT:
        if(param->add_attr_tab.status==ESP_GATT_OK) { memcpy(echo_handle_table, param->add_attr_tab.handles, sizeof(echo_handle_table)); esp_ble_gatts_start_service(echo_handle_table[IDX_SVC]); } break;
    case ESP_GATTS_CONNECT_EVT: {
        conn_id=param->connect.conn_id; device_connected=true; current_ble_state=BLE_PAIRED;
        esp_ble_conn_update_params_t conn_params={0}; memcpy(conn_params.bda, param->connect.remote_bda, sizeof(esp_bd_addr_t)); conn_params.min_int=0x06; conn_params.max_int=0x0C; conn_params.latency=0; conn_params.timeout=400;
        esp_ble_gap_update_conn_params(&conn_params); esp_ble_gatt_set_local_mtu(517); break;
    }
    case ESP_GATTS_DISCONNECT_EVT:
        device_connected=false; is_downloading=false; current_ble_state=BLE_DISCONNECTED_BLINK;
        if(transfer_file) { fclose(transfer_file); transfer_file=NULL; }
        esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){.adv_int_min=0x20, .adv_int_max=0x40, .adv_type=ADV_TYPE_IND, .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL, .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY}); break;
    case ESP_GATTS_WRITE_EVT:
        if(param->write.handle==echo_handle_table[IDX_CHAR_VAL_CMD]) { int len=(param->write.len<sizeof(pending_cmd)-1)?param->write.len:sizeof(pending_cmd)-1; memcpy(pending_cmd, param->write.value, len); pending_cmd[len]=0; cmd_ready=true; }
        else if(param->write.handle==echo_handle_table[IDX_CHAR_VAL_UPLOAD]) { if(is_uploading&&transfer_file) fwrite(param->write.value, 1, param->write.len, transfer_file); }
        if(param->write.need_rsp) esp_ble_gatts_send_response(gatts_if, param->write.conn_id, param->write.trans_id, ESP_GATT_OK, NULL); 
        break;
    default: break;
    }
}


/* ==================== 7.0 Main Method ==================== */

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(3000));
    led_strip_config_t strip_config={.strip_gpio_num=RGB_LED_PIN, .max_leds=1}; led_strip_rmt_config_t rmt_config={.resolution_hz=10*1000*1000};
    ESP_ERROR_CHECK(led_strip_new_rmt_device(&strip_config, &rmt_config, &led_strip)); led_strip_clear(led_strip);
    
    esp_err_t ret=nvs_flash_init(); if(ret==ESP_ERR_NVS_NO_FREE_PAGES||ret==ESP_ERR_NVS_NEW_VERSION_FOUND) { ESP_ERROR_CHECK(nvs_flash_erase()); nvs_flash_init(); }
    
    esp_bt_controller_config_t bt_cfg=BT_CONTROLLER_INIT_CONFIG_DEFAULT(); esp_bt_controller_init(&bt_cfg); esp_bt_controller_enable(ESP_BT_MODE_BLE); esp_bluedroid_init(); esp_bluedroid_enable();
    esp_ble_gatts_register_callback(gatts_event_handler); esp_ble_gap_register_callback(gap_event_handler); esp_ble_gatts_app_register(0);
    
    xTaskCreate(rgb_led_task, "rgb_task", 2048, NULL, 4, NULL); 
    xTaskCreate(process_command_task, "sd_task", 4096*2, NULL, 5, NULL);

    /* System Boot Default: ADXL gets the SPI bus first */
    init_adxl();
    bool adxl_active = true;

    ESP_LOGI(TAG, "Entering Master State Loop...");

    while(1) {
        
        // STATE 1: Switch to SD if BLE is connected
        if (device_connected && adxl_active) {
            deinit_adxl();
            mount_sd();
            adxl_active = false;
        }
        
        // STATE 2: Switch back to ADXL if BLE disconnected
        else if (!device_connected && !adxl_active) {
            unmount_sd();
            init_adxl();
            adxl_active = true;
        }

        // Active ADXL Logic (From your snippet)
        if (adxl_active) {
            if (gpio_get_level(ADXL_PIN_NUM_INT1) == 1) {
                
                int64_t start_wait = esp_timer_get_time();
                bool valid_trigger = true;
                
                while ((esp_timer_get_time() - start_wait) < WAKEUP_HOLD_TIME_US) {
                    if (gpio_get_level(ADXL_PIN_NUM_INT1) == 0 || device_connected) {
                        valid_trigger = false;
                        break;
                    }
                    vTaskDelay(pdMS_TO_TICKS(10));
                }

                if (valid_trigger) {
                    ESP_LOGI(TAG, "Motion Confirmed! Starting Sequence...");

                    /* Startup Delay Block */
                    for(int i = STARTUP_DELAY_SEC; i > 0; i--) {
                        if (device_connected) break; // Abort if user connects BLE
                        blink_led(1, 200);
                        vTaskDelay(pdMS_TO_TICKS(250)); 
                    }

                    /* Recording Simulation Block */
                    if (!device_connected) { // Only record if BLE didn't connect during delay
                        ESP_LOGI(TAG, "Simulating Recording for %d seconds...", RECORD_TIME_SEC);
                        gpio_set_level(TEST_LED_PIN, 1); 
                        
                        int64_t end_time = esp_timer_get_time() + ((int64_t)RECORD_TIME_SEC * 1000000);

                        while (esp_timer_get_time() < end_time) {
                            if (device_connected) break; // Abort if user connects BLE
                            vTaskDelay(pdMS_TO_TICKS(100)); 
                        }

                        gpio_set_level(TEST_LED_PIN, 0); 
                        ESP_LOGI(TAG, "Sequence Finished. Returning to Standby.");
                    }
                }
            }
        }

        vTaskDelay(pdMS_TO_TICKS(50)); 
    }
}