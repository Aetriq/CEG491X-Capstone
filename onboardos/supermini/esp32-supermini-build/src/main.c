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

/* Onboard OS for ESP32-S3 based SuperMini */
/* Main program to execute */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */
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
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "led_strip.h"

#define SD_PIN_NUM_CS GPIO_NUM_7
#define SD_PIN_NUM_MOSI GPIO_NUM_6
#define SD_PIN_NUM_CLK GPIO_NUM_5
#define SD_PIN_NUM_MISO GPIO_NUM_4
#define RGB_LED_PIN GPIO_NUM_48
#define MOUNT_POINT "/sdcard"
#define TRANSFER_BLOCK_SIZE 490

static const char *TAG = "SUPERMINI_BLE_SD";
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
static sdmmc_card_t *card;
typedef enum { BLE_UNPAIRED, BLE_PAIRED, BLE_DISCONNECTED_BLINK } ble_led_state_t;
volatile ble_led_state_t current_ble_state = BLE_UNPAIRED;
led_strip_handle_t led_strip;

esp_err_t send_notification(uint8_t *data, size_t len) {
    if(device_connected) return esp_ble_gatts_send_indicate(gatts_if_handle, conn_id, echo_handle_table[IDX_CHAR_VAL_DATA], len, data, false);
    return ESP_FAIL;
}
void send_eof() { send_notification((uint8_t*)"EOF", 3); }

void mount_sd_ble() {
    esp_vfs_fat_sdmmc_mount_config_t mount_config = {.format_if_mount_failed=false, .max_files=5, .allocation_unit_size=16*1024};
    gpio_set_pull_mode(SD_PIN_NUM_MISO, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SD_PIN_NUM_MOSI, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(SD_PIN_NUM_CLK, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SD_PIN_NUM_CS, GPIO_PULLUP_ONLY);
    sdmmc_host_t host = SDSPI_HOST_DEFAULT(); host.slot = SPI2_HOST; host.max_freq_khz = 4000;
    spi_bus_config_t bus_cfg = {.mosi_io_num=SD_PIN_NUM_MOSI, .miso_io_num=SD_PIN_NUM_MISO, .sclk_io_num=SD_PIN_NUM_CLK, .quadwp_io_num=-1, .quadhd_io_num=-1, .max_transfer_sz=4000};
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);
    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT(); slot_config.gpio_cs=SD_PIN_NUM_CS; slot_config.host_id=host.slot;
    if(esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card)==ESP_OK) ESP_LOGI(TAG, "SD Card mounted"); else ESP_LOGE(TAG, "Failed to mount SD card");
}

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

void app_main(void) {
    vTaskDelay(pdMS_TO_TICKS(3000));
    led_strip_config_t strip_config={.strip_gpio_num=RGB_LED_PIN, .max_leds=1}; led_strip_rmt_config_t rmt_config={.resolution_hz=10*1000*1000};
    ESP_ERROR_CHECK(led_strip_new_rmt_device(&strip_config, &rmt_config, &led_strip)); led_strip_clear(led_strip);
    esp_err_t ret=nvs_flash_init(); if(ret==ESP_ERR_NVS_NO_FREE_PAGES||ret==ESP_ERR_NVS_NEW_VERSION_FOUND) { ESP_ERROR_CHECK(nvs_flash_erase()); nvs_flash_init(); }
    mount_sd_ble();
    esp_bt_controller_config_t bt_cfg=BT_CONTROLLER_INIT_CONFIG_DEFAULT(); esp_bt_controller_init(&bt_cfg); esp_bt_controller_enable(ESP_BT_MODE_BLE); esp_bluedroid_init(); esp_bluedroid_enable();
    esp_ble_gatts_register_callback(gatts_event_handler); esp_ble_gap_register_callback(gap_event_handler); esp_ble_gatts_app_register(0);
    xTaskCreate(rgb_led_task, "rgb_task", 2048, NULL, 4, NULL); xTaskCreate(process_command_task, "sd_task", 4096*2, NULL, 5, NULL);
    while(1) vTaskDelay(pdMS_TO_TICKS(10000));
}